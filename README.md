# swarmbot

swarmbot is a Node.js monorepo for managing Docker Swarm resources. It contains:

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

Run the API (loads `apps/api/.env.development` with `SWARMBOT_MOCK=true` — no CouchDB/Docker required):

```sh
npm run dev:api
```

You should see `swarmbot listening on http://0.0.0.0:8081`. Demo login: `admin` / `swarmboty`.

To use a real CouchDB instead, unset mock mode (e.g. remove `SWARMBOT_MOCK` from `.env.development` or set `SWARMBOT_MOCK=false` and ensure `SWARMBOT_DB` points at CouchDB).

Run the web app:

```sh
npm run dev:web
```

Local `npm run dev:api` uses port **8081** (`apps/api/.env.development`). The Angular dev proxy (`apps/web/proxy.conf.json`) targets the same port. Production and Docker Compose still use **8080** unless overridden with `SWARMBOT_PORT`.

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

API tests use **Vitest** with an in-memory CouchDB/Docker mock. Web UI tests use **Playwright** against `ng serve` with `SWARMBOT_MOCK=true` on the API. Karma was removed.

The dev proxy does not forward `GET /login` to the API (that path is the Angular login screen). GraphQL login uses `/graphql`.

## Internationalization (i18n)

The web UI uses **Transloco** with runtime-loaded JSON dictionaries:

- `apps/web/public/assets/i18n/pl.json`
- `apps/web/public/assets/i18n/en.json`
- ...

The active language is stored in `localStorage` under `swarmbot.lang`. On first visit, Polish is preferred when the browser language starts with `pl`; otherwise English is used.

Switch language from the user menu in the top bar. PrimeNG table labels (paginator, etc.) are synchronized via `PrimeNGConfig.setTranslation`.

Every HTTP and GraphQL request sends `Accept-Language`. The API returns localized error messages from `apps/api/src/i18n/messages/`.

## Demo / mock mode

For a quick demo without Docker, CouchDB, or InfluxDB, set `SWARMBOT_MOCK=true`:

```sh
# Windows PowerShell
$env:SWARMBOT_MOCK="true"; npm run dev:api
```

```sh
# macOS / Linux
SWARMBOT_MOCK=true npm run dev:api
```

In mock mode the API uses an in-memory CouchDB shim and a mocked Docker engine with sample services and nodes. A demo admin user `admin / swarmboty` is created automatically.

Run the Angular dev server in another terminal:

```sh
npm run dev:web
```

Then open http://localhost:4200 and sign in as `admin` / `swarmboty`.

## Docker Compose — development

`examples/docker-compose.dev.yml` starts the full development stack with hot-reload and live-reload already wired up.

### Full stack (real databases)

```sh
docker compose -f examples/docker-compose.dev.yml up
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
$env:SWARMBOT_MOCK="true"; docker compose -f examples/docker-compose.dev.yml up api web

# macOS / Linux
SWARMBOT_MOCK=true docker compose -f examples/docker-compose.dev.yml up api web
```

### With the Rust agent (optional)

```sh
docker compose -f examples/docker-compose.dev.yml --profile agent up
```

### Recommended setup on Windows (faster HMR)

File watching inside Docker on Windows uses polling, which is slower than native. For the best developer experience run only the databases and the API in Docker and start the Angular server on the host:

```sh
# terminal 1 — infrastructure + API
docker compose -f examples/docker-compose.dev.yml up db influxdb api

# terminal 2 — Angular on host (for host API use `npm run dev:api` on 8081; proxy targets localhost:8081)
npm run dev:web
```

## Local Docker Swarm test cluster (DinD)

Scripts in `scripts/` run a local Swarm cluster inside Docker-in-Docker (DinD) containers: one manager and two workers on the `swarm-net` bridge network. No virtual machine or external infrastructure is required.

> **Requirements:** Docker must be running on the host.

### Start the cluster

```sh
npm run swarm:start
```

The script creates `swarm-net`, starts `swarm-manager`, `swarm-worker-1`, and `swarm-worker-2`, initializes Swarm, and joins the workers. It finishes by printing `docker node ls`.

### Check status

```sh
npm run swarm:status
```

Shows container status, Swarm nodes, and any deployed services and stacks.

### Stop and remove the cluster

```sh
npm run swarm:stop
```

Removes all three containers and the `swarm-net` network.

---

### Shell into the manager (interactive)

```sh
docker exec -it swarm-manager sh
```

Inside the container you have full `docker` CLI access to the whole cluster:

```sh
# list nodes
docker node ls

# deploy a test service
docker service create --name test --replicas 2 nginx:alpine

# list services and tasks
docker service ls
docker service ps test

# remove the service
docker service rm test

# leave the container
exit
```

You can also run commands from the host without entering the container:

```sh
docker exec swarm-manager docker node ls
docker exec swarm-manager docker service ls
```

---

### Deploy the full stack to local Swarm

`examples/docker-compose.local.yml` defines the full stack (app, db, influxdb, agent) for deployment to the DinD cluster. `npm run swarm:deploy` starts the DinD cluster automatically when it is not running (`swarm:start`), then builds images on the host, loads them into DinD nodes, and deploys the stack via the manager container:

```sh
npm run swarm:deploy
```

When finished, open **http://localhost:888** (port `888` is published from the `swarm-manager` DinD container to your host). Login: **admin** / **swarmboty**.

> Do not use bare `http://172.18.0.2/` — that is the manager container’s internal Docker bridge IP. On Windows it is often unreachable from the browser, and the app listens on port **888**, not 80.

```sh
# update after code changes (full rebuild + redeploy)
npm run swarm:deploy

# remove the stack (cluster stays up)
npm run swarm:undeploy
```

> DinD images (`docker:27-dind`) run isolated Docker daemons separate from the host. The script therefore saves built images to a temporary file and loads them on each node — no external registry required.

---

### Point swarmbot API at the test cluster

The manager exposes the Docker API over TCP on port `2375` (no TLS — the start script sets `DOCKER_TLS_CERTDIR=""`). To make swarmbot API talk to the test Swarm instead of the local daemon, resolve the manager IP and set:

**macOS / Linux:**

```sh
MANAGER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' swarm-manager)
SWARMBOT_DOCKER_SOCK=tcp://$MANAGER_IP:2375 npm run dev:api
```

**Windows PowerShell:**

```powershell
$MANAGER_IP = docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' swarm-manager
$env:SWARMBOT_DOCKER_SOCK = "tcp://${MANAGER_IP}:2375"
npm run dev:api
```

Then open http://localhost:4200 (after `npm run dev:web`) and sign in as `admin` / `swarmboty`. The UI will show resources from the test cluster.

> **Note:** if `SWARMBOT_DOCKER_SOCK` is unset, the API uses the local socket `/var/run/docker.sock` (default).

---

## Docker Compose — production

Start the full production stack with CouchDB, InfluxDB, the swarmbot app, and the Swarm agent:

```sh
docker compose -f examples/docker-compose.yml up --build
```

The compose file exposes the app on:

```text
http://localhost:888
```

## Kubernetes / k3s

swarmbot runs on **Docker Swarm and Kubernetes (k3s) with the same image** — the
backend is auto-detected at startup:

1. in-cluster ServiceAccount (`KUBERNETES_SERVICE_HOST` + token file) → **kubernetes**;
2. a kubeconfig (`SWARMBOT_KUBECONFIG`, then `KUBECONFIG`) → **kubernetes**;
3. a reachable Docker socket (`SWARMBOT_DOCKER_SOCK`) → **swarm**;
4. none → startup error with configuration hints.

Override with `SWARMBOT_ORCHESTRATOR=swarm|kubernetes|auto` (default `auto`).
The active mode is exposed in `GET /version`, the GraphQL `version.orchestrator`
field, and as a badge in the UI top bar.

### Concept mapping (feature matrix)

| swarmbot         | Docker Swarm                    | Kubernetes/k3s                                                                                        |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node              | swarm node                      | `v1.Node` (role from `node-role.kubernetes.io/*` labels)                                              |
| Service           | swarm service                   | Deployment / StatefulSet / DaemonSet                                                                  |
| Task              | swarm task                      | Pod (slot = StatefulSet ordinal, state from `status.phase`)                                           |
| Stack             | `com.docker.stack.namespace`    | Namespace                                                                                             |
| Networks          | overlay networks                | — (empty list)                                                                                        |
| Volumes           | docker volumes                  | PersistentVolumeClaims                                                                                |
| Secrets / Configs | swarm secrets/configs           | Secrets (without SA tokens) / ConfigMaps                                                              |
| Stack deploy      | `docker stack deploy` (Compose) | manifest YAML apply into the stack's namespace; Compose input returns `NOT_SUPPORTED_IN_ORCHESTRATOR` |
| Container logs    | Dockerode container logs        | pod logs via the apiserver                                                                            |
| Agent metrics     | container id = docker id        | container id = `{namespace}/{pod}/{container}` + `orchestrator: "kubernetes"` in the payload          |

The push-only `swarmagent` posts to `POST /events` in both modes; on Kubernetes
InfluxDB series are tagged with `orchestrator` and `namespace` (the namespace also
fills the `stack` tag so existing dashboards keep working).

### Local k3d cluster

Requires the [k3d](https://k3d.io) CLI:

```bash
npm run k3d:start    # create/start the 'swarmbot' cluster (1 server + 2 agents)
npm run k3d:deploy   # kubectl apply -f examples/k8s (app, CouchDB, InfluxDB, agent DaemonSet)
npm run k3d:stop     # delete the cluster
```

After deploy, open http://localhost:8888 (login: `admin` / `swarmboty`).
You can also run the API on the host against the cluster — auto-detection picks
kubernetes mode up from your `KUBECONFIG`.

### Mock Kubernetes mode

For UI demos/tests without any cluster:

```bash
SWARMBOT_MOCK=true SWARMBOT_MOCK_ORCHESTRATOR=kubernetes npm run dev:api
npm run test:e2e:k8s   # Playwright e2e against the mock-kubernetes API
```

## Configuration

The API supports `SWARMBOT_*` environment variables.

Common variables:

- `SWARMBOT_PORT` - API port, defaults to `8080`.
- `SWARMBOT_DB` - CouchDB URL, defaults to `http://localhost:5984`.
- `SWARMBOT_INFLUXDB` - optional InfluxDB URL.
- `SWARMBOT_DOCKER_SOCK` - Docker socket path, defaults to `/var/run/docker.sock`.
- `SWARMBOT_DOCKER_CLI` - path to the `docker` binary for `stack deploy` (optional; auto-detected on Windows).
- `SWARMBOT_DOCKER_API` - Docker API version, defaults to `1.44`.
- `SWARMBOT_WORK_DIR` - working directory, defaults to `/tmp`.
- `SWARMBOT_ORCHESTRATOR` - backend selection: `swarm`, `kubernetes` or `auto` (default).
- `SWARMBOT_KUBECONFIG` - explicit kubeconfig path for kubernetes mode (`KUBECONFIG` works too).
- `SWARMBOT_K8S_NAMESPACE` - restrict kubernetes views to a single namespace (default: all).
- `SWARMBOT_MOCK_ORCHESTRATOR` - which backend the mock mode imitates: `swarm` (default) or `kubernetes`.

## Project Layout

```text
apps/
  api/   Node.js API and GraphQL server
  web/   Angular frontend
Dockerfile
examples/          docker-compose stacks (dev, local Swarm, production) + k8s/ manifests
package.json
```

## License

MIT — see [LICENSE](LICENSE).
