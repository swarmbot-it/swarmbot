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
import { QUERY_CONFIG_CONTENT, QUERY_CONFIGS } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { AuthService } from "../../core/auth.service";

type Cfg = { id: string; name: string; created: string; updated: string };

/**
 * Swarm configs list page. Lists config objects and their created/updated timestamps.
 */
@Component({
	selector: "sb-configs-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "nav.configs" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.configs.countSuffix" | transloco }}
					</div>
				</div>
				<button *ngIf="auth.isAdmin()" class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.configs.add" | transloco }}
				</button>
			</div>
			<sb-data-table [columns]="cols()" [rows]="rows" [searchKeys]="['name']">
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="configs" [size]="14"></sb-icon>
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
								[title]="'pages.configs.view' | transloco"
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
			[subtitle]="'pages.configs.modal.subtitle' | transloco"
			(close)="viewing.set(null)"
		>
			<ng-container *ngIf="viewing()">
				<div *ngIf="loadingContent(); else loaded" class="t-empty">
					{{ "pages.configs.modal.loading" | transloco }}
				</div>
				<ng-template #loaded>
					<pre
						class="mono"
						style="background:var(--surface-2); border-radius:var(--r-md); padding:14px; font-size:12.5px; white-space:pre-wrap; word-break:break-word; max-height:400px; overflow:auto; margin:0;"
						>{{ content() || ("pages.configs.modal.empty" | transloco) }}</pre
					>
				</ng-template>
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
export class ConfigsPageComponent {
	/** Emitted when the user clicks "New config" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	readonly auth = inject(AuthService);

	readonly cols = translatedColumns<Cfg>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "created", labelKey: "columns.created" },
		{ key: "updated", labelKey: "columns.updated" },
		{ key: "actions", labelKey: "columns.actions", sortable: false, align: "right" },
	]);

	readonly rows$: Observable<Cfg[]> = this.apollo
		.watchQuery<{ configs: Cfg[] }>({ query: QUERY_CONFIGS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.configs ?? []) as Cfg[]));

	/** Row currently shown in the "view content" modal, or null when closed. */
	readonly viewing = signal<Cfg | null>(null);
	readonly content = signal<string | null>(null);
	readonly loadingContent = signal(false);

	view(row: Cfg): void {
		this.viewing.set(row);
		this.content.set(null);
		this.loadingContent.set(true);
		this.apollo
			.query<{ configs: Array<{ id: string; content: string | null }> }>({
				query: QUERY_CONFIG_CONTENT,
				fetchPolicy: "network-only",
			})
			.subscribe((res) => {
				const match = (res.data?.configs ?? []).find((c) => c.id === row.id);
				this.content.set(match?.content ?? null);
				this.loadingContent.set(false);
			});
	}
}
