import { TestBed } from "@angular/core/testing";
import { Router, UrlTree } from "@angular/router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { authGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

describe("authGuard", () => {
	let authService: { isAuthed: ReturnType<typeof vi.fn> };
	let router: { parseUrl: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		authService = { isAuthed: vi.fn() };
		router = { parseUrl: vi.fn().mockReturnValue("URL_TREE" as unknown as UrlTree) };
		TestBed.configureTestingModule({
			providers: [
				{ provide: AuthService, useValue: authService },
				{ provide: Router, useValue: router },
			],
		});
	});

	it("allows navigation when a session token exists", () => {
		authService.isAuthed.mockReturnValue(true);
		const result = TestBed.runInInjectionContext(() =>
			authGuard(null as never, null as never)
		);
		expect(result).toBe(true);
		expect(router.parseUrl).not.toHaveBeenCalled();
	});

	it("redirects to /login when there is no session", () => {
		authService.isAuthed.mockReturnValue(false);
		const result = TestBed.runInInjectionContext(() =>
			authGuard(null as never, null as never)
		);
		expect(router.parseUrl).toHaveBeenCalledWith("/login");
		expect(result).toBe("URL_TREE");
	});
});
