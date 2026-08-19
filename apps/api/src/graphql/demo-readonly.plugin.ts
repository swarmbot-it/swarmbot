import type { ApolloServerPlugin } from "@apollo/server";
import { GraphQLError } from "graphql";
import type { GraphQLContext } from "./context.js";
import { t } from "../i18n/translate.js";

/**
 * Mutations a read-only demo still has to allow, or nobody can get in or out.
 * Everything else is rejected before any resolver runs.
 */
const ALLOWED = new Set(["login", "logout"]);

/**
 * Blocks writes when the instance runs as a public demo (`SWARMBOT_DEMO=true`).
 *
 * This deliberately sits at the operation level rather than in `guards.ts`:
 * mutations are guarded there by three different helpers (`requireAdmin`,
 * `requireEditor`, and plain `requireUser` for profile/API-token changes), so a
 * role-based check would have to be added in every resolver and would silently
 * miss any new one. `didResolveOperation` sees every mutation exactly once.
 *
 * Note this is not the same thing as mock mode: `SWARMBOT_MOCK` fabricates data
 * and lets mutations report success against it, which is fine for local
 * development but would let a visitor "delete" a cluster on a public demo.
 */
export function demoReadOnlyPlugin(): ApolloServerPlugin<GraphQLContext> {
	return {
		async requestDidStart() {
			return {
				async didResolveOperation({ operation, contextValue }) {
					if (!contextValue.cfg.demo) return;
					// `operation` is optional in the hook's type; without one there is
					// nothing to classify, and execution will fail on its own anyway.
					if (!operation || String(operation.operation) !== "mutation") return;

					const fields = operation.selectionSet.selections
						.filter((s) => s.kind === "Field")
						.map((s) => (s as { name: { value: string } }).name.value);
					if (fields.length > 0 && fields.every((f) => ALLOWED.has(f))) return;

					// `http.status` matters: without it Apollo reports a refusal as 500,
					// which is both wrong (the server is fine) and noisy — every visitor
					// clicking a disabled action would log a server error.
					throw new GraphQLError(t(contextValue.locale, "errors.demoReadOnly"), {
						extensions: { code: "FORBIDDEN", http: { status: 403 } },
					});
				},
			};
		},
	};
}
