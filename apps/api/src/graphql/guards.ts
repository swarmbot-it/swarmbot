import type { JwtClaims } from "../auth/jwt.js";
import type { GraphQLContext } from "./context.js";
import { localizedError } from "../i18n/errors.js";

export function requireUser(ctx: GraphQLContext): JwtClaims {
	if (!ctx.user) {
		throw localizedError(ctx.locale, "errors.unauthenticated", "UNAUTHENTICATED");
	}
	return ctx.user;
}

/**
 * Roles are stored inconsistently across the app: the bootstrap admin account
 * uses lowercase "admin", while the "Add user" form writes capitalized
 * display labels ("Administrator" / "Editor" / "Read-only"). Normalize
 * before comparing so both sources are recognized.
 */
function normalizedRole(role: string | undefined): string {
	return (role ?? "").toLowerCase();
}

export function requireAdmin(ctx: GraphQLContext): JwtClaims {
	const user = requireUser(ctx);
	const role = normalizedRole(user.usr.role);
	if (role !== "admin" && role !== "administrator") {
		throw localizedError(ctx.locale, "errors.forbidden", "FORBIDDEN");
	}
	return user;
}

/** Editors may deploy/manage stacks & services; only admins manage users, secrets, and other infrastructure. */
export function requireEditor(ctx: GraphQLContext): JwtClaims {
	const user = requireUser(ctx);
	const role = normalizedRole(user.usr.role);
	if (role !== "admin" && role !== "administrator" && role !== "editor") {
		throw localizedError(ctx.locale, "errors.forbidden", "FORBIDDEN");
	}
	return user;
}
