import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	inject,
	computed,
} from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { Router } from "@angular/router";
import { Apollo, gql } from "apollo-angular";
import { TranslocoPipe } from "@jsverse/transloco";
import { AuthService } from "../core/auth.service";
import { ThemeService } from "../core/theme.service";
import { I18nStateService } from "../core/i18n/i18n-state.service";
import { type LangCode, isLangCode } from "../core/i18n/i18n-languages";
import { LogoComponent } from "../shared/logo.component";
import { IconComponent } from "../shared/icon.component";

const LOGOUT = gql`
	mutation Logout {
		logout
	}
`;

/** Language rows shown in the collapsible selector — Latin block first, CJK after divider. */
const LATIN_LANGS: { code: LangCode; label: string }[] = [
	{ code: "de", label: "Deutsch" },
	{ code: "en", label: "English" },
	{ code: "es", label: "Español" },
	{ code: "it", label: "Italiano" },
	{ code: "pl", label: "Polski" },
];
const CJK_LANGS: { code: LangCode; label: string }[] = [
	{ code: "zh", label: "中文" },
	{ code: "ja", label: "日本語" },
	{ code: "ko", label: "한국어" },
];

/**
 * Top navigation bar. Holds the brand mark, cluster pill, notifications,
 * theme toggle, and the user popover (collapsible language + account menu).
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
						<span class="topbar__user-role">{{ email() }}</span>
					</div>
					<sb-icon name="chevronDown" [size]="14"></sb-icon>
				</div>

				<div class="popover" *ngIf="menuOpen">
					<div class="popover__header">
						<div class="popover__name">{{ user() }}</div>
						<div class="popover__email">{{ email() }}</div>
					</div>

					<div class="popover__item" (click)="goToProfile()">
						<sb-icon name="user" [size]="15"></sb-icon
						><span>{{ "topbar.profile" | transloco }}</span>
					</div>
					<div class="popover__divider"></div>

					<div class="popover__sub">{{ "topbar.language" | transloco }}</div>
					<div class="popover__item lang-trigger" (click)="toggleLang()">
						<span class="lang-code">{{ currentLang().code.toUpperCase() }}</span>
						<span class="lang-trigger__name">{{ currentLang().label }}</span>
						<sb-icon
							name="chevronDown"
							[size]="14"
							[style.transform]="langOpen ? 'rotate(180deg)' : 'none'"
							[style.transition]="'transform 0.15s'"
							[style.color]="'var(--muted)'"
						></sb-icon>
					</div>

					<div class="lang-list" *ngIf="langOpen">
						<div
							*ngFor="let lang of latinLangs"
							class="popover__item lang-item"
							[class.lang-item--active]="lang.code === i18n.activeLang()"
							(click)="selectLang(lang.code)"
						>
							<span class="lang-code">{{ lang.code.toUpperCase() }}</span>
							<span class="lang-item__name">{{ lang.label }}</span>
							<sb-icon
								*ngIf="lang.code === i18n.activeLang()"
								name="check"
								[size]="14"
								[strokeWidth]="3"
								style="color: var(--primary-500)"
							></sb-icon>
						</div>
						<div class="lang-divider"></div>
						<div
							*ngFor="let lang of cjkLangs"
							class="popover__item lang-item"
							[class.lang-item--active]="lang.code === i18n.activeLang()"
							(click)="selectLang(lang.code)"
						>
							<span class="lang-code">{{ lang.code.toUpperCase() }}</span>
							<span class="lang-item__name">{{ lang.label }}</span>
							<sb-icon
								*ngIf="lang.code === i18n.activeLang()"
								name="check"
								[size]="14"
								[strokeWidth]="3"
								style="color: var(--primary-500)"
							></sb-icon>
						</div>
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
				font-size: 11px;
				color: var(--muted);
				padding: 6px 10px 2px;
				text-transform: uppercase;
				letter-spacing: 0.06em;
			}

			/* Language selector */
			.lang-code {
				font-family: var(--font-mono);
				font-size: 10.5px;
				font-weight: 700;
				letter-spacing: 0.04em;
				background: var(--surface-2);
				color: var(--muted);
				padding: 2px 6px;
				border-radius: 4px;
				min-width: 28px;
				text-align: center;
				border: 1px solid var(--border);
				flex-shrink: 0;
			}
			.lang-trigger {
				font-size: 12.5px;
			}
			.lang-trigger__name {
				flex: 1;
			}
			.lang-list {
				margin: 2px 4px 4px;
				padding: 4px;
				border: 1px solid var(--border);
				border-radius: var(--r-md);
				background: var(--surface-2);
				display: flex;
				flex-direction: column;
				gap: 1px;
				max-height: 280px;
				overflow-y: auto;
			}
			.lang-item {
				font-size: 12.5px;
				padding: 6px 8px;
				background: transparent;
			}
			.lang-item:hover {
				background: var(--surface-hover);
			}
			.lang-item--active {
				color: var(--primary-600);
				font-weight: 600;
			}
			.lang-item--active .lang-code {
				background: rgba(249, 115, 22, 0.12);
				color: var(--primary-600);
				border-color: transparent;
			}
			:host-context([data-theme='dark']) .lang-item--active {
				color: var(--primary-400);
			}
			:host-context([data-theme='dark']) .lang-item--active .lang-code {
				color: var(--primary-400);
			}
			.lang-item__name {
				flex: 1;
			}
			.lang-divider {
				height: 1px;
				background: var(--border);
				margin: 4px 6px;
			}
		`,
	],
	imports: [NgIf, NgFor, LogoComponent, IconComponent, TranslocoPipe],
})
export class TopbarComponent {
	readonly theme = inject(ThemeService);
	readonly i18n = inject(I18nStateService);
	readonly latinLangs = LATIN_LANGS;
	readonly cjkLangs = CJK_LANGS;
	private readonly auth = inject(AuthService);
	private readonly apollo = inject(Apollo);
	private readonly router = inject(Router);
	private readonly host = inject(ElementRef<HTMLElement>);

	menuOpen = false;
	langOpen = false;

	readonly currentLang = computed(() => {
		const code = this.i18n.activeLang();
		return (
			[...LATIN_LANGS, ...CJK_LANGS].find((l) => l.code === code) ?? LATIN_LANGS[1]
		);
	});

	toggle(): void {
		this.menuOpen = !this.menuOpen;
		if (!this.menuOpen) this.langOpen = false;
	}

	toggleLang(): void {
		this.langOpen = !this.langOpen;
	}

	selectLang(code: string): void {
		if (isLangCode(code)) {
			void this.i18n.setLanguage(code);
		}
		this.langOpen = false;
	}

	goToProfile(): void {
		this.menuOpen = false;
		this.langOpen = false;
		void this.router.navigate(["/app/profile"]);
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
			this.langOpen = false;
		}
	}
}
