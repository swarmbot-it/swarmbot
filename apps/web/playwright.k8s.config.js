const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

/**
 * Same stack as playwright.config.js, but the API mock imitates Kubernetes
 * (SW4RM_BOT_MOCK_ORCHESTRATOR=kubernetes) and only *.k8s.spec.ts files run.
 * The API port stays 8081 because proxy.conf.json targets it — stop any
 * previously running swarm-mode dev API before running this config.
 */
const monorepoRoot = path.resolve(__dirname, "../..");
const apiPort = process.env.SW4RM_BOT_E2E_API_PORT ?? "8081";
const webPort = process.env.SW4RM_BOT_E2E_WEB_PORT ?? "4200";

module.exports = defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.k8s\.spec\.ts/,
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: 1,
	timeout: 60_000,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: `http://127.0.0.1:${webPort}`,
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "npm run dev -w @sw4rmbot/api",
			cwd: monorepoRoot,
			url: `http://127.0.0.1:${apiPort}/health`,
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				...process.env,
				SW4RM_BOT_MOCK: "true",
				SW4RM_BOT_MOCK_ORCHESTRATOR: "kubernetes",
				PORT: apiPort,
				SW4RM_BOT_PORT: apiPort,
			},
		},
		{
			command: `npx ng serve --port ${webPort} --host 127.0.0.1`,
			url: `http://127.0.0.1:${webPort}`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
		},
	],
});
