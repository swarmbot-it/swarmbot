/**
 * Determinism harness + navigation helpers shared by every spec.
 *
 * The mockup has three sources of frame-to-frame drift, all neutralised here:
 *   1. `data.js` seeds per-task CPU/memory with `Math.random()`  → seeded PRNG
 *   2. CSS keyframes on the logo/boot mark run forever            → animations killed
 *   3. Webfonts arrive after first paint                          → awaited + asserted
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { DEMO_BADGE_TEXT, navItem, type PageId, type Theme } from "./mockup";
import { installThirdPartyCache } from "./net";

/** Any label rendered by the mockup, mapped to its admin route. */
export const ADMIN_PATH = "/SwarmBot%20Admin.html";
export const LOGIN_PATH = "/demo-login.html";

/** Fixed instant for anything that reads the wall clock. Chosen, not "now". */
export const FROZEN_TIME = new Date("2026-05-01T09:00:00.000Z");

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-delay: -1ms !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
`;

/**
 * Installs everything that has to be in place *before* the page's own scripts
 * run. Call once per page, before the first `goto`.
 */
export async function freezeUI(page: Page): Promise<void> {
	await installThirdPartyCache(page);

	// Deterministic Math.random (mulberry32). data.js calls it at module scope to
	// build TASKS, so this must land before any page script executes.
	await page.addInitScript(() => {
		let seed = 0x9e3779b9;
		Math.random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	});

	// Kill animations/transitions on every document, including after navigation.
	await page.addInitScript((css: string) => {
		const apply = () => {
			if (document.getElementById("__pixel-freeze")) return;
			const style = document.createElement("style");
			style.id = "__pixel-freeze";
			style.textContent = css;
			(document.head ?? document.documentElement).appendChild(style);
		};
		if (document.head) apply();
		else document.addEventListener("DOMContentLoaded", apply, { once: true });
	}, FREEZE_CSS);

	// Fixed wall clock without faking timers — the boot sequence still needs real
	// setInterval to finish, and nothing in the UI renders a live clock.
	await page.clock.setFixedTime(FROZEN_TIME);
}

/**
 * Waits until the page is genuinely stable: app mounted, boot overlay unmounted,
 * network quiet, webfonts resolved.
 *
 * The order matters. "`.sb-boot` is absent" is true in two very different states:
 * after the boot overlay has gone, and before React has mounted anything at all.
 * Waiting on absence alone therefore returns instantly on a blank document, and
 * whether the next screenshot is correct comes down to whether `toHaveScreenshot`
 * happens to retry past the ~2.3s boot sequence. Under CPU contention (parallel
 * workers compiling seven JSX files through Babel) it does not, and the capture is
 * a blank rectangle behind the full-screen overlay.
 *
 * `[data-screen-label]` is the unambiguous post-boot marker: `PageView` renders
 * only once `booting` is false, so its presence proves both that React mounted and
 * that the overlay has been dismissed.
 */
export async function settle(page: Page): Promise<void> {
	// The login screen is plain HTML with no React shell and no boot sequence.
	const isReactShell = (await page.locator("#root").count()) > 0;

	if (isReactShell) {
		await page.waitForSelector("[data-screen-label]", { state: "attached", timeout: 30_000 });
		await page.waitForFunction(() => !document.querySelector(".sb-boot"), undefined, {
			timeout: 15_000,
		});
	}

	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	await assertWebfontsLoaded(page);
}

/**
 * Fails fast when the branded typefaces did not load. A fallback face shifts
 * every glyph, so the alternative is a screenshot suite that fails everywhere
 * with no explanation of why.
 *
 * Checks per family rather than per weight: Google Fonts splits each family into
 * unicode-range subsets and only downloads the ones a page actually paints, so
 * `fonts.check('500 12px "JetBrains Mono"')` is legitimately false on a screen
 * that never uses medium-weight mono.
 */
export async function assertWebfontsLoaded(page: Page): Promise<void> {
	if (process.env.DESIGN_QA_REQUIRE_WEBFONTS === "0") return;
	const loaded = await page.evaluate(() => {
		const families = new Set<string>();
		document.fonts.forEach((face) => {
			if (face.status === "loaded") families.add(face.family);
		});
		return families.has("Plus Jakarta Sans") && families.has("JetBrains Mono");
	});
	expect(
		loaded,
		"Webfonts (Plus Jakarta Sans / JetBrains Mono) did not load — screenshots would be compared against fallback metrics. " +
			"Run `npm run warm` once with network access, or set DESIGN_QA_REQUIRE_WEBFONTS=0 to opt out."
	).toBe(true);
}

export interface OpenOptions {
	/** Demo mode adds `?demo=1`, the DEMO · READ-ONLY badge and the read-only guards. */
	demo?: boolean;
	theme?: Theme;
}

/** Opens the admin shell and returns once it is stable. */
export async function openAdmin(page: Page, options: OpenOptions = {}): Promise<void> {
	const { demo = true, theme = "light" } = options;
	await freezeUI(page);
	await page.goto(demo ? `${ADMIN_PATH}?demo=1` : ADMIN_PATH);
	await settle(page);
	if (theme !== "light") await setTheme(page, theme);
	if (demo) await expect(page.getByText(DEMO_BADGE_TEXT, { exact: true })).toBeVisible();
}

/** Sidebar entry locator — `data-label` is the mockup's own stable hook. */
export function sidebarItem(page: Page, label: string): Locator {
	return page.locator(`.sidebar__item[data-label="${label}"]`);
}

/**
 * Clicks a sidebar entry and waits for that page's root to be on screen.
 *
 * Parks the pointer afterwards: `.sidebar__item:hover` outranks
 * `.sidebar__item--active` on specificity, so leaving the cursor where it clicked
 * would repaint the active item in the hover colour and bake that into every
 * screenshot taken after a navigation.
 */
export async function gotoPage(page: Page, id: PageId): Promise<void> {
	const item = navItem(id);
	await sidebarItem(page, item.label).click();
	await expect(page.locator(`[data-screen-label="${item.screenLabel}"]`)).toBeVisible();
	await expect(sidebarItem(page, item.label)).toHaveClass(/sidebar__item--active/);
	await parkPointer(page);
	await settleAfterNavigation(page);
}

/** Moves the cursor off every interactive surface so no `:hover` rule is live. */
export async function parkPointer(page: Page): Promise<void> {
	await page.mouse.move(0, 0);
}

/** Lighter settle for in-app navigation — no document swap, so no font re-check. */
export async function settleAfterNavigation(page: Page): Promise<void> {
	await page.waitForLoadState("networkidle");
	// One frame for React to commit and layout to flush before anything is measured.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
}

export async function setTheme(page: Page, theme: Theme): Promise<void> {
	await page
		.getByRole("button", { name: `${theme === "light" ? "Light" : "Dark"} theme` })
		.click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
	await parkPointer(page);
	await settleAfterNavigation(page);
}

export async function currentTheme(page: Page): Promise<string | null> {
	return page.locator("html").getAttribute("data-theme");
}

/** The page root for the currently rendered screen. */
export function screen(page: Page, id: PageId): Locator {
	return page.locator(`[data-screen-label="${navItem(id).screenLabel}"]`);
}

export interface PixelOptions {
	/** Regions whose content is generated rather than authored. */
	mask?: Locator[];
	/** Only for masked/dynamic surfaces; static panels stay at a hard zero. */
	maxDiffPixels?: number;
}

/**
 * The single screenshot entry point.
 *
 * Static panels are compared at `maxDiffPixelRatio: 0`. Surfaces carrying
 * generated values pass `maxDiffPixels` instead, and mask the generated regions
 * on top of that.
 *
 * Neither counter is the whole gate: Playwright only counts a pixel once it
 * exceeds the per-pixel `threshold`, which the config pins at 0.01 because the
 * 0.2 default silently absorbs every low-contrast change. Do not override
 * `threshold` here — see "Why `threshold` is set explicitly" in the README.
 */
export async function expectPixelPerfect(
	target: Page | Locator,
	name: string,
	options: PixelOptions = {}
): Promise<void> {
	const tolerance =
		options.maxDiffPixels === undefined
			? { maxDiffPixelRatio: 0 }
			: { maxDiffPixels: options.maxDiffPixels };

	await expect(target).toHaveScreenshot(`${name}.png`, {
		...tolerance,
		mask: options.mask,
		animations: "disabled",
		caret: "hide",
		scale: "css",
	});
}

/** Reads resolved styles for label/typography assertions. */
export async function computedStyle(
	locator: Locator,
	properties: string[]
): Promise<Record<string, string>> {
	return locator.evaluate((element, props: string[]) => {
		const style = getComputedStyle(element as Element);
		return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
	}, properties);
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** `boundingBox()` that throws instead of returning null, so callers stay readable. */
export async function box(locator: Locator): Promise<Box> {
	const result = await locator.boundingBox();
	if (!result) throw new Error(`Element is not visible, cannot measure: ${locator}`);
	return result;
}

export const right = (b: Box) => b.x + b.width;
export const bottom = (b: Box) => b.y + b.height;

/** True when two rectangles share any area — used by the overlap checks. */
export function overlaps(a: Box, b: Box, epsilon = 0.5): boolean {
	return (
		a.x < right(b) - epsilon &&
		b.x < right(a) - epsilon &&
		a.y < bottom(b) - epsilon &&
		b.y < bottom(a) - epsilon
	);
}

/** Reads the dataset lengths the app itself is rendering from. */
export async function datasetLength(page: Page, key: string): Promise<number> {
	return page.evaluate((k: string) => (window as any).SBData[k].length, key);
}
