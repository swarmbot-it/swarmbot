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
import { QUERY_CONFIGS } from "../../core/graphql.queries";

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
					<h1 class="page-header__title">Configs</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> configs stored
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> New config
				</button>
			</div>
			<sb-data-table [columns]="cols" [rows]="rows" [searchKeys]="['name']">
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
	],
})
export class ConfigsPageComponent {
	/** Emitted when the user clicks "New config" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Name" },
		{ key: "created", label: "Created" },
		{ key: "updated", label: "Last updated" },
	];

	readonly rows$: Observable<Cfg[]> = this.apollo
		.watchQuery<{ configs: Cfg[] }>({ query: QUERY_CONFIGS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.configs ?? []) as Cfg[]));
}
