import { describe, it, expect } from "vitest";
import { buildContext, localeFromHeader } from "./context.js";
import { loadConfig } from "../config.js";
import { createTestDb } from "../test/db-setup.js";
import { createDocker } from "../docker/engine.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";

describe("localeFromHeader", () => {
	it("prefers Polish", () => {
		expect(localeFromHeader("pl-PL,en;q=0.9")).toBe("pl");
	});
	it("falls back to English for a locale we do not ship", () => {
		// Swedish is deliberately not in SUPPORTED_LOCALES. This case used to use
		// de-DE, which stopped being a fallback example once German was added.
		expect(localeFromHeader("sv-SE")).toBe("en");
	});
	it("resolves every shipped locale, matching on the primary subtag", () => {
		expect(localeFromHeader("de-DE")).toBe("de");
		expect(localeFromHeader("pt-BR")).toBe("pt");
		expect(localeFromHeader("zh-Hans")).toBe("zh");
		expect(localeFromHeader("ko")).toBe("ko");
	});
	it("honours q-weights over header order", () => {
		expect(localeFromHeader("sv-SE;q=0.9,ja-JP;q=1.0")).toBe("ja");
	});
});

describe("buildContext", () => {
	it("maps request user and locale", async () => {
		const db = await createTestDb();
		const cfg = { ...loadConfig(), mock: true };
		const docker = createDocker(cfg);
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "x",
			usr: { username: "admin" },
		};
		const ctx = buildContext(
			{
				headers: { "accept-language": "pl-PL" },
				swarmUser: claims,
			} as Parameters<typeof buildContext>[0],
			cfg,
			db,
			new SwarmOrchestrator(cfg, docker),
			docker
		);
		expect(ctx.user).toBe(claims);
		expect(ctx.locale).toBe("pl");
		expect(ctx.cfg.mock).toBe(true);
	});
});
