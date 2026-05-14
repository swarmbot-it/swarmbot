import { GraphQLError } from "graphql";
import type { JwtClaims } from "../auth/jwt.js";
import type { GraphQLContext } from "./context.js";

export function requireUser(ctx: GraphQLContext): JwtClaims {
  if (!ctx.user) {
    throw new GraphQLError("Unauthorized", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

export function requireAdmin(ctx: GraphQLContext): JwtClaims {
  const user = requireUser(ctx);
  const role = user.usr.role ?? "user";
  if (role !== "admin") {
    throw new GraphQLError("Forbidden", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}
