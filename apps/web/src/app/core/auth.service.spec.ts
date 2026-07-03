import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
	let router: { navigateByUrl: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		localStorage.clear();
		router = { navigateByUrl: vi.fn() };
		TestBed.configureTestingModule({
			providers: [AuthService, { provide: Router, useValue: router }],
		});
	});

	it("is not authed with an empty localStorage", () => {
		const auth = TestBed.inject(AuthService);
		expect(auth.isAuthed()).toBe(false);
		expect(auth.token()).toBeNull();
	});

	it("setToken persists a Bearer-prefixed token and flips isAuthed", () => {
		const auth = TestBed.inject(AuthService);
		auth.setToken("abc.def.ghi");
		expect(auth.token()).toBe("Bearer abc.def.ghi");
		expect(auth.isAuthed()).toBe(true);
	});

	it("setToken does not double-prefix an already-Bearer token", () => {
		const auth = TestBed.inject(AuthService);
		auth.setToken("Bearer abc.def.ghi");
		expect(auth.token()).toBe("Bearer abc.def.ghi");
	});

	it("logout clears the session and navigates to /login", () => {
		const auth = TestBed.inject(AuthService);
		auth.setToken("abc");
		auth.setProfile({ username: "alice", role: "Editor" });
		auth.logout();
		expect(auth.isAuthed()).toBe(false);
		expect(auth.profile()).toBeNull();
		expect(router.navigateByUrl).toHaveBeenCalledWith("/login");
	});

	it.each([
		["admin", true, true],
		["Administrator", true, true],
		["Editor", false, true],
		["Read-only", false, false],
		[undefined, false, false],
	])("role %s -> isAdmin=%s, isEditor=%s", (role, isAdmin, isEditor) => {
		const auth = TestBed.inject(AuthService);
		auth.setProfile({ username: "u", role });
		expect(auth.isAdmin()).toBe(isAdmin);
		expect(auth.isEditor()).toBe(isEditor);
	});

	it("restores a previously persisted profile on construction", () => {
		localStorage.setItem("swarmboty.profile", JSON.stringify({ username: "bob", role: "admin" }));
		const auth = TestBed.inject(AuthService);
		expect(auth.profile()?.username).toBe("bob");
		expect(auth.isAdmin()).toBe(true);
	});
});
