import { expect, test } from "@playwright/test";
import { THEMES } from "../helpers/mockup";
import { expectPixelPerfect, gotoPage, openAdmin } from "../helpers/ui";

/**
 * Panel-level regression.
 *
 * Page-level shots catch "something moved"; these catch *which* panel moved, and
 * reach the content below the fold — Playwright scrolls each locator into view
 * inside `.app__main` before capturing it.
 */

for (const theme of THEMES) {
	test.describe(`${theme} theme — chrome`, () => {
		test.beforeEach(async ({ page }) => {
			await openAdmin(page, { theme });
		});

		test("sidebar", async ({ page }) => {
			await expectPixelPerfect(page.locator(".sidebar"), `sidebar--${theme}`);
		});

		test("topbar carries the demo badge", async ({ page }) => {
			await expect(page.getByTestId("demo-badge")).toBeVisible();
			await expectPixelPerfect(page.locator(".topbar"), `topbar--${theme}`);
		});

		test("sidebar footer", async ({ page }) => {
			await expectPixelPerfect(page.locator(".sidebar__footer"), `sidebar-footer--${theme}`);
		});
	});

	test.describe(`${theme} theme — dashboard panels`, () => {
		test.beforeEach(async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "dashboard");
		});

		test("summary counters row", async ({ page }) => {
			await expectPixelPerfect(
				page.locator(".dash-summary"),
				`dashboard-summary-row--${theme}`
			);
		});

		for (const [index, label] of ["Stacks", "Services", "Tasks", "Nodes"].entries()) {
			test(`summary card — ${label}`, async ({ page }) => {
				const card = page.locator(".summary-card").nth(index);
				await expect(card.locator(".summary-card__label")).toHaveText(label);
				await expectPixelPerfect(
					card,
					`dashboard-summary-${label.toLowerCase()}--${theme}`
				);
			});
		}

		test("donut tile row", async ({ page }) => {
			await expectPixelPerfect(page.locator(".dash-grid"), `dashboard-donuts--${theme}`);
		});

		for (const [index, label] of ["CPU", "Memory", "Disk"].entries()) {
			test(`donut tile — ${label}`, async ({ page }) => {
				const tile = page.locator(".dash-tile").nth(index);
				await expect(tile.locator(".dash-tile__label")).toHaveText(label);
				await expectPixelPerfect(tile, `dashboard-tile-${label.toLowerCase()}--${theme}`);
			});
		}

		test("resource utilization card", async ({ page }) => {
			const card = page
				.locator(".card")
				.filter({ has: page.locator(".card__title", { hasText: "Resource Utilization" }) });
			await expectPixelPerfect(card, `dashboard-utilization-card--${theme}`);
		});

		test("nodes card", async ({ page }) => {
			const card = page
				.locator(".card")
				.filter({ has: page.locator(".card__title", { hasText: "Nodes" }) });
			await expectPixelPerfect(card, `dashboard-nodes-card--${theme}`);
		});
	});

	test.describe(`${theme} theme — infra map panels`, () => {
		test.beforeEach(async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "infra-map");
		});

		test("legend", async ({ page }) => {
			await expectPixelPerfect(page.locator(".card").first(), `infra-legend--${theme}`);
		});

		for (const host of ["swarm-mgr-01", "swarm-wk-03"]) {
			test(`node card — ${host}`, async ({ page }) => {
				await expectPixelPerfect(
					page.getByTestId(`infra-node-${host}`),
					`infra-node-${host}--${theme}`,
					{
						mask: [page.getByTestId(`infra-node-${host}`).getByTestId("infra-svc-mem")],
						maxDiffPixels: 50,
					}
				);
			});
		}

		test("per-service placement summary", async ({ page }) => {
			const card = page.locator(".card").filter({ hasText: "Per-service placement summary" });
			await expectPixelPerfect(card, `infra-service-summary--${theme}`);
		});

		test("cluster totals", async ({ page }) => {
			const card = page.locator(".card").filter({ hasText: "Cluster totals" });
			await expectPixelPerfect(card, `infra-cluster-totals--${theme}`);
		});

		test("key flows", async ({ page }) => {
			const card = page.locator(".card").filter({ hasText: "Key flows" });
			await expectPixelPerfect(card, `infra-key-flows--${theme}`);
		});
	});

	test.describe(`${theme} theme — resource tables`, () => {
		for (const id of [
			"stacks",
			"services",
			"networks",
			"volumes",
			"secrets",
			"configs",
			"registries",
			"users",
		] as const) {
			test(`${id} table`, async ({ page }) => {
				await openAdmin(page, { theme });
				await gotoPage(page, id);
				await expectPixelPerfect(page.locator(".table-wrap"), `table-${id}--${theme}`);
			});
		}

		// Seeding `Math.random` makes the per-task CPU/memory figures deterministic,
		// so this table is held to the same zero-tolerance gate as every other one.
		// It stays a separate case only because it is the one table whose content is
		// generated rather than authored — if it ever destabilises, that is a
		// determinism bug to fix, not a threshold to loosen.
		test("tasks table", async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "tasks");
			await expectPixelPerfect(page.locator(".table-wrap"), `table-tasks--${theme}`);
		});

		test("table toolbar", async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "stacks");
			await expectPixelPerfect(page.locator(".table-toolbar"), `table-toolbar--${theme}`);
		});

		test("pagination", async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "volumes");
			await expectPixelPerfect(page.locator(".pagination"), `pagination--${theme}`);
		});
	});

	test.describe(`${theme} theme — nodes page`, () => {
		test("node card", async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "nodes");
			const card = page.locator(".node-card").filter({ hasText: "swarm-mgr-01" });
			await expectPixelPerfect(card, `nodes-card-mgr-01--${theme}`);
		});

		test("node grid", async ({ page }) => {
			await openAdmin(page, { theme });
			await gotoPage(page, "nodes");
			await expectPixelPerfect(page.locator(".node-grid"), `nodes-grid--${theme}`);
		});
	});
}
