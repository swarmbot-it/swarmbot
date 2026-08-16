import { expect, test } from "@playwright/test";
import { DEMO_TOAST_TEXT } from "../helpers/mockup";
import { expectPixelPerfect, gotoPage, openAdmin } from "../helpers/ui";

/**
 * Read-only demo guarantees.
 *
 * Every create action must be intercepted before a modal opens, must announce
 * itself through the demo toast, and must leave the underlying dataset untouched.
 */

const CREATE_ACTIONS = [
	{ id: "stacks", button: "New stack" },
	{ id: "networks", button: "New network" },
	{ id: "volumes", button: "New volume" },
	{ id: "secrets", button: "New secret" },
	{ id: "configs", button: "New config" },
	{ id: "registries", button: "Connect registry" },
	{ id: "users", button: "Add user" },
] as const;

for (const { id, button } of CREATE_ACTIONS) {
	test(`${button} is blocked in demo mode`, async ({ page }) => {
		await openAdmin(page, { demo: true });
		await gotoPage(page, id);

		const rowsBefore = await page.locator(".dt tbody tr").count();

		await page.getByRole("button", { name: button }).click();

		await expect(page.getByTestId("toast")).toHaveText(new RegExp(DEMO_TOAST_TEXT));
		// No modal is mounted at all — the guard fires before the form state is set.
		await expect(page.locator(".modal-backdrop")).toHaveCount(0);
		expect(await page.locator(".dt tbody tr").count()).toBe(rowsBefore);
	});
}

test("the demo toast renders pixel-perfect", async ({ page }) => {
	await openAdmin(page, { demo: true });
	await gotoPage(page, "stacks");

	await page.getByRole("button", { name: "New stack" }).click();
	await expect(page.getByTestId("toast")).toBeVisible();

	await expectPixelPerfect(page.getByTestId("toast"), "demo-toast");
});

test("logging out of the demo returns to the login screen", async ({ page }) => {
	await openAdmin(page, { demo: true });

	await page.locator(".topbar__user").click();
	await expect(page.locator(".popover")).toBeVisible();
	await page.locator(".popover__item--danger").click();

	await page.waitForURL("**/demo-login.html");
	await expect(page.getByRole("heading", { name: "Zaloguj się do panelu" })).toBeVisible();
});

test("outside demo mode the create form opens normally", async ({ page }) => {
	await openAdmin(page, { demo: false });
	await gotoPage(page, "stacks");

	await expect(page.getByTestId("demo-badge")).toHaveCount(0);

	await page.getByRole("button", { name: "New stack" }).click();
	await expect(page.locator(".modal")).toBeVisible();
	await expect(page.locator(".modal__title")).toHaveText("Deploy stack");
});

/**
 * Positive control for `.modal-backdrop`.
 *
 * Every other use of that selector in this file is a `toHaveCount(0)` — which a
 * typo would satisfy just as well as a working read-only guard. Pinning the
 * mounted state here means a renamed class breaks this test loudly instead of
 * quietly turning the guards into no-ops.
 */
test("the modal backdrop mounts when a form opens", async ({ page }) => {
	await openAdmin(page, { demo: false });
	await gotoPage(page, "stacks");

	await expect(page.locator(".modal-backdrop")).toHaveCount(0);

	await page.getByRole("button", { name: "New stack" }).click();

	await expect(page.locator(".modal-backdrop")).toHaveCount(1);
	await expect(page.locator(".modal")).toBeVisible();
	await expectPixelPerfect(page.locator(".modal"), "modal-deploy-stack");

	await page.keyboard.press("Escape");
	await expect(page.locator(".modal-backdrop")).toHaveCount(0);
});

test("demo mode leaves navigation and read paths fully usable", async ({ page }) => {
	await openAdmin(page, { demo: true });

	for (const id of ["services", "tasks", "infra-map", "nodes"] as const) {
		await gotoPage(page, id);
		await expect(page.locator(".page-header__title")).toBeVisible();
	}
});
