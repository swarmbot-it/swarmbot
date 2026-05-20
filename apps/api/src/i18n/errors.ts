import { GraphQLError } from "graphql";
import type { SupportedLocale } from "./locale.js";
import { t, type MessageKey } from "./translate.js";

export function localizedError(
	locale: SupportedLocale,
	key: MessageKey,
	code: string
): GraphQLError {
	return new GraphQLError(t(locale, key), {
		extensions: { code },
	});
}

export function localizedMessage(locale: SupportedLocale, key: MessageKey): string {
	return t(locale, key);
}
