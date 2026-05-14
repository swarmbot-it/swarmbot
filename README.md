# Swarmbot

Swarmbot is a Node.js monorepo for managing Docker Swarm resources. It contains:

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
npm test
npm run lint
```

Tests and linting currently target the API workspace.

## Docker Compose

Start the full stack with CouchDB, InfluxDB, the Swarmbot app, and the Swarm agent:

```sh
docker compose up --build
```

The compose file exposes the app on:

```text
http://localhost:888
```

## Configuration

The API supports `SWARMBOT_*` environment variables and compatible `SWARMPIT_*` aliases.

Common variables:

- `SWARMBOT_PORT` - API port, defaults to `8080`.
- `SWARMBOT_DB` - CouchDB URL, defaults to `http://localhost:5984`.
- `SWARMBOT_INFLUXDB` - optional InfluxDB URL.
- `SWARMBOT_DOCKER_SOCK` - Docker socket path, defaults to `/var/run/docker.sock`.
- `SWARMBOT_DOCKER_API` - Docker API version, defaults to `1.44`.
- `SWARMBOT_WORK_DIR` - working directory, defaults to `/tmp`.

## Project Layout

```text
apps/
  api/   Node.js API and GraphQL server
  web/   Angular frontend
Dockerfile
docker-compose.yml
package.json
```
