import { test, expect, loginAsAdmin } from "./fixtures";

// Runs against the mock API started with SWARMBOT_MOCK_ORCHESTRATOR=kubernetes
// (see ../playwright.k8s.config.js). The Swarm counterpart is orchestrator.spec.ts;
// the default Playwright config testIgnores this spec so it only runs in k8s mode.
test.describe("orchestrator badge (kubernetes mock)", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test("topbar shows the Kubernetes badge", async ({ page }) => {
		const badge = page.getByTestId("orchestrator-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText(/kubernetes/i);
		await expect(badge).toHaveAttribute("data-orchestrator", "kubernetes");
	});

	test("sidebar relabels Stacks to Namespaces", async ({ page }) => {
		await expect(
			page.locator(".sidebar__item-text", { hasText: /^Namespaces$/ }),
		).toBeVisible();
		await expect(
			page.locator(".sidebar__item-text", { hasText: /^Stacks$/ }),
		).toHaveCount(0);
	});
});
