# design-qa — pixel-perfect suite for the swarmbot.it admin mockup

Playwright suite that locks the **swarmbot.it** admin panel to its reference mockup: full-screen and per-panel visual regression, screenshot-independent geometry checks, and the demo/login/theme flows.

`mockup/` is a verbatim copy of the [claude.ai/design project](https://claude.ai/design/p/8e3dc893-1772-4f55-b43c-017ce584e2ea), imported through the `claude_design` MCP. It is the specification — the tests measure it, they never restyle it. The only edits made to it are four `data-testid` attributes, listed below.

## Running

```bash
npm install                      # from the repo root, or inside design-qa
npx playwright install chromium  # run automatically by postinstall
npm run warm                     # once, with network — caches React/Babel + webfonts
npm test                         # the whole suite
```

From the repo root: `npm run test:design`.

Focused runs:

```bash
npm run test:visual   # screenshots
npm run test:layout   # geometry and copy
npm run test:flows    # login, demo read-only, theme, counts
npm run test:ui       # interactive runner
npm run report        # open the last HTML report
```

### Baselines

Baselines live in `tests/__screenshots__/` and are committed. Regenerate after an intentional design change:

```bash
npm run update-snapshots
```

Text rasterisation differs between operating systems, so baselines are only portable across machines that render identically. If your CI does not match your workstation, generate them in the same container CI uses:

```bash
npm run update-snapshots:docker   # mcr.microsoft.com/playwright:v1.62.1-jammy
```

Keep that image tag in step with the `@playwright/test` version in `package.json`.

## How determinism is achieved

Pixel comparison is worthless if the page can render two different ways. Five things could, and each is pinned:

| Source of drift                                          | Handling                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `data.js` seeds per-task CPU/memory with `Math.random()` | `addInitScript` replaces `Math.random` with a seeded mulberry32 before any page script runs                    |
| Infinite CSS keyframes on the logo and boot mark         | `contextOptions.reducedMotion: 'reduce'` (the mockup guards them) plus a global freeze stylesheet              |
| Webfonts arriving after first paint, or not at all       | `document.fonts.ready` is awaited and both families are asserted loaded — a fallback face fails the run loudly |
| React/Babel/webfonts fetched from CDNs at run time       | Requests to unpkg and Google Fonts replay from `.netcache/`                                                    |
| A ~2.3s boot overlay that covers the whole shell         | `settle()` waits for `[data-screen-label]`, the marker that only renders once booting is over                  |

On top of that: fixed 1440×900 viewport, `deviceScaleFactor: 1`, chromium only, UTC, `page.clock.setFixedTime`, and a `webServer` that is a 60-line zero-dependency Node static server rather than `npx serve` (no registry round-trip mid-run).

The pointer is parked at `(0, 0)` after every navigation. `.sidebar__item:hover` outranks `.sidebar__item--active` on specificity, so leaving the cursor where it clicked would otherwise bake a hover state into every screenshot taken after a nav click.

The boot wait deserves a note, because the obvious version of it is wrong. `.sb-boot` is absent in two very different states — after the overlay goes away, and before React has mounted anything at all — so waiting on absence alone returns instantly on a blank document. Under parallel-worker CPU contention (seven JSX files through Babel) that produced blank element captures roughly once in thirty runs. Waiting for `[data-screen-label]` instead proves both that React mounted and that boot finished.

### Tolerances

- **Static panels** — `maxDiffPixelRatio: 0` with `threshold: 0.01`. Both halves matter, see below.
- **Generated content** — `maxDiffPixels: 50` plus `mask:` over the generated regions. Applies only to the Infra Map service chips, where the seeded figures are re-aggregated across 52 elements and a `data.js` edit would otherwise redden the entire screen instead of pointing at the panel that moved.

#### Why `threshold` is set explicitly

`maxDiffPixelRatio: 0` is not by itself a pixel-perfect gate. Playwright applies `threshold` — a per-pixel perceptual (YIQ) distance, **default 0.2** — _before_ a pixel is eligible to be counted, so a zeroed counter still tolerates every sub-20% change. Measured consequence of leaving the default in place: swapping a nav item's resting baseline for its hover baseline (95.5% of pixels changed, worst pixel 0.153) compared as **equal**. All four hover pairs were affected, i.e. none of the hover tests verified colour at all.

`threshold: 0.01` rather than `0`: the suite renders bit-identically on a single machine, but a hair of anti-alias noise is normal once baselines move between environments, and 0.01 still separates the tightest pair by a wide margin (btn-secondary and btn-icon sit at 0.042). After the change all four pairs are detected — 7756, 3886, 2050 and 1024 differing pixels respectively.

Raise it to 0.02 only if a real environment shows anti-alias flake, and only after ruling out a determinism bug first: the one instability the tightened threshold exposed here turned out to be the boot-overlay race described above, not sub-pixel noise.

### The `.netcache` directory

Populated by `npm run warm`, git-ignored. The unpkg scripts carry `integrity="sha384-…"` attributes so they cannot silently change; the ~100 KB of Google Fonts responses can, which is the real reason the cache exists. Cache the directory in CI for hermetic, offline-capable runs.

## Coverage

| Screen         | `data-screen-label` | Visual (full)  | Visual (panels)                                                                      | Geometry                                                                    | Flows                                             |
| -------------- | ------------------- | -------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------- |
| Dashboard      | `01 Dashboard`      | light + dark   | summary row, 4 summary cards, donut row, 3 donut tiles, utilization card, nodes card | column edges, header inset, gutters, row alignment, no overlap, no h-scroll | subtitle totals                                   |
| Load           | `02 Load`           | light + dark   | —                                                                                    | column edges, header inset, no overlap, no h-scroll                         | —                                                 |
| Stacks         | `03 Stacks`         | light + dark   | table, toolbar                                                                       | + button height/padding/alignment                                           | demo read-only, theme persistence, modal backdrop |
| Services       | `04 Services`       | light + dark   | table                                                                                | ″                                                                           | header count                                      |
| Tasks          | `05 Tasks`          | light + dark   | table                                                                                | ″                                                                           | header count                                      |
| Infra Map      | `06 Infra Map`      | light + dark ¹ | legend, 2 node cards ¹, placement summary, cluster totals, key flows                 | + even manager/worker rows                                                  | reachable in demo mode                            |
| Nodes          | `07 Nodes`          | light + dark   | node grid, node card                                                                 | + row gutters, tile containment                                             | header count                                      |
| Networks       | `08 Networks`       | light + dark   | table                                                                                | + button height/padding/alignment                                           | header count                                      |
| Volumes        | `09 Volumes`        | light + dark   | table, pagination                                                                    | ″                                                                           | header count, pagination total                    |
| Secrets        | `10 Secrets`        | light + dark   | table                                                                                | ″                                                                           | demo read-only                                    |
| Configs        | `11 Configs`        | light + dark   | table                                                                                | ″                                                                           | demo read-only                                    |
| Registries     | `12 Registries`     | light + dark   | table                                                                                | ″                                                                           | demo read-only                                    |
| Users          | `13 Users`          | light + dark   | table                                                                                | ″                                                                           | demo read-only, count pill                        |
| Shell (chrome) | —                   | light + dark   | sidebar, sidebar footer, topbar + demo badge                                         | 248px column, 60px topbar, nav order, gaps, count-pill alignment, type ramp | theme toggle, logout                              |
| Demo login     | —                   | login card     | —                                                                                    | Polish copy verbatim, no wrapping labels                                    | pre-filled → admin                                |

¹ masked + `maxDiffPixels: 50` — generated values re-aggregated across 52 chips.

Interaction states covered separately in `tests/visual/states.spec.ts`: nav item resting/hover/active/active-with-count, primary/secondary/icon buttons resting + hover, both theme-toggle states, table row hover.

**Totals:** 194 tests, 110 baselines.

## Layout

```
design-qa/
├── mockup/                     verbatim design sources (the specification)
├── playwright.config.ts        1440x900, chromium, zero-tolerance defaults
├── reporters/
│   └── expected-failures.ts    surfaces test.fail() outcomes in the console
├── scripts/
│   ├── static-server.mjs       zero-dependency webServer
│   └── warm-cache.mjs          one-off third-party cache warm
└── tests/
    ├── helpers/
    │   ├── mockup.ts           NAV catalog, dataset sizes, theme.css metrics
    │   ├── net.ts              third-party cache routing
    │   └── ui.ts               freezeUI, gotoPage, setTheme, expectPixelPerfect, box helpers
    ├── visual/                 pages.spec, panels.spec, states.spec
    ├── layout/                 sidebar.spec, buttons.spec, grid.spec, labels.spec
    ├── flows/                  login.spec, demo-readonly.spec, theme.spec, nav-counts.spec
    └── __screenshots__/        committed baselines
```

## Changes made to the mockup

Four `data-testid` attributes. Nothing else — no markup, styling, or copy was altered, and none of these affect rendering. Everywhere else the suite selects on roles, verbatim text, or hooks the mockup already had (`data-label` on nav items, `data-screen-label` on page roots, BEM classes).

| File            | Element                     | Attribute                         | Why                                                                                       |
| --------------- | --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `app.jsx`       | DEMO · READ-ONLY badge      | `data-testid="demo-badge"`        | Inline-styled `<span>` with no class; text matching alone is brittle against copy changes |
| `app.jsx`       | Toast root                  | `data-testid="toast"`             | Same — the read-only flow asserts on it repeatedly                                        |
| `infra-map.jsx` | `InfraNodeCard` root        | `data-testid="infra-node-{host}"` | Bare `.card`; a text selector also matches the Cluster totals card, which names a host    |
| `infra-map.jsx` | Per-service `mem NN%` value | `data-testid="infra-svc-mem"`     | Mask target for the generated memory figures                                              |

## Findings

Two defects the suite surfaced in the mockup. **Both have since been fixed at the source** and the suite now guards against their return.

### 1. Nodes page overflowed horizontally at 1440×900 — fixed

`.node-card__charts` is `grid-template-columns: repeat(3, 1fr)` inside a ~368px card. A `.node-mini` used to have a hard floor of 140px — it wrapped a fixed `width={120}` `<Sparkline>` plus 10px of padding a side — which forced all three tracks to 140px. With two 10px gaps the row needed **440px in a 332px content box**, so the third tile (DISK) was pushed past the card's right border and clipped, and `.app__main` reported `scrollWidth` 1255 against `clientWidth` 1192.

Fixed in `components.jsx` / `pages.jsx`: `Sparkline` gained a `fluid` prop that renders `width="100%"` over a `viewBox` with `preserveAspectRatio="none"`, and `MiniMetric` passes `fluid={true}`. The tile now shrinks with its track (measured: 101.7px tile holding an 81.7px sparkline) and the page no longer scrolls.

Guarded by:

- `Nodes does not scroll horizontally` — a plain assertion now, no `test.fail()`.
- `the node card chart row fits inside the card` — three tracks plus two gaps must fit the chart row.
- `every node mini-metric stays inside its card on both themes` — every tile's bounding box inside its card's, across all 8 cards and both themes. This is the assertion that would have caught the original clipping directly.

### 2. Duplicate screen numbering — fixed

`data-screen-label` numbers used to collide (`02 Load` and `02 Stacks`) and Infra Map carried no number at all. The mockup now numbers all thirteen screens in navigation order, `01 Dashboard` through `13 Users`, with Infra Map as `06 Infra Map` and the detail screens following their parent (`03 Stacks › {name}`, `04 Services · {name}`, `05 Tasks · {id}`, `14 Profile`).

The suite keys on these strings through a single catalog (`NAV` in `tests/helpers/mockup.ts`), so the renumbering was a one-place edit. `settle()` waits on the bare `[data-screen-label]` attribute and was unaffected.

### Tracking a defect that is not yet fixed

There are no expected failures in the suite today. When one is needed, mark the assertion `test.fail()` and `reporters/expected-failures.ts` will report its status after every run — Playwright otherwise folds an expected failure into the passed count, leaving `expectedStatus: "failed"` in the JSON report as the only trace:

```
OCZEKIWANE PORAŻKI
  OK       chromium > layout/grid.spec.ts > horizontal overflow > Nodes does not scroll horizontally
           nadal failuje zgodnie z oczekiwaniem — defekt makiety nieusunięty
```

and, once the mockup is fixed and the assertion starts passing:

```
OCZEKIWANE PORAŻKI — WYMAGANA AKCJA
  UWAGA    chromium > … > Nodes does not scroll horizontally
           zaczął przechodzić — zaktualizuj test (usuń test.fail())
           i zgłoś naprawę makiety w design-qa/README.md ("Findings")
```

With no `test.fail()` tests in the run the reporter stays silent. It is informational and never changes the exit code; Playwright itself already fails a run in which a `test.fail()` test passes ("Expected to fail, but passed"), and the block exists to explain that failure rather than to cause it.

One caveat: passing `--reporter=<x>` on the command line **replaces** the config's reporter list, so the block disappears. To keep it while adding another reporter, name it explicitly: `--reporter=list,json,./reporters/expected-failures.ts`.

## Extending

Add a page: append to `NAV` in `tests/helpers/mockup.ts` and every parameterised suite picks it up.

Add a panel screenshot: add a case to `tests/visual/panels.spec.ts` using `expectPixelPerfect(locator, name)`. Omit `maxDiffPixels` for anything static — that is the zero-tolerance path.

Point the suite at the real implementation: the specs address the UI through `tests/helpers/ui.ts` (`gotoPage`, `sidebarItem`, `screen`, `setTheme`). Repointing `ADMIN_PATH` and those few selectors at the Angular app in `apps/web` reuses the whole geometry and flow layer against the shipped product; the baselines under `tests/__screenshots__/` then become the target to diff against.
