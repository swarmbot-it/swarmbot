import { describe, it, expect } from "vitest";
import { consumeSlt, createSlt } from "./slt.js";

describe("createSlt / consumeSlt", () => {
	it("issues a token that can be consumed once", () => {
		const slt = createSlt("alice");
		expect(typeof slt).toBe("string");
		expect(slt.length).toBeGreaterThan(10);
		expect(consumeSlt(slt)).toBe("alice");
		expect(consumeSlt(slt)).toBeUndefined();
	});

	it("returns undefined for unknown tokens", () => {
		expect(consumeSlt(undefined)).toBeUndefined();
		expect(consumeSlt("not-a-token")).toBeUndefined();
	});

	it("issues distinct tokens", () => {
		const a = createSlt("u");
		const b = createSlt("u");
		expect(a).not.toBe(b);
	});
});
