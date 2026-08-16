import { expect, test } from "@playwright/test";
import { GROUP_LABELS, GROUP_ORDER, METRICS, NAV } from "../helpers/mockup";
import { box, bottom, computedStyle, openAdmin, sidebarItem } from "../helpers/ui";

/**
 * Sidebar geometry, measured rather than photographed.
 *
 * A screenshot tells you the sidebar changed; these tell you it is 4px too wide,
 * or that Volumes and Secrets swapped places. They also survive a legitimate
 * colour change, so the two layers fail for different reasons.
 */

test.beforeEach(async ({ page }) => {
	await openAdmin(page);
});

test("sidebar column is exactly 248px wide", async ({ page }) => {
	const sidebar = await box(page.locator(".sidebar"));
	expect(sidebar.width).toBe(METRICS.sidebarWidth);
	expect(sidebar.x).toBe(0);
});

test("sidebar starts directly below the 60px topbar", async ({ page }) => {
	const topbar = await box(page.locator(".topbar"));
	const sidebar = await box(page.locator(".sidebar"));

	expect(topbar.height).toBe(METRICS.topbarHeight);
	expect(sidebar.y).toBe(bottom(topbar));
});

test("navigation items appear in the documented order", async ({ page }) => {
	const labels = await page
		.locator(".sidebar__item")
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-label")));
	expect(labels).toEqual(NAV.map((item) => item.label));
});

test("group headings appear in the documented order with verbatim text", async ({ page }) => {
	const headings = await page.locator(".sidebar__group-label").allTextContents();
	expect(headings).toEqual(GROUP_ORDER.map((group) => GROUP_LABELS[group]));
});

test("every navigation item shares one left edge and one width", async ({ page }) => {
	const boxes = await Promise.all(NAV.map((item) => box(sidebarItem(page, item.label))));

	const lefts = new Set(boxes.map((b) => b.x));
	const widths = new Set(boxes.map((b) => b.width));

	expect(lefts.size, `nav items are not left-aligned: ${[...lefts].join(", ")}`).toBe(1);
	expect(widths.size, `nav items have inconsistent widths: ${[...widths].join(", ")}`).toBe(1);

	// 248px column, less the 1px right border and 12px of padding on each side.
	expect([...lefts][0]).toBe(METRICS.sidebarPadding.x);
	expect([...widths][0]).toBe(METRICS.sidebarItemWidth);
});

test("items within a group are separated by the 2px flex gap", async ({ page }) => {
	for (const group of GROUP_ORDER) {
		const items = NAV.filter((item) => item.group === group);
		if (items.length < 2) continue;

		const boxes = await Promise.all(items.map((item) => box(sidebarItem(page, item.label))));
		for (let i = 1; i < boxes.length; i++) {
			const gap = boxes[i].y - bottom(boxes[i - 1]);
			expect(gap, `gap between ${items[i - 1].label} and ${items[i].label}`).toBeCloseTo(
				METRICS.sidebarGap,
				1
			);
		}
	}
});

test("group separation is consistent across every group boundary", async ({ page }) => {
	const gaps: number[] = [];

	for (let i = 1; i < GROUP_ORDER.length; i++) {
		const previousGroup = GROUP_ORDER[i - 1];
		const lastOfPrevious = NAV.filter((item) => item.group === previousGroup).at(-1)!;
		const heading = page.locator(".sidebar__group-label").nth(i);

		const previousBox = await box(sidebarItem(page, lastOfPrevious.label));
		const headingBox = await box(heading);
		gaps.push(headingBox.y - bottom(previousBox));
	}

	const unique = new Set(gaps.map((gap) => Number(gap.toFixed(2))));
	expect(unique.size, `group separations differ: ${gaps.join(", ")}`).toBe(1);
});

test("items are vertically ordered top to bottom without overlapping", async ({ page }) => {
	const boxes = await Promise.all(NAV.map((item) => box(sidebarItem(page, item.label))));

	for (let i = 1; i < boxes.length; i++) {
		expect(
			boxes[i].y,
			`${NAV[i].label} must sit below ${NAV[i - 1].label}`
		).toBeGreaterThanOrEqual(bottom(boxes[i - 1]));
	}
});

test("count pills are right-aligned against a shared edge", async ({ page }) => {
	const withCounts = NAV.filter((item) => item.countKey);
	const rights = await Promise.all(
		withCounts.map(async (item) => {
			const pill = await box(sidebarItem(page, item.label).locator(".sidebar__count"));
			return Number((pill.x + pill.width).toFixed(2));
		})
	);

	expect(new Set(rights).size, `count pills are not flush right: ${rights.join(", ")}`).toBe(1);
});

test("items without a dataset render no count pill", async ({ page }) => {
	for (const item of NAV.filter((n) => !n.countKey)) {
		await expect(sidebarItem(page, item.label).locator(".sidebar__count")).toHaveCount(0);
	}
});

test("navigation labels use the specified type ramp", async ({ page }) => {
	// Dashboard is active on load, and the active modifier bumps the weight to 600 —
	// measure a resting item for the base ramp.
	const resting = await computedStyle(sidebarItem(page, "Stacks"), [
		"font-size",
		"font-weight",
		"padding",
	]);
	expect(resting["font-size"]).toBe(`${METRICS.sidebarItemFontSize}px`);
	expect(resting["font-weight"]).toBe("500");
	expect(resting.padding).toBe("9px 12px");

	const active = await computedStyle(sidebarItem(page, "Dashboard"), ["font-weight", "padding"]);
	expect(active["font-weight"]).toBe("600");
	expect(active.padding, "the active state must not change the item box").toBe("9px 12px");
});

test("the footer sits at the bottom of the sidebar column", async ({ page }) => {
	const footer = await box(page.locator(".sidebar__footer"));
	const lastItem = await box(sidebarItem(page, "Users"));

	expect(footer.y).toBeGreaterThan(bottom(lastItem));
	expect(footer.x).toBe(METRICS.sidebarPadding.x);
});
