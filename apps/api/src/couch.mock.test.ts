import { describe, it, expect } from "vitest";
import { createMockCouch } from "./couch.mock.js";
import { findDocs, insertDoc, userByUsername } from "./couch.js";

describe("createMockCouch", () => {
	it("supports insert + find by type", async () => {
		const { db } = createMockCouch();
		await insertDoc(db, { type: "user", username: "bob" });
		await insertDoc(db, { type: "user", username: "carol" });
		await insertDoc(db, { type: "secret", secret: "s" });

		const users = await findDocs(db, "user", {});
		expect(users.map((u) => u.username).sort()).toEqual(["bob", "carol"]);

		const u = await userByUsername(db, "bob");
		expect(u?.username).toBe("bob");
	});

	it("bumps _rev on each insert", async () => {
		const { db } = createMockCouch();
		const a = await insertDoc(db, { type: "x" });
		expect(typeof a._rev).toBe("string");
		expect(a._rev?.startsWith("1-")).toBe(true);
	});
});
