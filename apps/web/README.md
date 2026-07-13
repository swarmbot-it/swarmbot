# SwarmBoty Web UI

Angular **21** single-page application for the SwarmBoty Docker Swarm admin console. It talks to the API through Apollo GraphQL (`/graphql`), uses PrimeNG for data tables and widgets, and Transloco for runtime i18n (9 languages).

## Requirements

- Node.js 20+
- npm (monorepo workspace)
- API running on port **8081** for host dev (`npm run dev:api`; see repository root `README.md`)

## Development server

From the monorepo root:

```bash
npm run dev:web
```

Or from this directory:

```bash
npm start
# equivalent: ng serve
```

Open [http://localhost:4200](http://localhost:4200). The dev server proxies API paths (`/graphql`, `/health`, …) to `http://localhost:8081` via `proxy.conf.json`.

> **Note:** `GET /login` is handled by Angular (login screen). It is **not** proxied to the API. Authentication uses the GraphQL `login` mutation on `/graphql`.

## Signing in (development)

1. Start the API in **mock mode** (in-memory CouchDB + sample Swarm data):

   ```powershell
   # Windows PowerShell
   $env:SWARMBOT_MOCK="true"; npm run dev:api
   ```

   ```bash
   # macOS / Linux
   SWARMBOT_MOCK=true npm run dev:api
   ```

2. Start the web app (`npm run dev:web` in another terminal).

3. Open [http://localhost:4200/login](http://localhost:4200/login) and sign in with:

   | Field    | Value       |
   | -------- | ----------- |
   | Username | `admin`     |
   | Password | `swarmboty` |

Mock mode creates this demo admin automatically. Without mock mode you need a real CouchDB-backed user (see root `README.md`).

After login you are redirected to `/app/dashboard`. The JWT is stored in `localStorage` under `swarmbot.token`.

If the API was restarted (especially in mock mode), the old token is invalid. The UI signs you out automatically when GraphQL returns `UNAUTHENTICATED`, or you can clear `swarmbot.token` in DevTools → Application → Local Storage and sign in again.

## Testing

**Karma / Jasmine were removed.** UI regression tests use **[Playwright](https://playwright.dev/)**.

From the monorepo root:

```bash
npm run test:e2e          # headless; starts mock API + ng serve when needed
npm run test:e2e:ui       # Playwright UI mode (from apps/web)
npm run test:all          # API Vitest + Playwright
```

From `apps/web`:

```bash
npm run test:e2e
npm run test:e2e:ui
```

E2E specs live in `e2e/`. `playwright.config.js` sets `SWARMBOT_MOCK=true` on the API and reuses an existing dev server when not in CI.

**Type-checking** (no unit test runner in this package):

```bash
npm run lint
```

## Build

```bash
npm run build
```

Production output: `dist/web/`. Fonts are self-hosted under `public/assets/fonts/` (Plus Jakarta Sans, JetBrains Mono) — no Google Fonts CDN.

## Internationalization

- Dictionaries: `public/assets/i18n/{pl,en,de,fr,es,it,zh,ja,ko}.json`
- Active language: `localStorage` key `swarmbot.lang`
- Switch language from the user menu (dropdown in the top bar popover)
- Theme (light/dark) is toggled only via the sun/moon control in the top bar, not in the menu
- `Accept-Language` is sent on HTTP and GraphQL requests (e.g. `pl-PL`, `de-DE`, `zh-CN`)

## API documentation (JSDoc / Compodoc)

Source files use **JSDoc** comments for Compodoc. Generate HTML docs from this directory:

```bash
npm run docs        # build to documentation/
npm run docs:serve  # build and open local doc server
```

Key modules: `src/app/core/` (auth, i18n, theme, GraphQL), `src/app/layout/`, `src/app/shared/`, `src/app/pages/`.

## Project layout

| Path | Purpose |
| ---- | ------- |
| `src/app/core/` | Auth, theme, i18n, GraphQL operations |
| `src/app/layout/` | Shell, sidebar, topbar |
| `src/app/pages/` | Routed feature pages |
| `src/app/forms/` | Create-resource modals |
| `src/app/shared/` | Reusable UI primitives |
| `e2e/` | Playwright tests |
| `public/assets/` | i18n JSON, fonts |

## Additional resources

- [Angular CLI](https://angular.dev/tools/cli)
- [Compodoc](https://compodoc.app/)
- Repository root `README.md` for Docker Compose, production build, and API details
