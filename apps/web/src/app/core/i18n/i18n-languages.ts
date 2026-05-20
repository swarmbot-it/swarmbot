/** Supported UI locales and HTTP `Accept-Language` tags. */
export const SUPPORTED_LANGUAGES = [
	{ code: "pl", label: "Polski", httpLocale: "pl-PL" },
	{ code: "en", label: "English", httpLocale: "en-US" },
	{ code: "de", label: "Deutsch", httpLocale: "de-DE" },
	{ code: "fr", label: "Français", httpLocale: "fr-FR" },
	{ code: "es", label: "Español", httpLocale: "es-ES" },
	{ code: "it", label: "Italiano", httpLocale: "it-IT" },
	{ code: "zh", label: "中文", httpLocale: "zh-CN" },
	{ code: "ja", label: "日本語", httpLocale: "ja-JP" },
	{ code: "ko", label: "한국어", httpLocale: "ko-KR" },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANG_CODES: readonly LangCode[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export function isLangCode(value: string | null | undefined): value is LangCode {
	return LANG_CODES.includes(value as LangCode);
}

export function httpLocaleFor(code: LangCode): string {
	return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.httpLocale ?? "en-US";
}
