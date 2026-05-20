import type { JwtClaims } from "../auth/jwt.js";
import type { GraphQLContext } from "./context.js";
import { localizedError } from "../i18n/errors.js";

export function requireUser(ctx: GraphQLContext): JwtClaims {
	if (!ctx.user) {
		throw localizedError(ctx.locale, "errors.unauthenticated", "UNAUTHENTICATED");
	}
	return ctx.user;
}

export function requireAdmin(ctx: GraphQLContext): JwtClaims {
	const user = requireUser(ctx);
	const role = user.usr.role ?? "user";
	if (role !== "admin") {
		throw localizedError(ctx.locale, "errors.forbidden", "FORBIDDEN");
	}
	return user;
}
