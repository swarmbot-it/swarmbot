const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

// Kubernetes-mock e2e harness: identical to playwright.config.js but the mock
// API imitates a Kubernetes cluster (SWARMBOT_MOCK_ORCHESTRATOR=kubernetes),
// and only the kubernetes orchestrator spec runs here. Run with:
//   npm run test:e2e:k8s -w web      (or `npm run test:e2e:k8s` from the root)
const monorepoRoot = path.resolve(__dirname, "../..");
const apiPort = process.env.SWARMBOT_E2E_API_PORT ?? "8081";
const webPort = process.env.SWARMBOT_E2E_WEB_PORT ?? "4200";

module.exports = defineConfig({
	testDir: "./e2e",
	testMatch: "**/orchestrator-k8s.spec.ts",
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
			// Start fresh so a leftover swarm-mock API on this port is never reused.
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				...process.env,
				SWARMBOT_MOCK: "true",
				SWARMBOT_MOCK_ORCHESTRATOR: "kubernetes",
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
