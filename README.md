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

Run the API:

```sh
npm run dev:api
```

Run the web app:

```sh
npm run dev:web
```

The API listens on port `8080` by default. The Angular dev server uses the default Angular development port unless configured otherwise.

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

# terminal 2 — Angular on host (proxy already points at localhost:8080)
npm run dev:web
```

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
