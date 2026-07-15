import type { Request, Response, NextFunction } from "express";
import type { Kysely } from "kysely";
import { verifyJwt, type JwtClaims } from "../auth/jwt.js";
import { isRevoked } from "../auth/blacklist.js";
import { findAuthUser } from "../store/users.js";
import { getAppSecret, type Database } from "../db.js";

export type AuthedRequest = Request & { swarmUser?: JwtClaims };

/** Attach swarmUser when Authorization JWT is valid; never sends 401. */
export function optionalJwtMiddleware(db: Kysely<Database>) {
	return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
		try {
			const auth = req.headers.authorization;
			if (!auth) {
				return next();
			}
			const secret = await getAppSecret(db);
			const claims = verifyJwt(secret, auth);
			if (claims.iss === "swarmboty-api") {
				const u = await findAuthUser(db, claims.usr.username);
				if (u?.apiTokenJti !== claims.jti) {
					return next();
				}
			} else if (claims.iss === "swarmboty") {
				if (await isRevoked(db, claims.jti)) {
					return next();
				}
			}
			const u = await findAuthUser(db, claims.usr.username);
			if (u) {
				req.swarmUser = claims;
			}
		} catch {
			/* invalid token — anonymous */
		}
		next();
	};
}
