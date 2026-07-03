import {
	ChangeDetectionStrategy,
	Component,
	EventEmitter,
	Input,
	OnChanges,
	Output,
	inject,
	signal,
} from "@angular/core";
import { DatePipe, NgIf } from "@angular/common";
import { Apollo, gql } from "apollo-angular";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { ModalComponent } from "./modal.component";
import { IconComponent } from "./icon.component";
import { ToastService } from "../core/toast.service";

const ME_TOKEN_QUERY = gql`
	query MeApiToken {
		me {
			apiTokenMask
			apiTokenExpiresAt
		}
	}
`;
const GENERATE = gql`
	mutation ApiTokenGenerate {
		apiTokenGenerate {
			token
			expiresAt
		}
	}
`;
const REMOVE = gql`
	mutation ApiTokenRemove {
		apiTokenRemove
	}
`;

/**
 * Personal API token management — shows the active token's mask/expiry,
 * lets the user (re)generate a token (shown once) or revoke it.
 */
@Component({
	selector: "sb-api-token-modal",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ModalComponent, IconComponent, NgIf, DatePipe, TranslocoPipe],
	template: `
		<sb-modal
			[open]="open"
			[title]="'topbar.apiTokens' | transloco"
			[subtitle]="'topbar.apiTokensSubtitle' | transloco"
			(close)="onClose()"
		>
			<div class="field" *ngIf="freshToken() as token; else activeOrEmpty">
				<label class="field__label">{{ "topbar.apiTokensYourNew" | transloco }}</label>
				<textarea class="textarea mono" rows="3" readonly>{{ token }}</textarea>
				<div class="field__hint" style="color:var(--warning)">
					{{ "topbar.apiTokensCopyHint" | transloco }}
				</div>
			</div>
			<button class="btn btn--secondary" *ngIf="freshToken()" (click)="copy()">
				<sb-icon name="download" [size]="14"></sb-icon>
				{{ "topbar.apiTokensCopy" | transloco }}
			</button>
			<ng-template #activeOrEmpty>
				<div class="field" *ngIf="mask() as m; else noToken">
					<label class="field__label">{{ "topbar.apiTokensActive" | transloco }}</label>
					<input class="input mono" [value]="'••••••••••' + m" readonly disabled />
					<div class="field__hint" *ngIf="expiresAt() as exp; else noExpiry">
						{{ "topbar.apiTokensExpires" | transloco }} {{ exp | date: "medium" }}
					</div>
					<ng-template #noExpiry>
						<div class="field__hint">{{ "topbar.apiTokensNoExpiry" | transloco }}</div>
					</ng-template>
				</div>
				<ng-template #noToken>
					<div style="font-size:13px; color:var(--muted)">
						{{ "topbar.apiTokensNone" | transloco }}
					</div>
				</ng-template>
			</ng-template>

			<div *ngIf="error()" style="font-size:12.5px; color:var(--danger)">{{ error() }}</div>

			<div modal-footer style="display:flex; gap:10px; width:100%">
				<button
					class="btn btn--danger"
					*ngIf="mask() || freshToken()"
					[disabled]="loading()"
					(click)="revoke()"
				>
					<sb-icon name="trash" [size]="14"></sb-icon>
					{{ "topbar.apiTokensRevoke" | transloco }}
				</button>
				<span style="flex:1"></span>
				<button class="btn btn--secondary" (click)="onClose()">
					{{ "common.close" | transloco }}
				</button>
				<button class="btn btn--primary" [disabled]="loading()" (click)="generate()">
					<sb-icon name="keys" [size]="14"></sb-icon>
					{{
						(mask() || freshToken()
							? "topbar.apiTokensRegenerate"
							: "topbar.apiTokensGenerate"
						) | transloco
					}}
				</button>
			</div>
		</sb-modal>
	`,
})
export class ApiTokenModalComponent implements OnChanges {
	@Input() open = false;
	@Output() close = new EventEmitter<void>();

	private readonly apollo = inject(Apollo);
	private readonly toast = inject(ToastService);
	private readonly transloco = inject(TranslocoService);

	readonly mask = signal<string | null>(null);
	readonly expiresAt = signal<string | null>(null);
	readonly freshToken = signal<string | null>(null);
	readonly loading = signal(false);
	readonly error = signal("");

	ngOnChanges(): void {
		if (this.open) {
			this.freshToken.set(null);
			this.error.set("");
			this.load();
		}
	}

	private load(): void {
		this.apollo
			.query<{ me: { apiTokenMask: string | null; apiTokenExpiresAt: string | null } | null }>({
				query: ME_TOKEN_QUERY,
				fetchPolicy: "network-only",
			})
			.subscribe((r) => {
				this.mask.set(r.data?.me?.apiTokenMask ?? null);
				this.expiresAt.set(r.data?.me?.apiTokenExpiresAt ?? null);
			});
	}

	generate(): void {
		this.loading.set(true);
		this.error.set("");
		this.apollo
			.mutate<{ apiTokenGenerate: { token: string; expiresAt: string | null } }>({
				mutation: GENERATE,
			})
			.subscribe({
				next: (r) => {
					this.loading.set(false);
					const token = r.data?.apiTokenGenerate.token ?? null;
					this.freshToken.set(token);
					this.expiresAt.set(r.data?.apiTokenGenerate.expiresAt ?? null);
					this.mask.set(token ? token.slice(-5) : null);
				},
				error: (err) => {
					this.loading.set(false);
					this.error.set(err?.message || this.transloco.translate("topbar.apiTokensGenFailed"));
				},
			});
	}

	revoke(): void {
		this.loading.set(true);
		this.error.set("");
		this.apollo.mutate<{ apiTokenRemove: boolean }>({ mutation: REMOVE }).subscribe({
			next: () => {
				this.loading.set(false);
				this.mask.set(null);
				this.freshToken.set(null);
				this.expiresAt.set(null);
				this.toast.push("success", this.transloco.translate("topbar.apiTokensRevoked"));
			},
			error: (err) => {
				this.loading.set(false);
				this.error.set(err?.message || this.transloco.translate("topbar.apiTokensRevokeFailed"));
			},
		});
	}

	copy(): void {
		const token = this.freshToken();
		if (!token) return;
		void navigator.clipboard?.writeText(token).then(() => {
			this.toast.push("success", this.transloco.translate("topbar.apiTokensCopied"));
		});
	}

	onClose(): void {
		this.freshToken.set(null);
		this.close.emit();
	}
}
