import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "../../core/auth.service";

/**
 * Receives the session token from the API's OIDC callback via the URL fragment
 * (`#token=…&to=…`), stores it, scrubs it from history, and lands on the console.
 * Registered as an UNGUARDED route (`app/oidc`) so it can set the token before
 * the authGuard on the rest of `/app` runs.
 */
@Component({
	selector: "sb-oidc-callback",
	standalone: true,
	template: `<p style="padding: 2rem; color: var(--muted);">Signing you in…</p>`,
})
export class OidcCallbackComponent {
	private readonly auth = inject(AuthService);
	private readonly router = inject(Router);

	constructor() {
		const raw = window.location.hash.startsWith("#")
			? window.location.hash.slice(1)
			: window.location.hash;
		const params = new URLSearchParams(raw);
		const token = params.get("token");
		const to = params.get("to") ?? "/app/dashboard";
		// Drop the token from the URL/history immediately.
		history.replaceState(null, "", "/app/oidc");
		if (token) {
			this.auth.setToken(token);
			void this.router.navigateByUrl(to.startsWith("/app") ? to : "/app/dashboard");
		} else {
			void this.router.navigateByUrl("/login?error=oidc");
		}
	}
}
