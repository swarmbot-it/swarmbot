import { describe, it, expect } from "vitest";
import { isRevoked, revokeJti } from "./blacklist.js";
import { createMockCouch } from "../couch.mock.js";

describe("revokeJti / isRevoked", () => {
	it("ignores undefined", async () => {
		const { db } = createMockCouch();
		await revokeJti(db, undefined);
		expect(await isRevoked(db, undefined)).toBe(false);
	});

	it("marks a jti revoked", async () => {
		const { db } = createMockCouch();
		const jti = `jti-${Math.random()}`;
		expect(await isRevoked(db, jti)).toBe(false);
		await revokeJti(db, jti);
		expect(await isRevoked(db, jti)).toBe(true);
	});

	it("returns false for unknown jtis", async () => {
		const { db } = createMockCouch();
		expect(await isRevoked(db, `unknown-${Math.random()}`)).toBe(false);
	});

	it("is scoped per jti and does not leak across instances", async () => {
		const a = createMockCouch();
		const b = createMockCouch();
		const jti = `jti-${Math.random()}`;
		await revokeJti(a.db, jti);
		expect(await isRevoked(a.db, jti)).toBe(true);
		expect(await isRevoked(b.db, jti)).toBe(false);
	});
});
