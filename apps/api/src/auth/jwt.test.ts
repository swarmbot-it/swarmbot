import { describe, it, expect } from "vitest";
import { decodeBasic, generateJwt, tokenValue, verifyJwt } from "./jwt.js";
import type { CouchDoc } from "../couch.js";

const SECRET = "test-secret";

const user: CouchDoc = {
	type: "user",
	username: "alice",
	email: "alice@example.com",
	role: "admin",
	password: "x",
};

describe("tokenValue", () => {
	it("strips Bearer prefix", () => {
		expect(tokenValue("Bearer abc.def.ghi")).toBe("abc.def.ghi");
	});
	it("returns trimmed token when no prefix", () => {
		expect(tokenValue("  raw.token  ")).toBe("raw.token");
	});
	it("handles undefined", () => {
		expect(tokenValue(undefined)).toBe("");
	});
});

describe("generateJwt / verifyJwt", () => {
	it("round-trips claims", () => {
		const token = generateJwt(SECRET, user);
		expect(token.startsWith("Bearer ")).toBe(true);
		const claims = verifyJwt(SECRET, token);
		expect(claims.iss).toBe("swarmbot");
		expect(claims.usr.username).toBe("alice");
		expect(claims.usr.role).toBe("admin");
		expect(claims.jti).toBeTruthy();
	});

	it("rejects bad signature", () => {
		const token = generateJwt(SECRET, user);
		expect(() => verifyJwt("other", token)).toThrow();
	});

	it("respects custom iss/jti/exp", () => {
		const token = generateJwt(SECRET, user, {
			iss: "swarmbot-api",
			jti: "fixed-jti",
			exp: null,
		});
		const claims = verifyJwt(SECRET, token);
		expect(claims.iss).toBe("swarmbot-api");
		expect(claims.jti).toBe("fixed-jti");
		expect(claims.exp).toBeUndefined();
	});
});

describe("decodeBasic", () => {
	it("decodes a Basic header", () => {
		const b64 = Buffer.from("alice:secret", "utf8").toString("base64");
		expect(decodeBasic(`Basic ${b64}`)).toEqual({
			username: "alice",
			password: "secret",
		});
	});
	it("throws on non-Basic headers", () => {
		expect(() => decodeBasic("Bearer x")).toThrow();
		expect(() => decodeBasic(undefined)).toThrow();
	});
	it("throws when payload has no colon", () => {
		const b64 = Buffer.from("noColonHere", "utf8").toString("base64");
		expect(() => decodeBasic(`Basic ${b64}`)).toThrow();
	});
});
