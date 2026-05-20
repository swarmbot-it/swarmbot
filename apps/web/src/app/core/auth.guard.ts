import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

const TOKEN_KEY = "swarmboty.token";

/**
 * Route guard for authenticated `/app/*` routes.
 * Reads `swarmboty.token` from `localStorage` directly so redirects stay correct
 * when storage is cleared outside Angular (e.g. Playwright fixtures).
 *
 * @returns `true` when a token exists; otherwise a `UrlTree` to `/login`.
 */
export const authGuard: CanActivateFn = () => {
	if (typeof localStorage !== "undefined" && localStorage.getItem(TOKEN_KEY)) {
		return true;
	}
	return inject(Router).parseUrl("/login");
};
