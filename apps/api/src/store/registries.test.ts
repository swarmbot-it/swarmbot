import { describe, expect, it } from "vitest";
import { createMockCouch } from "../couch.mock.js";
import {
	createRegistry,
	listRegistries,
	removeRegistry,
	seedDefaultRegistries,
} from "./registries.js";

describe("registries store", () => {
	it("seeds defaults exactly once", async () => {
		const { db } = createMockCouch();
		await seedDefaultRegistries(db);
		await seedDefaultRegistries(db);
		const all = await listRegistries(db);
		expect(all.length).toBeGreaterThanOrEqual(5);
		expect(all.filter((r) => r.default)).toHaveLength(1);
	});

	it("create + remove round-trip", async () => {
		const { db } = createMockCouch();
		const reg = await createRegistry(db, {
			name: "My Reg",
			url: "https://reg.example",
			type: "Harbor",
			user: "svc",
		});
		expect(reg.id).toBeTruthy();
		const after = await listRegistries(db);
		expect(after.some((r) => r.id === reg.id)).toBe(true);
		expect(await removeRegistry(db, reg.id)).toBe(true);
	});

	it("creating a new default unsets the previous default", async () => {
		const { db } = createMockCouch();
		await createRegistry(db, { name: "A", url: "a", type: "GHCR", default: true });
		await createRegistry(db, { name: "B", url: "b", type: "GHCR", default: true });
		const all = await listRegistries(db);
		expect(all.filter((r) => r.default)).toHaveLength(1);
		expect(all.find((r) => r.default)?.name).toBe("B");
	});
});
