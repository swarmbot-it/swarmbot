import { Injectable, signal } from "@angular/core";
import { Router } from "@angular/router";

const TOKEN_KEY = "swarmboty.token";
const PROFILE_KEY = "swarmboty.profile";

/** Cached user profile shown in the top bar. */
export type Profile = {
	username: string;
	name?: string;
	email?: string;
	role?: string;
};

/**
 * Client-side session state backed by `localStorage`.
 * Stores the GraphQL JWT and a minimal profile for the top bar on first paint.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
	private readonly _authed = signal<boolean>(Boolean(localStorage.getItem(TOKEN_KEY)));
	private readonly _profile = signal<Profile | null>(this.readProfile());

	/** Read-only profile signal for templates. */
	readonly profile = this._profile.asReadonly();

	constructor(private readonly router: Router) {}

	/**
	 * Whether the user is considered signed in.
	 * Re-reads `localStorage` on every call so guards stay in sync after external clears.
	 */
	isAuthed(): boolean {
		const stored = Boolean(localStorage.getItem(TOKEN_KEY));
		this._authed.set(stored);
		return stored;
	}

	/** JWT from `swarmboty.token`, or `null` when logged out. */
	token(): string | null {
		return localStorage.getItem(TOKEN_KEY);
	}

	/**
	 * Persists the API token after a successful `login` mutation.
	 * @param token - Value sent as the `Authorization` header on GraphQL requests.
	 */
	setToken(token: string): void {
		localStorage.setItem(TOKEN_KEY, token);
		this._authed.set(true);
	}

	/** Updates the cached profile and persists it to `swarmboty.profile`. */
	setProfile(profile: Profile): void {
		this._profile.set(profile);
		try {
			localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
		} catch {
			/* ignore */
		}
	}

	/** Clears session storage and navigates to `/login`. */
	logout(): void {
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(PROFILE_KEY);
		this._authed.set(false);
		this._profile.set(null);
		void this.router.navigateByUrl("/login");
	}

	private readProfile(): Profile | null {
		try {
			const raw = localStorage.getItem(PROFILE_KEY);
			return raw ? (JSON.parse(raw) as Profile) : null;
		} catch {
			return null;
		}
	}
}
