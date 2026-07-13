import { describe, it, expect } from "vitest";
import { requireUser, requireAdmin } from "./guards.js";
import type { GraphQLContext } from "./context.js";
import { loadConfig } from "../config.js";
import { createMockCouch } from "../couch.mock.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";

function ctx(
	user?: GraphQLContext["user"],
	locale: GraphQLContext["locale"] = "en"
): GraphQLContext {
	const { db } = createMockCouch();
	const cfg = { ...loadConfig(), mock: true };
	return {
		cfg,
		couchDb: db,
		orchestrator: new SwarmOrchestrator(cfg),
		user,
		locale,
	};
}

describe("requireUser", () => {
	it("returns claims when authenticated", () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "admin", role: "admin" },
		};
		expect(requireUser(ctx(claims)).usr.username).toBe("admin");
	});

	it("throws when anonymous", () => {
		expect(() => requireUser(ctx())).toThrow(/unauthorized/i);
	});
});

describe("requireAdmin", () => {
	it("allows admin role", () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "admin", role: "admin" },
		};
		expect(requireAdmin(ctx(claims)).usr.role).toBe("admin");
	});

	it("rejects non-admin", () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "bob", role: "editor" },
		};
		expect(() => requireAdmin(ctx(claims))).toThrow(/forbidden/i);
	});
});
