import { describe, expect, it } from "vitest";
import { parseAcceptLanguage } from "./locale.js";
import { t } from "./translate.js";

describe("parseAcceptLanguage", () => {
	it("prefers pl", () => {
		expect(parseAcceptLanguage("pl-PL,en;q=0.9")).toBe("pl");
	});
	it("falls back to en", () => {
		expect(parseAcceptLanguage("en-US")).toBe("en");
	});
	it("defaults to en when missing", () => {
		expect(parseAcceptLanguage(undefined)).toBe("en");
	});
});

describe("t", () => {
	it("returns polish message", () => {
		expect(t("pl", "errors.invalidCredentials")).toContain("nieprawidłowe");
	});
});
