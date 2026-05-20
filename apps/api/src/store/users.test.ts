import { describe, expect, it } from "vitest";
import { createMockCouch } from "../couch.mock.js";
import { createUser, listUsers, removeUser, seedDemoUsers } from "./users.js";

describe("users store", () => {
	it("create + list + remove", async () => {
		const { db } = createMockCouch();
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
		const { db } = createMockCouch();
		await createUser(db, { username: "dup", password: "p1", email: "a@b.c", role: "Editor" });
		await expect(
			createUser(db, { username: "dup", password: "p2", email: "x@y.z", role: "Editor" })
		).rejects.toThrow();
	});

	it("seedDemoUsers populates a non-empty list", async () => {
		const { db } = createMockCouch();
		await seedDemoUsers(db);
		const all = await listUsers(db);
		expect(all.length).toBeGreaterThan(0);
	});
});
