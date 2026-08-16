import { expect, test } from "@playwright/test";
import { DEMO_BADGE_TEXT, DEMO_EMAIL } from "../helpers/mockup";
import {
	ADMIN_PATH,
	LOGIN_PATH,
	expectPixelPerfect,
	freezeUI,
	screen,
	settle,
} from "../helpers/ui";

test.describe("demo login flow", () => {
	test("login screen is pre-filled with the demo credentials", async ({ page }) => {
		await freezeUI(page);
		await page.goto(LOGIN_PATH);
		await settle(page);

		await expect(page).toHaveTitle("demo.swarmbot.it — Zaloguj się");
		await expect(page.getByRole("heading", { name: "Zaloguj się do panelu" })).toBeVisible();
		await expect(page.locator("#email")).toHaveValue(DEMO_EMAIL);
		await expect(page.locator("#email")).toHaveAttribute("readonly", "");
		await expect(page.locator("#pass")).toHaveValue("swarm-demo-2026");
		await expect(page.getByRole("button", { name: "Zaloguj" })).toBeVisible();
		await expect(
			page.getByText(
				"Tryb tylko do odczytu — możesz przeglądać cały panel, ale wprowadzanie zmian jest wyłączone."
			)
		).toBeVisible();
	});

	test('"Zaloguj" lands on the admin panel in demo mode', async ({ page }) => {
		await freezeUI(page);
		await page.goto(LOGIN_PATH);
		await settle(page);

		await page.getByRole("button", { name: "Zaloguj" }).click();

		await page.waitForURL(`**${ADMIN_PATH}?demo=1`);
		await settle(page);

		await expect(page.getByText(DEMO_BADGE_TEXT, { exact: true })).toBeVisible();
		await expect(screen(page, "dashboard")).toBeVisible();
	});

	test("login screen renders pixel-perfect", async ({ page }) => {
		await freezeUI(page);
		await page.goto(LOGIN_PATH);
		await settle(page);

		await expectPixelPerfect(page.locator(".card"), "demo-login-card");
	});
});
