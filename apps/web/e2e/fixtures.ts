import { test as base, expect } from "@playwright/test";

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			localStorage.clear();
			sessionStorage.clear();
		});
		await use(page);
	},
});

export { expect };

export async function loginAsAdmin(
	page: import("@playwright/test").Page,
	options?: { locale?: string }
): Promise<void> {
	await page.goto("/login", { waitUntil: "domcontentloaded" });
	await page.evaluate((locale) => {
		localStorage.clear();
		sessionStorage.clear();
		if (locale) {
			localStorage.setItem("swarmbot.lang", locale);
		}
	}, options?.locale ?? null);
	await expect(page).toHaveURL(/\/login/);
	await page.waitForSelector("sb-login-page, .login-card", { timeout: 90_000 });
	const inputs = page.locator(".login-card input.input");
	await inputs.nth(0).fill("admin");
	await inputs.nth(1).fill("swarmboty");
	await page.locator('.login-card button[type="submit"]').click();
	await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
}
