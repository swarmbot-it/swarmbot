import { describe, expect, it } from "vitest";
import {
	ComposeValidationError,
	countComposeResources,
	validateComposeYaml,
} from "./compose-validate.js";

describe("validateComposeYaml", () => {
	it("accepts a minimal valid compose file", () => {
		const doc = validateComposeYaml(`
version: "3.9"
services:
  web:
    image: nginx:alpine
    deploy:
      replicas: 1
`);
		expect(countComposeResources(doc).services).toBe(1);
	});

	it("rejects empty input", () => {
		expect(() => validateComposeYaml("   ")).toThrow(ComposeValidationError);
	});

	it("rejects invalid YAML", () => {
		expect(() => validateComposeYaml("services: [\n  bad")).toThrow(
			ComposeValidationError
		);
	});

	it("rejects missing services", () => {
		expect(() => validateComposeYaml("version: '3.9'\nnetworks: {}")).toThrow(
			ComposeValidationError
		);
	});
});
