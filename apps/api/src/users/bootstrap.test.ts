import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bootstrapAdminIfEmpty, initUsersFromConfig } from "./bootstrap.js";
import { createMockCouch } from "../couch.mock.js";
import { users } from "../couch.js";
import { derivePassword } from "../auth/password.js";

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}));

import { readFile } from "fs/promises";

describe("bootstrapAdminIfEmpty", () => {
	beforeEach(() => {
		delete process.env.SWARMBOTY_BOOTSTRAP_ADMIN;
		delete process.env.SWARMBOTY_BOOTSTRAP_PASSWORD;
	});

	it("creates mock admin when database is empty", async () => {
		const { db } = createMockCouch();
		await bootstrapAdminIfEmpty(db, { mock: true });
		const list = await users(db);
		expect(list.some((u) => u.username === "admin")).toBe(true);
	});

	it("skips when users already exist", async () => {
		const { db } = createMockCouch();
		const { insertDoc } = await import("../couch.js");
		await insertDoc(db, {
			type: "user",
			username: "existing",
			password: derivePassword("x"),
			role: "user",
		});
		await bootstrapAdminIfEmpty(db, { mock: true });
		const list = await users(db);
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
		const { db } = createMockCouch();
		await initUsersFromConfig(db);
		const list = await users(db);
		expect(list.some((u) => u.username === "yamluser")).toBe(true);
	});

	it("ignores missing config file", async () => {
		vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
		const { db } = createMockCouch();
		await expect(initUsersFromConfig(db)).resolves.toBeUndefined();
	});
});
