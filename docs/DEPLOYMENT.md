# Deploying Swarmbot

Swarmbot ships as a **single image that auto-detects its orchestrator** at
startup — Docker Swarm (or a standalone Docker Engine) vs Kubernetes — so the
same build runs everywhere. Force it with `SWARMBOT_ORCHESTRATOR=swarm|kubernetes`.

The solution is two workloads plus two backing stores:

| Component | What it is | Swarm | Kubernetes |
| --- | --- | --- | --- |
| **swarmbot** | API + web UI in one process (port `8080`) | service on a manager | Deployment + Service |
| **swarmagent** | push-only per-node telemetry agent | `global` service | DaemonSet |
| **PostgreSQL** | application database | `db` service | StatefulSet / external |
| **InfluxDB** | metrics store | `influxdb` service | Deployment / external |

Prebuilt images: `ghcr.io/swarmbot-it/swarmbot` and
`ghcr.io/swarmbot-it/swarmagent` (public). To build your own, see
[Building your own images](#building-your-own-images).

---

## Configuration reference

All configuration is via environment variables (see `apps/api/src/config.ts`).
The important ones:

| Variable | Purpose |
| --- | --- |
| `SWARMBOT_DB` | Postgres connection string, e.g. `postgres://user:pass@host:5432/swarmbot` |
| `SWARMBOT_INFLUXDB` | InfluxDB base URL, e.g. `http://influxdb:8086` |
| `SWARMBOT_INFLUXDB_TOKEN` | InfluxDB auth. For InfluxDB 1.x send `user:password`; for 2.x the admin token |
| `SWARMBOT_PORT` | HTTP port (default `8080`) |
| `SWARMBOT_ORCHESTRATOR` | `swarm` \| `kubernetes` \| `auto` (default: auto-detect) |
| `SWARMBOT_KUBECONFIG` | kubeconfig path for Kubernetes mode outside a cluster (in-cluster uses the ServiceAccount) |
| `SWARMBOT_ALLOWED_ORIGINS` | **Comma-separated origins allowed by CORS. MUST include the console's own URL** (e.g. `https://swarmbot.example`) or the browser SPA's module/font/GraphQL requests are blocked (500). |
| `SWARMBOT_BOOTSTRAP_ADMIN` / `SWARMBOT_BOOTSTRAP_PASSWORD` | first-run admin account (created only when the users table is empty) |
| `SWARMBOT_MOCK` | `true` runs with an in-memory DB + mocked engine (demo; no Postgres/Docker needed) |
| `SWARMAGENT_SHARED_SECRET` | optional shared secret the agent must send as `x-agent-token` on `/events` (opt-in) |
| `SWARMBOT_URL` (agent) | base URL of the app the agent posts to, e.g. `http://app:8080` |
| `AGENT_MODE` (agent) | `auto` \| `docker` \| `kubernetes` |

OIDC login is optional — see [OIDC / SSO login](#optional-oidc--sso-login).

---

## Option A — Docker Swarm (your own cluster)

Manifest: [`docker-compose.swarm.yml`](../docker-compose.swarm.yml). It deploys
the app, agent (`global` — one per node), Postgres and InfluxDB on an overlay
network, with the app/DB pinned to a manager node.

**Prerequisites:** a Swarm (`docker swarm init` on the manager if you don't have
one), and the images reachable from every node.

1. Provide secrets/config via the shell or a `.env` beside the compose file:

   ```sh
   export POSTGRES_USER=swarmbot POSTGRES_PASSWORD='change-me' POSTGRES_DB=swarmbot
   export INFLUXDB_USER=swarmbot INFLUXDB_PASSWORD='change-me' INFLUXDB_TOKEN='change-me-token'
   export SWARMBOT_PORT=888          # published port for the UI/API
   export SWARMBOT_TAG=latest SWARMAGENT_TAG=latest
   ```

2. Deploy the stack from the manager:

   ```sh
   docker stack deploy -c docker-compose.swarm.yml swarmbot
   ```

3. Open `http://<manager-ip>:888` and sign in with the bootstrap admin.

4. Verify:

   ```sh
   docker stack services swarmbot
   docker service logs swarmbot_app --tail 20
   curl -fsS http://<manager-ip>:888/health
   ```

**Notes**
- The agent runs as a `global` service, so every node it can schedule on is
  monitored; it reaches the app at `http://app:8080` over the overlay network.
- For production put the app behind a reverse proxy with TLS and set
  `SWARMBOT_ALLOWED_ORIGINS` to the exact URL you serve the UI from.
- The compose file references `swarmbot/swarmbot` / `swarmbot/swarmagent`; point
  `image:` at your registry (or the `ghcr.io/swarmbot-it/*` images) as needed.

A throwaway local Swarm (Docker-in-Docker) for testing is available via
`npm run swarm:start && npm run swarm:deploy` (see the main README).

---

## Option B — Kubernetes on k3s

Manifests: [`deploy/k3s/`](../deploy/k3s) (a Kustomize overlay). k3s ships
Traefik, so the ingress (`50-ingress.yaml`) uses Traefik's `IngressRoute`-style
annotations + an `ipAllowList` Middleware.

1. **Secrets** — edit `deploy/k3s/05-secrets.yaml` (replace every `CHANGE-ME`),
   or create the three secrets out of band and drop that file from
   `kustomization.yaml`. **Never `kubectl apply -k` with the CHANGE-ME file into
   a live namespace** — it overwrites real secrets.

2. **Adjust for your cluster:**
   - image tags — `kustomization.yaml` `images:` (pin a release or `latest`);
   - node placement — the app/DB pin to a node via `nodeSelector`; the agent
     excludes that node via `nodeAffinity`. Change or remove these for your nodes;
   - ingress host — set your hostname in `50-ingress.yaml` and the internal DNS;
   - `SWARMBOT_ALLOWED_ORIGINS` — add your console URL as an env in
     `30-swarmbot.yaml` (e.g. `https://swarmbot.example`).

3. Deploy and verify:

   ```sh
   kubectl apply -k deploy/k3s
   kubectl -n swarmbot get pods -o wide
   kubectl -n swarmbot logs deploy/swarmbot --tail=20     # migrations + orchestrator=kubernetes
   ```

**Bundled vs central databases:** by default the overlay bundles Postgres +
InfluxDB in the namespace. To point at a shared/central engine instead, drop
`10-postgres.yaml`/`20-influxdb.yaml` and set `SWARMBOT_DB`/`SWARMBOT_INFLUXDB`
at the central endpoints — see the variants section in
[`deploy/k3s/README.md`](../deploy/k3s/README.md).

A throwaway local k3s (k3d) cluster is available via
`npm run k8s:start && npm run k8s:deploy` (see [`examples/k8s/`](../examples/k8s)).

---

## Option C — Generic Kubernetes (non-k3s)

The `deploy/k3s/` manifests are **standard Kubernetes** and portable to any
cluster, with one exception: the **ingress** is Traefik-specific. To run on a
different cluster/ingress controller:

- **Ingress** — replace `50-ingress.yaml` with a standard
  `networking.k8s.io/v1` `Ingress` for your controller (ingress-nginx, HAProxy,
  a Gateway API `HTTPRoute`, …) pointing at the `swarmbot` Service on port 8080.
  Provide TLS via your own cert-manager `ClusterIssuer` or existing certs.
- **Node pinning** — remove/adjust the `nodeSelector` (app/DB) and `nodeAffinity`
  (agent) so they match your node labels, or drop them to schedule anywhere.
- **Image pull** — the manifests reference `imagePullSecrets: ghcr-pull`; if the
  images are public (they are), that secret is optional — create it only for a
  private registry, otherwise remove the block.
- **StorageClass** — the PVCs use `local-path` (k3s default). Set your cluster's
  StorageClass in `10-postgres.yaml`/`20-influxdb.yaml`.
- **RBAC** — the `ServiceAccount` + `ClusterRole` in `30-swarmbot.yaml` /
  `40-swarmagent.yaml` are generic and required (the app reads cluster resources
  for the dashboard; the agent reads nodes/pods + kubelet stats). Keep them.

Everything else (namespace, secrets, Postgres, InfluxDB, Deployment, DaemonSet)
applies unchanged. The `examples/k8s/` overlay is a good, minimal starting point
to copy and adapt (local images, no ingress guard, dev secrets).

---

## Building your own images

```sh
# app (repo root)
docker build -t <registry>/swarmbot:<tag> .

# agent (git submodule)
git submodule update --init --recursive
docker build -t <registry>/swarmagent:<tag> ./swarmagent

docker push <registry>/swarmbot:<tag>
docker push <registry>/swarmagent:<tag>
```

Then set the image refs (`SWARMBOT_TAG`/`SWARMAGENT_TAG` for Swarm, or the
`images:` block in `deploy/k3s/kustomization.yaml` for Kubernetes).

---

## Optional: OIDC / SSO login

The console can delegate login to any OIDC provider (the app is a confidential
OIDC client with PKCE; it maps the identity to a user and issues its own
session). Set on the **swarmbot** workload:

| Variable | Example |
| --- | --- |
| `SWARMBOT_OIDC_ISSUER` | `https://idp.example` |
| `SWARMBOT_OIDC_CLIENT_ID` | `swarmbot` |
| `SWARMBOT_OIDC_CLIENT_SECRET` | (from a secret) |
| `SWARMBOT_OIDC_REDIRECT_URI` | `https://swarmbot.example/api/auth/oidc/callback` |
| `SWARMBOT_OIDC_ADMIN_GROUPS` | groups mapped to the `admin` role (comma-separated) |
| `SWARMBOT_OIDC_EDITOR_GROUPS` | groups mapped to `editor` (empty ⇒ everyone else is read-only) |
| `SWARMBOT_CONSOLE_HOSTS` | hosts whose `/` skips the landing and goes straight to login |

Register the redirect URI with your IdP. The feature is inert until
`ISSUER`+`CLIENT_ID`+`CLIENT_SECRET`+`REDIRECT_URI` are all set; password login
keeps working alongside it.

On a host listed in `SWARMBOT_CONSOLE_HOSTS`, the console **auto-redirects to the
IdP** — both the `/` entry point (server-side) and the SPA login page, which
never shows the password form there. To reach the local password login on such a
host anyway, append `?password` (e.g. `https://swarmbot.example/app/login?password`).
