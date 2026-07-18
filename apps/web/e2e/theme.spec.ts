import { test, expect, loginAsAdmin } from "./fixtures";

test.describe("theme slider", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test("slider is visible in the topbar with both icons", async ({ page }) => {
		const slider = page.locator(".theme-slider");
		await expect(slider).toBeVisible();
		await expect(slider.locator('sb-icon[name="sun"]')).toBeVisible();
		await expect(slider.locator('sb-icon[name="moon"]')).toBeVisible();
	});

	test("light button is active by default", async ({ page }) => {
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await expect(
			page.locator('.theme-slider__btn.theme-slider__btn--active sb-icon[name="sun"]'),
		).toBeVisible();
	});

	test("clicking dark button switches to dark mode", async ({ page }) => {
		await page.locator('.theme-slider__btn:has(sb-icon[name="moon"])').click();

		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(
			page.locator('.theme-slider__btn.theme-slider__btn--active sb-icon[name="moon"]'),
		).toBeVisible();
	});

	test("clicking light button switches back to light mode", async ({ page }) => {
		await page.locator('.theme-slider__btn:has(sb-icon[name="moon"])').click();
		await page.locator('.theme-slider__btn:has(sb-icon[name="sun"])').click();

		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await expect(
			page.locator('.theme-slider__btn.theme-slider__btn--active sb-icon[name="sun"]'),
		).toBeVisible();
	});

	test("persists selection in localStorage", async ({ page }) => {
		await page.locator('.theme-slider__btn:has(sb-icon[name="moon"])').click();

		const stored = await page.evaluate(() => localStorage.getItem("swarmbot.theme"));
		expect(stored).toBe("dark");
	});
});
