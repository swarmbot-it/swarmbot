#!/usr/bin/env bash
# Migracja działającej instancji z namespace "swarmboty" (stary prefiks env
# SWARMBOTY_*) do "swarmbot" (SWARMBOT_*). Weryfikuje i mityguje wszystkie
# konsekwencje operacyjne zmiany nazewnictwa:
#
#   1. Sól scrypt secret-box ("swarmboty-secret-box" -> "swarmbot-secret-box"):
#      hasła rejestrów w tabeli `registries` są RE-SZYFROWANE nową solą
#      (klucz bazowy z `app_secrets` jedzie w dumpie — zmienia się tylko sól,
#      więc pełna migracja jest możliwa bez ponownego wpisywania haseł).
#      Wpisy nieodszyfrowywalne żadną solą są czyszczone i raportowane.
#   2. Namespace k8s: nowy namespace "swarmbot" stawiany od zera, sekrety
#      tworzone IMPERATYWNIE z wartości odczytanych ze starego namespace
#      (nigdy `kubectl apply -k` — 05-secrets.yaml zawiera CHANGE-ME).
#   3. JWT iss ("swarmboty" -> "swarmbot"): stare tokeny tracą ważność —
#      skrypt weryfikuje, że logowanie działa i nowy token ma iss=swarmbot.
#   4. User/baza Postgresa ("swarmboty" -> "swarmbot"): świeży wolumen
#      inicjalizowany nowymi nazwami, dane przenoszone pg_dump | psql.
#      Dodatkowo InfluxDB: baza "swarmboty" migrowana backup/restore do
#      bazy "swarmbot" (stats-writer pisze teraz db=swarmbot).
#
# Uruchamiać z WSL (kubeconfig: ~/.kube/no-human-k3s.yaml).
# Wymagane narzędzia: kubectl, jq, curl, base64. Plik musi mieć końce linii LF.
#
# Kolejność faz:
#   ./migrate-from-swarmboty.sh verify     # read-only pre-flight + test kontraktu obrazu
#   ./migrate-from-swarmboty.sh migrate    # nowy namespace, dane, re-szyfrowanie, weryfikacja
#   ./migrate-from-swarmboty.sh cutover    # przełączenie ingressu, zatrzymanie starego
#   ./migrate-from-swarmboty.sh finalize   # usunięcie starego namespace (nieodwracalne)
set -euo pipefail

# ---------------------------------------------------------------- konfiguracja

OLD_NS="${OLD_NS:-swarmboty}"
NEW_NS="${NEW_NS:-swarmbot}"
# Obraz zgodny z kontraktem SWARMBOT_* (po merge zmienić na :latest).
APP_IMAGE="${APP_IMAGE:-ghcr.io/swarmbot-it/swarmbot:ci-k8s-orchestrator-postgres}"
AGENT_IMAGE="${AGENT_IMAGE:-ghcr.io/swarmbot-it/swarmagent:ci-ghcr-actions}"
# Nazwa starej bazy metryk w InfluxDB (domyślna sprzed zmiany nazewnictwa).
OLD_INFLUX_DB="${OLD_INFLUX_DB:-swarmboty}"
# IP, na które wskazuje swarmbot.infra (k3s-a1) — do testu ingressu po cutover.
INGRESS_IP="${INGRESS_IP:-10.6.6.6}"
INGRESS_HOST="${INGRESS_HOST:-swarmbot.infra}"
SKIP_INFLUX="${SKIP_INFLUX:-false}"
PF_PORT="${PF_PORT:-18091}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${KUBECONFIG:-}" && -f "$HOME/.kube/no-human-k3s.yaml" ]]; then
	export KUBECONFIG="$HOME/.kube/no-human-k3s.yaml"
fi

# ------------------------------------------------------------------- narzędzia

log() { printf '\033[1;34m>>>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mUWAGA\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mBŁĄD\033[0m %s\n' "$*" >&2; exit 1; }

need() {
	for c in "$@"; do command -v "$c" >/dev/null || die "brak narzędzia: $c"; done
}

secret_val() { # secret_val <ns> <secret> <klucz>
	kubectl -n "$1" get secret "$2" -o jsonpath="{.data.$3}" 2>/dev/null | base64 -d
}

old_pg_pod() { kubectl -n "$OLD_NS" get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}'; }
new_pg_pod() { kubectl -n "$NEW_NS" get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}'; }
old_influx_pod() { kubectl -n "$OLD_NS" get pod -l app=influxdb -o jsonpath='{.items[0].metadata.name}'; }
new_influx_pod() { kubectl -n "$NEW_NS" get pod -l app=influxdb -o jsonpath='{.items[0].metadata.name}'; }

# psql przez unix socket w podzie (docker-entrypoint ustawia local trust).
old_sql() { kubectl -n "$OLD_NS" exec -i "$(old_pg_pod)" -- psql -U "$OLD_PG_USER" -d "$OLD_PG_DB" -tAq -c "$1"; }
new_sql() { kubectl -n "$NEW_NS" exec -i "$(new_pg_pod)" -- psql -U "$NEW_NS" -d "$NEW_NS" -tAq -c "$1"; }

# Sekret bootstrap znajdź po kluczu (nazwa mogła być tworzona imperatywnie).
find_old_bootstrap_secret() {
	kubectl -n "$OLD_NS" get secrets -o json \
		| jq -r '.items[] | select(.data["SWARMBOTY_BOOTSTRAP_ADMIN"] != null) | .metadata.name' \
		| head -1
}

load_old_credentials() {
	OLD_PG_USER="$(secret_val "$OLD_NS" postgres-credentials POSTGRES_USER)"
	OLD_PG_DB="$(secret_val "$OLD_NS" postgres-credentials POSTGRES_DB)"
	OLD_PG_PASS="$(secret_val "$OLD_NS" postgres-credentials POSTGRES_PASSWORD)"
	OLD_INFLUX_PASS="$(secret_val "$OLD_NS" influxdb-credentials INFLUXDB_ADMIN_PASSWORD)"
	BOOTSTRAP_SECRET="$(find_old_bootstrap_secret)"
	[[ -n "$BOOTSTRAP_SECRET" ]] || die "nie znaleziono sekretu bootstrap (klucz SWARMBOTY_BOOTSTRAP_ADMIN) w ns $OLD_NS"
	BOOTSTRAP_ADMIN="$(secret_val "$OLD_NS" "$BOOTSTRAP_SECRET" SWARMBOTY_BOOTSTRAP_ADMIN)"
	BOOTSTRAP_PASS="$(secret_val "$OLD_NS" "$BOOTSTRAP_SECRET" SWARMBOTY_BOOTSTRAP_PASSWORD)"
	[[ -n "$OLD_PG_USER" && -n "$OLD_PG_PASS" && -n "$OLD_INFLUX_PASS" ]] \
		|| die "niekompletne sekrety w ns $OLD_NS (postgres-credentials / influxdb-credentials)"
	# Hasło ląduje w connection stringu SWARMBOT_DB — musi być URL-safe.
	[[ "$OLD_PG_PASS" =~ ^[A-Za-z0-9._~-]+$ ]] \
		|| die "hasło Postgresa zawiera znaki wymagające URL-encodowania — utwórz sekret postgres-credentials w ns $NEW_NS ręcznie i uruchom ponownie"
}

# Deployment aplikacji w starym ns (obok niego jest tylko influxdb).
old_app_deploy() {
	kubectl -n "$OLD_NS" get deploy -o json \
		| jq -r '.items[].metadata.name' | grep -v '^influxdb$' | head -1
}

# ------------------------------------------------- test kontraktu obrazu (1/4)

contract_test() {
	log "Test kontraktu: obraz $APP_IMAGE musi czytać prefiks SWARMBOT_*"
	local pod=swarmbot-contract-check ns="$OLD_NS"
	kubectl -n "$ns" delete pod "$pod" --ignore-not-found >/dev/null
	kubectl -n "$ns" run "$pod" --image="$APP_IMAGE" --restart=Never \
		--env=SWARMBOT_MOCK=true --env=SWARMBOT_PORT=9911 >/dev/null
	local i deadline=36 pass=false
	for ((i = 0; i < deadline; i++)); do
		if kubectl -n "$ns" logs "$pod" 2>/dev/null | grep -q '"port":9911.*listening'; then
			pass=true
			break
		fi
		# Stary obraz ignoruje SWARMBOT_MOCK, próbuje postgres://localhost i pada.
		if kubectl -n "$ns" logs "$pod" 2>/dev/null | grep -q 'failed to start'; then
			break
		fi
		sleep 5
	done
	kubectl -n "$ns" delete pod "$pod" --ignore-not-found >/dev/null
	if [[ "$pass" == true ]]; then
		ok "obraz czyta SWARMBOT_* (mock wystartował na porcie 9911)"
	else
		die "obraz $APP_IMAGE NIE czyta prefiksu SWARMBOT_* — zbuduj/wskaż obraz po zmianie nazewnictwa (APP_IMAGE=...)"
	fi
}

# ------------------------------------------------------------------ faza: verify

cmd_verify() {
	need kubectl jq curl base64
	log "Pre-flight (read-only), kubeconfig: ${KUBECONFIG:-domyślny}"
	kubectl version >/dev/null || die "brak połączenia z klastrem"
	kubectl get ns "$OLD_NS" >/dev/null || die "brak starego namespace $OLD_NS"
	ok "klaster osiągalny, namespace $OLD_NS istnieje"

	if kubectl get ns "$NEW_NS" >/dev/null 2>&1; then
		warn "namespace $NEW_NS już istnieje — migrate będzie kontynuować/uzupełniać"
	fi

	local f
	for f in 00-namespace.yaml 10-postgres.yaml 20-influxdb.yaml 30-swarmbot.yaml 40-swarmagent.yaml 50-ingress.yaml; do
		[[ -f "$SCRIPT_DIR/$f" ]] || die "brak manifestu $f obok skryptu"
	done
	ok "komplet manifestów w $SCRIPT_DIR (05-secrets.yaml celowo pomijany)"

	load_old_credentials
	ok "sekrety odczytane: postgres ($OLD_PG_USER/$OLD_PG_DB), influxdb, bootstrap ($BOOTSTRAP_SECRET: $BOOTSTRAP_ADMIN)"

	local users regs encs
	users="$(old_sql 'SELECT count(*) FROM users;')"
	regs="$(old_sql 'SELECT count(*) FROM registries;')"
	encs="$(old_sql "SELECT count(*) FROM registries WHERE password LIKE 'enc:%';")"
	ok "stara baza: users=$users, registries=$regs (w tym zaszyfrowanych haseł: $encs — zostaną re-zaszyfrowane nową solą)"

	contract_test
	log "verify zakończone — można uruchomić: $0 migrate"
}

# ----------------------------------------------------------------- faza: migrate

create_new_secrets() {
	log "Tworzenie sekretów w ns $NEW_NS (imperatywnie, wartości ze starego ns)"
	kubectl -n "$NEW_NS" create secret generic postgres-credentials \
		--from-literal=POSTGRES_USER="$NEW_NS" \
		--from-literal=POSTGRES_PASSWORD="$OLD_PG_PASS" \
		--from-literal=POSTGRES_DB="$NEW_NS" \
		--from-literal=SWARMBOT_DB="postgres://$NEW_NS:$OLD_PG_PASS@db:5432/$NEW_NS" \
		--dry-run=client -o yaml | kubectl apply -f - >/dev/null
	kubectl -n "$NEW_NS" create secret generic influxdb-credentials \
		--from-literal=INFLUXDB_ADMIN_USER="$NEW_NS" \
		--from-literal=INFLUXDB_ADMIN_PASSWORD="$OLD_INFLUX_PASS" \
		--from-literal=SWARMBOT_INFLUXDB_TOKEN="$NEW_NS:$OLD_INFLUX_PASS" \
		--dry-run=client -o yaml | kubectl apply -f - >/dev/null
	kubectl -n "$NEW_NS" create secret generic swarmbot-bootstrap \
		--from-literal=SWARMBOT_BOOTSTRAP_ADMIN="$BOOTSTRAP_ADMIN" \
		--from-literal=SWARMBOT_BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASS" \
		--dry-run=client -o yaml | kubectl apply -f - >/dev/null
	# Pull secret tylko jeśli istniał (pakiety GHCR są publiczne — może go nie być).
	if kubectl -n "$OLD_NS" get secret ghcr-pull >/dev/null 2>&1; then
		kubectl -n "$OLD_NS" get secret ghcr-pull -o json \
			| jq --arg ns "$NEW_NS" '{apiVersion, kind, type, data, metadata: {name: "ghcr-pull", namespace: $ns}}' \
			| kubectl apply -f - >/dev/null
	fi
	ok "sekrety utworzone (user/db/org = $NEW_NS, hasła bez zmian)"
}

migrate_postgres() {
	local tables
	tables="$(new_sql "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';")"
	if [[ "$tables" != "0" ]]; then
		warn "baza $NEW_NS ma już $tables tabel — pomijam restore (ponowne uruchomienie?)"
		return
	fi
	log "Migracja Postgresa: pg_dump ($OLD_PG_USER/$OLD_PG_DB) | psql ($NEW_NS/$NEW_NS)"
	kubectl -n "$OLD_NS" exec "$(old_pg_pod)" -- \
		pg_dump -U "$OLD_PG_USER" -d "$OLD_PG_DB" --no-owner --no-privileges \
		| kubectl -n "$NEW_NS" exec -i "$(new_pg_pod)" -- \
			psql -U "$NEW_NS" -d "$NEW_NS" -q -v ON_ERROR_STOP=1 >/dev/null
	ok "dane Postgresa przeniesione (dump zawiera app_secrets — klucz JWT/szyfrowania zachowany)"
}

migrate_influx() {
	if [[ "$SKIP_INFLUX" == true ]]; then
		warn "SKIP_INFLUX=true — historyczne metryki nie będą przeniesione (aplikacja utworzy pustą bazę $NEW_NS)"
		return
	fi
	local newpod oldpod
	newpod="$(new_influx_pod)"
	oldpod="$(old_influx_pod)"
	if kubectl -n "$NEW_NS" exec "$newpod" -- \
		influx -username "$NEW_NS" -password "$OLD_INFLUX_PASS" -execute 'SHOW DATABASES' 2>/dev/null \
		| grep -qx "$NEW_NS"; then
		warn "baza InfluxDB $NEW_NS już istnieje — pomijam restore"
		return
	fi
	log "Migracja InfluxDB: backup -portable ($OLD_INFLUX_DB) -> restore -newdb $NEW_NS"
	kubectl -n "$OLD_NS" exec "$oldpod" -- sh -c "rm -rf /tmp/sbmig && influxd backup -portable -database $OLD_INFLUX_DB /tmp/sbmig" >/dev/null
	kubectl -n "$OLD_NS" exec "$oldpod" -- tar -C /tmp -cf - sbmig \
		| kubectl -n "$NEW_NS" exec -i "$newpod" -- tar -C /tmp -xf -
	kubectl -n "$NEW_NS" exec "$newpod" -- \
		influxd restore -portable -db "$OLD_INFLUX_DB" -newdb "$NEW_NS" /tmp/sbmig >/dev/null
	kubectl -n "$OLD_NS" exec "$oldpod" -- rm -rf /tmp/sbmig
	kubectl -n "$NEW_NS" exec "$newpod" -- rm -rf /tmp/sbmig
	ok "metryki przeniesione do bazy $NEW_NS"
}

# Konsekwencja #1: re-szyfrowanie haseł rejestrów nową solą scrypt.
reencrypt_registry_secrets() {
	log "Re-szyfrowanie haseł rejestrów (sól swarmboty-secret-box -> swarmbot-secret-box)"
	local result
	result="$(kubectl -n "$NEW_NS" exec -i deploy/swarmbot -- node <<'NODE_EOF'
const { Client } = require("pg");
const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require("crypto");
(async () => {
	const c = new Client({ connectionString: process.env.SWARMBOT_DB });
	await c.connect();
	const secret = (await c.query("SELECT secret FROM app_secrets LIMIT 1")).rows[0].secret;
	const oldKey = scryptSync(secret, "swarmboty-secret-box", 32);
	const newKey = scryptSync(secret, "swarmbot-secret-box", 32);
	const dec = (key, v) => {
		const [iv, tag, data] = v.slice(4).split(":");
		const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
		d.setAuthTag(Buffer.from(tag, "base64"));
		return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
	};
	const enc = (key, plain) => {
		const iv = randomBytes(12);
		const ci = createCipheriv("aes-256-gcm", key, iv);
		const e = Buffer.concat([ci.update(plain, "utf8"), ci.final()]);
		return `enc:${iv.toString("base64")}:${ci.getAuthTag().toString("base64")}:${e.toString("base64")}`;
	};
	const rows = (await c.query("SELECT id, name, password FROM registries WHERE password LIKE 'enc:%'")).rows;
	const out = { reencrypted: 0, alreadyNew: 0, cleared: [] };
	for (const r of rows) {
		try { dec(newKey, r.password); out.alreadyNew++; continue; } catch {}
		let plain;
		try { plain = dec(oldKey, r.password); } catch {
			await c.query("UPDATE registries SET password = '' WHERE id = $1", [r.id]);
			out.cleared.push(r.name);
			continue;
		}
		await c.query("UPDATE registries SET password = $1 WHERE id = $2", [enc(newKey, plain), r.id]);
		out.reencrypted++;
	}
	console.log(JSON.stringify(out));
	await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
NODE_EOF
)"
	echo "$result" | jq . >/dev/null 2>&1 || die "re-szyfrowanie nie powiodło się: $result"
	ok "rejestry: $(echo "$result" | jq -r '"re-zaszyfrowane=\(.reencrypted), już-nowe=\(.alreadyNew), wyczyszczone=\(.cleared | length)"')"
	local cleared
	cleared="$(echo "$result" | jq -r '.cleared[]' || true)"
	[[ -z "$cleared" ]] || warn "hasła do ponownego wpisania w UI dla rejestrów: $cleared"
}

# Konsekwencje #3 i #4: health, login, iss nowego JWT, zgodność liczby userów.
verify_new_instance() {
	log "Weryfikacja nowej instancji przez port-forward (localhost:$PF_PORT)"
	kubectl -n "$NEW_NS" port-forward svc/swarmbot "$PF_PORT:8080" >/dev/null 2>&1 &
	local pf=$!
	trap 'kill $pf 2>/dev/null || true' RETURN
	sleep 3
	curl -fsS "http://127.0.0.1:$PF_PORT/health" >/dev/null || die "/health nie odpowiada"
	local version
	version="$(curl -fsS "http://127.0.0.1:$PF_PORT/version")"
	echo "$version" | jq -e '.name == "swarmbot" and .orchestrator == "kubernetes"' >/dev/null \
		|| die "/version niezgodne z oczekiwaniem: $version"
	ok "/health 200, /version: name=swarmbot orchestrator=kubernetes"

	local basic token payload iss
	basic="$(printf '%s:%s' "$BOOTSTRAP_ADMIN" "$BOOTSTRAP_PASS" | base64 -w0)"
	token="$(curl -fsS -X POST -H "Authorization: Basic $basic" "http://127.0.0.1:$PF_PORT/login" | jq -r .token)"
	[[ -n "$token" && "$token" != null ]] || die "logowanie $BOOTSTRAP_ADMIN nie powiodło się (użytkownicy z migracji zachowują hasła)"
	payload="$(echo "$token" | cut -d. -f2 | tr '_-' '/+')"
	while ((${#payload} % 4)); do payload="$payload="; done
	iss="$(echo "$payload" | base64 -d 2>/dev/null | jq -r .iss)"
	[[ "$iss" == "swarmbot" ]] || die "nowy JWT ma iss=$iss, oczekiwano swarmbot"
	ok "login OK, nowy JWT iss=swarmbot (stare tokeny z iss=swarmboty są odrzucane — użytkownicy logują się ponownie)"

	local old_users new_users
	old_users="$(old_sql 'SELECT count(*) FROM users;')"
	new_users="$(new_sql 'SELECT count(*) FROM users;')"
	[[ "$old_users" == "$new_users" ]] || die "liczba userów różni się: stara=$old_users nowa=$new_users"
	ok "liczba użytkowników zgodna ($new_users)"
}

cmd_migrate() {
	need kubectl jq curl base64
	kubectl get ns "$OLD_NS" >/dev/null || die "brak starego namespace $OLD_NS"
	load_old_credentials
	contract_test

	log "Namespace + baza danych"
	kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml" >/dev/null
	create_new_secrets
	kubectl apply -f "$SCRIPT_DIR/10-postgres.yaml" -f "$SCRIPT_DIR/20-influxdb.yaml" >/dev/null
	kubectl -n "$NEW_NS" rollout status sts/postgres --timeout=180s >/dev/null
	kubectl -n "$NEW_NS" rollout status deploy/influxdb --timeout=180s >/dev/null
	ok "postgres i influxdb gotowe w ns $NEW_NS"

	# Spójny dump: zatrzymaj zapis do starej bazy (stara instancja przestaje
	# obsługiwać ruch — to jest właściwy początek okna migracji).
	local old_deploy
	old_deploy="$(old_app_deploy)"
	log "Zatrzymuję starą aplikację (deploy/$old_deploy w ns $OLD_NS) na czas dumpa"
	kubectl -n "$OLD_NS" scale "deploy/$old_deploy" --replicas=0 >/dev/null
	kubectl -n "$OLD_NS" rollout status "deploy/$old_deploy" --timeout=120s >/dev/null || true

	migrate_postgres
	migrate_influx

	log "Wdrażanie aplikacji i agenta"
	kubectl apply -f "$SCRIPT_DIR/30-swarmbot.yaml" -f "$SCRIPT_DIR/40-swarmagent.yaml" >/dev/null
	kubectl -n "$NEW_NS" set image deploy/swarmbot swarmbot="$APP_IMAGE" >/dev/null
	kubectl -n "$NEW_NS" set image ds/swarmagent swarmagent="$AGENT_IMAGE" >/dev/null
	kubectl -n "$NEW_NS" rollout status deploy/swarmbot --timeout=300s >/dev/null
	kubectl -n "$NEW_NS" rollout status ds/swarmagent --timeout=300s >/dev/null
	ok "aplikacja i agent wdrożone ($APP_IMAGE)"

	reencrypt_registry_secrets
	verify_new_instance

	log "migrate zakończone. Stara instancja jest ZATRZYMANA (replicas=0), ruch"
	log "nadal wskazuje na stary ingress. Przełączenie: $0 cutover"
}

# ----------------------------------------------------------------- faza: cutover

cmd_cutover() {
	need kubectl jq curl
	kubectl -n "$NEW_NS" get deploy/swarmbot >/dev/null || die "brak wdrożenia w ns $NEW_NS — najpierw: $0 migrate"

	log "Przełączanie ingressu $INGRESS_HOST na ns $NEW_NS"
	local ing
	kubectl -n "$OLD_NS" get ingress -o json 2>/dev/null \
		| jq -r --arg h "$INGRESS_HOST" '.items[] | select(any(.spec.rules[]?; .host == $h)) | .metadata.name' \
		| while read -r ing; do
			kubectl -n "$OLD_NS" delete ingress "$ing" >/dev/null
			echo "  usunięto stary ingress: $OLD_NS/$ing"
		done
	kubectl apply -f "$SCRIPT_DIR/50-ingress.yaml" >/dev/null
	ok "nowy ingress + middleware internal-only zaaplikowane"

	local i
	for ((i = 0; i < 12; i++)); do
		if curl -fsSk --resolve "$INGRESS_HOST:443:$INGRESS_IP" "https://$INGRESS_HOST/health" >/dev/null 2>&1; then
			ok "https://$INGRESS_HOST/health -> 200 (przez $INGRESS_IP)"
			break
		fi
		[[ $i -lt 11 ]] || die "ingress nie odpowiada po 60 s — sprawdź: kubectl -n $NEW_NS describe ingress swarmbot"
		sleep 5
	done

	log "Zatrzymywanie pozostałych workloadów w ns $OLD_NS (PVC z danymi zostają jako backup)"
	kubectl -n "$OLD_NS" delete ds swarmagent --ignore-not-found >/dev/null
	kubectl -n "$OLD_NS" scale deploy --all --replicas=0 >/dev/null 2>&1 || true
	kubectl -n "$OLD_NS" scale sts --all --replicas=0 >/dev/null 2>&1 || true
	ok "stary namespace uśpiony; po okresie kwarantanny: $0 finalize"
}

# ---------------------------------------------------------------- faza: finalize

cmd_finalize() {
	need kubectl
	kubectl get ns "$OLD_NS" >/dev/null || die "namespace $OLD_NS już nie istnieje"
	warn "To usunie namespace $OLD_NS wraz z PVC (local-path — dane przepadają NIEODWRACALNIE)."
	printf 'Wpisz nazwę namespace do usunięcia, aby potwierdzić: '
	read -r answer
	[[ "$answer" == "$OLD_NS" ]] || die "przerwano (wpisano: '$answer')"
	kubectl delete ns "$OLD_NS"
	ok "namespace $OLD_NS usunięty — migracja domknięta"
}

# ------------------------------------------------------------------------- main

case "${1:-}" in
	verify) cmd_verify ;;
	migrate) cmd_migrate ;;
	cutover) cmd_cutover ;;
	finalize) cmd_finalize ;;
	*)
		sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
		exit 1
		;;
esac
