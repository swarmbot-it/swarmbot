import { describe, it, expect } from "vitest";
import { isRevoked, revokeJti } from "./blacklist.js";
import { createTestDb } from "../test/db-setup.js";

describe("revokeJti / isRevoked", () => {
	it("ignores undefined", async () => {
		const db = await createTestDb();
		await revokeJti(db, undefined);
		expect(await isRevoked(db, undefined)).toBe(false);
	});

	it("marks a jti revoked", async () => {
		const db = await createTestDb();
		const jti = `jti-${Math.random()}`;
		expect(await isRevoked(db, jti)).toBe(false);
		await revokeJti(db, jti);
		expect(await isRevoked(db, jti)).toBe(true);
	});

	it("returns false for unknown jtis", async () => {
		const db = await createTestDb();
		expect(await isRevoked(db, `unknown-${Math.random()}`)).toBe(false);
	});

	it("re-revoking the same jti is a no-op, not an error", async () => {
		const db = await createTestDb();
		const jti = `jti-${Math.random()}`;
		await revokeJti(db, jti);
		await expect(revokeJti(db, jti)).resolves.not.toThrow();
		expect(await isRevoked(db, jti)).toBe(true);
	});

	it("a fresh test db (truncated) does not see a previously revoked jti", async () => {
		const db1 = await createTestDb();
		const jti = `jti-${Math.random()}`;
		await revokeJti(db1, jti);
		expect(await isRevoked(db1, jti)).toBe(true);
		const db2 = await createTestDb();
		expect(await isRevoked(db2, jti)).toBe(false);
	});
});
