import { describe, expect, it } from "vitest";
import { createTestDb } from "../test/db-setup.js";
import { createUser, listUsers, removeUser, seedDemoUsers, upsertOidcUser } from "./users.js";

describe("users store", () => {
	it("create + list + remove", async () => {
		const db = await createTestDb();
		const u = await createUser(db, {
			username: "alice",
			password: "very-secret-1",
			email: "alice@example.com",
			role: "Editor",
		});
		expect(u.username).toBe("alice");
		const all = await listUsers(db);
		expect(all.some((x) => x.id === u.id)).toBe(true);
		expect(await removeUser(db, u.id)).toBe(true);
	});

	it("rejects duplicate usernames", async () => {
		const db = await createTestDb();
		await createUser(db, { username: "dup", password: "p1", email: "a@b.c", role: "Editor" });
		await expect(
			createUser(db, { username: "dup", password: "p2", email: "x@y.z", role: "Editor" })
		).rejects.toThrow();
	});

	it("seedDemoUsers populates a non-empty list", async () => {
		const db = await createTestDb();
		await seedDemoUsers(db);
		const all = await listUsers(db);
		expect(all.length).toBeGreaterThan(0);
	});
});

describe("upsertOidcUser", () => {
	it("creates a new user for an unknown OIDC subject", async () => {
		const db = await createTestDb();
		const r = await upsertOidcUser(db, {
			sub: "gh|1",
			provider: "dex",
			username: "carol",
			email: "c@x.io",
			name: "Carol",
			role: "admin",
		});
		expect(r.username).toBe("carol");
		expect(r.role).toBe("admin");
		const all = await listUsers(db);
		expect(all.filter((u) => u.username === "carol")).toHaveLength(1);
	});

	it("matches an existing subject and updates the role without duplicating", async () => {
		const db = await createTestDb();
		await upsertOidcUser(db, {
			sub: "gh|2",
			provider: "dex",
			username: "dave",
			email: null,
			name: null,
			role: "user",
		});
		// Same subject on a later login (even if the IdP username changed) -> same
		// account, role re-applied.
		const r = await upsertOidcUser(db, {
			sub: "gh|2",
			provider: "dex",
			username: "dave-renamed",
			email: null,
			name: null,
			role: "admin",
		});
		expect(r.username).toBe("dave");
		expect(r.role).toBe("admin");
		const all = await listUsers(db);
		expect(all.filter((u) => u.username.startsWith("dave"))).toHaveLength(1);
	});

	it("links OIDC to an existing password account by username (no duplicate)", async () => {
		const db = await createTestDb();
		await createUser(db, {
			username: "erin",
			password: "pw-very-secret",
			email: "e@x.io",
			role: "Editor",
		});
		const before = (await listUsers(db)).length;
		const r = await upsertOidcUser(db, {
			sub: "gh|3",
			provider: "dex",
			username: "erin",
			email: "e@x.io",
			name: "Erin",
			role: "admin",
		});
		expect(r.username).toBe("erin");
		const all = await listUsers(db);
		expect(all.length).toBe(before);
		expect(all.find((u) => u.username === "erin")?.role).toBe("admin");
	});
});
