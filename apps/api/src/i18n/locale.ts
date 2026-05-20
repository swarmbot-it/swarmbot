export type SupportedLocale = "pl" | "en";

const DEFAULT_LOCALE: SupportedLocale = "en";

/** Parse Accept-Language (e.g. pl-PL, en-US;q=0.9) into pl | en. */
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
		if (tag.startsWith("pl")) return "pl";
		if (tag.startsWith("en")) return "en";
	}
	return DEFAULT_LOCALE;
}
