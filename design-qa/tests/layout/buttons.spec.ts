import { expect, test, type Locator } from "@playwright/test";
import { METRICS } from "../helpers/mockup";
import { box, computedStyle, gotoPage, openAdmin } from "../helpers/ui";

/**
 * Button geometry.
 *
 * Buttons are where "close enough" usually shows up first: a label that wraps at
 * one more character, a control 2px short of the 36px rhythm, a padding that
 * drifted on one variant only.
 */

/** Every screen that puts a call-to-action in its page header. */
const PAGES_WITH_ACTIONS = [
	{ id: "stacks", label: "New stack" },
	{ id: "networks", label: "New network" },
	{ id: "volumes", label: "New volume" },
	{ id: "secrets", label: "New secret" },
	{ id: "configs", label: "New config" },
	{ id: "registries", label: "Connect registry" },
	{ id: "users", label: "Add user" },
] as const;

async function heightOf(button: Locator): Promise<number> {
	return (await box(button)).height;
}

test.describe("primary page actions", () => {
	for (const { id, label } of PAGES_WITH_ACTIONS) {
		test(`${label} keeps the 36px control height and never wraps`, async ({ page }) => {
			await openAdmin(page, { theme: "light" });
			await gotoPage(page, id);

			const button = page.getByRole("button", { name: label });
			await expect(button).toBeVisible();

			expect(await heightOf(button)).toBe(METRICS.buttonHeight);

			const style = await computedStyle(button, [
				"padding",
				"font-size",
				"font-weight",
				"white-space",
				"gap",
			]);
			expect(style.padding).toBe("8px 14px");
			expect(style["font-size"]).toBe("13px");
			expect(style["font-weight"]).toBe("600");
			expect(style["white-space"]).toBe("nowrap");
			expect(style.gap).toBe("8px");

			// A label that wraps or clips overflows its own content box.
			const overflow = await button.evaluate((el) => ({
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
				lines: el.getClientRects().length,
			}));
			expect(overflow.scrollWidth, `"${label}" is clipped or wrapped`).toBeLessThanOrEqual(
				overflow.clientWidth
			);
			expect(overflow.lines).toBe(1);
		});
	}
});

test("page-header actions align to the content column right edge", async ({ page }) => {
	await openAdmin(page);

	for (const { id, label } of PAGES_WITH_ACTIONS) {
		await gotoPage(page, id);

		const header = await box(page.locator(".page-header"));
		const button = await box(page.getByRole("button", { name: label }));

		expect(
			button.x + button.width,
			`${label} is not flush with the page-header right edge`
		).toBeCloseTo(header.x + header.width, 1);
	}
});

test("small buttons use the 30px variant consistently", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "dashboard");

	const refresh = page.getByRole("button", { name: "Refresh" });
	expect(await heightOf(refresh)).toBe(METRICS.buttonHeightSmall);

	const style = await computedStyle(refresh, ["padding", "font-size"]);
	expect(style.padding).toBe("4px 10px");
	expect(style["font-size"]).toBe("12px");
});

test("icon buttons are square at both sizes", async ({ page }) => {
	await openAdmin(page);

	const notifications = await box(page.getByRole("button", { name: "Notifications" }));
	expect(notifications.width).toBe(METRICS.buttonHeight);
	expect(notifications.height).toBe(METRICS.buttonHeight);
});

test("every button on a screen shares one baseline height per size class", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "stacks");

	const heights = await page.locator(".btn").evaluateAll((nodes) =>
		nodes
			.filter((node) => (node as HTMLElement).offsetParent !== null)
			.map((node) => ({
				small: node.classList.contains("btn--sm"),
				height: Math.round(node.getBoundingClientRect().height),
			}))
	);

	expect(heights.length).toBeGreaterThan(0);
	for (const { small, height } of heights) {
		expect(height).toBe(small ? METRICS.buttonHeightSmall : METRICS.buttonHeight);
	}
});

test("theme toggle buttons are equally sized", async ({ page }) => {
	await openAdmin(page);

	const light = await box(page.getByRole("button", { name: "Light theme" }));
	const dark = await box(page.getByRole("button", { name: "Dark theme" }));

	expect(light.width).toBe(dark.width);
	expect(light.height).toBe(dark.height);
	expect(light.y).toBe(dark.y);
});
