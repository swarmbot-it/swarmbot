import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { IconComponent } from "../../shared/icon.component";
import { QUERY_VOLUMES } from "../../core/graphql.queries";

type Volume = { name: string; driver: string; size: string };

/**
 * Swarm volumes list page. Loads volumes via GraphQL and renders a searchable data table.
 */
@Component({
	selector: "sb-volumes-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">Volumes</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> volumes provisioned
					</div>
				</div>
				<button class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon> New volume
				</button>
			</div>
			<sb-data-table [columns]="cols" [rows]="rows" [searchKeys]="['name', 'driver']">
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px;"
						>
							<sb-icon name="volumes" [size]="14"></sb-icon>
							<strong>{{ row.name }}</strong>
						</span>
						<span
							*ngSwitchCase="'driver'"
							class="badge badge--neutral"
							style="text-transform:uppercase; font-size:10.5px; letter-spacing:.06em;"
							>{{ row.driver }}</span
						>
						<span *ngSwitchCase="'size'" class="mono">{{ row.size }}</span>
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
		IconComponent,
	],
})
export class VolumesPageComponent {
	/** Emitted when the user clicks "New volume" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Name" },
		{ key: "driver", label: "Driver" },
		{ key: "size", label: "Size", align: "right" as const },
	];

	readonly rows$: Observable<Volume[]> = this.apollo
		.watchQuery<{ volumes: Volume[] }>({ query: QUERY_VOLUMES, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.volumes ?? []) as Volume[]));
}
