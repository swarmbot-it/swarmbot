import type { AuthedRequest } from "../http/optional-jwt.js";
import type { JwtClaims } from "../auth/jwt.js";
import type { SwarmbotConfig } from "../config.js";
import type Dockerode from "dockerode";
import type { Kysely } from "kysely";
import type { Database } from "../db.js";
import type { Orchestrator } from "../orchestrator/types.js";
import { parseAcceptLanguage, type SupportedLocale } from "../i18n/locale.js";

export type GraphQLContext = {
	cfg: SwarmbotConfig;
	db: Kysely<Database>;
	/** Active backend (Swarm or Kubernetes) — all resource reads go through it. */
	orchestrator: Orchestrator;
	/** Raw Dockerode handle — Swarm-only mutations; guarded by orchestrator.kind checks. */
	docker: Dockerode;
	user: JwtClaims | undefined;
	locale: SupportedLocale;
	ip: string;
};

export function buildContext(
	req: AuthedRequest,
	cfg: SwarmbotConfig,
	db: Kysely<Database>,
	orchestrator: Orchestrator,
	docker: Dockerode
): GraphQLContext {
	return {
		cfg,
		db,
		orchestrator,
		docker,
		user: req.swarmUser,
		locale: parseAcceptLanguage(req.headers["accept-language"]),
		ip: req.ip ?? "unknown",
	};
}

export function localeFromHeader(header: string | string[] | undefined): SupportedLocale {
	return parseAcceptLanguage(header);
}
