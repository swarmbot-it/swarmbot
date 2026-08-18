import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, parseAcceptLanguage } from "./locale.js";
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
	it("matches on the primary subtag for region/script variants", () => {
		expect(parseAcceptLanguage("pt-BR")).toBe("pt");
		expect(parseAcceptLanguage("zh-Hans-CN")).toBe("zh");
	});
	it("falls back to en for a locale we do not ship", () => {
		expect(parseAcceptLanguage("sv-SE")).toBe("en");
	});
});

describe("t", () => {
	it("returns polish message", () => {
		expect(t("pl", "errors.invalidCredentials")).toContain("nieprawidłowe");
	});

	it("has every message in every shipped locale", () => {
		for (const locale of SUPPORTED_LOCALES) {
			const value = t(locale, "errors.forbidden");
			expect(value, `errors.forbidden missing for ${locale}`).toBeTruthy();
			// A locale silently falling through to English would be indistinguishable
			// from a real translation, so pin the non-English ones as different.
			if (locale !== "en") expect(value).not.toBe(t("en", "errors.forbidden"));
		}
	});

	it("interpolates {n} wherever the locale places it", () => {
		expect(t("en", "chart.minutesAgo", { n: 42 })).toBe("42m ago");
		// German puts the number after the preposition, Japanese before the suffix —
		// substitution must not assume the placeholder is trailing.
		expect(t("de", "chart.minutesAgo", { n: 42 })).toContain("42");
		expect(t("ja", "chart.minutesAgo", { n: 42 })).toContain("42");
		expect(t("de", "chart.minutesAgo", { n: 42 })).not.toContain("{n}");
		expect(t("ja", "chart.minutesAgo", { n: 42 })).not.toContain("{n}");
	});

	it("leaves the raw string alone when no vars are passed", () => {
		expect(t("en", "chart.minutesAgo")).toBe("{n}m ago");
	});
});
