import { describe, it, expect } from "vitest";
import { consumeSlt, createSlt } from "./slt.js";
import { createTestDb } from "../test/db-setup.js";

describe("createSlt / consumeSlt", () => {
	it("issues a token that can be consumed once", async () => {
		const db = await createTestDb();
		const slt = await createSlt(db, "alice");
		expect(typeof slt).toBe("string");
		expect(slt.length).toBeGreaterThan(10);
		expect(await consumeSlt(db, slt)).toBe("alice");
		expect(await consumeSlt(db, slt)).toBeUndefined();
	});

	it("returns undefined for unknown tokens", async () => {
		const db = await createTestDb();
		expect(await consumeSlt(db, undefined)).toBeUndefined();
		expect(await consumeSlt(db, "not-a-token")).toBeUndefined();
	});

	it("issues distinct tokens", async () => {
		const db = await createTestDb();
		const a = await createSlt(db, "u");
		const b = await createSlt(db, "u");
		expect(a).not.toBe(b);
	});
});
