import { test, expect, loginAsAdmin } from "./fixtures";

/**
 * Runs against the API mock started with SW4RM_BOT_MOCK_ORCHESTRATOR=kubernetes
 * (see playwright.k8s.config.js).
 */
test.describe("mock-kubernetes views", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page);
	});

	test("topbar shows the Kubernetes badge", async ({ page }) => {
		const badge = page.getByTestId("orchestrator-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText(/kubernetes/i);
		await expect(badge).toHaveAttribute("data-orchestrator", "kubernetes");
	});

	test("sidebar renames Stacks to Namespaces", async ({ page }) => {
		await expect(
			page.locator(".sidebar__item-text", { hasText: /^Namespaces$/ })
		).toBeVisible();
		await expect(page.locator(".sidebar__item-text", { hasText: /^Stacks$/ })).toHaveCount(0);
	});

	test("stacks page lists kubernetes namespaces", async ({ page }) => {
		await page.goto("/app/stacks");
		await expect(page.locator(".page-header__title")).toHaveText(/Namespaces/i);
		await expect(page.getByRole("cell", { name: "frontend", exact: true })).toBeVisible();
		await expect(page.getByRole("cell", { name: "databases", exact: true })).toBeVisible();
	});

	test("nodes page lists k3s nodes with a control-plane manager", async ({ page }) => {
		await page.goto("/app/nodes");
		await expect(page.getByText("k3s-server-01")).toBeVisible();
		await expect(page.getByText("k3s-agent-01")).toBeVisible();
	});

	test("services page lists kubernetes workloads", async ({ page }) => {
		await page.goto("/app/services");
		await expect(page.getByText("nginx", { exact: true }).first()).toBeVisible();
		await expect(page.getByText("swarmagent", { exact: true }).first()).toBeVisible();
	});
});
