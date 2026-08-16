import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.DESIGN_QA_PORT ?? 4321);
const HOST = process.env.DESIGN_QA_HOST ?? "127.0.0.1";
export const BASE_URL = `http://${HOST}:${PORT}`;

/**
 * Pixel-perfect regression suite for the swarmbot.it admin mockup.
 *
 * Deliberately single-engine: baselines are byte-compared, and Firefox/WebKit
 * rasterise text differently enough that a shared baseline set is meaningless.
 * Chromium only, one fixed viewport, no device-pixel scaling.
 */
export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// No retries: a screenshot that only passes on the second attempt is a flake
	// to fix, not a result to accept.
	retries: 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: [
		["list"],
		// Prints the status of every `test.fail()` test — Playwright otherwise hides
		// them inside the passed count. Informational only, never changes exit code.
		["./reporters/expected-failures.ts"],
		["html", { outputFolder: "playwright-report", open: "never" }],
	],
	outputDir: "test-results",
	snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}{ext}",

	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			animations: "disabled",
			caret: "hide",
			scale: "css",
			maxDiffPixelRatio: 0,
			// `maxDiffPixelRatio: 0` alone is not a pixel-perfect gate. Playwright
			// applies `threshold` — a per-pixel perceptual (YIQ) distance, default
			// 0.2 — *before* a pixel is counted as different, so a zeroed counter
			// still tolerates every sub-20% change. Measured consequence of the
			// default: a nav item's entire hover state (95.5% of pixels changed,
			// worst pixel 0.153) compared equal. See design-qa/VERIFICATION.md §6.5.
			//
			// 0.01 rather than 0: the suite renders bit-identically on one machine,
			// but a hair of anti-alias noise is normal when baselines move between
			// environments, and 0.01 still separates all four hover pairs (the
			// tightest, btn-secondary/btn-icon, sits at 0.042).
			threshold: 0.01,
		},
	},

	use: {
		baseURL: BASE_URL,
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1,
		// theme.css guards its infinite logo/boot keyframes behind
		// `prefers-reduced-motion: reduce`, so this is a first-class part of the
		// determinism story, not just an accessibility nicety.
		contextOptions: { reducedMotion: "reduce" },
		colorScheme: "light",
		timezoneId: "UTC",
		locale: "en-GB",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},

	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
				deviceScaleFactor: 1,
			},
		},
	],

	webServer: {
		command: "node scripts/static-server.mjs",
		url: `${BASE_URL}/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
