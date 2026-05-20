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
import { QUERY_SECRETS } from "../../core/graphql.queries";

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
					<h1 class="page-header__title">Secrets</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> secrets stored
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> New secret
				</button>
			</div>
			<sb-data-table [columns]="cols" [rows]="rows" [searchKeys]="['name']">
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
	],
})
export class SecretsPageComponent {
	/** Emitted when the user clicks "New secret" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Name" },
		{ key: "created", label: "Created" },
		{ key: "updated", label: "Last updated" },
	];

	readonly rows$: Observable<Secret[]> = this.apollo
		.watchQuery<{ secrets: Secret[] }>({ query: QUERY_SECRETS, pollInterval: 60_000 })
		.valueChanges.pipe(map((x) => (x.data?.secrets ?? []) as Secret[]));
}
