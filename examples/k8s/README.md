# Local Kubernetes (k3d) dev overlay

Run the full Swarmbot stack (app + agent + Postgres + InfluxDB) on a throwaway
[k3d](https://k3d.io) cluster on your laptop, with the API in **real kubernetes
mode** (not mock). This is the local-dev counterpart of the production
manifests in [`../../deploy/k3s`](../../deploy/k3s).

## Requirements

- [k3d](https://k3d.io) (which needs Docker), `kubectl`, and Docker.

## Quick start

```sh
npm run k8s:start      # create the k3d cluster 'swarmbot-dev'
npm run k8s:deploy     # build local images, import them, apply this overlay
npm run k8s:status     # nodes + workloads + pods
# open http://swarmbot.localhost:8088   (login: admin / swarmbot)
npm run k8s:undeploy   # remove the stack (keep the cluster)
npm run k8s:stop       # delete the cluster
```

`swarmbot.localhost` resolves to `127.0.0.1` on most systems; otherwise add it
to your hosts file. Override the exposed port with `SWARMBOT_K8S_PORT`.

## How it differs from `deploy/k3s`

| Production (`deploy/k3s`) | Local dev (`examples/k8s`) |
| --- | --- |
| `ghcr.io/swarmbot-it/*:latest` + `imagePullSecrets` | locally built `*:local`, imported into k3d |
| `nodeSelector`/`nodeAffinity` pin to real nodes | none — schedules on any k3d node |
| `ipAllowList` (RFC1918) on the ingress | none (localhost only) |
| host `swarmbot.infra`, internal DNS | host `swarmbot.localhost` |
| `CHANGE-ME` secrets (set out of band) | committed dev-only secrets |

The RBAC (ServiceAccount + ClusterRole) is identical, so the kubernetes
dashboard behaves the same as in production.

## Applying without the npm scripts

```sh
kubectl apply -k examples/k8s     # against your current kube-context!
```

Prefer `npm run k8s:deploy` — it targets the `swarmbot-dev` cluster explicitly
so you never apply this to the wrong context.
