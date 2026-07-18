import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { bootstrapAdminIfEmpty, initUsersFromConfig } from "./bootstrap.js";
import { createTestDb } from "../test/db-setup.js";
import { listUsers } from "../store/users.js";
import { derivePassword } from "../auth/password.js";

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "fs/promises";

describe("bootstrapAdminIfEmpty", () => {
	beforeEach(() => {
		delete process.env.SWARMBOT_BOOTSTRAP_ADMIN;
		delete process.env.SWARMBOT_BOOTSTRAP_PASSWORD;
	});

	it("creates mock admin when database is empty", async () => {
		const db = await createTestDb();
		await bootstrapAdminIfEmpty(db, { mock: true });
		const list = await listUsers(db);
		expect(list.some((u) => u.username === "admin")).toBe(true);
	});

	it("skips when users already exist", async () => {
		const db = await createTestDb();
		await db
			.insertInto("users")
			.values({
				id: randomUUID(),
				username: "existing",
				password: derivePassword("x"),
				role: "user",
			})
			.execute();
		await bootstrapAdminIfEmpty(db, { mock: true });
		const list = await listUsers(db);
		expect(list).toHaveLength(1);
	});
});

describe("initUsersFromConfig", () => {
	afterEach(() => {
		vi.mocked(readFile).mockReset();
	});

	it("imports users from yaml file", async () => {
		vi.mocked(readFile).mockResolvedValue(`
users:
  - username: yamluser
    password: secret123
    email: y@example.com
    role: editor
`);
		const db = await createTestDb();
		await initUsersFromConfig(db);
		const list = await listUsers(db);
		expect(list.some((u) => u.username === "yamluser")).toBe(true);
	});

	it("ignores missing config file", async () => {
		vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
		const db = await createTestDb();
		await expect(initUsersFromConfig(db)).resolves.toBeUndefined();
	});
});
