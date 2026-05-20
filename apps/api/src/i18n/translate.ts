import en from "./messages/en.json" with { type: "json" };
import pl from "./messages/pl.json" with { type: "json" };
import type { SupportedLocale } from "./locale.js";

export type MessageKey = keyof typeof en;

const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
	en: en as Record<string, string>,
	pl: pl as Record<string, string>,
};

export function t(locale: SupportedLocale, key: MessageKey): string {
	return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}
