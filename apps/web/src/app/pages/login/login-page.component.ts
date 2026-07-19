import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Apollo } from "apollo-angular";
import { NgIf } from "@angular/common";
import { form, FormField, required, minLength } from "@angular/forms/signals";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { AuthService, type Profile } from "../../core/auth.service";
import { LogoComponent } from "../../shared/logo.component";
import { MUTATION_LOGIN, QUERY_PROFILE_ME } from "../../core/graphql.queries";

/**
 * Standalone login screen. Authenticates via GraphQL and stores the JWT for the admin shell.
 */
@Component({
	selector: "sb-login-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="login-shell">
			<div class="login-card">
				<div class="login-card__brand">
					<sb-logo></sb-logo>
				</div>
				<h1 class="login-card__title">{{ "auth.login.title" | transloco }}</h1>
				<p class="login-card__subtitle">{{ "auth.login.subtitle" | transloco }}</p>
				<form (submit)="onSubmit($event)" *ngIf="!redirecting()">
					<div class="field">
						<label class="field__label">{{ "auth.login.username" | transloco }}</label>
						<input
							class="input"
							autocomplete="username"
							[formField]="loginForm.username"
						/>
					</div>
					<div class="field" style="margin-top: 12px;">
						<label class="field__label">{{ "auth.login.password" | transloco }}</label>
						<input
							class="input"
							type="password"
							autocomplete="current-password"
							[formField]="loginForm.password"
						/>
					</div>
					<button
						class="btn btn--primary"
						type="submit"
						style="margin-top: 18px; width: 100%; height: 42px; justify-content: center;"
						[disabled]="!loginForm().valid() || loading()"
					>
						{{
							(loading() ? "auth.login.submitting" : "auth.login.submit") | transloco
						}}
					</button>
					<div class="login-error" *ngIf="error()">{{ error() }}</div>
				</form>
				<button
					*ngIf="oidcEnabled() && !redirecting()"
					type="button"
					class="btn"
					style="margin-top: 12px; width: 100%; height: 42px; justify-content: center;"
					(click)="loginWithDex()"
				>
					Sign in with GitHub
				</button>
			</div>
		</div>
	`,
	styles: [
		`
			.login-shell {
				display: flex;
				align-items: center;
				justify-content: center;
				min-height: 100vh;
				background: var(--bg);
			}
			.login-card {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-xl);
				box-shadow: var(--shadow-3);
				width: 420px;
				padding: 28px;
			}
			.login-card__brand {
				margin-bottom: 18px;
			}
			.login-card__title {
				margin: 0;
				font-size: 22px;
				font-weight: 700;
				letter-spacing: -0.01em;
			}
			.login-card__subtitle {
				color: var(--muted);
				font-size: 13px;
				margin-top: 4px;
			}
			.login-error {
				margin-top: 14px;
				color: var(--danger);
				font-size: 12.5px;
			}
		`,
	],
	imports: [FormField, NgIf, LogoComponent, TranslocoPipe],
})
export class LoginPageComponent implements OnInit {
	private readonly apollo = inject(Apollo);
	private readonly auth = inject(AuthService);
	private readonly router = inject(Router);
	private readonly transloco = inject(TranslocoService);

	readonly loading = signal(false);
	readonly error = signal<string | null>(null);
	/** Hides the form until we know whether to auto-redirect to OIDC (console hosts). */
	readonly redirecting = signal(true);
	/** Whether the "Sign in with GitHub" (OIDC) button should be shown. */
	readonly oidcEnabled = signal(false);

	/**
	 * On a console host with OIDC enabled, go straight to the provider (Dex) —
	 * never show the password form (the user asked for auto-redirect). The
	 * `?password` query param is an escape hatch to the local password login.
	 */
	async ngOnInit(): Promise<void> {
		if (this.auth.isAuthed()) {
			void this.router.navigateByUrl("/app/dashboard");
			return;
		}
		const forcePassword = new URLSearchParams(window.location.search).has("password");
		try {
			const cfg = (await (await fetch("/api/auth/config")).json()) as {
				oidc?: boolean;
				autoLogin?: boolean;
			};
			this.oidcEnabled.set(Boolean(cfg.oidc));
			if (cfg.autoLogin && !forcePassword) {
				window.location.href = "/api/auth/oidc/login";
				return;
			}
		} catch {
			/* config unavailable — fall back to the password form */
		}
		this.redirecting.set(false);
	}

	private readonly loginModel = signal({ username: "", password: "" });
	readonly loginForm = form(this.loginModel, (f) => {
		required(f.username);
		minLength(f.username, 3);
		required(f.password);
		minLength(f.password, 4);
	});

	/** Full-page redirect into the app-native OIDC (Dex) login. */
	loginWithDex(): void {
		window.location.href = "/api/auth/oidc/login";
	}

	/**
	 * Submits credentials to the login mutation and navigates to the dashboard on success.
	 *
	 * @param event - Form submit event (prevented to avoid a full page reload).
	 */
	onSubmit(event: Event): void {
		event.preventDefault();
		if (!this.loginForm().valid()) return;
		const { username, password } = this.loginModel();
		this.loading.set(true);
		this.error.set(null);
		this.apollo
			.mutate<{ login: { token: string } }>({
				mutation: MUTATION_LOGIN,
				variables: { username, password },
			})
			.subscribe({
				next: (res) => {
					const token = res.data?.login.token;
					if (!token) {
						this.loading.set(false);
						return;
					}
					this.auth.setToken(token);
					this.auth.setProfile({ username, name: username });
					// Fetch the full profile (role included) so role-gated UI is correct from the first
					// screen — a plain { username } profile would otherwise hide editor/admin actions.
					this.apollo
						.query<{ me: Profile | null }>({ query: QUERY_PROFILE_ME, fetchPolicy: "network-only" })
						.subscribe({
							next: (profileRes) => {
								if (profileRes.data?.me) this.auth.setProfile(profileRes.data.me);
								void this.router.navigateByUrl("/app/dashboard");
							},
							error: () => void this.router.navigateByUrl("/app/dashboard"),
						});
				},
				error: () => {
					this.error.set(this.transloco.translate("auth.login.failed"));
					this.loading.set(false);
				},
				complete: () => {
					this.loading.set(false);
				},
			});
	}
}
