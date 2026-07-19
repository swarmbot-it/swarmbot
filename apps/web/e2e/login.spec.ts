import { test, expect } from "./fixtures";

test.describe("login", () => {
	test("redirects unauthenticated users to login", async ({ page }) => {
		await page.goto("/app/dashboard");
		await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
		await expect(page.locator(".login-card")).toBeVisible();
	});

	test("logs in with mock admin and opens dashboard", async ({ page }) => {
		// Exercises the real login form end-to-end (loginAsAdmin seeds the token
		// programmatically elsewhere to stay under the login rate limit).
		await page.goto("/app/login", { waitUntil: "domcontentloaded" });
		await page.waitForSelector(".login-card", { timeout: 90_000 });
		const inputs = page.locator(".login-card input.input");
		await inputs.nth(0).fill("admin");
		await inputs.nth(1).fill("swarmbot");
		await page.locator('.login-card button[type="submit"]').click();
		await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
		await expect(page.locator("h1.page-header__title")).toBeVisible();
	});

	test("shows error for invalid credentials", async ({ page }) => {
		await page.goto("/app/login", { waitUntil: "domcontentloaded" });
		await page.waitForSelector("sb-login-page, .login-card", { timeout: 90_000 });
		const inputs = page.locator(".login-card input.input");
		await inputs.nth(0).fill("admin");
		await inputs.nth(1).fill("wrong-password");
		await page.locator('.login-card button[type="submit"]').click();
		await expect(page.locator(".login-error")).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});
});
