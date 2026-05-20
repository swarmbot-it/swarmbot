import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { derivePassword, isSha256Digest, verifyPassword } from "./password.js";

describe("derivePassword + verifyPassword", () => {
	it("round-trips a pbkdf2 hash", () => {
		const stored = derivePassword("hunter2");
		expect(stored.startsWith("pbkdf2+sha512$")).toBe(true);
		expect(verifyPassword("hunter2", stored)).toBe(true);
		expect(verifyPassword("wrong", stored)).toBe(false);
	});

	it("returns false for empty inputs", () => {
		expect(verifyPassword("", "abc")).toBe(false);
		expect(verifyPassword("abc", "")).toBe(false);
	});
});

describe("legacy sha256", () => {
	const plain = "letmein";
	const sha = createHash("sha256").update(plain, "utf8").digest("hex");

	it("verifies legacy sha256 digest as stored password", () => {
		expect(verifyPassword(plain, sha)).toBe(true);
	});

	it("detects sha256 digest format via isSha256Digest", () => {
		expect(isSha256Digest(plain, sha)).toBe(true);
		expect(isSha256Digest(plain, derivePassword(plain))).toBe(false);
	});
});
