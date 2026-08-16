import { expect, test } from "@playwright/test";
import { EXPECTED_COUNTS, METRICS, NAV, THEMES } from "../helpers/mockup";
import { box, bottom, gotoPage, openAdmin, overlaps, right, screen, type Box } from "../helpers/ui";

/**
 * Panel alignment.
 *
 * Three questions per screen: do panels share the content column's edges, are
 * the gutters between them equal, and does anything overlap.
 */

/** Distinct gap values between consecutive siblings, rounded to sub-pixel. */
function gapsBetween(boxes: Box[], axis: "x" | "y"): number[] {
	const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
	const gaps: number[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const previous = sorted[i - 1];
		const gap = axis === "x" ? sorted[i].x - right(previous) : sorted[i].y - bottom(previous);
		gaps.push(Number(gap.toFixed(2)));
	}
	return gaps;
}

test("the shell is a 248px + fluid two-column grid under a 60px topbar", async ({ page }) => {
	await openAdmin(page);

	const viewport = page.viewportSize()!;
	const topbar = await box(page.locator(".topbar"));
	const sidebar = await box(page.locator(".sidebar"));
	const main = await box(page.locator(".app__main"));

	expect(topbar.width).toBe(viewport.width);
	expect(topbar.height).toBe(METRICS.topbarHeight);
	expect(sidebar.width).toBe(METRICS.sidebarWidth);

	expect(main.x).toBe(METRICS.sidebarWidth);
	expect(main.y).toBe(METRICS.topbarHeight);
	expect(right(main)).toBe(viewport.width);
	expect(bottom(main)).toBe(viewport.height);
});

test("every screen root spans the padded content column", async ({ page }) => {
	await openAdmin(page);

	const main = await box(page.locator(".app__main"));
	const expectedLeft = main.x + METRICS.mainPadding.left;
	const expectedRight = right(main) - METRICS.mainPadding.right;

	for (const item of NAV) {
		await gotoPage(page, item.id);
		const root = await box(screen(page, item.id));

		expect(root.x, `${item.label} content column left edge`).toBeCloseTo(expectedLeft, 1);
		expect(right(root), `${item.label} content column right edge`).toBeCloseTo(
			expectedRight,
			1
		);
	}
});

test("page headers align to the same top inset on every screen", async ({ page }) => {
	await openAdmin(page);

	const main = await box(page.locator(".app__main"));
	const expectedTop = main.y + METRICS.mainPadding.top;

	for (const item of NAV) {
		await gotoPage(page, item.id);
		const header = await box(page.locator(".page-header"));
		expect(header.y, `${item.label} page header top inset`).toBeCloseTo(expectedTop, 1);
	}
});

test("dashboard summary cards share one gutter and one width", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "dashboard");

	const cards = await page.locator(".summary-card").all();
	expect(cards).toHaveLength(4);

	const boxes = await Promise.all(cards.map(box));
	const gaps = gapsBetween(boxes, "x");

	expect(new Set(gaps).size, `uneven gutters: ${gaps.join(", ")}`).toBe(1);
	expect(gaps[0]).toBeCloseTo(16, 1);

	const widths = new Set(boxes.map((b) => Number(b.width.toFixed(2))));
	expect(widths.size, `uneven card widths: ${[...widths].join(", ")}`).toBe(1);
});

test("dashboard donut tiles share one gutter and one width", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "dashboard");

	const boxes = await Promise.all((await page.locator(".dash-tile").all()).map(box));
	expect(boxes).toHaveLength(3);

	const gaps = gapsBetween(boxes, "x");
	expect(new Set(gaps).size, `uneven gutters: ${gaps.join(", ")}`).toBe(1);
	expect(gaps[0]).toBeCloseTo(16, 1);
});

test("dashboard rows stack on the same left and right edges", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "dashboard");

	const rows = [
		page.locator(".dash-summary"),
		page.locator(".dash-grid"),
		page
			.locator(".card")
			.filter({ has: page.locator(".card__title", { hasText: "Resource Utilization" }) }),
		page.locator(".card").filter({ has: page.locator(".card__title", { hasText: "Nodes" }) }),
	];

	const boxes = await Promise.all(rows.map(box));
	const lefts = new Set(boxes.map((b) => Number(b.x.toFixed(2))));
	const rights = new Set(boxes.map((b) => Number(right(b).toFixed(2))));

	expect(lefts.size, `dashboard rows are not left-aligned: ${[...lefts].join(", ")}`).toBe(1);
	expect(rights.size, `dashboard rows are not right-aligned: ${[...rights].join(", ")}`).toBe(1);
});

test("infra map node cards form even rows — 3 managers, 4 workers", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "infra-map");

	const managerHosts = ["swarm-mgr-01", "swarm-mgr-02", "swarm-mgr-03"];
	const workerHosts = ["swarm-wk-01", "swarm-wk-02", "swarm-wk-03", "swarm-wk-04"];

	for (const [rowName, hosts] of [
		["managers", managerHosts],
		["workers", workerHosts],
	] as const) {
		const boxes = await Promise.all(
			hosts.map((host) => box(page.getByTestId(`infra-node-${host}`)))
		);

		const tops = new Set(boxes.map((b) => Number(b.y.toFixed(2))));
		expect(tops.size, `${rowName} row is not top-aligned: ${[...tops].join(", ")}`).toBe(1);

		// CSS grid distributes the remainder of a fractional track across columns,
		// so equal `1fr` cards legitimately differ by well under a pixel.
		const widths = boxes.map((b) => b.width);
		expect(
			Math.max(...widths) - Math.min(...widths),
			`${rowName} cards have uneven widths: ${widths.map((w) => w.toFixed(2)).join(", ")}`
		).toBeLessThanOrEqual(1);

		const gaps = gapsBetween(boxes, "x");
		expect(
			Math.max(...gaps) - Math.min(...gaps),
			`${rowName} gutters are uneven: ${gaps.join(", ")}`
		).toBeLessThanOrEqual(1);
		expect(gaps[0]).toBeCloseTo(12, 1);
	}
});

test("nodes grid keeps even gutters within each row", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "nodes");

	const boxes = await Promise.all((await page.locator(".node-card").all()).map(box));
	expect(boxes.length).toBeGreaterThan(1);

	// Group by row, then check the horizontal rhythm inside each one.
	const rows = new Map<number, Box[]>();
	for (const b of boxes) {
		const key = Number(b.y.toFixed(0));
		rows.set(key, [...(rows.get(key) ?? []), b]);
	}

	for (const [top, rowBoxes] of rows) {
		if (rowBoxes.length < 2) continue;
		const gaps = gapsBetween(rowBoxes, "x");
		expect(
			Math.max(...gaps) - Math.min(...gaps),
			`row at y=${top} has uneven gutters: ${gaps.join(", ")}`
		).toBeLessThanOrEqual(1);
		expect(gaps[0]).toBeCloseTo(16, 1);
	}
});

test("no two top-level panels overlap on any screen", async ({ page }) => {
	await openAdmin(page);

	for (const item of NAV) {
		await gotoPage(page, item.id);

		// Direct children of the screen root are the page's structural bands.
		const bands = screen(page, item.id).locator(":scope > *");
		const boxes = (
			await Promise.all((await bands.all()).map((band) => band.boundingBox()))
		).filter((b): b is Box => b !== null && b.width > 0 && b.height > 0);

		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				expect(
					overlaps(boxes[i], boxes[j]),
					`${item.label}: bands ${i} and ${j} overlap (${JSON.stringify(boxes[i])} vs ${JSON.stringify(boxes[j])})`
				).toBe(false);
			}
		}
	}
});

test.describe("horizontal overflow", () => {
	for (const item of NAV) {
		test(`${item.label} does not scroll horizontally`, async ({ page }) => {
			await openAdmin(page);
			await gotoPage(page, item.id);

			const overflow = await page.locator(".app__main").evaluate((el) => ({
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
			}));
			expect(
				overflow.scrollWidth,
				`${item.label} overflows the content column`
			).toBeLessThanOrEqual(overflow.clientWidth);
		});
	}
});

test("the node card chart row fits inside the card", async ({ page }) => {
	// Regression guard for the overflow this suite used to track as a known defect.
	// `.node-mini` no longer has a 140px floor — its <Sparkline> is `fluid`, so it
	// renders at `width="100%"` over a viewBox and shrinks with its `1fr` track.
	// Asserting the arithmetic (three tracks plus two gaps ≤ the container) catches a
	// regression at the source, before it shows up as a page-level scrollbar.
	await openAdmin(page);
	await gotoPage(page, "nodes");

	const card = page.locator(".node-card").first();
	const charts = card.locator(".node-card__charts");

	const tracks = await charts.evaluate((el) =>
		getComputedStyle(el).gridTemplateColumns.split(" ").map(parseFloat)
	);
	const gap = await charts.evaluate((el) => parseFloat(getComputedStyle(el).columnGap));
	const available = (await box(charts)).width;

	expect(tracks).toHaveLength(3);

	const required = tracks.reduce((total, track) => total + track, 0) + gap * (tracks.length - 1);
	expect(required, "three tracks plus two gaps must fit the chart row").toBeLessThanOrEqual(
		available + 0.5
	);
});

test("every node mini-metric stays inside its card on both themes", async ({ page }) => {
	// The DISK tile used to be pushed past the card's right border and clipped. This
	// checks containment directly — every tile's box inside its card's box — for all
	// eight cards rather than only the first, so a regression that only affects the
	// widest hostname or the last column still trips it.
	for (const theme of THEMES) {
		await openAdmin(page, { theme });
		await gotoPage(page, "nodes");

		const cards = await page.locator(".node-card").all();
		expect(cards.length).toBe(EXPECTED_COUNTS.NODES);

		for (const card of cards) {
			const host = (await card.locator(".node-card__hostname").innerText()).trim();
			const cardBox = await box(card);
			const minis = await card.locator(".node-mini").all();
			expect(minis.length, `${host} should show CPU, Memory and Disk`).toBe(3);

			for (const [index, mini] of minis.entries()) {
				const miniBox = await box(mini);
				const label = `${theme} / ${host} / tile ${index + 1}`;

				expect(
					miniBox.x,
					`${label} spills past the card's left border`
				).toBeGreaterThanOrEqual(cardBox.x - 0.5);
				expect(
					right(miniBox),
					`${label} spills past the card's right border`
				).toBeLessThanOrEqual(right(cardBox) + 0.5);
				expect(
					miniBox.y,
					`${label} spills past the card's top border`
				).toBeGreaterThanOrEqual(cardBox.y - 0.5);
				expect(
					bottom(miniBox),
					`${label} spills past the card's bottom border`
				).toBeLessThanOrEqual(bottom(cardBox) + 0.5);
			}
		}
	}
});
