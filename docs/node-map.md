# Node Map — dokumentacja i plan implementacji

Status: **wdrożone**. Zakładka „Node Map" pokazuje węzły klastra jako karty, a wewnątrz każdej karty — usługi/kontenery aktualnie na niej uruchomione, z żywym zużyciem CPU/RAM. Dane pobierane dynamicznie z realnych hostów przez GraphQL API.

## 1. Cel

Osobna zakładka w panelu (obok istniejącej „Nodes"), pokazująca węzły klastra jako karty, a wewnątrz każdej karty — usługi/kontenery aktualnie na niej uruchomione, z żywym zużyciem CPU/RAM.

## 2. Co już istniało w systemie (stan wyjściowy)

| Dane | Gdzie | Status |
|---|---|---|
| Węzeł: hostname, rola, IP, docker version, tagi, CPU/Mem/Disk % + historia | `NodeSummary` — `apps/api/src/graphql/schema.ts:217`, resolver `nodes` | ✅ gotowe, żywe (Influx albo pseudo-load bez Influxa) |
| Przypisanie usługi do węzła + żywe CPU/Mem % kontenera | `TaskInfo` — `apps/api/src/graphql/schema.ts:200` (pola `node`, `nodeHostname`, `serviceName`, `cpu`, `mem`), resolver `tasks` w `apps/api/src/graphql/resolvers.ts` | ✅ gotowy klucz łączący usługę z węzłem |
| Placement per orchestrator | Swarm: `TaskSummary.nodeId` (ustawiane w `apps/api/src/docker/engine.ts`, funkcja `mapTaskSummary`), Kubernetes: `orchestrator/kubernetes/adapter.ts` (`mapPodTask`) — oba zmapowane na `TaskSummary.nodeId` | ✅ gotowe w obu adapterach |
| Bajtowe RAM/storage per usługa (np. „268 Mi — 10 Gi") | — | ❌ nie istnieje — poza zakresem v1 |

## 3. Zaimplementowana architektura

### Backend (`apps/api`)

GraphQL (`apps/api/src/graphql/schema.ts`):

```graphql
type NodeMapService {
  taskId: ID!
  serviceName: String!
  image: String!
  category: String!   # heurystyka: data / identity / network / ops / app
  cpu: Int!
  mem: Int!
  status: String!
}
type NodeMapEntry {
  node: NodeSummary!
  services: [NodeMapService!]!
}
extend type Query {
  nodeMap: [NodeMapEntry!]!
}
```

Resolver `Query.nodeMap` (`apps/api/src/graphql/resolvers.ts`) nie duplikuje logiki fetchowania — dzieli wspólny helper `loadTaskInfos` z resolverem `tasks`, grupuje wynik po `nodeHostname` i mapuje na `NodeMapService`. Kategoria usługi liczona jest heurystyką `categorizeImage` po nazwie obrazu (`postgres/mysql/redis/mongo` → `data`, `keycloak/dex/vault` → `identity`, `traefik/nginx/haproxy` → `network`, `prometheus/grafana` → `ops`, reszta → `app`) — jawnie udokumentowana jako przybliżenie.

Zero zmian w orchestrator adapterach — `nodeId`/`nodeHostname` były już tam obecne.

### Frontend (`apps/web`)

- Zakładka w sidebarze, grupa `infra`, obok `nodes` (`apps/web/src/app/layout/sidebar.component.ts`).
- Route `app/node-map` (`apps/web/src/app/app.routes.ts`).
- `NodeMapPageComponent` (`apps/web/src/app/pages/node-map/node-map.component.ts`): `Apollo.watchQuery` + `pollInterval` (wzorem `nodes.component.ts`), układ i anatomia karty odwzorowane z referencyjnego mockupu „Infrastructure Node Map":
  - **Pigułka statusu** w nagłówku strony: „X / Y węzłów gotowych" (gotowy = bez tagu `DRAIN`) z pulsującą kropką.
  - **Legenda** nad siatką: role węzłów (M/W) i kolory kategorii usług.
  - **Grupowanie wg roli** — wiersze „Managery" i „Workery" z mono-etykietą w kolorze roli i listą hostów obok (pomijane, gdy grupa pusta).
  - **Karta węzła**: kolorowy `border-top` wg roli, odznaka roli (M/W, solid), mono hostname, tag „Lider" (gdy `tags` zawiera `LEADER`), IP + wersja Dockera po prawej; kompaktowy wiersz zużycia (Pamięć / CPU · Dysk) z cienkim paskiem postępu w kolorze roli (szerokość = % pamięci, jak w mockupie).
  - **Gęste chipy usług**: mono nazwa + status + `%CPU · %Mem` po prawej, lewy border 3px w kolorze kategorii, tooltip z nazwą obrazu; pusty stan = kreskowana ramka (jak placeholder „1 orderer + 1 peer" w mockupie).
  - **Kolory i fonty na wspólnych tokenach appki** (nie osobny design system): CSS custom properties komponentu (`--nh-orange`, `--cat-*`, `--role-*`, `--nm-*`) to teraz aliasy na istniejące zmienne z `styles.scss` (`--primary-500/600`, `--success`, `--warning`, `--info`, `--neutral`, `--danger`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-2`, `--muted`, `--shadow-1`, `--font-sans`, `--font-mono`) — jedna deklaracja, bez osobnego bloku `[data-theme="dark"]`, bo cała appka już przełącza te zmienne globalnie przez `ThemeService`. Kategorie: `--success`=dane, `--warning`=tożsamość, `--info`=sieć, `--neutral`=ops, `--primary-500`=aplikacja; role: `--primary-500`=manager, `--muted`=worker, `--danger`=drain.
  - Dodatkowo per mockup: pigułka „PEAK" na najbardziej obciążonym węźle (liczona z żywych danych), panel „Kluczowe przepływy" (4 realne ścieżki danych swarmbot.it: public/orkiestracja/telemetria/trwałość), notka pod kafelkami totals. Świadomie pominięte: sekcja „Planned" (statyczna roadmapa nie do wyprowadzenia z danych).
- **Podsumowanie zasobów per usługa** — tabela mono agregująca wszystkie węzły po nazwie usługi (węzły, zadania, śr. CPU/Mem), z kolorowym lewym borderem kategorii przy nazwie; liczona po stronie klienta z już pobranych danych `nodeMap` (zero dodatkowych zapytań do API).
- **Podsumowanie klastra** — kafelki z dużymi mono-liczbami (węzły/usługi/zadania, śr. CPU/Mem, najbardziej obciążony węzeł), również liczone po stronie klienta.
- Toggle grid/list w toolbarze (`NodeMapViewService`, `apps/web/src/app/core/node-map-view.service.ts`) — wzorem `ThemeService`, zapis wyboru w `localStorage` (`swarmbot.nodeMapView`).
- i18n: klucze `nav.nodeMap` i `pages.nodeMap.*` (w tym `groups`, `legend`, `pills`, `summary`, `totals`) we wszystkich 9 językach (`apps/web/public/assets/i18n/*.json`).
- Z mockupu przeniesiony jest sam **układ** (masthead, legenda, wiersze ról, gęste chipy, tabela per-usługa, kafelki totals, panel przepływów, stopka) — bez brandingu NO-HUMAN P.S.A. (logo, nazwa, Roboto, własna paleta) i bez statycznych danych: każda liczba na stronie pochodzi z żywego zapytania `nodeMap`. Pominięta sekcja „Planned" (statyczna roadmapa, niewywodliwa z danych).

## 4. Podjęte decyzje

- **Kategoryzacja usług**: automatyczna heurystyka po nazwie obrazu (zero zmian w `ServiceInput`). Przybliżona, ale wystarczająca dla v1.
- **Nazwa zakładki**: „Mapa węzłów" w PL, lokalny odpowiednik w pozostałych 8 językach (`nav.nodeMap`).
- **Honest-0 vs pseudo-load**: Node Map dziedziczy dokładnie tę samą konwencję co istniejąca strona Tasks — bez skonfigurowanego Influxa pokazuje deterministyczne pseudo-wartości (`pseudoLoad`) dla działających tasków, a nie sztucznie wymuszone 0. Powód: `mapTaskInfo` i `decorateNodes` już tak działają w całym systemie, gdy `influxdbUrl` nie jest w ogóle skonfigurowany. „Honest 0" dotyczy tylko przypadku, gdy Influx JEST skonfigurowany, ale zapytanie zwraca pustkę/błąd (agent nie raportuje) — ten przypadek Node Map dziedziczy bez zmian, więc nigdy nie fabrykuje danych ponad to, co robi reszta aplikacji.
- **Bajty RAM/storage per usługa**: poza zakresem v1 (potwierdzone, brak źródła danych w swarmagent/Influx).
- **Branding NO-HUMAN P.S.A. usunięty** (decyzja finalna, po wcześniejszym „pełny branding" i jeszcze wcześniejszym „tylko wzorzec wizualny"): logo, nazwa marki i customowa paleta/fonty (Roboto) zdjęte z masthead i stopki; komponent używa wyłącznie wspólnych tokenów motywu appki (`--surface`, `--primary-500`, `--font-mono` itd.), więc Node Map wygląda spójnie z resztą swarmbot.it w obu motywach (jasnym/ciemnym) bez osobnego przełącznika kolorów.
- **Influx ignorowany w trybie mock** (`apps/api/src/config.ts`, `loadConfig`): mock imituje silnik Dockera, więc żaden agent nigdy nie zasila Influxa — skonfigurowany `SWARMBOT_INFLUXDB` w mocku zamieniał każdą metrykę w wieczne 0 (martwe demo, wbrew README „no Influx required"). Od teraz `mock=true` wymusza `influxdbUrl=undefined`, dzięki czemu demo pokazuje deterministyczne pseudo-wartości. Naprawia to scenariusz `SWARMBOT_MOCK=true docker compose up` (compose zawsze ustawia zmienną Influxa).
- **Budżet CSS komponentu** (`apps/web/angular.json`): podniesiony z 4/8 kB do 10/16 kB (warning/error) — pełny design Node Map ma ~9 kB stylów.

## 5. Weryfikacja

Zweryfikowano w przeglądarce zarówno w trybie mock, jak i na w pełni realnym stosie (realny Postgres, realny InfluxDB, realny Docker Swarm, realny agent telemetrii w Ruście): karty węzłów renderują się poprawnie i pogrupowane wg roli, chipy usług pokazują %CPU/%Mem, węzeł bez zaplanowanych tasków poprawnie pokazuje pusty stan zamiast fabrykowanych danych, tabela podsumowania per usługa i panel sum klastra poprawnie agregują dane po wdrożeniu testowej usługi na realnym swarmie, toggle grid/list działa i przetrwał odświeżenie strony, aktywny stan w sidebarze działa, wersje PL i EN renderują poprawne tłumaczenia. `npm run build` i pełny zestaw testów API (169/169) przechodzą.

## 6. Follow-upy (poza v1)

- Ręczny tag kategorii na usłudze (jeśli heurystyka okaże się niewystarczająca) — wymagałby nowego pola w `ServiceInput`.
- Bajtowe RAM/storage per usługa — wymagałby zmiany payloadu swarmagent (dodanie surowych bajtów) + nowych pól w Influx/GraphQL. Osobny, większy temat.

## 7. Pochodzenie koncepcji

Układ (masthead, legenda, wiersze ról, gęste chipy, tabela per-usługa, kafelki totals, panel przepływów, stopka) zainspirowany wewnętrznym mockupem infrastruktury NO-HUMAN P.S.A. („Infrastructure Node Map.dc", Claude Design, 2026-07-15). Branding organizacji (logo, nazwa, paleta kolorów, Roboto/Roboto Mono) — po przejściowym etapie pełnego przeniesienia — został ostatecznie usunięty na wyraźne życzenie: strona koloryzuje się wyłącznie tokenami motywu swarmbot.it, spójnie z resztą appki w obu motywach. Nie przeniesiono żadnych statycznych liczb — wszystkie dane na stronie są żywe (GraphQL `nodeMap`, odświeżanie co 30 s); sekcje niewywodliwe z danych (statyczna roadmapa „Planned") pominięto, a „Key flows" zastąpiono realnymi ścieżkami danych swarmbot.it.
