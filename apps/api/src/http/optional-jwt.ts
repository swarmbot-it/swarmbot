import type { Request, Response, NextFunction } from "express";
import { verifyJwt, type JwtClaims } from "../auth/jwt.js";
import { isRevoked } from "../auth/blacklist.js";
import * as couch from "../couch.js";
import type nano from "nano";

export type AuthedRequest = Request & { swarmUser?: JwtClaims };

/** Attach swarmUser when Authorization JWT is valid; never sends 401. */
export function optionalJwtMiddleware(couchDb: nano.DocumentScope<couch.CouchDoc>) {
	return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
		try {
			const auth = req.headers.authorization;
			if (!auth) {
				return next();
			}
			const secretDoc = await couch.getSecret(couchDb);
			const secret = String(secretDoc?.secret ?? "");
			if (!secret) {
				return next();
			}
			const claims = verifyJwt(secret, auth);
			if (claims.iss === "sw4rm.bot-api") {
				const u = await couch.userByUsername(couchDb, claims.usr.username);
				const apiToken = u?.["api-token"];
				const apiJti =
					apiToken && typeof apiToken === "object" && apiToken !== null
						? (apiToken as { jti?: string }).jti
						: undefined;
				if (apiJti !== claims.jti) {
					return next();
				}
			} else if (claims.iss === "sw4rm.bot") {
				if (isRevoked(claims.jti)) {
					return next();
				}
			}
			const u = await couch.userByUsername(couchDb, claims.usr.username);
			if (u) {
				req.swarmUser = claims;
			}
		} catch {
			/* invalid token — anonymous */
		}
		next();
	};
}
