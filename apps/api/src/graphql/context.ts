import type { AuthedRequest } from "../http/optional-jwt.js";
import type { JwtClaims } from "../auth/jwt.js";
import type { SwarmbotyConfig } from "../config.js";
import type Dockerode from "dockerode";
import type nano from "nano";
import type { CouchDoc } from "../couch.js";
import { parseAcceptLanguage, type SupportedLocale } from "../i18n/locale.js";

export type GraphQLContext = {
	cfg: SwarmbotyConfig;
	couchDb: nano.DocumentScope<CouchDoc>;
	docker: Dockerode;
	user: JwtClaims | undefined;
	locale: SupportedLocale;
	ip: string;
};

export function buildContext(
	req: AuthedRequest,
	cfg: SwarmbotyConfig,
	couchDb: nano.DocumentScope<CouchDoc>,
	docker: Dockerode
): GraphQLContext {
	return {
		cfg,
		couchDb,
		docker,
		user: req.swarmUser,
		locale: parseAcceptLanguage(req.headers["accept-language"]),
		ip: req.ip ?? "unknown",
	};
}

export function localeFromHeader(header: string | string[] | undefined): SupportedLocale {
	return parseAcceptLanguage(header);
}
