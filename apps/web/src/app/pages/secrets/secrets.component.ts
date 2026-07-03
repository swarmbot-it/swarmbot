import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, signal } from "@angular/core";
import {
	AsyncPipe,
	DatePipe,
	NgIf,
	NgSwitch,
	NgSwitchCase,
	NgSwitchDefault,
} from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { IconComponent } from "../../shared/icon.component";
import { ModalComponent } from "../../shared/modal.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_SECRETS } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { AuthService } from "../../core/auth.service";

type Secret = { id: string; name: string; created: string; updated: string };

/**
 * Swarm secrets list page. Lists secret metadata (names and timestamps) from GraphQL.
 */
@Component({
	selector: "sb-secrets-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "nav.secrets" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.secrets.countSuffix" | transloco }}
					</div>
				</div>
				<button *ngIf="auth.isAdmin()" class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.secrets.add" | transloco }}
				</button>
			</div>
			<sb-data-table [columns]="cols()" [rows]="rows" [searchKeys]="['name']">
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="secrets" [size]="14"></sb-icon>
							<strong class="mono">{{ row.name }}</strong>
						</span>
						<span *ngSwitchCase="'created'" class="mono" style="color: var(--muted)">{{
							row.created | date: "yyyy-MM-dd"
						}}</span>
						<span *ngSwitchCase="'updated'" class="mono">{{
							row.updated | date: "yyyy-MM-dd"
						}}</span>
						<span *ngSwitchCase="'actions'" style="display:flex; justify-content:flex-end;">
							<button
								class="btn btn--ghost btn--icon btn--sm"
								[title]="'pages.secrets.view' | transloco"
								(click)="view(row)"
							>
								<sb-icon name="eye" [size]="15" style="color: var(--muted)"></sb-icon>
							</button>
						</span>
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>

		<sb-modal
			[open]="viewing() !== null"
			[title]="viewing()?.name || ''"
			[subtitle]="'pages.secrets.modal.subtitle' | transloco"
			(close)="viewing.set(null)"
		>
			<ng-container *ngIf="viewing() as s">
				<div class="field">
					<label class="field__label">{{ "pages.secrets.modal.id" | transloco }}</label>
					<input class="input mono" [value]="s.id" readonly disabled style="color: var(--muted)" />
				</div>
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
					<div class="field">
						<label class="field__label">{{ "pages.secrets.modal.created" | transloco }}</label>
						<input
							class="input mono"
							[value]="s.created | date: 'medium'"
							readonly
							disabled
							style="color: var(--muted)"
						/>
					</div>
					<div class="field">
						<label class="field__label">{{ "pages.secrets.modal.updated" | transloco }}</label>
						<input
							class="input mono"
							[value]="s.updated | date: 'medium'"
							readonly
							disabled
							style="color: var(--muted)"
						/>
					</div>
				</div>
				<div
					style="display:flex; gap:8px; align-items:flex-start; padding:10px 12px; background:var(--surface-2); border-radius:var(--r-md); font-size:12.5px; color:var(--text-2);"
				>
					<sb-icon
						name="secrets"
						[size]="14"
						style="color:var(--muted); margin-top:2px; flex-shrink:0;"
					></sb-icon>
					<span>{{ "pages.secrets.modal.writeOnlyNotice" | transloco }}</span>
				</div>
			</ng-container>
			<div modal-footer>
				<button class="btn btn--secondary" (click)="viewing.set(null)">
					{{ "common.close" | transloco }}
				</button>
			</div>
		</sb-modal>
	`,
	imports: [
		NgIf,
		NgSwitch,
		NgSwitchCase,
		NgSwitchDefault,
		AsyncPipe,
		DatePipe,
		DataTableComponent,
		IconComponent,
		ModalComponent,
		TranslocoPipe,
	],
})
export class SecretsPageComponent {
	/** Emitted when the user clicks "New secret" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	readonly auth = inject(AuthService);

	readonly cols = translatedColumns<Secret>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "created", labelKey: "columns.created" },
		{ key: "updated", labelKey: "columns.updated" },
		{ key: "actions", labelKey: "columns.actions", sortable: false, align: "right" },
	]);

	readonly rows$: Observable<Secret[]> = this.apollo
		.watchQuery<{ secrets: Secret[] }>({ query: QUERY_SECRETS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.secrets ?? []) as Secret[]));

	/** Row currently shown in the "view details" modal, or null when closed. */
	readonly viewing = signal<Secret | null>(null);

	view(row: Secret): void {
		this.viewing.set(row);
	}
}
