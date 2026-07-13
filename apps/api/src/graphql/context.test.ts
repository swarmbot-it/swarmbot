import { describe, it, expect } from "vitest";
import { buildContext, localeFromHeader } from "./context.js";
import { loadConfig } from "../config.js";
import { createMockCouch } from "../couch.mock.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";

describe("localeFromHeader", () => {
	it("prefers Polish", () => {
		expect(localeFromHeader("pl-PL,en;q=0.9")).toBe("pl");
	});
	it("falls back to English", () => {
		expect(localeFromHeader("de-DE")).toBe("en");
	});
});

describe("buildContext", () => {
	it("maps request user and locale", () => {
		const { db } = createMockCouch();
		const cfg = { ...loadConfig(), mock: true };
		const orchestrator = new SwarmOrchestrator(cfg);
		const claims = {
			iss: "sw4rm.bot",
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
			orchestrator
		);
		expect(ctx.user).toBe(claims);
		expect(ctx.locale).toBe("pl");
		expect(ctx.cfg.mock).toBe(true);
	});
});
