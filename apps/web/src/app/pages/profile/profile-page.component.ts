import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	signal,
} from "@angular/core";
import { NgClass, NgFor, NgIf } from "@angular/common";
import { IconComponent } from "../../shared/icon.component";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { AuthService } from "../../core/auth.service";
import { ToastService } from "../../core/toast.service";
import { ModalComponent } from "../../shared/modal.component";
import {
	MUTATION_CHANGE_PASSWORD,
	MUTATION_UPDATE_PROFILE,
	QUERY_PROFILE_ME,
} from "../../core/graphql.queries";

interface MeUser {
	username: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	role: string;
	created: string | null;
	lastLogin: string | null;
}

@Component({
	selector: "sb-profile-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgIf, NgFor, NgClass, IconComponent, ModalComponent, TranslocoPipe],
	template: `
		<div class="profile-page">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "profile.title" | transloco }}</h1>
					<p class="page-header__subtitle">{{ "profile.subtitle" | transloco }}</p>
				</div>
			</div>

			<div class="profile__loading" *ngIf="loading()">
				<span class="profile__loading-dot"></span>
			</div>

			<div class="profile__grid" *ngIf="!loading()">
				<!-- Identity card -->
				<div class="card profile__identity">
					<div class="profile__avatar">{{ initials() }}</div>
					<div class="profile__name">{{ meUser()?.name || meUser()?.username }}</div>
					<div class="profile__email">{{ meUser()?.email || "—" }}</div>
					<div class="tag profile__role-tag" [ngClass]="roleTagClass()">
						{{ meUser()?.role || "user" }}
					</div>
					<div class="profile__divider"></div>
					<div class="profile__stats">
						<div class="profile__stat">
							<span class="profile__stat-label">{{
								"profile.accountCreated" | transloco
							}}</span>
							<span class="profile__stat-value">{{
								formatDate(meUser()?.created)
							}}</span>
						</div>
						<div class="profile__stat">
							<span class="profile__stat-label">{{
								"profile.lastLogin" | transloco
							}}</span>
							<span class="profile__stat-value">{{
								formatRelative(meUser()?.lastLogin)
							}}</span>
						</div>
						<div class="profile__stat">
							<span class="profile__stat-label">{{
								"profile.username" | transloco
							}}</span>
							<span class="profile__stat-value profile__stat-value--mono">{{
								meUser()?.username
							}}</span>
						</div>
					</div>
				</div>

				<!-- Account details form -->
				<div class="card profile__details">
					<div class="card__header">
						<div>
							<div class="card__title">
								{{ "profile.accountDetails" | transloco }}
							</div>
							<div class="card__subtitle">
								{{ "profile.accountDetailsHint" | transloco }}
							</div>
						</div>
					</div>

					<div class="card__body profile__form-body">
						<!-- Username (read-only) -->
						<div class="field">
							<label class="field__label">{{
								"profile.username" | transloco
							}}</label>
							<input
								class="input input--mono"
								[value]="meUser()?.username"
								readonly
							/>
							<span class="field__hint">{{
								"profile.usernameHint" | transloco
							}}</span>
						</div>

						<!-- Password -->
						<div class="field">
							<label class="field__label">{{
								"profile.password" | transloco
							}}</label>
							<div class="profile__password-row">
								<input
									class="input"
									type="password"
									value="••••••••"
									readonly
									tabindex="-1"
								/>
								<button class="btn btn--secondary btn--sm" (click)="openPwModal()">
									<sb-icon name="key" [size]="13"></sb-icon>{{ "profile.changePassword" | transloco }}
								</button>
							</div>
						</div>

						<!-- Full name -->
						<div class="field">
							<label class="field__label"
								>{{ "profile.fullName" | transloco
								}}<span class="req"> *</span></label
							>
							<input
								class="input"
								[class.input--error]="showNameErr()"
								[value]="nameVal()"
								(input)="onName($event)"
								(blur)="nameTouched.set(true)"
							/>
							<span class="field__error" *ngIf="showNameErr()">{{
								"profile.modal.errors.required" | transloco
							}}</span>
						</div>

						<!-- Email + Phone -->
						<div class="profile__two-col">
							<div class="field">
								<label class="field__label"
									>{{ "forms.user.email" | transloco
									}}<span class="req"> *</span></label
								>
								<input
									class="input"
									[class.input--error]="showEmailErr()"
									[value]="emailVal()"
									(input)="onEmail($event)"
									(blur)="emailTouched.set(true)"
								/>
								<span class="field__error" *ngIf="showEmailErr()">{{
									emailError()! | transloco
								}}</span>
							</div>
							<div class="field">
								<label class="field__label">{{
									"forms.user.phone" | transloco
								}}</label>
								<input
									class="input"
									[value]="phoneVal()"
									(input)="onPhone($event)"
								/>
							</div>
						</div>

						<!-- Role (read-only) -->
						<div class="field">
							<label class="field__label">{{
								"profile.role" | transloco
							}}</label>
							<div class="profile__role-row">
								<div
									class="tag profile__role-tag"
									[ngClass]="roleTagClass()"
								>
									{{ meUser()?.role }}
								</div>
								<span class="field__hint">{{
									"profile.roleHint" | transloco
								}}</span>
							</div>
						</div>

						<!-- Created + Last login -->
						<div class="profile__two-col">
							<div class="field">
								<label class="field__label">{{
									"profile.accountCreated" | transloco
								}}</label>
								<input
									class="input"
									[value]="formatDate(meUser()?.created)"
									readonly
								/>
							</div>
							<div class="field">
								<label class="field__label">{{
									"profile.lastLogin" | transloco
								}}</label>
								<input
									class="input"
									[value]="formatRelative(meUser()?.lastLogin)"
									readonly
								/>
							</div>
						</div>
					</div>

					<div class="profile__form-footer">
						<button
							class="btn btn--ghost"
							[disabled]="!dirty()"
							(click)="resetForm()"
						>
							{{ "profile.reset" | transloco }}
						</button>
						<button
							class="btn btn--primary"
							[disabled]="!dirty() || !formValid() || saving()"
							(click)="saveProfile()"
						>
							{{ saving() ? "…" : ("profile.saveChanges" | transloco) }}
						</button>
					</div>
				</div>
			</div>

			<!-- Password change modal -->
			<sb-modal
				[open]="pwModalOpen()"
				[title]="'profile.modal.title' | transloco"
				[subtitle]="'profile.modal.subtitle' | transloco"
				[hasFooter]="true"
				(close)="pwModalOpen.set(false)"
			>
				<div class="field">
					<label class="field__label">{{
						"profile.modal.current" | transloco
					}}</label>
					<input
						class="input"
						type="password"
						[class.input--error]="pwErrors().current"
						[value]="pwCurrent()"
						(input)="pwCurrent.set(asStr($event))"
						autocomplete="current-password"
					/>
					<span class="field__error" *ngIf="pwErrors().current">{{
						pwErrors().current! | transloco
					}}</span>
				</div>

				<div class="field">
					<label class="field__label">{{
						"profile.modal.new" | transloco
					}}</label>
					<input
						class="input"
						type="password"
						[class.input--error]="pwErrors().next"
						[value]="pwNext()"
						(input)="pwNext.set(asStr($event))"
						autocomplete="new-password"
					/>
					<span class="field__hint">{{
						"profile.modal.newHint" | transloco
					}}</span>
					<span class="field__error" *ngIf="pwErrors().next">{{
						pwErrors().next! | transloco
					}}</span>
					<div class="pw-strength" *ngIf="pwNext().length > 0">
						<div class="pw-strength__track">
							<div
								*ngFor="let seg of strengthRange"
								class="pw-strength__seg"
								[style.background]="
									seg < pwStrength()
										? pwStrengthColor()
										: 'var(--surface-2)'
								"
								[style.border-color]="
									seg < pwStrength()
										? pwStrengthColor()
										: 'var(--border)'
								"
							></div>
						</div>
						<span
							class="pw-strength__label"
							[style.color]="pwStrengthColor()"
							>{{ pwStrengthKey() | transloco }}</span
						>
					</div>
				</div>

				<div class="field">
					<label class="field__label">{{
						"profile.modal.confirm" | transloco
					}}</label>
					<input
						class="input"
						type="password"
						[class.input--error]="pwErrors().confirm"
						[value]="pwConfirm()"
						(input)="pwConfirm.set(asStr($event))"
						autocomplete="new-password"
					/>
					<span class="field__error" *ngIf="pwErrors().confirm">{{
						pwErrors().confirm! | transloco
					}}</span>
				</div>

				<ng-container modal-footer>
					<button class="btn btn--ghost" (click)="pwModalOpen.set(false)">
						{{ "common.cancel" | transloco }}
					</button>
					<button
						class="btn btn--primary"
						[disabled]="changingPw()"
						(click)="changePassword()"
					>
						{{
							changingPw() ? "…" : ("profile.modal.update" | transloco)
						}}
					</button>
				</ng-container>
			</sb-modal>
		</div>
	`,
	styles: [
		`
			.profile__loading {
				display: flex;
				justify-content: center;
				padding: 60px;
			}
			.profile__loading-dot {
				width: 32px;
				height: 32px;
				border-radius: 50%;
				border: 3px solid var(--border);
				border-top-color: var(--primary-500);
				animation: spin 0.7s linear infinite;
			}
			@keyframes spin {
				to {
					transform: rotate(360deg);
				}
			}

			.profile__grid {
				display: grid;
				grid-template-columns: 320px 1fr;
				gap: 20px;
				align-items: start;
			}

			/* Identity card */
			.profile__identity {
				display: flex;
				flex-direction: column;
				align-items: center;
				text-align: center;
				padding: 28px 24px;
				gap: 8px;
			}
			.profile__avatar {
				width: 88px;
				height: 88px;
				border-radius: 50%;
				background: linear-gradient(
					135deg,
					var(--primary-400),
					var(--primary-600)
				);
				color: white;
				font-weight: 700;
				font-size: 26px;
				display: flex;
				align-items: center;
				justify-content: center;
				letter-spacing: 0.02em;
				margin-bottom: 6px;
				flex-shrink: 0;
			}
			.profile__name {
				font-size: 18px;
				font-weight: 700;
				letter-spacing: -0.01em;
				color: var(--text);
			}
			.profile__email {
				font-size: 13px;
				color: var(--muted);
				margin-top: -2px;
			}
			.profile__role-tag {
				margin-top: 4px;
				font-size: 11px;
				padding: 3px 10px;
				text-transform: uppercase;
				letter-spacing: 0.05em;
			}
			.tag--admin {
				background: rgba(249, 115, 22, 0.14);
				color: var(--primary-700);
			}
			:host-context([data-theme="dark"]) .tag--admin {
				color: var(--primary-300);
			}
			.tag--editor {
				background: var(--info-soft);
				color: #1d4ed8;
			}
			:host-context([data-theme="dark"]) .tag--editor {
				color: #93c5fd;
			}
			.tag--readonly {
				background: var(--neutral-soft);
				color: var(--text-2);
			}
			.profile__divider {
				width: 100%;
				height: 1px;
				background: var(--border);
				margin: 8px 0;
			}
			.profile__stats {
				width: 100%;
				display: flex;
				flex-direction: column;
				gap: 10px;
			}
			.profile__stat {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 8px;
			}
			.profile__stat-label {
				font-size: 12px;
				color: var(--muted);
			}
			.profile__stat-value {
				font-size: 12px;
				color: var(--text-2);
				font-weight: 500;
				text-align: right;
			}
			.profile__stat-value--mono {
				font-family: var(--font-mono);
				font-size: 11.5px;
			}

			/* Details card */
			.card__subtitle {
				font-size: 12.5px;
				color: var(--muted);
				margin-top: 2px;
			}
			.profile__form-body {
				display: flex;
				flex-direction: column;
				gap: 18px;
			}
			.profile__form-footer {
				padding: 14px 20px;
				border-top: 1px solid var(--border);
				display: flex;
				justify-content: flex-end;
				gap: 10px;
			}
			.profile__password-row {
				display: flex;
				gap: 10px;
				align-items: center;
			}
			.profile__password-row .input {
				flex: 1;
			}
			.profile__two-col {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px;
			}
			.profile__role-row {
				display: flex;
				align-items: center;
				gap: 12px;
			}

			/* Error input */
			.input--error {
				border-color: var(--danger) !important;
				box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
			}

			/* Mono input */
			.input--mono {
				font-family: var(--font-mono);
				font-size: 12.5px;
			}

			/* read-only inputs */
			.input[readonly] {
				background: var(--surface-2);
				color: var(--muted);
				cursor: default;
			}

			.req {
				color: var(--danger);
			}

			/* Password strength meter */
			.pw-strength {
				display: flex;
				align-items: center;
				gap: 10px;
				margin-top: 4px;
			}
			.pw-strength__track {
				display: flex;
				gap: 4px;
				flex: 1;
			}
			.pw-strength__seg {
				flex: 1;
				height: 5px;
				border-radius: 3px;
				border: 1px solid var(--border);
				transition:
					background 0.2s,
					border-color 0.2s;
			}
			.pw-strength__label {
				font-size: 11.5px;
				font-weight: 600;
				white-space: nowrap;
				transition: color 0.2s;
				min-width: 68px;
				text-align: right;
			}
		`,
	],
})
export class ProfilePageComponent {
	private readonly apollo = inject(Apollo);
	private readonly auth = inject(AuthService);
	private readonly toast = inject(ToastService);
	private readonly transloco = inject(TranslocoService);
	private readonly destroyRef = inject(DestroyRef);

	readonly loading = signal(true);
	readonly meUser = signal<MeUser | null>(null);

	readonly nameVal = signal("");
	readonly emailVal = signal("");
	readonly phoneVal = signal("");
	readonly nameTouched = signal(false);
	readonly emailTouched = signal(false);

	private readonly _orig = signal({ name: "", email: "", phone: "" });

	readonly dirty = computed(() => {
		const o = this._orig();
		return (
			this.nameVal() !== o.name ||
			this.emailVal() !== o.email ||
			this.phoneVal() !== o.phone
		);
	});

	readonly nameError = computed(() =>
		!this.nameVal().trim() ? "profile.modal.errors.required" : null
	);
	readonly emailError = computed(() => {
		const e = this.emailVal().trim();
		if (!e) return "profile.modal.errors.required";
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "profile.modal.errors.invalidEmail";
		return null;
	});

	readonly showNameErr = computed(() => this.nameTouched() && !!this.nameError());
	readonly showEmailErr = computed(
		() => this.emailTouched() && !!this.emailError()
	);

	readonly formValid = computed(() => !this.nameError() && !this.emailError());
	readonly saving = signal(false);

	readonly initials = computed(() => {
		const name =
			this.meUser()?.name ?? this.meUser()?.username ?? "SB";
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((s) => s[0])
				.join("")
				.toUpperCase() || "SB"
		);
	});

	readonly roleTagClass = computed(() => {
		const role = (this.meUser()?.role ?? "").toLowerCase();
		if (role === "admin" || role === "administrator") return "tag--admin";
		if (role === "editor") return "tag--editor";
		return "tag--readonly";
	});

	readonly pwModalOpen = signal(false);
	readonly pwCurrent = signal("");
	readonly pwNext = signal("");
	readonly pwConfirm = signal("");
	readonly changingPw = signal(false);
	readonly pwErrors = signal<{
		current?: string;
		next?: string;
		confirm?: string;
	}>({});

	readonly strengthRange = [0, 1, 2, 3, 4];

	readonly pwStrength = computed(() => {
		const pw = this.pwNext();
		let score = 0;
		if (pw.length >= 8) score++;
		if (pw.length >= 12) score++;
		if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
		if (/\d/.test(pw)) score++;
		if (/[^a-zA-Z0-9]/.test(pw)) score++;
		return score;
	});

	readonly pwStrengthColor = computed(() => {
		const s = this.pwStrength();
		if (s <= 1) return "var(--danger)";
		if (s <= 3) return "var(--warning)";
		return "var(--success)";
	});

	readonly pwStrengthKey = computed(() => {
		const keys = ["veryWeak", "weak", "fair", "good", "strong", "excellent"];
		return `profile.modal.strength.${keys[this.pwStrength()]}`;
	});

	constructor() {
		this.apollo
			.query<{ me: MeUser }>({
				query: QUERY_PROFILE_ME,
				fetchPolicy: "network-only",
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const u = res.data!.me;
					this.meUser.set(u);
					const snap = {
						name: u.name ?? "",
						email: u.email ?? "",
						phone: u.phone ?? "",
					};
					this._orig.set(snap);
					this.nameVal.set(snap.name);
					this.emailVal.set(snap.email);
					this.phoneVal.set(snap.phone);
					this.loading.set(false);
				},
				error: () => this.loading.set(false),
			});
	}

	formatDate(isoStr: string | null | undefined): string {
		if (!isoStr) return "—";
		const d = new Date(isoStr);
		if (isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(this.transloco.getActiveLang(), {
			dateStyle: "medium",
		}).format(d);
	}

	formatRelative(isoStr: string | null | undefined): string {
		if (!isoStr) return "—";
		const d = new Date(isoStr);
		if (isNaN(d.getTime())) return "—";
		const rtf = new Intl.RelativeTimeFormat(this.transloco.getActiveLang(), {
			numeric: "auto",
		});
		const diff = (d.getTime() - Date.now()) / 1000;
		const abs = Math.abs(diff);
		if (abs < 60) return rtf.format(Math.round(diff), "second");
		if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
		if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
		if (abs < 2592000) return rtf.format(Math.round(diff / 86400), "day");
		if (abs < 31536000) return rtf.format(Math.round(diff / 2592000), "month");
		return rtf.format(Math.round(diff / 31536000), "year");
	}

	onName(e: Event): void {
		this.nameVal.set((e.target as HTMLInputElement).value);
	}
	onEmail(e: Event): void {
		this.emailVal.set((e.target as HTMLInputElement).value);
	}
	onPhone(e: Event): void {
		this.phoneVal.set((e.target as HTMLInputElement).value);
	}
	asStr(e: Event): string {
		return (e.target as HTMLInputElement).value;
	}

	resetForm(): void {
		const o = this._orig();
		this.nameVal.set(o.name);
		this.emailVal.set(o.email);
		this.phoneVal.set(o.phone);
		this.nameTouched.set(false);
		this.emailTouched.set(false);
	}

	saveProfile(): void {
		this.nameTouched.set(true);
		this.emailTouched.set(true);
		if (!this.formValid() || this.saving()) return;
		this.saving.set(true);

		this.apollo
			.mutate<{ updateProfile: MeUser }>({
				mutation: MUTATION_UPDATE_PROFILE,
				variables: {
					input: {
						name: this.nameVal().trim(),
						email: this.emailVal().trim(),
						phone: this.phoneVal().trim() || null,
					},
				},
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const u = res.data!.updateProfile;
					this.meUser.set(u);
					const snap = {
						name: u.name ?? "",
						email: u.email ?? "",
						phone: u.phone ?? "",
					};
					this._orig.set(snap);
					this.nameVal.set(snap.name);
					this.emailVal.set(snap.email);
					this.phoneVal.set(snap.phone);
					this.auth.setProfile({
						username: u.username,
						name: u.name ?? undefined,
						email: u.email ?? undefined,
						phone: u.phone ?? undefined,
						role: u.role,
						created: u.created ?? undefined,
						lastLogin: u.lastLogin ?? undefined,
					});
					this.toast.push(
						"success",
						this.transloco.translate("profile.saved")
					);
					this.saving.set(false);
				},
				error: () => this.saving.set(false),
			});
	}

	openPwModal(): void {
		this.pwCurrent.set("");
		this.pwNext.set("");
		this.pwConfirm.set("");
		this.pwErrors.set({});
		this.pwModalOpen.set(true);
	}

	changePassword(): void {
		const errors: { current?: string; next?: string; confirm?: string } = {};
		if (!this.pwCurrent().trim())
			errors.current = "profile.modal.errors.current";
		if (this.pwNext().length < 8)
			errors.next = "profile.modal.errors.minLength";
		if (this.pwNext() !== this.pwConfirm())
			errors.confirm = "profile.modal.errors.mismatch";
		if (Object.keys(errors).length > 0) {
			this.pwErrors.set(errors);
			return;
		}
		this.changingPw.set(true);

		this.apollo
			.mutate<{ changePassword: boolean }>({
				mutation: MUTATION_CHANGE_PASSWORD,
				variables: {
					input: { current: this.pwCurrent(), next: this.pwNext() },
				},
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.toast.push(
						"success",
						this.transloco.translate("profile.modal.updated")
					);
					this.pwModalOpen.set(false);
					this.changingPw.set(false);
				},
				error: () => {
					this.pwErrors.set({
						current: "profile.modal.errors.current",
					});
					this.changingPw.set(false);
				},
			});
	}
}
