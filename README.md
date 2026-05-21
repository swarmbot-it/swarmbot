# Swarmboty

Swarmboty is a Node.js monorepo for managing Docker Swarm resources. It contains:

- `apps/api` - Express and Apollo GraphQL API for authentication, Docker access, events, and persistence.
- `apps/web` - Angular web UI built with Apollo Angular and PrimeNG.

## Requirements

- Node.js 20 or newer
- npm
- Docker, when using Docker-related API features or `docker-compose`

## Install

```sh
npm install
```

## Development

Run the API (loads `apps/api/.env.development` with `SWARMBOTY_MOCK=true` — no CouchDB/Docker required):

```sh
npm run dev:api
```

You should see `Swarmboty listening on http://0.0.0.0:8081`. Demo login: `admin` / `swarmboty`.

To use a real CouchDB instead, unset mock mode (e.g. remove `SWARMBOTY_MOCK` from `.env.development` or set `SWARMBOTY_MOCK=false` and ensure `SWARMBOTY_DB` points at CouchDB).

Run the web app:

```sh
npm run dev:web
```

Local `npm run dev:api` uses port **8081** (`apps/api/.env.development`). The Angular dev proxy (`apps/web/proxy.conf.json`) targets the same port. Production and Docker Compose still use **8080** unless overridden with `SWARMBOTY_PORT`.

## Build

```sh
npm run build
```

This builds both workspaces. The Docker build also copies the compiled web app into the API `public` directory so the runtime container can serve the UI and API from one process.

## Test and Lint

```sh
npm test                 # API unit tests (Vitest)
npm run test:coverage    # API coverage report
npm run test:e2e         # Web E2E (Playwright; starts mock API + ng serve)
npm run test:all         # Vitest + Playwright
npm run lint
```

API tests use **Vitest** with an in-memory CouchDB/Docker mock. Web UI tests use **Playwright** against `ng serve` with `SWARMBOTY_MOCK=true` on the API. Karma was removed.

The dev proxy does not forward `GET /login` to the API (that path is the Angular login screen). GraphQL login uses `/graphql`.

## Internationalization (i18n)

The web UI uses **Transloco** with runtime-loaded JSON dictionaries:

- `apps/web/public/assets/i18n/pl.json`
- `apps/web/public/assets/i18n/en.json`

The active language is stored in `localStorage` under `swarmboty.lang` (`pl` or `en`). On first visit, Polish is preferred when the browser language starts with `pl`; otherwise English is used.

Switch language from the user menu in the top bar (PL / EN). PrimeNG table labels (paginator, etc.) are synchronized via `PrimeNGConfig.setTranslation`.

Every HTTP and GraphQL request sends `Accept-Language` (`pl-PL` or `en-US`). The API returns localized error messages from `apps/api/src/i18n/messages/`.

## Demo / mock mode

For a quick demo without Docker, CouchDB, or InfluxDB, set `SWARMBOTY_MOCK=true`:

```sh
# Windows PowerShell
$env:SWARMBOTY_MOCK="true"; npm run dev:api
```

```sh
# macOS / Linux
SWARMBOTY_MOCK=true npm run dev:api
```

In mock mode the API uses an in-memory CouchDB shim and a mocked Docker engine with sample services and nodes. A demo admin user `admin / swarmboty` is created automatically.

Run the Angular dev server in another terminal:

```sh
npm run dev:web
```

Then open http://localhost:4200 and sign in as `admin` / `swarmboty`.

## Docker Compose — development

`docker-compose.dev.yml` starts the full development stack with hot-reload and live-reload already wired up.

### Full stack (real databases)

```sh
docker compose -f docker-compose.dev.yml up
```

| Service            | URL                           | Description      |
| ------------------ | ----------------------------- | ---------------- |
| Angular dev server | http://localhost:4200         | Live-reload, HMR |
| API (GraphQL)      | http://localhost:8080/graphql | tsx hot-reload   |
| API health         | http://localhost:8080/health  |                  |
| CouchDB Fauxton    | http://localhost:5984/\_utils | Admin UI         |
| InfluxDB           | http://localhost:8086         | HTTP API         |

Sign in as `admin` / `swarmboty`.

The API and Angular containers mount the source tree — saving a `.ts` or `.html` file restarts the API or triggers Angular's live-reload automatically.

### Mock mode (no databases or Docker socket required)

```sh
# Windows PowerShell
$env:SWARMBOTY_MOCK="true"; docker compose -f docker-compose.dev.yml up api web

# macOS / Linux
SWARMBOTY_MOCK=true docker compose -f docker-compose.dev.yml up api web
```

### With the Rust agent (optional)

```sh
docker compose -f docker-compose.dev.yml --profile agent up
```

### Recommended setup on Windows (faster HMR)

File watching inside Docker on Windows uses polling, which is slower than native. For the best developer experience run only the databases and the API in Docker and start the Angular server on the host:

```sh
# terminal 1 — infrastructure + API
docker compose -f docker-compose.dev.yml up db influxdb api

# terminal 2 — Angular on host (for host API use `npm run dev:api` on 8081; proxy targets localhost:8081)
npm run dev:web
```

## Testowy klaster Docker Swarm (DinD)

Skrypty w `scripts/` uruchamiają lokalny klaster Swarm wewnątrz kontenerów Docker-in-Docker (DinD): jeden manager i dwóch workerów połączonych siecią mostkową `swarm-net`. Nie jest potrzebna maszyna wirtualna ani zewnętrzna infrastruktura.

> **Wymagania:** Docker musi być uruchomiony na hoście.

### Uruchomienie klastra

```sh
npm run swarm:start
```

Skrypt tworzy sieć `swarm-net`, startuje kontenery `swarm-manager`, `swarm-worker-1`, `swarm-worker-2`, inicjalizuje Swarm i dołącza workerów. Na koniec wyświetla `docker node ls`.

### Sprawdzenie stanu

```sh
npm run swarm:status
```

Wyświetla stan kontenerów, listę node'ów Swarm oraz ewentualne wdrożone serwisy i stacki.

### Zatrzymanie i usunięcie klastra

```sh
npm run swarm:stop
```

Usuwa wszystkie trzy kontenery i sieć `swarm-net`.

---

### Logowanie do managera (interaktywna powłoka)

```sh
docker exec -it swarm-manager sh
```

Wewnątrz kontenera dostępny jest pełnoprawny `docker` CLI z widokiem na cały klaster:

```sh
# lista node'ów
docker node ls

# wdrożenie testowego serwisu
docker service create --name test --replicas 2 nginx:alpine

# lista serwisów i tasków
docker service ls
docker service ps test

# usunięcie serwisu
docker service rm test

# wyjście z kontenera
exit
```

Polecenia można też wykonywać bezpośrednio z hosta bez wchodzenia do kontenera:

```sh
docker exec swarm-manager docker node ls
docker exec swarm-manager docker service ls
```

---

### Wdrożenie całego stacku do lokalnego Swarm

`docker-compose.local.yml` definiuje kompletny stack (app, db, influxdb, agent) przeznaczony do wdrożenia do klastra DinD. Skrypt buduje obrazy na hoście, ładuje je do kontenerów DinD przez `docker cp` + `docker load`, a następnie wdraża stack przez TCP do demona managera:

```sh
npm run swarm:deploy
```

Po zakończeniu skrypt wypisze adres URL: `http://MANAGER_IP:888`.

```sh
# aktualizacja po zmianie kodu (pełny rebuild + redeploy)
npm run swarm:deploy

# usunięcie stacku (klaster pozostaje)
npm run swarm:undeploy
```

> Obrazy DinD (`docker:27-dind`) mają własne demony Docker izolowane od hosta. Dlatego skrypt zapisuje zbudowane obrazy do pliku tymczasowego i ładuje je do każdego node'a — bez potrzeby zewnętrznego registry.

---

### Podłączenie SwarmBoty API do testowego klastra

Manager udostępnia Docker API przez TCP na porcie `2375` (bez TLS — flaga `DOCKER_TLS_CERTDIR=""` jest ustawiona przez skrypt startowy). Aby API SwarmBoty trafiało do testowego Swarm zamiast lokalnego demona, pobierz IP managera i przekaż go przez zmienną środowiskową:

**macOS / Linux:**
```sh
MANAGER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' swarm-manager)
SWARMBOTY_DOCKER_HOST=tcp://$MANAGER_IP:2375 npm run dev:api
```

**Windows PowerShell:**
```powershell
$MANAGER_IP = docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' swarm-manager
$env:SWARMBOTY_DOCKER_HOST = "tcp://${MANAGER_IP}:2375"
npm run dev:api
```

Następnie otwórz http://localhost:4200 (po uruchomieniu `npm run dev:web`) i zaloguj się jako `admin` / `swarmboty`. Panel będzie pokazywał zasoby testowego klastra.

> **Uwaga:** jeśli `SWARMBOTY_DOCKER_HOST` nie jest ustawione, API używa lokalnego socketu `/var/run/docker.sock` (domyślnie).

---

## Docker Compose — production

Start the full production stack with CouchDB, InfluxDB, the Swarmboty app, and the Swarm agent:

```sh
docker compose up --build
```

The compose file exposes the app on:

```text
http://localhost:888
```

## Configuration

The API supports `SWARMBOTY_*` environment variables.

Common variables:

- `SWARMBOTY_PORT` - API port, defaults to `8080`.
- `SWARMBOTY_DB` - CouchDB URL, defaults to `http://localhost:5984`.
- `SWARMBOTY_INFLUXDB` - optional InfluxDB URL.
- `SWARMBOTY_DOCKER_SOCK` - Docker socket path, defaults to `/var/run/docker.sock`.
- `SWARMBOTY_DOCKER_API` - Docker API version, defaults to `1.44`.
- `SWARMBOTY_WORK_DIR` - working directory, defaults to `/tmp`.

## Project Layout

```text
apps/
  api/   Node.js API and GraphQL server
  web/   Angular frontend
Dockerfile
docker-compose.yml
package.json
```

## License

MIT — see [LICENSE](LICENSE).
