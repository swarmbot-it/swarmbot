import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { QUERY_TASKS } from "../../core/graphql.queries";

type TaskRow = {
	id: string;
	name: string;
	image: string;
	node: string;
	cpu: number;
	mem: number;
	updated: string;
	status: string;
	cpuSeries: number[];
	memSeries: number[];
};

/**
 * Swarm tasks list page. Displays scheduled tasks with status, resource usage, and sparkline trends.
 */
@Component({
	selector: "sb-tasks-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">Tasks</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong> tasks scheduled
					</div>
				</div>
			</div>
			<sb-data-table
				[columns]="cols"
				[rows]="rows"
				[searchKeys]="['name', 'image', 'node', 'status']"
				[pageSize]="12"
			>
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<div *ngSwitchCase="'name'">
							<div class="mono" style="font-weight: 600">{{ row.name }}</div>
							<div class="mono" style="color: var(--muted); margin-top: 2px;">
								{{ row.image }}
							</div>
						</div>
						<span *ngSwitchCase="'node'" class="mono">{{ row.node }}</span>
						<div *ngSwitchCase="'cpu'" class="meter">
							<sb-sparkline
								[data]="row.cpuSeries"
								[width]="70"
								[height]="22"
								color="var(--primary-500)"
								[strokeWidth]="1.25"
							></sb-sparkline>
							<span class="meter__value">{{ row.cpu }}%</span>
						</div>
						<div *ngSwitchCase="'mem'" class="meter">
							<sb-sparkline
								[data]="row.memSeries"
								[width]="70"
								[height]="22"
								color="#3b82f6"
								[strokeWidth]="1.25"
							></sb-sparkline>
							<span class="meter__value">{{ row.mem }}%</span>
						</div>
						<span *ngSwitchCase="'updated'" style="color: var(--muted)">{{
							row.updated
						}}</span>
						<sb-status *ngSwitchCase="'status'" [status]="row.status"></sb-status>
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>
	`,
	styles: [
		`
			.meter {
				display: flex;
				align-items: center;
				gap: 8px;
			}
			.meter__value {
				font-size: 11px;
				font-family: var(--font-mono);
				font-weight: 600;
				min-width: 36px;
				text-align: right;
			}
		`,
	],
	imports: [
		NgIf,
		NgSwitch,
		NgSwitchCase,
		NgSwitchDefault,
		AsyncPipe,
		DataTableComponent,
		StatusBadgeComponent,
		SparklineComponent,
	],
})
export class TasksPageComponent {
	private readonly apollo = inject(Apollo);

	readonly cols = [
		{ key: "name", label: "Task" },
		{ key: "node", label: "Node" },
		{ key: "cpu", label: "CPU", width: 160, sortFn: (r: TaskRow) => r.cpu },
		{ key: "mem", label: "Memory", width: 160, sortFn: (r: TaskRow) => r.mem },
		{ key: "updated", label: "Last updated" },
		{ key: "status", label: "Status" },
	];

	readonly rows$: Observable<TaskRow[]> = this.apollo
		.watchQuery<{ tasks: TaskRow[] }>({ query: QUERY_TASKS, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.tasks ?? []) as TaskRow[]));
}
