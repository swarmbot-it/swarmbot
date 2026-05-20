import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

/**
 * Route guard for authenticated `/app/*` routes.
 *
 * @returns `true` when a session token exists; otherwise a `UrlTree` to `/login`.
 */
export const authGuard: CanActivateFn = () => {
	const auth = inject(AuthService);
	if (auth.isAuthed()) {
		return true;
	}
	return inject(Router).parseUrl("/login");
};
