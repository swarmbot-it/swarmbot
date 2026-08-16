import { expect, test, type Locator, type Page } from "@playwright/test";
import { NAV, THEMES, type PageId } from "../helpers/mockup";
import { expectPixelPerfect, gotoPage, openAdmin } from "../helpers/ui";

/**
 * Full-viewport regression for all 13 navigation screens, in both themes.
 *
 * The shell is `height: 100vh` with the content column scrolling inside
 * `.app__main`, so the viewport screenshot *is* the page at 1440×900 — a
 * `fullPage` capture would just re-photograph the same fold. Content below the
 * fold is covered panel-by-panel in `panels.spec.ts`, where Playwright scrolls
 * each panel into its own container before capturing.
 */

/**
 * Screens carrying values the mockup generates rather than authors.
 *
 * `data.js` derives per-task CPU/memory from `Math.random()`, which the harness
 * seeds — so these values are in fact deterministic and the Tasks screen is now
 * compared at full strictness like everything else. What remains masked is the
 * Infra Map, where the same figures are re-aggregated per node across 52 chips;
 * masking there keeps a `data.js` edit from turning the whole screen red instead
 * of pointing at the panel that moved.
 */
const GENERATED_REGIONS: Partial<Record<PageId, (page: Page) => Locator[]>> = {
	"infra-map": (page) => [page.getByTestId("infra-svc-mem")],
};

for (const theme of THEMES) {
	test.describe(`${theme} theme`, () => {
		for (const item of NAV) {
			test(`${item.label} renders pixel-perfect`, async ({ page }) => {
				await openAdmin(page, { theme });
				await gotoPage(page, item.id);

				await expect(
					page.getByRole("heading", { name: item.heading, exact: true })
				).toBeVisible();

				const masks = GENERATED_REGIONS[item.id]?.(page);
				await expectPixelPerfect(
					page,
					`${item.id}--${theme}`,
					masks ? { mask: masks, maxDiffPixels: 50 } : {}
				);
			});
		}
	});
}
