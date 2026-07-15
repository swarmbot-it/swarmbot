import { test, expect, loginAsAdmin } from "./fixtures";

test.describe("orchestrator badge (swarm mock)", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test("topbar shows the Swarm badge", async ({ page }) => {
		const badge = page.getByTestId("orchestrator-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText(/swarm/i);
		await expect(badge).toHaveAttribute("data-orchestrator", "swarm");
	});

	test("sidebar keeps the Stacks label", async ({ page }) => {
		await expect(page.locator(".sidebar__item-text", { hasText: /^Stacks$/ })).toBeVisible();
	});
});
