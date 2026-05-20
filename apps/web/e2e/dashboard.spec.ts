import { test, expect, loginAsAdmin } from "./fixtures";

test.describe("dashboard", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test("shows cluster summary cards", async ({ page }) => {
		await expect(page.locator(".dash-summary .summary-card")).toHaveCount(4);
	});

	test("sidebar navigates to services", async ({ page }) => {
		await page.locator(".sidebar a", { hasText: /services|usługi/i }).click();
		await expect(page).toHaveURL(/\/app\/services/);
	});
});
