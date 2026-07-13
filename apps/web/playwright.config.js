const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const monorepoRoot = path.resolve(__dirname, "../..");
const apiPort = process.env.SWARMBOT_E2E_API_PORT ?? "8081";
const webPort = process.env.SWARMBOT_E2E_WEB_PORT ?? "4200";

module.exports = defineConfig({
	testDir: "./e2e",
	// *.k8s.spec.ts runs via playwright.k8s.config.js (mock-kubernetes API).
	testIgnore: /.*\.k8s\.spec\.ts/,
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
			command: "npm run dev -w @swarmbot/api",
			cwd: monorepoRoot,
			url: `http://127.0.0.1:${apiPort}/health`,
			reuseExistingServer: true,
			timeout: 120_000,
			env: {
				...process.env,
				SWARMBOT_MOCK: "true",
				PORT: apiPort,
				SWARMBOT_PORT: apiPort,
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
