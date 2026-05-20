import { describe, it, expect } from "vitest";
import { localizedError, localizedMessage } from "./errors.js";

describe("localizedMessage", () => {
	it("returns Polish copy", () => {
		expect(localizedMessage("pl", "errors.unauthenticated")).toBe("Brak autoryzacji");
	});
	it("returns English copy", () => {
		expect(localizedMessage("en", "errors.unauthenticated")).toBe("Unauthorized");
	});
});

describe("localizedError", () => {
	it("sets GraphQL extension code", () => {
		const err = localizedError("en", "errors.forbidden", "FORBIDDEN");
		expect(err.extensions?.code).toBe("FORBIDDEN");
		expect(err.message).toMatch(/forbidden/i);
	});
});
