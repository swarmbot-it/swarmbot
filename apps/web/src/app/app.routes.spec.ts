import { describe, it, expect } from "vitest";
import type { Route } from "@angular/router";
import { routes } from "./app.routes";
import { authGuard } from "./core/auth.guard";

/**
 * Structural guard-rails for the router config. The app is served with
 * base-href "/app/", so router paths are single-segment ("dashboard", "oidc")
 * and the shell lives at the empty path. Two past regressions are pinned here:
 *   - the OIDC callback was "app/oidc" (only reachable at /app/app/oidc) -> loop;
 *   - the shell was "app" (pushing the console to /app/app/*).
 */
describe("app routes", () => {
	const byPath = (p: string): Route | undefined => routes.find((r) => r.path === p);
	const guards = (r?: Route): unknown[] => (r?.canActivate ?? []) as unknown[];

	it("serves the OIDC callback at 'oidc' (matches /app/oidc under base-href), unguarded", () => {
		expect(byPath("oidc")).toBeDefined();
		expect(guards(byPath("oidc"))).not.toContain(authGuard);
		// Regression: "app/oidc" would live at /app/app/oidc and never match the redirect.
		expect(byPath("app/oidc")).toBeUndefined();
	});

	it("keeps the login page public", () => {
		expect(byPath("login")).toBeDefined();
		expect(guards(byPath("login"))).not.toContain(authGuard);
	});

	it("mounts the guarded shell at the empty path with the app pages as children", () => {
		const shell = byPath("");
		expect(shell).toBeDefined();
		expect(shell!.component).toBeDefined();
		expect(guards(shell)).toContain(authGuard);
		const childPaths = (shell!.children ?? []).map((c) => c.path);
		expect(childPaths).toContain("dashboard");
		expect(childPaths).toContain("services");
		// Regression: no doubled "app" segment for the shell.
		expect(byPath("app")).toBeUndefined();
	});

	it("redirects unknown paths to the dashboard", () => {
		expect(routes.find((r) => r.path === "**")?.redirectTo).toBe("dashboard");
	});
});
