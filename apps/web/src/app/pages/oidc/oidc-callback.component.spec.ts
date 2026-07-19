import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService } from "../../core/auth.service";
import { OidcCallbackComponent } from "./oidc-callback.component";

/**
 * The callback component runs entirely in its constructor: parse the URL
 * fragment (#token=…&to=…), store the token, scrub it from history, and land on
 * the console. These tests pin the token handling and the open-redirect guard
 * on `to` (a bogus "//host" must not become an off-site navigation).
 */
describe("OidcCallbackComponent", () => {
	let auth: { setToken: ReturnType<typeof vi.fn> };
	let router: { navigateByUrl: ReturnType<typeof vi.fn> };

	function create(hash: string) {
		window.location.hash = hash;
		return TestBed.createComponent(OidcCallbackComponent);
	}

	beforeEach(() => {
		auth = { setToken: vi.fn() };
		router = { navigateByUrl: vi.fn() };
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				{ provide: AuthService, useValue: auth },
				{ provide: Router, useValue: router },
			],
		});
		history.replaceState(null, "", "/app/oidc");
		window.location.hash = "";
	});

	it("stores the token from the fragment and navigates to `to`", () => {
		create("#token=abc.def&to=/services");
		expect(auth.setToken).toHaveBeenCalledWith("abc.def");
		expect(router.navigateByUrl).toHaveBeenCalledWith("/services");
	});

	it("scrubs the token from the URL", () => {
		create("#token=abc&to=/dashboard");
		expect(window.location.hash).toBe("");
		expect(window.location.pathname).toBe("/app/oidc");
	});

	it("defaults to /dashboard when `to` is missing", () => {
		create("#token=abc");
		expect(router.navigateByUrl).toHaveBeenCalledWith("/dashboard");
	});

	it("rejects an open-redirect `to` (//host) and falls back to /dashboard", () => {
		create("#token=abc&to=//evil.example/x");
		expect(router.navigateByUrl).toHaveBeenCalledWith("/dashboard");
	});

	it("goes to the login error page when no token is present", () => {
		create("#state=only");
		expect(auth.setToken).not.toHaveBeenCalled();
		expect(router.navigateByUrl).toHaveBeenCalledWith("/login?error=oidc");
	});
});
