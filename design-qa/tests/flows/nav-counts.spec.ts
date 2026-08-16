import { expect, test } from "@playwright/test";
import { EXPECTED_COUNTS, NAV } from "../helpers/mockup";
import { datasetLength, gotoPage, openAdmin, sidebarItem } from "../helpers/ui";

/**
 * Sidebar counts against the data layer.
 *
 * Two assertions per item, deliberately: the pill must equal what `window.SBData`
 * currently holds (the wiring is live), and that dataset must still be the size
 * the design was drawn against (the data has not silently drifted).
 */

test("every count pill matches its live dataset", async ({ page }) => {
	await openAdmin(page);

	for (const item of NAV.filter((n) => n.countKey)) {
		const live = await datasetLength(page, item.countKey!);
		await expect(
			sidebarItem(page, item.label).locator(".sidebar__count"),
			`${item.label} pill`
		).toHaveText(String(live));
	}
});

test("datasets are the sizes the mockup was designed against", async ({ page }) => {
	await openAdmin(page);

	for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
		expect(await datasetLength(page, key), `${key} dataset size`).toBe(expected);
	}
});

test("page headers repeat the same counts as the sidebar", async ({ page }) => {
	await openAdmin(page);

	const withHeaderCount = [
		{ id: "stacks", key: "STACKS", noun: "stacks deployed" },
		{ id: "services", key: "SERVICES", noun: "services running" },
		{ id: "tasks", key: "TASKS", noun: "tasks scheduled" },
		{ id: "networks", key: "NETWORKS", noun: "networks available" },
		{ id: "volumes", key: "VOLUMES", noun: "volumes provisioned" },
		{ id: "secrets", key: "SECRETS", noun: "secrets stored" },
		{ id: "configs", key: "CONFIGS", noun: "configs stored" },
		{ id: "registries", key: "REGISTRIES", noun: "registries connected" },
		{ id: "users", key: "USERS", noun: "users in workspace" },
	] as const;

	for (const { id, key, noun } of withHeaderCount) {
		await gotoPage(page, id);
		await expect(page.locator(".page-header__count")).toHaveText(
			`${EXPECTED_COUNTS[key]} ${noun}`
		);
	}
});

test("table pagination totals agree with the dataset", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "volumes");

	await expect(page.locator(".pagination")).toContainText(`of ${EXPECTED_COUNTS.VOLUMES}`);
	await expect(page.locator(".dt tbody tr")).toHaveCount(10); // default page size
});

test("the dashboard subtitle restates the cluster totals", async ({ page }) => {
	await openAdmin(page);
	await gotoPage(page, "dashboard");

	await expect(page.locator(".page-header__subtitle")).toHaveText(
		`Live status of prod-eu-1 · ${EXPECTED_COUNTS.NODES} nodes · ${EXPECTED_COUNTS.SERVICES} services · ${EXPECTED_COUNTS.TASKS} tasks`
	);
});
