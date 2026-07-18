import { describe, it, expect } from "vitest";
import { requireUser, requireAdmin } from "./guards.js";
import type { GraphQLContext } from "./context.js";
import { loadConfig } from "../config.js";
import { createTestDb } from "../test/db-setup.js";
import { createDocker } from "../docker/engine.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";

async function ctx(
	user?: GraphQLContext["user"],
	locale: GraphQLContext["locale"] = "en"
): Promise<GraphQLContext> {
	const db = await createTestDb();
	return {
		cfg: { ...loadConfig(), mock: true },
		db,
		docker: createDocker({ ...loadConfig(), mock: true }),
		orchestrator: new SwarmOrchestrator({ ...loadConfig(), mock: true }),
		user,
		locale,
		ip: "127.0.0.1",
	};
}

describe("requireUser", () => {
	it("returns claims when authenticated", async () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "admin", role: "admin" },
		};
		expect(requireUser(await ctx(claims)).usr.username).toBe("admin");
	});

	it("throws when anonymous", async () => {
		const c = await ctx();
		expect(() => requireUser(c)).toThrow(/unauthorized/i);
	});
});

describe("requireAdmin", () => {
	it("allows admin role", async () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "admin", role: "admin" },
		};
		expect(requireAdmin(await ctx(claims)).usr.role).toBe("admin");
	});

	it("rejects non-admin", async () => {
		const claims = {
			iss: "swarmbot",
			iat: 1,
			jti: "j",
			usr: { username: "bob", role: "editor" },
		};
		const c = await ctx(claims);
		expect(() => requireAdmin(c)).toThrow(/forbidden/i);
	});
});
