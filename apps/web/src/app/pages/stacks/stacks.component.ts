import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { IconComponent } from "../../shared/icon.component";
import { QUERY_STACKS } from "../../core/graphql.queries";

type Stack = {
	name: string;
	services: number;
	networks: number;
	volumes: number;
	configs: number;
	secrets: number;
	status: string;
};

/**
 * Docker stack list page. Shows stack composition counts and deployment status from GraphQL.
 */
@Component({
	selector: "sb-stacks-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">Stacks</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> stacks deployed
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> New stack
				</button>
			</div>
			<sb-data-table [columns]="cols" [rows]="rows" [searchKeys]="['name', 'status']">
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="stacks" [size]="16"></sb-icon>
							<strong>{{ row.name }}</strong>
						</span>
						<span *ngSwitchCase="'services'" class="num">{{ row.services }}</span>
						<span *ngSwitchCase="'networks'" class="num">{{ row.networks }}</span>
						<span *ngSwitchCase="'volumes'" class="num">{{ row.volumes }}</span>
						<span *ngSwitchCase="'configs'" class="num">{{ row.configs }}</span>
						<span *ngSwitchCase="'secrets'" class="num">{{ row.secrets }}</span>
						<sb-status *ngSwitchCase="'status'" [status]="row.status"></sb-status>
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
		DataTableComponent,
		StatusBadgeComponent,
		IconComponent,
	],
})
export class StacksPageComponent {
	/** Emitted when the user clicks "New stack" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Stack" },
		{ key: "services", label: "Services", align: "right" as const },
		{ key: "networks", label: "Networks", align: "right" as const },
		{ key: "volumes", label: "Volumes", align: "right" as const },
		{ key: "configs", label: "Configs", align: "right" as const },
		{ key: "secrets", label: "Secrets", align: "right" as const },
		{ key: "status", label: "Status" },
	];

	readonly rows$: Observable<Stack[]> = this.apollo
		.watchQuery<{ stacks: Stack[] }>({ query: QUERY_STACKS, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.stacks ?? []) as Stack[]));
}
