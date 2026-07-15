import type { AuthedRequest } from "../http/optional-jwt.js";
import type { JwtClaims } from "../auth/jwt.js";
import type { SwarmbotyConfig } from "../config.js";
import type Dockerode from "dockerode";
import type { Kysely } from "kysely";
import type { Database } from "../db.js";
import { parseAcceptLanguage, type SupportedLocale } from "../i18n/locale.js";

export type GraphQLContext = {
	cfg: SwarmbotyConfig;
	db: Kysely<Database>;
	docker: Dockerode;
	user: JwtClaims | undefined;
	locale: SupportedLocale;
	ip: string;
};

export function buildContext(
	req: AuthedRequest,
	cfg: SwarmbotyConfig,
	db: Kysely<Database>,
	docker: Dockerode
): GraphQLContext {
	return {
		cfg,
		db,
		docker,
		user: req.swarmUser,
		locale: parseAcceptLanguage(req.headers["accept-language"]),
		ip: req.ip ?? "unknown",
	};
}

export function localeFromHeader(header: string | string[] | undefined): SupportedLocale {
	return parseAcceptLanguage(header);
}
