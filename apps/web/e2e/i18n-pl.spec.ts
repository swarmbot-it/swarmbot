import { test as base, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { loginAsAdmin } from "./fixtures";

const pl = JSON.parse(
	fs.readFileSync(path.join(__dirname, "../public/assets/i18n/pl.json"), "utf8")
) as Record<string, unknown>;

function t(key: string): string {
	const value = key.split(".").reduce<unknown>((acc, part) => {
		if (acc && typeof acc === "object" && part in acc) {
			return (acc as Record<string, unknown>)[part];
		}
		return undefined;
	}, pl);
	if (typeof value !== "string") {
		throw new Error(`Missing translation key: ${key}`);
	}
	return value;
}

/** English UI strings that must not appear when locale is Polish. */
const FORBIDDEN_LEGACY = [
	"Stacki",
	"Środowiska",
	"Środowisko",
	"środowisk wdrożonych",
	"Nowe środowisko",
	"Sekrety",
	"Nowy stack",
	"Nowy sekret",
	"sekretów zapisanych",
];

const FORBIDDEN_EN = [
	"New stack",
	"New service",
	"New network",
	"New volume",
	"New secret",
	"New config",
	"Connect registry",
	"Add user",
	"services running",
	"tasks scheduled",
	"networks available",
	"volumes provisioned",
	"secrets stored",
	"configs stored",
	"registries connected",
	"Search hostname or IP",
	"No results",
	"Running",
	"Healthy",
	"Managers",
	"Workers",
];

type TablePageSpec = {
	path: string;
	titleKey: string;
	countSuffixKey: string;
	addKey?: string;
	headerKeys: string[];
};

const TABLE_PAGES: TablePageSpec[] = [
	{
		path: "/app/stacks",
		titleKey: "nav.stacks",
		countSuffixKey: "pages.stacks.countSuffix",
		addKey: "pages.stacks.add",
		headerKeys: ["pages.stacks.columns.stack", "pages.stacks.columns.services", "columns.status"],
	},
	{
		path: "/app/services",
		titleKey: "nav.services",
		countSuffixKey: "pages.services.countSuffix",
		addKey: "pages.services.add",
		headerKeys: [
			"pages.services.columns.service",
			"pages.services.columns.replicas",
			"columns.status",
		],
	},
	{
		path: "/app/tasks",
		titleKey: "nav.tasks",
		countSuffixKey: "pages.tasks.countSuffix",
		headerKeys: ["pages.tasks.columns.task", "pages.tasks.columns.node", "columns.status"],
	},
	{
		path: "/app/networks",
		titleKey: "nav.networks",
		countSuffixKey: "pages.networks.countSuffix",
		addKey: "pages.networks.add",
		headerKeys: ["columns.name", "columns.driver", "columns.subnet"],
	},
	{
		path: "/app/volumes",
		titleKey: "nav.volumes",
		countSuffixKey: "pages.volumes.countSuffix",
		addKey: "pages.volumes.add",
		headerKeys: ["columns.name", "columns.driver", "columns.size"],
	},
	{
		path: "/app/secrets",
		titleKey: "nav.secrets",
		countSuffixKey: "pages.secrets.countSuffix",
		addKey: "pages.secrets.add",
		headerKeys: ["columns.name", "columns.created", "columns.updated"],
	},
	{
		path: "/app/configs",
		titleKey: "nav.configs",
		countSuffixKey: "pages.configs.countSuffix",
		addKey: "pages.configs.add",
		headerKeys: ["columns.name", "columns.created", "columns.updated"],
	},
	{
		path: "/app/registries",
		titleKey: "nav.registries",
		countSuffixKey: "pages.registries.countSuffix",
		addKey: "pages.registries.add",
		headerKeys: [
			"pages.registries.columns.registry",
			"columns.type",
			"pages.registries.columns.authUser",
		],
	},
	{
		path: "/app/users",
		titleKey: "users.title",
		countSuffixKey: "users.inWorkspace",
		addKey: "users.addUser",
		headerKeys: [
			"users.columns.user",
			"users.columns.role",
			"users.columns.lastLogin",
		],
	},
];

const test = base.extend({
	page: async ({ page }, use) => {
		// Set locale only — do not clear storage on navigation (would drop the auth token).
		await page.addInitScript(() => {
			localStorage.setItem("swarmboty.lang", "pl");
		});
		await use(page);
	},
});

test.describe("Polish UI (pl)", () => {
	test.beforeEach(async ({ page }) => {
		await loginAsAdmin(page, { locale: "pl" });
	});

	for (const spec of TABLE_PAGES) {
		test(`${spec.path} — titles, buttons, table headers`, async ({ page }) => {
			await page.goto(spec.path, { waitUntil: "domcontentloaded" });
			await page.waitForSelector(".page-header__title", { timeout: 60_000 });
			await expect(page.locator(".page-header__title")).toHaveText(t(spec.titleKey), {
				timeout: 15_000,
			});
			await expect(page.locator(".page-header__count")).toContainText(t(spec.countSuffixKey));

			if (spec.addKey) {
				await expect(page.locator(".page-header .btn--primary")).toContainText(t(spec.addKey));
			}

			await page.waitForSelector("table thead th", { timeout: 60_000 });
			const headers = (await page.locator("table thead th").allTextContents()).map((h) =>
				h.trim()
			);
			for (const key of spec.headerKeys) {
				const label = t(key);
				expect(
					headers.some((h) => h.includes(label)),
					`Expected table header "${label}" on ${spec.path}, got: ${headers.join(", ")}`
				).toBe(true);
			}

			await expect(page.locator(".input--search")).toHaveAttribute(
				"placeholder",
				t("table.search")
			);

			for (const label of [...FORBIDDEN_EN, ...FORBIDDEN_LEGACY]) {
				await expect(page.locator(".page-header")).not.toContainText(label);
				await expect(page.locator("table thead")).not.toContainText(label);
			}

			if (spec.headerKeys.includes("columns.status")) {
				await expect(page.locator("table tbody")).not.toContainText("Running");
				await expect(page.locator("table tbody")).not.toContainText("Healthy");
			}
		});
	}

	test("/app/nodes — search, filters, resource labels", async ({ page }) => {
		await page.goto("/app/nodes", { waitUntil: "domcontentloaded" });
		await page.waitForSelector(".page-header__title", { timeout: 60_000 });
		await expect(page.locator(".page-header__title")).toHaveText(t("nav.nodes"));
		await expect(page.locator(".page-header__count")).toContainText("węzłów");

		await expect(page.locator(".input--search")).toHaveAttribute(
			"placeholder",
			t("pages.nodes.searchPlaceholder")
		);

		const filters = page.locator(".dt-toolbar .segmented__item");
		await expect(filters.filter({ hasText: t("pages.nodes.filters.all") })).toBeVisible();
		await expect(filters.filter({ hasText: t("pages.nodes.filters.manager") })).toBeVisible();
		await expect(filters.filter({ hasText: t("pages.nodes.filters.worker") })).toBeVisible();

		await expect(
			page.locator(".node-mini__label", { hasText: t("pages.nodes.labels.cpu") }).first()
		).toBeVisible();
		await expect(
			page.locator(".node-mini__label", { hasText: t("pages.nodes.labels.memory") }).first()
		).toBeVisible();
		await expect(
			page.locator(".node-mini__label", { hasText: t("pages.nodes.labels.disk") }).first()
		).toBeVisible();
	});

});
