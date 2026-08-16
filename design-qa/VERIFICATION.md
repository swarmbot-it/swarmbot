# Raport weryfikacji suite'u `design-qa/`

Data: 2026-08-16 · Weryfikacja wykonana bez modyfikacji testów i makiety (wyłącznie uruchamianie, analiza, kontrolowane wstrzyknięcia usterek w artefakty odtwarzalne, każde przywrócone).

---

## 1. Środowisko

| Element            | Wartość                                                            |
| ------------------ | ------------------------------------------------------------------ |
| Node               | v20.19.2                                                           |
| npm                | 9.2.0                                                              |
| Playwright CLI     | 1.62.1                                                             |
| `@playwright/test` | 1.62.1                                                             |
| Chromium           | Chrome for Testing 151.0.7922.34 (`chromium-1234`) — zainstalowany |
| Cache `.netcache/` | 7 wpisów (14 plików), rozgrzany — `npm run warm` nie był potrzebny |
| Baseline'y         | 109 plików PNG                                                     |

`npx playwright install --dry-run chromium` potwierdza obecność przeglądarki w `~/.cache/ms-playwright/chromium-1234`. Wersja obrazu Dockera w `update-snapshots:docker` (`v1.62.1-jammy`) zgadza się z zainstalowanym `@playwright/test`.

---

## 2. Wyniki zbiorcze

Cztery pełne przebiegi (trzy pod pomiar stabilności + jeden kontrolny po eksperymentach z wstrzykiwaniem usterek).

| Kategoria                   | Testów  | Passed  | Expected fail | Failed | Skipped | Flaky (3 przebiegi) |
| --------------------------- | ------- | ------- | ------------- | ------ | ------- | ------------------- |
| **visual** — `pages.spec`   | 26      | 26      | 0             | 0      | 0       | 0                   |
| **visual** — `panels.spec`  | 66      | 66      | 0             | 0      | 0       | 0                   |
| **visual** — `states.spec`  | 10      | 10      | 0             | 0      | 0       | 0                   |
| **layout** — `sidebar.spec` | 12      | 12      | 0             | 0      | 0       | 0                   |
| **layout** — `buttons.spec` | 12      | 12      | 0             | 0      | 0       | 0                   |
| **layout** — `grid.spec`    | 23      | 22      | **1**         | 0      | 0       | 0                   |
| **layout** — `labels.spec`  | 17      | 17      | 0             | 0      | 0       | 0                   |
| **flows** — `login.spec`    | 3       | 3       | 0             | 0      | 0       | 0                   |
| **flows** — `demo-readonly` | 11      | 11      | 0             | 0      | 0       | 0                   |
| **flows** — `theme.spec`    | 7       | 7       | 0             | 0      | 0       | 0                   |
| **flows** — `nav-counts`    | 5       | 5       | 0             | 0      | 0       | 0                   |
| **RAZEM**                   | **192** | **191** | **1**         | **0**  | **0**   | **0**               |

Zbiorczo wg warstw: visual 102 · layout 64 · flows 26 = 192.

Statystyki Playwrighta per przebieg (identyczne):

```
run1: expected=192 skipped=0 unexpected=0 flaky=0  (130,0 s)
run2: expected=192 skipped=0 unexpected=0 flaky=0  (127,0 s)
run3: expected=192 skipped=0 unexpected=0 flaky=0  (126,8 s)
run4: 192 passed                                    (126 s, po eksperymentach)
```

---

## 3. Kompletność względem deklaracji

| Deklaracja (README)                                | Zmierzono                                             | Zgodność |
| -------------------------------------------------- | ----------------------------------------------------- | -------- |
| 192 testy                                          | 192                                                   | ✅       |
| 109 baseline'ów                                    | 109                                                   | ✅       |
| 13 stron × light/dark                              | 26 testów, 26 baseline'ów, 28 zrzutów 1440×900 ¹      | ✅       |
| 66 screenshotów per-panel                          | 66 testów, 66 baseline'ów                             | ✅       |
| stany hover/active                                 | 10 testów, 13 baseline'ów ²                           | ✅       |
| layout: geometria + etykiety verbatim              | 64 testy (sidebar 12, buttons 12, grid 23, labels 17) | ✅       |
| flows: login, 7 guardów read-only, motyw, liczniki | 26 testów (7 guardów potwierdzone w `demo-readonly`)  | ✅       |

¹ 26 zrzutów stron + 2 zrzuty powłoki (`shell--light`, `shell--dark` w `theme.spec`) = 28 obrazów 1440×900.
² Trzy testy przycisków robią po dwa zrzuty (rest + hover), stąd 13 baseline'ów przy 10 testach.

**Bilans baseline'ów:** `pages 26 + panels 66 + states 13 + theme 2 + login 1 + demo-readonly 1 = 109`. Zero rozbieżności, zero baseline'ów osieroconych.

**Brak brakujących snapshotów:** w żadnym z przebiegów nie pojawił się komunikat `A snapshot doesn't exist … writing actual` (0 wystąpień). Każde porównanie zrzutu odbyło się wobec istniejącego, zacommitowanego baseline'u.

Żaden test nie jest oznaczony `test.skip` ani `test.only`.

---

## 4. Znany defekt (`test.fail()`) — nadal aktualny

```
layout/grid.spec.ts > horizontal overflow > Nodes does not scroll horizontally
  expectedStatus:  failed
  wynik surowy:    failed
  status raportu:  expected
  komunikat:       Error: Nodes overflows the content column
```

- To **jedyny** test w suite z `expectedStatus != passed`.
- Nadal realnie failuje we wszystkich przebiegach → defekt makiety **nie został naprawiony**, adnotacja pozostaje zasadna.
- Test towarzyszący `the node card chart row demands more width than the card provides` przechodzi, potwierdzając mechanizm: `.node-mini` = 140 px (120 px sparkline + 2×10 px padding), trzy kafle + dwie przerwy 10 px = 440 px przy ~332 px dostępnych w karcie.

Nie stwierdzono sytuacji „zaczął przechodzić" — aktualizacja testu nie jest w tej chwili potrzebna.

---

## 5. Stabilność (anty-flake)

Trzy pełne przebiegi z rzędu, porównanie **test po teście** na podstawie raportów JSON (status + expectedStatus + surowy wynik):

```
testów porównanych:                 192
testów o niestabilnym wyniku:         0
flaky wg Playwrighta (run1/2/3):    0/0/0
unexpected:                         0/0/0
skipped:                            0/0/0
```

Różnice w tekstowym logu `--reporter=list` między przebiegami dotyczą wyłącznie **kolejności kończenia zadań przez workery** (numeracja `[chromium] ✓ 1..6`), nie statusów. Raport JSON — źródło rozstrzygające — nie wykazał ani jednej różnicy.

Czasy trwania: 130,0 s / 127,0 s / 126,8 s (rozrzut 2,5%).

**Wniosek:** zero flake. Mechanizmy determinizmu (zaseedowany `Math.random`, zamrożone animacje, `document.fonts.ready`, parkowanie kursora, cache assetów) działają zgodnie z opisem.

---

## 6. Wiarygodność pixel-perfect

### 6.1 Progi i maski — zgodne z deklaracją

- `playwright.config.ts` ustawia `expect.toHaveScreenshot.maxDiffPixelRatio: 0`.
- `expectPixelPerfect()` przekazuje `maxDiffPixelRatio: 0`, chyba że wywołanie poda `maxDiffPixels` — wtedy **wyłącznie** `maxDiffPixels`.
- Na 38 wywołań `expectPixelPerfect` tylko **3 miejsca** poluzowują próg, co przekłada się na **10 z 102 testów wizualnych**:

| Miejsce              | Zakres                                 | Testów |
| -------------------- | -------------------------------------- | ------ |
| `pages.spec.ts:41`   | tylko `tasks` i `infra-map` × 2 motywy | 4      |
| `panels.spec.ts:101` | karty węzłów infra-map × 2 motywy      | 4      |
| `panels.spec.ts:146` | tabela Tasks × 2 motywy                | 2      |

Wszystkie dotyczą wyłącznie tabeli Tasks i chipów infra-map. **Zgodne z deklaracją.**

### 6.2 Pokrycie masek — maski nie zakrywają całych elementów

| Zrzut                       | Masek | Powierzchnia maski       |
| --------------------------- | ----- | ------------------------ |
| strona Tasks (viewport)     | 24    | 5,21% viewportu          |
| tabela Tasks                | 24    | 6,74% powierzchni tabeli |
| karta węzła infra-map       | 4     | 3,25% powierzchni karty  |
| strona Infra Map (viewport) | 52    | 2,42% viewportu          |

Żadna maska nie zakrywa całego mierzonego elementu.

### 6.3 Testy „puste" — nie stwierdzono

- **Zrzuty elementów o zerowym rozmiarze:** brak. Najmniejszy baseline to 36×37 px (przycisk ikonowy), zero plików poniżej progu podejrzliwości (area < 400 px lub < 300 B).
- **Obrazy jednolite/puste:** brak. Najniższy stosunek bajtów do piksela to 0,047 (`table-toolbar`) — zweryfikowany wizualnie, zawiera realną treść.
- **Asercje przechodzące na nieistniejących selektorach** — dla każdej asercji `toHaveCount(0)` / `toEqual([])` potwierdzono empirycznie kontrolę pozytywną:

| Asercja negatywna                             | Kontrola pozytywna (pomiar w przeglądarce)      |
| --------------------------------------------- | ----------------------------------------------- |
| `.sidebar__count` → 0 dla pozycji bez zbioru  | selektor dopasowuje **10** elementów            |
| `demo-badge` → 0 poza trybem demo             | **1** w trybie demo, **0** poza nim             |
| `.modal-backdrop` → 0 przy zablokowanej akcji | **1** przy otwartym modalu, **0** po zamknięciu |
| `label, .btn, .domain` → brak zawinięć        | selektor dopasowuje **4** elementy              |
| pasma `:scope > *` w teście nakładania        | **3–8** pasm na ekran (min. 3 pary)             |

### 6.4 Asercja webfontów — potwierdzona kontrolą negatywną

Wstrzyknięto usterkę: wpis cache z arkuszem Google Fonts zredukowany z 15 818 B do pustego arkusza (53 B), przy nietkniętym cache React/Babel.

```
Error: Webfonts (Plus Jakarta Sans / JetBrains Mono) did not load — screenshots
would be compared against fallback metrics. …
  at assertWebfontsLoaded (tests/helpers/ui.ts:105)
→ 4 failed
```

Asercja failuje **przed** porównaniem zrzutu, więc nie da się wygenerować fałszywie zielonego baseline'u na metrykach fallbacku. Po przywróceniu cache: `4 passed`. Cache zweryfikowany bajtowo po przywróceniu.

### 6.5 ⚠️ ZNALEZISKO: domyślny próg perceptualny neutralizuje `maxDiffPixelRatio: 0`

**Objaw.** Podmieniono baseline `nav-item-rest.png` na wizualnie inny `nav-item-hover.png` (identyczne wymiary 223×38, **95,5% pikseli różnych**). Test `navigation item states › resting` **przeszedł**.

**Eksperymenty rozstrzygające:**

| Eksperyment                                               | Wynik                                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| baseline o innych wymiarach (1440×900 zamiast 223×38)     | ❌ FAIL — mechanizm porównania działa              |
| baseline usunięty                                         | ❌ FAIL + plik odtworzony — ścieżka jest poprawna  |
| baseline podmieniony na `theme-toggle` dark zamiast light | ❌ FAIL — „2289 pixels (ratio 0.84) are different" |
| baseline podmieniony na `nav-item-hover` zamiast `rest`   | ✅ **PASS — różnica niewykryta**                   |

**Diagnoza.** Playwright stosuje per-pikselowy próg `threshold` (domyślnie **0.2**, perceptualny dystans YIQ w skali 0–1) **przed** zliczeniem pikseli do `maxDiffPixels` / `maxDiffPixelRatio`. Konfiguracja ustawia liczniki na zero, ale nigdzie nie obniża `threshold`. Efektywna bramka brzmi więc „żaden piksel nie może różnić się o więcej niż ~20% dystansu perceptualnego", a nie „żaden piksel nie może się różnić".

Zmierzone maksymalne delty (wyrażone jako równoważny `threshold`):

| Para baseline'ów                              | max delta | Wykrywalne przy `threshold=0.2`? |
| --------------------------------------------- | --------- | -------------------------------- |
| `nav-item-rest` vs `nav-item-hover`           | **0,153** | ❌ NIE                           |
| `btn-primary-rest` vs `btn-primary-hover`     | **0,084** | ❌ NIE                           |
| `btn-secondary-rest` vs `btn-secondary-hover` | **0,042** | ❌ NIE                           |
| `btn-icon-rest` vs `btn-icon-hover`           | **0,042** | ❌ NIE                           |
| `nav-item-rest` vs `nav-item-active`          | 0,537     | ✅ TAK                           |
| `theme-toggle` light vs dark                  | 0,867     | ✅ TAK                           |
| `dashboard` light vs dark (kontrola)          | 0,875     | ✅ TAK                           |

Dla pary rest/hover: przy `threshold=0.2` liczone jest **0** pikseli, przy `0.05` — 354, przy `0.01` — 8065 (z 8474).

**Skutek praktyczny.** Cztery z siedmiu par stanów są dla suite'u nieodróżnialne. W konsekwencji **wszystkie cztery testy hover** (`nav-item-hover`, `btn-primary-hover`, `btn-secondary-hover`, `btn-icon-hover`) nie weryfikują koloru stanu hover — potwierdzają jedynie, że element ma oczekiwaną geometrię i że zrzut w ogóle powstaje. Niewykrywalne pozostają także: drobne korekty tokenów kolorystycznych (np. `--border`, `--surface-2`, kolory tekstu drugorzędnego), zmiany cieni i przezroczystości, subtelne różnice antyaliasingu typografii.

Wykrywane bez zastrzeżeń: przesunięcia układu, zmiany wymiarów, zmiany wysokokontrastowe, przełączenie motywu — czyli cała warstwa, którą dodatkowo pokrywają testy geometryczne.

**Proponowana poprawka (NIE zastosowana, zgodnie z poleceniem):**

```ts
// playwright.config.ts
expect: {
    toHaveScreenshot: {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0,
        threshold: 0.01, // ← brakujący element; domyślne 0.2 znosi bramkę zerową
    },
},
```

`threshold: 0` jest najostrzejsze i prawdopodobnie wykonalne na tej maszynie (suite okazał się bitowo stabilny w trzech przebiegach), ale `0.01–0.02` jest bezpieczniejsze przy przenoszeniu baseline'ów między środowiskami — wchłania szum antyaliasingu, nadal wykrywając wszystkie cztery pary hover. Po zmianie należy przepuścić pełny przebieg: część testów może zacząć failować na realnych, dotąd niewidocznych różnicach, i każdy taki fail wymaga oceny (regresja vs. szum), zanim baseline'y zostaną przegenerowane.

---

## 7. Integralność makiety

Oryginalne payloady MCP odtworzono z transkryptu sesji importu (bez ponownego przepisywania treści przez model — porównanie w pełni bajtowe).

| Plik                  | Wynik porównania                                                 |
| --------------------- | ---------------------------------------------------------------- |
| `SwarmBot Admin.html` | identyczny                                                       |
| `components.jsx`      | identyczny                                                       |
| `data.js`             | identyczny                                                       |
| `demo-login.html`     | identyczny                                                       |
| `favicon.ico`         | identyczny                                                       |
| `forms.jsx`           | identyczny                                                       |
| `pages.jsx`           | identyczny                                                       |
| `tables.jsx`          | identyczny                                                       |
| `theme.css`           | identyczny                                                       |
| `tweaks-panel.jsx`    | identyczny                                                       |
| `app.jsx`             | **+2** `data-testid`: `demo-badge`, `toast`                      |
| `infra-map.jsx`       | **+2** `data-testid`: `infra-node-${node.host}`, `infra-svc-mem` |

**Dokładnie 4 atrybuty `data-testid`, zero innych zmian** — zgodne z listą w README. Diff nie zawiera żadnych modyfikacji znaczników, stylów ani treści.

**Dryf upstream:** świeży `get_file` na `demo-login.html` z projektu `8e3dc893-…` zwrócił plik identyczny z kopią lokalną → brak dryfu. Sprawdzenie wyrywkowe (1 z 12 plików); pełna kontrola dryfu wymagałaby ponownego pobrania całego projektu.

Po wszystkich eksperymentach potwierdzono przywrócenie stanu: 109 baseline'ów, sumy kontrolne podmienianych plików zgodne z oryginałami, cache 14 plików / arkusz CSS 15 818 B, makieta bez zmian poza czterema `data-testid`.

---

## 8. Odchylenia i obserwacje

| #   | Waga         | Opis                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Istotne**  | Domyślny `threshold: 0.2` neutralizuje `maxDiffPixelRatio: 0` dla zmian niskokontrastowych — szczegóły i poprawka w §6.5. Cztery testy hover nie weryfikują koloru.                                                                                                                                                                                      |
| 2   | Drobne       | Maski na tabeli Tasks zakrywają nie tylko sparkline, ale i wartość liczbową (`.meter__value`, `{r.cpu}%`). Żaden test nie asertuje tych wartości tekstowo, więc ~6,7% powierzchni tabeli pozostaje całkowicie nieweryfikowane. Ponieważ `Math.random` jest zaseedowany, maski są nadmiarowe — ich usunięcie podniosłoby pokrycie bez utraty stabilności. |
| 3   | Drobne       | `.modal-backdrop` występuje wyłącznie w asercjach negatywnych (`toHaveCount(0)`). Selektor zweryfikowano diagnostycznie jako poprawny, ale żaden test nie potwierdza jego obecności — asercja jest nieodporna na przyszłą zmianę nazwy klasy.                                                                                                            |
| 4   | Informacyjne | `test.fail()` jest ustawiany warunkowo wewnątrz testu (`if (knownOverflow) test.fail()`). Działa poprawnie, ale Playwright nie wyróżnia takiego testu w podsumowaniu konsolowym — widać go dopiero w raporcie JSON (`expectedStatus: failed`). W CI łatwo przeoczyć zmianę statusu.                                                                      |
| 5   | Informacyjne | Liczby i progi zadeklarowane w README (192 testy, 109 baseline'ów, zakres poluzowanych progów, 4 `data-testid`) zgadzają się co do jednego z pomiarem.                                                                                                                                                                                                   |

---

## 9. Werdykt (stan z audytu, przed poprawkami)

> **Zastrzeżenie z tej sekcji zostało zdjęte.** Poprawki i dowody ich skuteczności — sekcja [§11 „Po poprawce"](#11-po-poprawce). Aktualny werdykt: ✅.

### ⚠️ Suite wiarygodny z jednym istotnym zastrzeżeniem

**Co jest solidne:**

- Kompletność zgodna z deklaracją co do jednego testu i jednego baseline'u (192 / 109).
- Zero flake w trzech kolejnych pełnych przebiegach — determinizm faktycznie działa.
- Zero pominiętych testów, zero brakujących snapshotów, zero pustych lub degenerowanych zrzutów.
- Wszystkie asercje negatywne mają potwierdzoną empirycznie kontrolę pozytywną — brak przejść „pustych".
- Asercja webfontów potwierdzona kontrolą negatywną: realnie failuje i to przed porównaniem zrzutu.
- Warstwa geometrii (64 testy) i flow (26 testów) opiera się na realnych pomiarach `boundingBox()` / `getComputedStyle` i jest niezależna od problemu z §6.5.
- Makieta bajtowo zgodna ze źródłem poza czterema zadeklarowanymi `data-testid`.
- Znany defekt strony Nodes nadal failuje zgodnie z oczekiwaniem — adnotacja aktualna.

**Zastrzeżenie:**

Deklaracja „pixel-perfect / `maxDiffPixelRatio: 0`" **nie obowiązuje dla różnic niskokontrastowych**. Z powodu domyślnego `threshold: 0.2` zmiany o dystansie perceptualnym poniżej ~20% są liczone jako zero różnic. Zmierzono, że podmiana baseline'u stanu spoczynkowego na stan hover (95,5% pikseli różnych) przechodzi niezauważona dla czterech par stanów. Suite nadal rzetelnie wykrywa regresje układu, wymiarów i wysokokontrastowe zmiany kolorystyczne, ale **nie jest dowodem wierności kolorystycznej na poziomie pojedynczego piksela**, jak sugeruje README.

Po zastosowaniu poprawki z §6.5 (`threshold: 0.01`) i ponownej walidacji baseline'ów zastrzeżenie zostanie zdjęte — werdykt przejdzie na ✅.

---

## 10. Komendy do reprodukcji

```bash
cd design-qa

# środowisko
node --version && npx playwright --version
npx playwright install --dry-run chromium
npm run warm                       # tylko gdy .netcache/ jest pusty

# pełny przebieg
npm test                           # albo: npm run test:design z katalogu głównego

# trzy przebiegi z raportem JSON do porównania stabilności
for i in 1 2 3; do
  PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/run$i.json npx playwright test --reporter=list,json > /tmp/run$i.txt 2>&1
done

# odczyt oczekiwanej porażki (Nodes overflow) — widoczna tylko w JSON
node -e 'const j=require("/tmp/run1.json");(function w(s,t){for(const u of s.suites||[])w(u,[...t,u.title]);
  for(const p of s.specs||[])for(const x of p.tests||[])if(x.expectedStatus!=="passed")
    console.log(x.expectedStatus,"|",[...t,p.title].join(" > "))})({suites:j.suites},[])'

# kontrola negatywna asercji webfontów (wymaga przywrócenia cache po teście!)
cp -r .netcache /tmp/netcache-backup
printf '/* pusty arkusz */\n' > .netcache/<hash-fonts.googleapis.com>.bin
npx playwright test tests/flows/login.spec.ts     # oczekiwane: CZERWONE
rm -rf .netcache && cp -r /tmp/netcache-backup .netcache

# kontrola negatywna porównania zrzutów (wymaga przywrócenia baseline'u!)
B=tests/__screenshots__/states.spec.ts
cp $B/nav-item-rest.png /tmp/rest.orig
cp $B/nav-item-hover.png $B/nav-item-rest.png
npx playwright test tests/visual/states.spec.ts --grep resting   # obecnie: ZIELONE (patrz §6.5)
cp /tmp/rest.orig $B/nav-item-rest.png

# integralność makiety wobec źródła projektu Claude Design
#   pobierz pliki przez MCP claude_design (get_file) do katalogu tymczasowego, następnie:
#   for f in mockup/*; do cmp -s "$f" "/tmp/src/$(basename "$f")" && echo "OK $f" || echo "DIFF $f"; done
```

---

## 11. Po poprawce

Sekcje 1–10 opisują stan zastany podczas audytu. Ta sekcja dokumentuje wprowadzone poprawki i dowody ich skuteczności. Makieta nie była modyfikowana; zmiany objęły wyłącznie konfigurację, testy i reporter.

### 11.1 Zakres zmian

| Plik                                | Zmiana                                                                                          | Adresuje   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| `playwright.config.ts`              | `expect.toHaveScreenshot.threshold: 0.01` + rejestracja reportera oczekiwanych porażek          | §6.5, §8.4 |
| `reporters/expected-failures.ts`    | nowy — wypisuje w konsoli status każdego testu `test.fail()`                                    | §8.4       |
| `tests/visual/pages.spec.ts`        | `tasks` usunięte z `GENERATED_REGIONS` (pełny widok Tasks bez maski i tolerancji)               | §8.2       |
| `tests/visual/panels.spec.ts`       | tabela Tasks bez `mask` i `maxDiffPixels`                                                       | §8.2       |
| `tests/flows/demo-readonly.spec.ts` | nowy test `the modal backdrop mounts when a form opens` (0 → 1 → zrzut → 0 po `Escape`)         | §8.3       |
| `tests/helpers/ui.ts`               | `settle()` czeka na `[data-screen-label]` przed sprawdzeniem `.sb-boot`; doprecyzowany docblock | §11.3      |
| `tsconfig.json`                     | `reporters/**/*.ts` w `include`                                                                 | —          |

Baseline'y: 4 zregenerowane (`tasks--light`, `tasks--dark`, `table-tasks--light`, `table-tasks--dark` — skutek zdjęcia masek) i 1 nowy (`modal-deploy-stack`). Porównanie sum kontrolnych przed i po potwierdza, że **żaden inny baseline się nie zmienił**. Stan: 110 plików.

### 11.2 Kontrola skuteczności progu

Powtórzony eksperyment z §6.5 — podmiana baseline'u stanu spoczynkowego na baseline stanu hover, dla wszystkich czterech par:

| Para (rest ← hover) | max delta | Przed (`threshold: 0.2`) | Po (`threshold: 0.01`)         |
| ------------------- | --------- | ------------------------ | ------------------------------ |
| `nav-item`          | 0,153     | ✅ PASS — niewykryte     | ❌ FAIL — 7756 px (ratio 0,92) |
| `btn-primary`       | 0,084     | ✅ PASS — niewykryte     | ❌ FAIL — 3886 px (ratio 0,88) |
| `btn-secondary`     | 0,042     | ✅ PASS — niewykryte     | ❌ FAIL — 2050 px (ratio 0,76) |
| `btn-icon`          | 0,042     | ✅ PASS — niewykryte     | ❌ FAIL — 1024 px (ratio 0,77) |

Wszystkie cztery pary są teraz rozróżnialne. Baseline'y przywrócono i zweryfikowano bajtowo po każdej podmianie.

Wartość **0,01** (nie 0) zgodnie z zaleceniem: zapas na antyaliasing przy przenoszeniu baseline'ów między środowiskami, przy zachowaniu marginesu ~4× względem najciaśniejszej pary (0,042). Uzasadnienie zapisane w `playwright.config.ts` i w README („Why `threshold` is set explicitly").

### 11.3 Efekt uboczny zaostrzenia: ujawniony wyścig boot loadera

Pierwszy pełny przebieg po zmianie progu wykazał jedną awarię (`navigation item states › resting`), niepowtarzalną w izolacji. Diagnoza zamiast podniesienia progu:

- `nav-item-rest-actual.png` miał **200 B** przy oczekiwanych 2220 B — zrzut pustego prostokąta.
- Zrzut awarii pokazał aplikację wciąż na boot loaderze („Fetching node inventory… · 40%").
- Przyczyna: `settle()` czekał na **brak** `.sb-boot`, a ten warunek jest spełniony również **zanim React się zamontuje**. Pod obciążeniem (równoległe workery kompilujące siedem plików JSX przez Babel) `settle()` wracał na pustym dokumencie, a poprawność zrzutu zależała od tego, czy `toHaveScreenshot` zdąży ponowić próbę po ~2,3 s sekwencji bootowania.
- Powtarzalność przed naprawą: **1 awaria na 30** przebiegów przy `--repeat-each=30 --workers=8`.

Naprawa: `settle()` czeka najpierw na `[data-screen-label]` — marker renderowany dopiero gdy `booting === false`, co dowodzi zarówno zamontowania Reacta, jak i zakończenia bootowania. Dla ekranu logowania (czysty HTML, brak `#root`) warunek jest pomijany.

Weryfikacja po naprawie, pod tym samym wymuszonym obciążeniem:

| Scenariusz                                     | Wynik          |
| ---------------------------------------------- | -------------- |
| `states.spec.ts:13` × 30, 8 workerów           | 30/30 passed   |
| `states.spec.ts` (cały) × 10, 8 workerów       | 100/100 passed |
| `pages.spec.ts` (pełne widoki) × 3, 8 workerów | 78/78 passed   |

Łącznie **208 przebiegów testów pod obciążeniem, zero awarii**. Wyścig istniał również przed zmianą progu — był maskowany przez ponowienia `toHaveScreenshot` i luźną tolerancję; zaostrzenie go jedynie ujawniło.

### 11.4 Maski tabeli Tasks — zdjęte

`mask` i `maxDiffPixels: 50` usunięte z pełnego widoku Tasks i z tabeli Tasks. Zregenerowany baseline zawiera realne sparkline'y i wartości procentowe zamiast prostokątów maski — **~6,7% powierzchni tabeli przeszło ze stanu „nieweryfikowane" do „weryfikowane przy zerowej tolerancji"**. Wartości pochodzą z zaseedowanego `Math.random`, więc nie wymagały zamrażania żadnego dodatkowego źródła (brak użycia `Date` w tej ścieżce); stabilność potwierdzona w trzech pełnych przebiegach oraz w teście obciążeniowym `pages.spec.ts`.

Maski pozostają wyłącznie na chipach Infra Map, gdzie te same liczby są re-agregowane w 52 elementach — tam maska służy czytelności diffu, nie tolerancji błędu.

### 11.5 Sygnalizacja oczekiwanej porażki

Reporter `reporters/expected-failures.ts` wypisuje blok po każdym przebiegu. Obie gałęzie zweryfikowane:

| Scenariusz                                           | Wyjście                                                                    | Exit code |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| defekt nadal obecny (stan faktyczny)                 | `OCZEKIWANE PORAŻKI` + zielone `OK … nadal failuje zgodnie z oczekiwaniem` | 0         |
| test `test.fail()` zaczyna przechodzić (plik próbny) | `OCZEKIWANE PORAŻKI — WYMAGANA AKCJA` + żółte `UWAGA … zaktualizuj test`   | 1 ¹       |

¹ Kod wyjścia 1 pochodzi z samego Playwrighta („Expected to fail, but passed"), nie z reportera — reporter jest wyłącznie informacyjny i nie wpływa na wynik buildu. Plik próbny użyty do weryfikacji gałęzi ostrzeżenia został usunięty.

Zastrzeżenie operacyjne: przekazanie `--reporter=<x>` w linii poleceń **zastępuje** listę reporterów z konfiguracji i blok znika. Aby go zachować przy dokładaniu innego reportera, trzeba wymienić go jawnie: `--reporter=list,json,./reporters/expected-failures.ts`. Odnotowane w README.

### 11.6 Kontrola pozytywna `.modal-backdrop`

Nowy test w `tests/flows/demo-readonly.spec.ts` otwiera modal „Deploy stack" poza trybem demo i sprawdza pełny cykl: `toHaveCount(0)` → klik → `toHaveCount(1)` → zrzut elementu `.modal` → `Escape` → `toHaveCount(0)`. Selektor ma teraz stałą kontrolę pozytywną, a modal (nagłówek, pola, stopka z przyciskami) po raz pierwszy trafił pod regresję wizualną.

### 11.7 Wyniki końcowe

Trzy pełne przebiegi na zamrożonym drzewie, porównanie test po teście z raportów JSON:

```
run1: expected=193 skipped=0 unexpected=0 flaky=0  (131,9 s)
run2: expected=193 skipped=0 unexpected=0 flaky=0  (131,6 s)
run3: expected=193 skipped=0 unexpected=0 flaky=0  (127,6 s)

testów porównanych:      193
niestabilnych:             0
oczekiwanych porażek:      1  (Nodes overflow — nadal failuje)
```

| Kategoria | Testów  | Passed  | Expected fail | Failed | Skipped | Flaky |
| --------- | ------- | ------- | ------------- | ------ | ------- | ----- |
| visual    | 102     | 102     | 0             | 0      | 0       | 0     |
| layout    | 64      | 63      | 1             | 0      | 0       | 0     |
| flows     | 27      | 27      | 0             | 0      | 0       | 0     |
| **RAZEM** | **193** | **192** | **1**         | **0**  | **0**   | **0** |

Integralność po wszystkich eksperymentach: makieta bajtowo identyczna ze źródłem MCP poza czterema `data-testid` (2 w `app.jsx`, 2 w `infra-map.jsx`, zero innych zmienionych linii); 110 baseline'ów; Prettier bez zastrzeżeń; `tsc --noEmit` czysty.

### 11.8 Werdykt po poprawce

### ✅ Suite wiarygodny

Zastrzeżenie z §9 zostało usunięte u źródła: `threshold: 0.01` przywraca deklarowaną bramkę pixel-perfect, co potwierdzono ponownym eksperymentem na wszystkich czterech parach stanów. Przy okazji zaostrzenie ujawniło i pozwoliło naprawić realny wyścig w harnessie, który wcześniej mógł produkować puste zrzuty pod obciążeniem — suite jest teraz nie tylko ostrzejszy, ale i bezpieczniejszy niż w chwili audytu.

Trzy drobne obserwacje (§8.2–§8.4) również zaadresowane: maski Tasks zdjęte, `.modal-backdrop` ma kontrolę pozytywną, oczekiwana porażka jest widoczna w konsoli.

Pozostaje jedna pozycja informacyjna, świadomie niezmieniona: **defekt przepełnienia strony Nodes w makiecie** (§4). Jego naprawa jest decyzją projektową, nie testową. — _Zaktualizowane: defekt został naprawiony w makiecie, patrz [§12](#12-naprawa-defektów-makiety)._

### 11.9 Komendy do reprodukcji poprawek

```bash
cd design-qa

# pełny przebieg z blokiem oczekiwanych porażek (reportery z konfiguracji)
npx playwright test

# kontrola skuteczności progu — dla każdej z 4 par
B=tests/__screenshots__/states.spec.ts
for p in nav-item btn-primary btn-secondary btn-icon; do cp $B/$p-rest.png /tmp/$p.orig; done
cp $B/nav-item-hover.png $B/nav-item-rest.png
npx playwright test tests/visual/states.spec.ts:13     # oczekiwane: CZERWONE
cp /tmp/nav-item.orig $B/nav-item-rest.png             # przywróć!

# test obciążeniowy wyścigu boot loadera
npx playwright test tests/visual/states.spec.ts --repeat-each=10 --workers=8

# gałąź ostrzeżenia reportera (plik próbny, usuwany po teście)
printf 'import { expect, test } from "@playwright/test";\ntest("probe", async () => { test.fail(); expect(1).toBe(1); });\n' \
  > tests/layout/__tmp-probe.spec.ts
npx playwright test tests/layout/__tmp-probe.spec.ts   # oczekiwane: blok UWAGA, exit 1
rm tests/layout/__tmp-probe.spec.ts
```

---

## 12. Naprawa defektów makiety

Makieta źródłowa otrzymała poprawki obu defektów odnotowanych w §4 i §8. Ta sekcja dokumentuje synchronizację i jej weryfikację.

### 12.1 Import i kontrola zakresu

Cztery pliki (`components.jsx`, `pages.jsx`, `tables.jsx`, `infra-map.jsx`) pobrano przez claude_design MCP i zapisano bajtowo — treść wyodrębniono z surowych odpowiedzi MCP zamiast przepisywać ją przez model, więc import nie mógł wprowadzić własnych różnic.

Diff nowego źródła względem poprzedniego (bez `data-testid`) zawiera **wyłącznie** zapowiedziane zmiany:

| Plik             | Zmienionych linii | Zakres                                                                                                  |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `components.jsx` | 2                 | sygnatura `Sparkline` (+`fluid = false`) i atrybuty `<svg>` (`width`, `viewBox`, `preserveAspectRatio`) |
| `pages.jsx`      | 6                 | `MiniMetric` → `fluid={true}`; `07 Nodes`, `14 Profile`, `03 Stacks ›`, `04 Services ·`, `05 Tasks ·`   |
| `tables.jsx`     | 9                 | wyłącznie `screenLabel` (03 Stacks … 13 Users)                                                          |
| `infra-map.jsx`  | 1                 | `data-screen-label="06 Infra Map"`                                                                      |

Cztery `data-testid` zachowane: dwa w `infra-map.jsx` nałożone ponownie po imporcie (z asercją pojedynczego dopasowania każdego wzorca), dwa w `app.jsx` nietknięte — ten plik nie był aktualizowany. Stan końcowy makiety: 10 z 12 plików bajtowo identycznych ze źródłem, 2 różniące się wyłącznie o `data-testid`.

### 12.2 Zmiany w testach

| Plik                        | Zmiana                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/helpers/mockup.ts`   | 11 wartości `screenLabel` zaktualizowanych do nowej numeracji (jedno miejsce dla całego suite'u)                                                                                                                        |
| `tests/layout/grid.spec.ts` | usunięty `test.fail()` i cała gałąź `knownOverflow`; test diagnostyczny defektu zastąpiony przez `the node card chart row fits inside the card`; **nowy** `every node mini-metric stays inside its card on both themes` |
| `tests/flows/login.spec.ts` | ostatni literał `[data-screen-label="01 Dashboard"]` zastąpiony wywołaniem `screen(page, "dashboard")` z katalogu                                                                                                       |

`settle()` — **bez zmian**, zgodnie z przewidywaniem: czeka na `page.waitForSelector("[data-screen-label]")`, czyli na sam atrybut, bez filtrowania po treści. Renumeracja nie miała na niego wpływu.

Reporter `expected-failures` — **bez zmian**: obsługa pustej listy była już zaimplementowana (`if (tracked.length === 0) return`). Potwierdzone empirycznie: w przebiegu bez testów `test.fail()` blok nie pojawia się ani razu.

Liczba testów: 193 → **194** (grid.spec 23 → 24).

### 12.3 ⚠️ Zmiana wykraczająca poza zapowiedziany zakres

Zapowiedź mówiła, że przy `fluid=false` „dodany `viewBox` + `preserveAspectRatio="xMidYMid meet"` nie zmienia renderu przy stałym width". **To prawda tylko wtedy, gdy renderowana szerokość `<svg>` równa się atrybutowi `width`.** Pomiar w przeglądarce:

| Powierzchnia         | `width` | `viewBox`    | Szerokość renderowana        | Skutek                                     |
| -------------------- | ------- | ------------ | ---------------------------- | ------------------------------------------ |
| Kafelek dashboardu   | `220`   | `0 0 220 32` | **212 px**                   | skala 0,964 → **krzywa ściśnięta poziomo** |
| Tabela Tasks (meter) | `70`    | `0 0 70 22`  | 70 px                        | skala 1:1 → bez zmian                      |
| `.node-mini` (fluid) | `100%`  | `0 0 120 32` | 81,73 px w kafelku 101,73 px | zamierzone skalowanie                      |

Kafelek dashboardu jest ściskany przez kontener do 212 px. Wcześniej (bez `viewBox`) treść rysowała się 1:1 w jednostkach użytkownika i **ostatnie ~8 px krzywej było obcinane**; teraz cała krzywa jest widoczna, ale skompresowana o 3,6%. To zmiana na plus, ale realna i widoczna — dotyczy 12 baseline'ów dashboardu, których zapowiedź nie wymieniała.

Zakres regeneracji rozszerzono więc o rzeczywiście dotknięte powierzchnie zamiast trzymać się listy z zapowiedzi. Wszystkie 18 zregenerowanych baseline'ów odpowiada 1:1 osiemnastu testom, które padły przed regeneracją.

### 12.4 Regeneracja baseline'ów

| Grupa                                    | Baseline'ów | Powód                                             |
| ---------------------------------------- | ----------- | ------------------------------------------------- |
| strona Nodes (light/dark)                | 2           | kafelki `.node-mini` skalują się z trackiem       |
| karta węzła + siatka węzłów (light/dark) | 4           | ″                                                 |
| strona Dashboard (light/dark)            | 2           | sparkline kafelków — patrz §12.3                  |
| rząd donutów + 3 kafelki (light/dark)    | 8           | ″                                                 |
| powłoka `shell--light/dark`              | 2           | zrzut viewportu dashboardu zawiera te sparkline'y |
| **RAZEM**                                | **18**      |                                                   |

Porównanie sum kontrolnych przed i po: **zmieniło się dokładnie 18 plików, pozostałe 92 są bajtowo nietknięte**, zero nowych i zero usuniętych. Stan: 110 baseline'ów.

### 12.5 Potwierdzenie naprawy overflow

| Pomiar                                     | Przed                          | Po                       |
| ------------------------------------------ | ------------------------------ | ------------------------ |
| `.app__main` `scrollWidth` / `clientWidth` | 1255 / 1192 ❌                 | **1192 / 1192** ✅       |
| Szerokość `.node-mini`                     | 140 px (sztywne)               | 101,73 px (elastyczne)   |
| Kafelek DISK                               | wypychany poza kartę, obcinany | w całości wewnątrz karty |

Nowa asercja `every node mini-metric stays inside its card on both themes` sprawdza zawieranie się bounding boxów **wszystkich 3 kafelków × 8 kart × 2 motywy = 48 kafelków** — to test, który wychwyciłby oryginalne obcięcie bezpośrednio, a nie dopiero jako pasek przewijania strony.

### 12.6 Wyniki końcowe

Trzy pełne przebiegi na zamrożonym, sformatowanym drzewie:

```
run1: expected=194 skipped=0 unexpected=0 flaky=0  (155,3 s)
run2: expected=194 skipped=0 unexpected=0 flaky=0  (161,8 s)
run3: expected=194 skipped=0 unexpected=0 flaky=0  (162,5 s)

testów porównanych:      194
niestabilnych:             0
oczekiwanych porażek:      0   ← defekt naprawiony, test.fail() usunięty
blok reportera:            0 wystąpień (pusta lista obsłużona poprawnie)
```

| Kategoria | Testów  | Passed  | Expected fail | Failed | Skipped | Flaky |
| --------- | ------- | ------- | ------------- | ------ | ------- | ----- |
| visual    | 102     | 102     | 0             | 0      | 0       | 0     |
| layout    | 65      | 65      | 0             | 0      | 0       | 0     |
| flows     | 27      | 27      | 0             | 0      | 0       | 0     |
| **RAZEM** | **194** | **194** | **0**         | **0**  | **0**   | **0** |

`tsc --noEmit` czysty, Prettier bez zastrzeżeń, makieta zgodna ze źródłem poza czterema `data-testid`.

### 12.7 Werdykt

### ✅ Suite wiarygodny, zero oczekiwanych porażek

Oba defekty odnotowane podczas audytu są naprawione w makiecie i pokryte asercjami, które wykryłyby ich powrót. Suite nie zawiera już żadnego `test.fail()`; reporter pozostaje w konfiguracji i poprawnie milczy przy pustej liście.

Jedna rzecz do odnotowania na przyszłość: opis zmiany źródłowej niedoszacował zakresu — `viewBox` zmienia render wszędzie tam, gdzie CSS ściska `<svg>` poniżej jego atrybutu `width`, co objęło 12 baseline'ów dashboardu ponad 6 zapowiedzianych z Nodes. Suite wychwycił to natychmiast; gdyby próg `threshold` pozostał na domyślnym 0,2 (§6.5), część tych różnic mogłaby przejść niezauważona.

**Aneks (kosmetyczna poprawka `pages.jsx`, 2 linie — `fluid={true}` na kafelkach `ResourceTile`/`StackResourceTile`):** wbrew zapowiedzi „render wizualnie identyczny" zmiana **nie jest pikselowo neutralna** — `preserveAspectRatio="none"` skaluje wyłącznie oś X, podczas gdy poprzednie `meet` skalowało obie osie o 0,964 i centrowało w pionie, więc krzywa urosła z ≈26,98 px do 28,00 px i przesunęła się o ≈0,5 px w górę (284–311 różnych pikseli na kafelek, ratio 0,01); zregenerowano dokładnie 12 baseline'ów dashboardu (pozostałe 98 bajtowo nietknięte), 3 przebiegi × 194 testy, zero flake'ów.
