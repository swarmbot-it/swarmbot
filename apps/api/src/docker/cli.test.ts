import { describe, it, expect } from "vitest";
import { validateStackName } from "./cli.js";

describe("validateStackName", () => {
	it("accepts safe names", () => {
		expect(() => validateStackName("web")).not.toThrow();
		expect(() => validateStackName("web-1.svc_test")).not.toThrow();
	});

	it("rejects unsafe names", () => {
		expect(() => validateStackName("")).toThrow();
		expect(() => validateStackName("../etc")).toThrow();
		expect(() => validateStackName("with space")).toThrow();
		expect(() => validateStackName("name;rm -rf /")).toThrow();
		expect(() => validateStackName("-leading-dash")).toThrow();
	});
});
