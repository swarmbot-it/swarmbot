import { describe, it, expect } from "vitest";
import { isRevoked, revokeJti } from "./blacklist.js";

describe("revokeJti / isRevoked", () => {
	it("ignores undefined", () => {
		revokeJti(undefined);
		expect(isRevoked(undefined)).toBe(false);
	});

	it("marks a jti revoked", () => {
		const jti = `jti-${Math.random()}`;
		expect(isRevoked(jti)).toBe(false);
		revokeJti(jti);
		expect(isRevoked(jti)).toBe(true);
	});

	it("returns false for unknown jtis", () => {
		expect(isRevoked(`unknown-${Math.random()}`)).toBe(false);
	});
});
