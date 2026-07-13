import type { AuthedRequest } from "../http/optional-jwt.js";
import type { JwtClaims } from "../auth/jwt.js";
import type { SwarmBotConfig } from "../config.js";
import type nano from "nano";
import type { CouchDoc } from "../couch.js";
import type { Orchestrator } from "../orchestrator/types.js";
import { parseAcceptLanguage, type SupportedLocale } from "../i18n/locale.js";

export type GraphQLContext = {
	cfg: SwarmBotConfig;
	couchDb: nano.DocumentScope<CouchDoc>;
	orchestrator: Orchestrator;
	user: JwtClaims | undefined;
	locale: SupportedLocale;
};

export function buildContext(
	req: AuthedRequest,
	cfg: SwarmBotConfig,
	couchDb: nano.DocumentScope<CouchDoc>,
	orchestrator: Orchestrator
): GraphQLContext {
	return {
		cfg,
		couchDb,
		orchestrator,
		user: req.swarmUser,
		locale: parseAcceptLanguage(req.headers["accept-language"]),
	};
}

export function localeFromHeader(header: string | string[] | undefined): SupportedLocale {
	return parseAcceptLanguage(header);
}
