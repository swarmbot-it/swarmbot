import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
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
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_SECRETS } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";

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
				<button class="btn btn--primary" (click)="createRequested.emit()">
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
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>
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
		TranslocoPipe,
	],
})
export class SecretsPageComponent {
	/** Emitted when the user clicks "New secret" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly cols = translatedColumns<Secret>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "created", labelKey: "columns.created" },
		{ key: "updated", labelKey: "columns.updated" },
	]);

	readonly rows$: Observable<Secret[]> = this.apollo
		.watchQuery<{ secrets: Secret[] }>({ query: QUERY_SECRETS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.secrets ?? []) as Secret[]));
}
