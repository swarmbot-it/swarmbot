import { expect, test } from "@playwright/test";
import { expectPixelPerfect, gotoPage, openAdmin, setTheme } from "../helpers/ui";

/**
 * Theme switching.
 *
 * The toggle must repaint via CSS custom properties on the root element — not by
 * swapping stylesheets or re-rendering geometry — and both resting states are
 * held to the same pixel gate as everything else.
 */

test("light is the default theme", async ({ page }) => {
	await openAdmin(page);
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute(
		"aria-pressed",
		"true"
	);
	await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
		"aria-pressed",
		"false"
	);
});

test("the toggle flips data-theme and the underlying tokens", async ({ page }) => {
	await openAdmin(page);

	const readTokens = () =>
		page.evaluate(() => {
			const style = getComputedStyle(document.documentElement);
			return {
				bg: style.getPropertyValue("--bg").trim(),
				surface: style.getPropertyValue("--surface").trim(),
				text: style.getPropertyValue("--text").trim(),
			};
		});

	const light = await readTokens();
	expect(light).toEqual({ bg: "#f5f6fa", surface: "#ffffff", text: "#0f172a" });

	await setTheme(page, "dark");

	const dark = await readTokens();
	expect(dark).toEqual({ bg: "#0b1020", surface: "#131a2e", text: "#f1f5f9" });
});

test("switching themes is idempotent and reversible", async ({ page }) => {
	await openAdmin(page);

	await setTheme(page, "dark");
	await setTheme(page, "dark");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

	await setTheme(page, "light");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute(
		"aria-pressed",
		"true"
	);
});

test("the theme survives navigation between screens", async ({ page }) => {
	await openAdmin(page);
	await setTheme(page, "dark");

	for (const id of ["stacks", "nodes", "users"] as const) {
		await gotoPage(page, id);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	}
});

test("the shell holds its pixel baseline in light", async ({ page }) => {
	await openAdmin(page, { theme: "light" });
	await expectPixelPerfect(page, "shell--light");
});

test("the shell holds its pixel baseline in dark", async ({ page }) => {
	await openAdmin(page, { theme: "dark" });
	await expectPixelPerfect(page, "shell--dark");
});

test("theme changes repaint without shifting the layout", async ({ page }) => {
	await openAdmin(page, { theme: "light" });
	await gotoPage(page, "stacks");

	const measure = () =>
		page.locator(".dt tbody tr").evaluateAll((rows) =>
			rows.map((row) => {
				const { x, y, width, height } = row.getBoundingClientRect();
				return { x, y, width, height };
			})
		);

	const before = await measure();
	await setTheme(page, "dark");
	const after = await measure();

	expect(after).toEqual(before);
});
