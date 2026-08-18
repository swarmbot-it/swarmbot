import de from "./messages/de.json" with { type: "json" };
import en from "./messages/en.json" with { type: "json" };
import es from "./messages/es.json" with { type: "json" };
import fr from "./messages/fr.json" with { type: "json" };
import it from "./messages/it.json" with { type: "json" };
import ja from "./messages/ja.json" with { type: "json" };
import ko from "./messages/ko.json" with { type: "json" };
import pl from "./messages/pl.json" with { type: "json" };
import pt from "./messages/pt.json" with { type: "json" };
import zh from "./messages/zh.json" with { type: "json" };
import type { SupportedLocale } from "./locale.js";

export type MessageKey = keyof typeof en;

const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
	de: de as Record<string, string>,
	en: en as Record<string, string>,
	es: es as Record<string, string>,
	fr: fr as Record<string, string>,
	it: it as Record<string, string>,
	ja: ja as Record<string, string>,
	ko: ko as Record<string, string>,
	pl: pl as Record<string, string>,
	pt: pt as Record<string, string>,
	zh: zh as Record<string, string>,
};

export function t(
	locale: SupportedLocale,
	key: MessageKey,
	vars?: Record<string, string | number>
): string {
	const raw = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
	if (!vars) return raw;
	// `{n}`-style placeholders — locales put them in different positions
	// ("vor {n} Min." vs "{n} 分钟前"), so substitution must not assume order.
	return Object.entries(vars).reduce(
		(acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
		raw
	);
}
