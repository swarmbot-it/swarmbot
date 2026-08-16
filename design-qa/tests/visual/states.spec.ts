import { expect, test } from "@playwright/test";
import { expectPixelPerfect, gotoPage, openAdmin, sidebarItem } from "../helpers/ui";

/**
 * Interaction states.
 *
 * Hover and active are as much a part of the spec as the resting state, and they
 * are exactly where a reimplementation quietly drifts. Transitions are frozen by
 * the harness, so a hover screenshot is stable the instant the pointer lands.
 */

test.describe("navigation item states", () => {
	test("resting", async ({ page }) => {
		await openAdmin(page);
		await expectPixelPerfect(sidebarItem(page, "Stacks"), "nav-item-rest");
	});

	test("hover", async ({ page }) => {
		await openAdmin(page);
		const item = sidebarItem(page, "Stacks");
		await item.hover();
		await expectPixelPerfect(item, "nav-item-hover");
	});

	test("active", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "stacks");
		const item = sidebarItem(page, "Stacks");
		await expect(item).toHaveClass(/sidebar__item--active/);
		await expectPixelPerfect(item, "nav-item-active");
	});

	test("active item with count pill", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "users");
		await expectPixelPerfect(sidebarItem(page, "Users"), "nav-item-active-with-count");
	});
});

test.describe("button states", () => {
	test("primary — resting and hover", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "stacks");

		const button = page.getByRole("button", { name: "New stack" });
		await button.scrollIntoViewIfNeeded();
		await expectPixelPerfect(button, "btn-primary-rest");

		await button.hover();
		await expectPixelPerfect(button, "btn-primary-hover");
	});

	test("secondary — resting and hover", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "dashboard");

		const button = page.getByRole("button", { name: "Refresh" });
		await button.scrollIntoViewIfNeeded();
		await expectPixelPerfect(button, "btn-secondary-rest");

		await button.hover();
		await expectPixelPerfect(button, "btn-secondary-hover");
	});

	test("icon button — resting and hover", async ({ page }) => {
		await openAdmin(page);

		const button = page.getByRole("button", { name: "Notifications" });
		await expectPixelPerfect(button, "btn-icon-rest");

		await button.hover();
		await expectPixelPerfect(button, "btn-icon-hover");
	});
});

test.describe("theme toggle states", () => {
	test("light selected", async ({ page }) => {
		await openAdmin(page, { theme: "light" });
		await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await expectPixelPerfect(page.locator(".theme-toggle"), "theme-toggle--light-selected");
	});

	test("dark selected", async ({ page }) => {
		await openAdmin(page, { theme: "dark" });
		await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await expectPixelPerfect(page.locator(".theme-toggle"), "theme-toggle--dark-selected");
	});
});

test.describe("table row states", () => {
	test("row hover", async ({ page }) => {
		await openAdmin(page);
		await gotoPage(page, "stacks");

		const row = page.locator(".dt tbody tr").first();
		await row.hover();
		await expectPixelPerfect(row, "table-row-hover");
	});
});
