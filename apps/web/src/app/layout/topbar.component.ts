import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	inject,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { Router } from "@angular/router";
import { Apollo, gql } from "apollo-angular";
import { TranslocoPipe } from "@jsverse/transloco";
import { AuthService } from "../core/auth.service";
import { ThemeService } from "../core/theme.service";
import { I18nStateService } from "../core/i18n/i18n-state.service";
import { SUPPORTED_LANGUAGES, isLangCode } from "../core/i18n/i18n-languages";
import { LogoComponent } from "../shared/logo.component";
import { IconComponent } from "../shared/icon.component";

const LOGOUT = gql`
	mutation Logout {
		logout
	}
`;

/**
 * Top navigation bar. Holds the brand mark, cluster pill, notifications,
 * theme toggle, and the user popover (language + account menu).
 */
@Component({
	selector: "sb-topbar",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<header class="topbar">
			<sb-logo></sb-logo>

			<span class="topbar__divider"></span>
			<div class="topbar__cluster">
				<span class="dot dot--success"></span>
				<span class="topbar__cluster-name">prod-eu-1</span>
				<sb-icon name="chevronDown" [size]="14"></sb-icon>
			</div>

			<span class="topbar__spacer"></span>

			<div class="theme-slider" role="group" [attr.aria-label]="'topbar.theme' | transloco">
				<button
					class="theme-slider__btn"
					[class.theme-slider__btn--active]="theme.theme() === 'light'"
					[title]="'topbar.switchToLight' | transloco"
					(click)="theme.set('light')"
				>
					<sb-icon name="sun" [size]="16"></sb-icon>
				</button>
				<button
					class="theme-slider__btn"
					[class.theme-slider__btn--active]="theme.theme() === 'dark'"
					[title]="'topbar.switchToDark' | transloco"
					(click)="theme.set('dark')"
				>
					<sb-icon name="moon" [size]="16"></sb-icon>
				</button>
			</div>

			<button
				class="btn btn--ghost btn--icon topbar__bell"
				[title]="'topbar.notifications' | transloco"
			>
				<sb-icon name="bell" [size]="18"></sb-icon>
				<span class="topbar__bell-dot"></span>
			</button>

			<div #anchor class="topbar__user-anchor">
				<div class="topbar__user" (click)="toggle()">
					<div class="avatar">{{ initials() }}</div>
					<div class="topbar__user-meta">
						<span class="topbar__user-name">{{ user() }}</span>
						<span class="topbar__user-role">{{
							"topbar.administrator" | transloco
						}}</span>
					</div>
					<sb-icon name="chevronDown" [size]="14"></sb-icon>
				</div>

				<div class="popover" *ngIf="menuOpen">
					<div class="popover__header">
						<div class="popover__name">{{ user() }}</div>
						<div class="popover__email">{{ email() }}</div>
					</div>

					<label class="popover__sub" for="sb-lang-select">{{
						"topbar.language" | transloco
					}}</label>
					<select
						id="sb-lang-select"
						class="popover__select"
						[value]="i18n.activeLang()"
						(change)="onLanguageChange($event)"
					>
						<option *ngFor="let lang of languages" [value]="lang.code">
							{{ lang.label }}
						</option>
					</select>

					<div class="popover__divider"></div>
					<div class="popover__item">
						<sb-icon name="user" [size]="15"></sb-icon
						><span>{{ "topbar.profile" | transloco }}</span>
					</div>
					<div class="popover__item">
						<sb-icon name="settings" [size]="15"></sb-icon
						><span>{{ "topbar.preferences" | transloco }}</span>
					</div>
					<div class="popover__item">
						<sb-icon name="keys" [size]="15"></sb-icon
						><span>{{ "topbar.apiTokens" | transloco }}</span>
					</div>
					<div class="popover__divider"></div>
					<div class="popover__item popover__item--danger" (click)="onLogout()">
						<sb-icon name="logout" [size]="15"></sb-icon
						><span>{{ "topbar.logout" | transloco }}</span>
					</div>
				</div>
			</div>
		</header>
	`,
	styles: [
		`
			.topbar {
				height: 60px;
				background: var(--topbar-bg);
				border-bottom: 1px solid var(--border);
				display: flex;
				align-items: center;
				padding: 0 24px;
				gap: 16px;
				position: relative;
				z-index: 10;
			}
			.topbar__divider {
				width: 1px;
				height: 28px;
				background: var(--border);
			}
			.topbar__cluster {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				color: var(--text);
			}
			.topbar__cluster-name {
				font-size: 13px;
				font-weight: 600;
			}
			.topbar__spacer {
				flex: 1;
			}
			.theme-slider {
				display: flex;
				align-items: center;
				background: var(--surface-2);
				border: 1px solid var(--border);
				border-radius: 999px;
				padding: 3px;
				gap: 2px;
			}
			.theme-slider__btn {
				width: 30px;
				height: 30px;
				border-radius: 999px;
				border: none;
				background: transparent;
				cursor: pointer;
				display: flex;
				align-items: center;
				justify-content: center;
				color: var(--muted-2);
				transition: color 0.15s;
			}
			.theme-slider__btn--active {
				background: var(--surface);
				color: var(--primary-500);
				box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 0 0 1px var(--border);
			}
			:host-context([data-theme='dark']) .theme-slider__btn--active {
				box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--border-strong);
			}
			.theme-slider__btn:not(.theme-slider__btn--active):hover {
				color: var(--muted);
			}
			.topbar__bell {
				position: relative;
			}
			.topbar__bell-dot {
				position: absolute;
				top: 8px;
				right: 9px;
				width: 7px;
				height: 7px;
				border-radius: 50%;
				background: var(--primary-500);
				box-shadow: 0 0 0 2px var(--surface);
			}
			.topbar__user-anchor {
				position: relative;
			}
			.topbar__user {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 6px 10px 6px 6px;
				border-radius: 999px;
				cursor: pointer;
				border: 1px solid transparent;
				transition:
					background 0.15s,
					border-color 0.15s;
			}
			.topbar__user:hover {
				background: var(--surface-hover);
				border-color: var(--border);
			}
			.avatar {
				width: 32px;
				height: 32px;
				border-radius: 50%;
				background: linear-gradient(135deg, var(--primary-400), var(--primary-600));
				color: white;
				font-weight: 700;
				font-size: 12px;
				display: flex;
				align-items: center;
				justify-content: center;
				letter-spacing: 0.02em;
			}
			.topbar__user-meta {
				display: flex;
				flex-direction: column;
				line-height: 1.15;
			}
			.topbar__user-name {
				font-size: 13px;
				font-weight: 600;
			}
			.topbar__user-role {
				font-size: 11px;
				color: var(--muted);
			}

			.popover {
				position: absolute;
				right: 0;
				top: 52px;
				min-width: 240px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				box-shadow: var(--shadow-3);
				padding: 6px;
				z-index: 30;
			}
			.popover__header {
				padding: 10px 12px 12px;
				border-bottom: 1px solid var(--border);
				margin-bottom: 6px;
			}
			.popover__name {
				font-weight: 700;
				font-size: 13px;
			}
			.popover__email {
				color: var(--muted);
				font-size: 12px;
				margin-top: 2px;
			}
			.popover__item {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 8px 10px;
				border-radius: var(--r-md);
				cursor: pointer;
				font-size: 13px;
			}
			.popover__item:hover {
				background: var(--surface-hover);
			}
			.popover__item--danger {
				color: var(--danger);
			}
			.popover__divider {
				height: 1px;
				background: var(--border);
				margin: 6px 4px;
			}
			.popover__sub {
				display: block;
				font-size: 11px;
				color: var(--muted);
				padding: 6px 10px 2px;
				text-transform: uppercase;
				letter-spacing: 0.06em;
			}
			.popover__select {
				display: block;
				width: calc(100% - 12px);
				margin: 4px 6px 8px;
				padding: 8px 10px;
				font-size: 13px;
				font-weight: 500;
				border: 1px solid var(--border);
				border-radius: var(--r-md);
				background: var(--surface);
				color: var(--text);
				cursor: pointer;
			}
			.popover__select:focus {
				outline: 2px solid var(--primary-500);
				outline-offset: 1px;
			}
		`,
	],
	imports: [NgIf, NgFor, LogoComponent, IconComponent, TranslocoPipe],
})
export class TopbarComponent {
	readonly theme = inject(ThemeService);
	readonly i18n = inject(I18nStateService);
	readonly languages = SUPPORTED_LANGUAGES;
	private readonly auth = inject(AuthService);
	private readonly apollo = inject(Apollo);
	private readonly router = inject(Router);
	private readonly host = inject(ElementRef<HTMLElement>);

	menuOpen = false;

	toggle(): void {
		this.menuOpen = !this.menuOpen;
	}

	onLanguageChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		if (isLangCode(value)) {
			void this.i18n.setLanguage(value);
		}
	}

	user(): string {
		return this.auth.profile()?.name ?? this.auth.profile()?.username ?? "Administrator";
	}
	email(): string {
		return this.auth.profile()?.email ?? "—";
	}
	initials(): string {
		const name = this.user();
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((s) => s[0])
				.join("")
				.toUpperCase() || "SB"
		);
	}

	onLogout(): void {
		this.menuOpen = false;
		this.apollo.mutate({ mutation: LOGOUT }).subscribe({
			complete: () => {
				this.auth.logout();
			},
			error: () => {
				this.auth.logout();
			},
		});
	}

	@HostListener("document:mousedown", ["$event"])
	outsideClick(event: MouseEvent): void {
		if (!this.menuOpen) return;
		const root = this.host.nativeElement;
		if (!root.contains(event.target as Node)) {
			this.menuOpen = false;
		}
	}
}
