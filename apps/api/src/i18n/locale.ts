/**
 * Locales the API can answer in. Mirrors the web app's SUPPORTED_LANGUAGES —
 * add a locale here and a matching `messages/<code>.json` at the same time, or
 * `t()` silently falls back to English for that locale.
 */
export const SUPPORTED_LOCALES = [
	"de",
	"en",
	"es",
	"fr",
	"it",
	"pl",
	"pt",
	"zh",
	"ja",
	"ko",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: SupportedLocale = "en";

function isSupported(tag: string): tag is SupportedLocale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(tag);
}

/** Parse Accept-Language (e.g. `pl-PL`, `en-US;q=0.9`) into a supported locale. */
export function parseAcceptLanguage(header: string | string[] | undefined): SupportedLocale {
	if (!header) return DEFAULT_LOCALE;
	const raw = Array.isArray(header) ? header.join(",") : header;
	const parts = raw
		.split(",")
		.map((p) => {
			const [tag, qPart] = p.trim().split(";");
			const q = qPart?.startsWith("q=") ? Number.parseFloat(qPart.slice(2)) : 1;
			return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
		})
		.sort((a, b) => b.q - a.q);

	for (const { tag } of parts) {
		// Match the primary subtag, so `pt-BR` and `zh-Hans` resolve to `pt`/`zh`.
		const primary = tag.split("-")[0]!;
		if (isSupported(primary)) return primary;
	}
	return DEFAULT_LOCALE;
}
