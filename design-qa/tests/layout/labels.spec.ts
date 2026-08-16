import { expect, test } from "@playwright/test";
import { DEMO_BADGE_TEXT, GROUP_LABELS, GROUP_ORDER, NAV } from "../helpers/mockup";
import {
	computedStyle,
	freezeUI,
	gotoPage,
	LOGIN_PATH,
	openAdmin,
	settle,
	sidebarItem,
} from "../helpers/ui";

/**
 * Verbatim copy and resolved typography.
 *
 * Every string is asserted exactly as authored, diacritics and typographic
 * punctuation included — the demo badge separator is U+00B7 MIDDLE DOT, not a
 * hyphen, and the Polish copy on the login screen carries ż/ł/ą/ę. A
 * reimplementation that normalises either has changed the design.
 */

/** theme.css tokens, resolved to the rgb() form getComputedStyle returns. */
const TOKENS = {
	text: "rgb(15, 23, 42)", // --text  #0f172a
	muted: "rgb(100, 116, 139)", // --muted #64748b
	primary500: "rgb(249, 115, 22)", // --primary-500 #f97316
	primary600: "rgb(234, 88, 12)", // --primary-600 #ea580c
	primary400: "rgb(251, 146, 60)", // --primary-400 #fb923c
	darkText: "rgb(241, 245, 249)", // --text in dark #f1f5f9
} as const;

test.describe("admin shell copy", () => {
	test.beforeEach(async ({ page }) => {
		await openAdmin(page);
	});

	test("navigation labels are verbatim", async ({ page }) => {
		for (const item of NAV) {
			await expect(sidebarItem(page, item.label).locator("span").first()).toHaveText(
				item.label
			);
		}
	});

	test("group headings are verbatim, including the ampersand", async ({ page }) => {
		const headings = page.locator(".sidebar__group-label");
		for (const [index, group] of GROUP_ORDER.entries()) {
			await expect(headings.nth(index)).toHaveText(GROUP_LABELS[group]);
		}
		await expect(headings.filter({ hasText: "Storage" })).toHaveText("Storage & Config");
	});

	test("page headings are verbatim on every screen", async ({ page }) => {
		for (const item of NAV) {
			await gotoPage(page, item.id);
			await expect(page.locator(".page-header__title")).toHaveText(item.heading);
		}
	});

	test("demo badge uses a middle dot, not a hyphen", async ({ page }) => {
		const badge = page.getByTestId("demo-badge");
		await expect(badge).toHaveText(DEMO_BADGE_TEXT);

		const text = (await badge.textContent())!.trim();
		expect(text).toBe("DEMO · READ-ONLY");
		expect(text).not.toContain(" - ");
	});

	test("the wordmark keeps its orange .it suffix", async ({ page }) => {
		const wordmark = page.locator(".topbar__logo span").filter({ hasText: "swarmbot" }).first();
		await expect(wordmark).toContainText("swarmbot.it");

		const suffix = wordmark.locator("span").filter({ hasText: ".it" }).first();
		const style = await computedStyle(suffix, ["color"]);
		expect(style.color).toBe(TOKENS.primary500);
	});

	test("the sidebar footer states quorum and API version", async ({ page }) => {
		const footer = page.locator(".sidebar__footer");
		await expect(footer).toContainText("Cluster healthy");
		await expect(footer).toContainText("Quorum: 3 of 3 managers");
		await expect(footer).toContainText("API: v1.45");
	});
});

test.describe("typography", () => {
	test("page titles resolve to 22px / 700 / --text", async ({ page }) => {
		await openAdmin(page);
		const style = await computedStyle(page.locator(".page-header__title"), [
			"font-size",
			"font-weight",
			"color",
			"letter-spacing",
		]);

		expect(style["font-size"]).toBe("22px");
		expect(style["font-weight"]).toBe("700");
		expect(style.color).toBe(TOKENS.text);
		expect(style["letter-spacing"]).toBe("-0.22px"); // -0.01em at 22px
	});

	test("page titles use the branded sans, not a fallback", async ({ page }) => {
		await openAdmin(page);
		const style = await computedStyle(page.locator(".page-header__title"), ["font-family"]);
		expect(style["font-family"]).toContain("Plus Jakarta Sans");
	});

	test("monospace surfaces use JetBrains Mono", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "networks");
		const style = await computedStyle(page.locator(".dt tbody .mono").first(), ["font-family"]);
		expect(style["font-family"]).toContain("JetBrains Mono");
	});

	test("group headings resolve to 11px / 600 / --muted", async ({ page }) => {
		await openAdmin(page);
		const style = await computedStyle(page.locator(".sidebar__group-label").first(), [
			"font-size",
			"font-weight",
			"color",
			"text-transform",
		]);

		expect(style["font-size"]).toBe("11px");
		expect(style["font-weight"]).toBe("600");
		expect(style.color).toBe(TOKENS.muted);
		expect(style["text-transform"]).toBe("uppercase");
	});

	test("the active navigation item picks up the brand accent in both themes", async ({
		page,
	}) => {
		await openAdmin(page, { theme: "light" });
		await gotoPage(page, "stacks");
		expect((await computedStyle(sidebarItem(page, "Stacks"), ["color"])).color).toBe(
			TOKENS.primary600
		);

		await page.getByRole("button", { name: "Dark theme" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		expect((await computedStyle(sidebarItem(page, "Stacks"), ["color"])).color).toBe(
			TOKENS.primary400
		);
	});

	test("dark theme repaints body text without moving it", async ({ page }) => {
		await openAdmin(page, { theme: "light" });
		const lightBox = await page.locator(".page-header__title").boundingBox();

		await page.getByRole("button", { name: "Dark theme" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

		const darkBox = await page.locator(".page-header__title").boundingBox();
		expect(darkBox).toEqual(lightBox);
		expect((await computedStyle(page.locator(".page-header__title"), ["color"])).color).toBe(
			TOKENS.darkText
		);
	});
});

test.describe("login screen copy (Polish)", () => {
	test.beforeEach(async ({ page }) => {
		await freezeUI(page);
		await page.goto(LOGIN_PATH);
		await settle(page);
	});

	test("headline and lede are verbatim, diacritics intact", async ({ page }) => {
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zaloguj się do panelu");
		await expect(page.locator(".card p").first()).toHaveText(
			"Publiczne demo — dane logowania są już uzupełnione."
		);
	});

	test("field labels and the read-only note are verbatim", async ({ page }) => {
		await expect(page.locator('label[for="email"]')).toHaveText("E-mail");
		await expect(page.locator('label[for="pass"]')).toHaveText("Hasło");
		await expect(page.locator(".note span")).toHaveText(
			"Tryb tylko do odczytu — możesz przeglądać cały panel, ale wprowadzanie zmian jest wyłączone."
		);
	});

	test("the submit button and back link are verbatim", async ({ page }) => {
		await expect(page.getByRole("button", { name: "Zaloguj" })).toHaveText("Zaloguj");
		await expect(page.getByRole("link")).toHaveText("← swarmbot.it — strona główna");
	});

	test("the domain chip reads demo.swarmbot.it", async ({ page }) => {
		await expect(page.locator(".domain")).toContainText("demo.swarmbot.it");
	});

	test("no label wraps to a second line", async ({ page }) => {
		const wrapped = await page
			.locator("label, .btn, .domain")
			.evaluateAll((nodes) =>
				nodes
					.filter((node) => node.getClientRects().length > 1)
					.map((node) => node.textContent?.trim())
			);
		expect(wrapped, `these labels wrap: ${wrapped.join(" | ")}`).toEqual([]);
	});
});
