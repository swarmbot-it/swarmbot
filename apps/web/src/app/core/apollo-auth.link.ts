import { HttpHeaders } from "@angular/common/http";
import { inject } from "@angular/core";
import { ApolloLink } from "@apollo/client/core";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { AuthService } from "./auth.service";
import { I18nStateService } from "./i18n/i18n-state.service";

const LOGIN_OPERATION = "Login";

/**
 * Apollo links that attach the session JWT and `Accept-Language`, and sign the user out
 * when the API returns `UNAUTHENTICATED` (e.g. expired token or API restart in mock mode).
 */
export function createApolloAuthLinks(): ApolloLink {
	const auth = inject(AuthService);
	const i18n = inject(I18nStateService);

	const authLink = setContext((_, { headers }) => {
		const token = auth.token();
		let h =
			headers instanceof HttpHeaders
				? headers
				: new HttpHeaders((headers as Record<string, string> | undefined) ?? {});
		h = h.set("Accept-Language", i18n.httpLocale());
		if (token) {
			h = h.set("Authorization", token);
		}
		return { headers: h };
	});

	const errorLink = onError(({ error, operation }) => {
		if (operation.operationName === LOGIN_OPERATION) {
			return;
		}
		if (!CombinedGraphQLErrors.is(error)) {
			return;
		}
		const unauthenticated = error.errors.some(
			(err) => err.extensions?.["code"] === "UNAUTHENTICATED"
		);
		if (!unauthenticated) {
			return;
		}
		auth.logout();
	});

	return ApolloLink.from([errorLink, authLink]);
}
