/**
 * Supported UI locales and HTTP `Accept-Language` tags.
 *
 * This is the single source of truth for the language selector too: the order
 * here IS the order shown in the dropdown (European locales A→Z by their native
 * name, then the CJK block), and `script` is what splits the two groups with a
 * divider. The topbar used to keep its own hand-written copy of this list, which
 * is how French ended up shipped-but-unselectable — derive, never duplicate.
 */
export const SUPPORTED_LANGUAGES = [
	{ code: "de", label: "Deutsch", httpLocale: "de-DE", script: "latin" },
	{ code: "en", label: "English", httpLocale: "en-US", script: "latin" },
	{ code: "es", label: "Español", httpLocale: "es-ES", script: "latin" },
	{ code: "fr", label: "Français", httpLocale: "fr-FR", script: "latin" },
	{ code: "it", label: "Italiano", httpLocale: "it-IT", script: "latin" },
	{ code: "pl", label: "Polski", httpLocale: "pl-PL", script: "latin" },
	{ code: "pt", label: "Português", httpLocale: "pt-PT", script: "latin" },
	{ code: "zh", label: "中文", httpLocale: "zh-CN", script: "cjk" },
	{ code: "ja", label: "日本語", httpLocale: "ja-JP", script: "cjk" },
	{ code: "ko", label: "한국어", httpLocale: "ko-KR", script: "cjk" },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANG_CODES: readonly LangCode[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/** Latin-script locales, in selector order. */
export const LATIN_LANGUAGES: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES.filter(
	(l) => l.script === "latin"
);

/** CJK locales, shown after a divider in the selector. */
export const CJK_LANGUAGES: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES.filter(
	(l) => l.script === "cjk"
);

export function isLangCode(value: string | null | undefined): value is LangCode {
	return LANG_CODES.includes(value as LangCode);
}

export function httpLocaleFor(code: LangCode): string {
	return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.httpLocale ?? "en-US";
}

/** Selector metadata for a code, falling back to English. */
export function languageFor(code: LangCode): SupportedLanguage {
	return (
		SUPPORTED_LANGUAGES.find((l) => l.code === code) ??
		SUPPORTED_LANGUAGES.find((l) => l.code === "en")!
	);
}
