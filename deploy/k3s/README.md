# Wdrożenie Swarmbot na klaster k3s

Topologia:

- **k3s-a1.infra.no-human.tech** — aplikacja `swarmbot` (API + UI w jednym
  kontenerze) + centralna baza **PostgreSQL 16** + InfluxDB 1.8 (metryki agentów),
  przypięte przez `nodeSelector: kubernetes.io/hostname`.
- **pozostałe węzły** — `swarmagent` jako DaemonSet z `nodeAffinity NotIn [k3s-a1…]`;
  agent jest push-only i wysyła staty/eventy na
  `http://swarmbot.swarmbot.svc.cluster.local:8080/events`.
- **UI/API** — Ingress (Traefik, wbudowany w k3s) pod `http://swarmbot.infra`,
  ograniczony middleware'em `ipAllowList` do adresów RFC1918. Węzły mają publiczne
  IP, więc ten middleware jest obowiązkowy, a rekord DNS `swarmbot.infra` może
  istnieć wyłącznie w wewnętrznej strefie.

Obrazy są budowane przez GitHub Actions (`.github/workflows/docker-publish.yml`
w obu repozytoriach) i publikowane do GHCR:

- `ghcr.io/swarmbot-it/swarmbot`
- `ghcr.io/swarmbot-it/swarmagent`

Push na `main` → tag `latest` + `sha-…`; gałęzie `ci/**` → tag z nazwą gałęzi;
tag git `vX.Y.Z` → tagi semver.

## Wymagania i zależności między repozytoriami

- Aplikacja (main) używa **PostgreSQL** (Kysely + pg); InfluxDB w wariancie
  **1.x** (InfluxQL — stąd `influxdb:1.8` w manifestach).
- Agent w trybie Kubernetes wymaga zmian z gałęzi `feature/multi-orchestrator`
  (PR #2 w swarmbot-it/swarmagent). Obraz `main` sprzed tego PR nie zadziała na k3s.
- `POST /events` obsługuje opcjonalny sekret (`SWARMAGENT_SHARED_SECRET` +
  nagłówek `x-agent-token`), ale agent wysyła go dopiero po zmergowaniu PR #1
  (agent-shared-secret-auth). Do tego czasu zmienna musi pozostać nieustawiona,
  inaczej API odrzuci staty agentów (401).
- Widoki zasobów klastra (Serwisy/Taski itd.) w main są nadal oparte o Docker
  Swarm — na k3s będą puste/nieaktywne. Wsparcie orchestratora Kubernetes dla
  API/UI istnieje w linii `rc-1` i czeka na scalenie z linią PostgreSQL.

## Warianty warstwy danych: lokalny (wbudowany) vs centralny (współdzielony)

PostgreSQL i InfluxDB można wdrożyć na dwa sposoby. Wybór dotyczy wyłącznie tego,
skąd aplikacja bierze dane — kontrakt env (`SWARMBOT_DB`, `SWARMBOT_INFLUXDB`,
`SWARMBOT_INFLUXDB_TOKEN`) jest wspólny dla obu. Agent (`swarmagent`) nic nie wie
o bazach — wysyła push-only do API, więc jego manifest się nie zmienia w żadnym
wariancie.

### Wariant lokalny (wbudowany, domyślny)

- Postgres i InfluxDB jako manifesty w namespace instancji: `10-postgres.yaml`,
  `20-influxdb.yaml`; dane w PVC przypiętych do `k3s-a1` (`nodeSelector`).
- `SWARMBOT_DB` → `postgres://…@db:5432/swarmbot`, `SWARMBOT_INFLUXDB` →
  `http://influxdb:8086` (Service'y w namespace).
- **Kiedy:** pojedyncza instancja, pełna izolacja, najprostszy start; backup
  i skalowanie per instancja.
- To jest domyślne zachowanie `kubectl apply -k deploy/k3s` (Krok 3).

### Wariant centralny (współdzielony)

- Jeden zewnętrzny PostgreSQL i jeden InfluxDB obsługują wiele instancji swarbota.
- Usuń `10-postgres.yaml` i `20-influxdb.yaml` z `kustomization.yaml` (nie wdrażaj
  lokalnych baz) i skieruj env na centralne endpointy:
  - `SWARMBOT_DB` → `postgres://<user>:<hasło>@<centralny-host>:5432/<baza-instancji>`
  - `SWARMBOT_INFLUXDB` → `http://<centralny-host>:8086`,
    `SWARMBOT_INFLUXDB_TOKEN` → `user:hasło` konta danej instancji.
- **Izolacja najemców na wspólnym silniku:** osobna **baza + rola** per instancja
  (Postgres) oraz osobna **baza InfluxQL** per instancja (InfluxDB). Naturalny
  klucz nazewniczy: `SWARMBOT_INSTANCE_NAME`.
- **Sekrety:** sól secret-box (`swarmbot-secret-box`) i klucz bazowy w tabeli
  `app_secrets` są per-baza — trzymaj `app_secrets` każdej instancji w JEJ bazie,
  żeby szyfrowanie haseł rejestrów pozostało odseparowane między instancjami.
- Porty bez zmian (5432/8086) — „centralny" znaczy wspólny host, nie inny port.
- **Kiedy:** flota instancji, wspólny backup/ops, jedna domena awarii do pilnowania.

## Krok 1 — obrazy w GHCR

Workflow uruchamia się na push do `main`/`ci/**`. Po pierwszym buildzie pakiety
GHCR są **prywatne** — ustaw je jako publiczne (repo jest publiczne, więc to
spójne): `https://github.com/orgs/swarmbot-it/packages` → pakiet → Package
settings → Change visibility → Public. Alternatywnie utwórz sekret pull:

```sh
kubectl create secret docker-registry ghcr-pull \
  --namespace swarmbot \
  --docker-server=ghcr.io \
  --docker-username=<github-user> \
  --docker-password=<PAT z uprawnieniem read:packages>
```

Jeśli pakiety są publiczne, bloki `imagePullSecrets` w `30-swarmbot.yaml`
i `40-swarmagent.yaml` są ignorowane, o ile sekret `ghcr-pull` nie istnieje —
można je też po prostu usunąć.

## Krok 2 — sekrety

Podmień wszystkie wartości `CHANGE-ME` w `05-secrets.yaml` (hasło Postgresa
występuje też w URL `SWARMBOT_DB`, a hasło InfluxDB w `SWARMBOT_INFLUXDB_TOKEN`
w formacie `user:hasło`). `SWARMBOT_BOOTSTRAP_*` tworzy pierwsze konto
administratora UI przy pustej tabeli użytkowników. Zalecane: utwórz sekrety
poza repo i usuń `05-secrets.yaml` z `kustomization.yaml`.

## Krok 3 — wdrożenie

```sh
kubectl apply -k deploy/k3s
kubectl -n swarmbot get pods -o wide
# swarmbot/postgres/influxdb na k3s-a1, agenci na pozostałych węzłach
```

Powyższe wdraża **wariant lokalny** (wbudowane bazy). Dla **wariantu centralnego**
najpierw usuń `10-postgres.yaml`/`20-influxdb.yaml` z `kustomization.yaml`
i ustaw `SWARMBOT_DB`/`SWARMBOT_INFLUXDB` na centralne endpointy — patrz sekcja
[Warianty warstwy danych](#warianty-warstwy-danych-lokalny-wbudowany-vs-centralny-współdzielony).

## Krok 4 — DNS

W wewnętrznym DNS (strefa, w której rozwiązują się nazwy `*.infra.no-human.tech`)
dodaj rekord `swarmbot.infra` → wewnętrzne IP węzłów k3s (10.6.6.x; Traefik
nasłuchuje na 80/443 na każdym węźle przez ServiceLB). Nie publikuj rekordu
w DNS zewnętrznym.

Logowanie: `http://swarmbot.infra`, konto z sekretu `swarmbot-bootstrap`.

## Weryfikacja po wdrożeniu

```sh
# API żyje:
curl -s --resolve swarmbot.infra:80:10.6.6.6 http://swarmbot.infra/health

# agenci wysyłają staty:
kubectl -n swarmbot logs ds/swarmagent --tail=20
kubectl -n swarmbot logs deploy/swarmbot --tail=20

# rozmieszczenie na węzłach:
kubectl -n swarmbot get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName
```

## Aktualizacja wersji

Nowy tag `vX.Y.Z` w repo → obraz semver w GHCR → podbij tag w `kustomization.yaml`
(sekcja `images:`) i `kubectl apply -k deploy/k3s`. Przy `latest` wystarczy
`kubectl -n swarmbot rollout restart deploy/swarmbot ds/swarmagent`
(`imagePullPolicy: Always`).

## Migracja z namespace `swarmboty` (stary prefiks env)

Instancje wdrożone przed zmianą nazewnictwa (namespace `swarmboty`, env
`SWARMBOTY_*`, baza/user Postgresa `swarmboty`) migruje skrypt
[`migrate-from-swarmboty.sh`](migrate-from-swarmboty.sh) — uruchamiany z WSL,
fazami `verify → migrate → cutover → finalize`. Skrypt przenosi dane
(pg_dump/psql, backup/restore InfluxDB do bazy `swarmbot`), tworzy sekrety
imperatywnie z wartości starych, re-szyfruje hasła rejestrów nową solą
scrypt i weryfikuje kontrakt obrazu (`SWARMBOT_*`), logowanie oraz `iss`
nowego JWT. Stare tokeny JWT tracą ważność — użytkownicy logują się ponownie.
