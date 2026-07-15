import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		include: ["src/**/*.test.ts"],
		// Tests share one real Postgres database (truncated between tests for
		// isolation, see test/db-setup.ts) rather than a per-file in-memory
		// fake — running files in parallel would race on those shared tables.
		fileParallelism: false,
		coverage: {
			provider: "v8",
			reporter: ["text", "text-summary", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/index.ts", "src/i18n/messages/**"],
		},
	},
});
