import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Apollo } from "apollo-angular";
import { NgIf } from "@angular/common";
import { form, FormField, required, minLength } from "@angular/forms/signals";
import { TranslocoPipe } from "@jsverse/transloco";
import { AuthService } from "../../core/auth.service";
import { LogoComponent } from "../../shared/logo.component";
import { MUTATION_LOGIN } from "../../core/graphql.queries";

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
				<form (submit)="onSubmit($event)">
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
export class LoginPageComponent {
	private readonly apollo = inject(Apollo);
	private readonly auth = inject(AuthService);
	private readonly router = inject(Router);

	readonly loading = signal(false);
	readonly error = signal<string | null>(null);

	private readonly loginModel = signal({ username: "", password: "" });
	readonly loginForm = form(this.loginModel, (f) => {
		required(f.username);
		minLength(f.username, 3);
		required(f.password);
		minLength(f.password, 4);
	});

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
					void this.router.navigateByUrl("/app/dashboard");
				},
				error: (err) => {
					const msg = err?.graphQLErrors?.[0]?.message ?? err?.message ?? null;
					this.error.set(msg);
					this.loading.set(false);
				},
				complete: () => {
					this.loading.set(false);
				},
			});
	}
}
