import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from "@angular/core";
import { AsyncPipe, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataTableComponent } from "../../shared/data-table.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { IconComponent } from "../../shared/icon.component";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { QUERY_SERVICES } from "../../core/graphql.queries";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { AuthService } from "../../core/auth.service";
import { Router } from "@angular/router";

type ServiceRow = {
	id: string;
	name: string;
	image: string;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
	status: string;
	stack: string | null;
};

/**
 * Swarm services list page. Shows replicas, images, ports, and status for each service.
 */
@Component({
	selector: "sb-services-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="rows$ | async as rows">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "nav.services" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.services.countSuffix" | transloco }}
					</div>
				</div>
				<button *ngIf="auth.isEditor()" class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.services.add" | transloco }}
				</button>
			</div>
			<sb-data-table
				[columns]="cols()"
				[rows]="rows"
				[searchKeys]="['name', 'image', 'stack', 'status']"
				(rowClick)="open($event.id)"
			>
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<div *ngSwitchCase="'name'">
							<div style="font-weight: 600">{{ row.name }}</div>
							<div class="mono" style="color: var(--muted); margin-top: 2px;">
								{{ row.image }}
							</div>
						</div>
						<div *ngSwitchCase="'replicas'" class="replica">
							<div class="replica__bar">
								<div
									class="replica__bar-fill"
									[style.width.%]="
										row.replicasTotal === 0
											? 0
											: (row.replicasRunning / row.replicasTotal) * 100
									"
									[style.background]="
										row.replicasRunning < row.replicasTotal
											? 'var(--warning)'
											: 'var(--success)'
									"
								></div>
							</div>
							<span class="replica__text"
								>{{ row.replicasRunning }}/{{ row.replicasTotal }}</span
							>
						</div>
						<div *ngSwitchCase="'ports'" style="display:flex; flex-wrap:wrap; gap:4px;">
							<span
								*ngFor="let p of row.ports"
								class="tag"
								style="background: var(--surface-2); color: var(--text-2); text-transform: none"
								>{{ p }}</span
							>
						</div>
						<sb-status *ngSwitchCase="'status'" [status]="row.status"></sb-status>
						<ng-container *ngSwitchDefault>{{ row[key] }}</ng-container>
					</ng-container>
				</ng-template>
			</sb-data-table>
		</ng-container>
	`,
	styles: [
		`
			.replica {
				display: flex;
				align-items: center;
				gap: 8px;
			}
			.replica__bar {
				width: 80px;
				height: 6px;
				background: var(--surface-2);
				border-radius: 3px;
				overflow: hidden;
			}
			.replica__bar-fill {
				height: 100%;
				border-radius: 3px;
				transition: width 0.2s;
			}
			.replica__text {
				font-size: 12px;
				font-variant-numeric: tabular-nums;
				font-family: var(--font-mono);
				font-weight: 600;
			}
		`,
	],
	imports: [
		NgIf,
		NgFor,
		NgSwitch,
		NgSwitchCase,
		NgSwitchDefault,
		AsyncPipe,
		DataTableComponent,
		StatusBadgeComponent,
		IconComponent,
		TranslocoPipe,
	],
})
export class ServicesPageComponent {
	/** Emitted when the user clicks "New service" to open the create modal. */
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	private readonly router = inject(Router);
	readonly auth = inject(AuthService);

	open(id: string): void {
		this.router.navigate(["/services", id]);
	}

	readonly cols = translatedColumns<ServiceRow>(this.transloco, this.i18n.activeLang, [
		{
			key: "name",
			labelKey: "pages.services.columns.service",
			sortFn: (r: ServiceRow) => r.name,
		},
		{
			key: "replicas",
			labelKey: "pages.services.columns.replicas",
			width: 200,
			sortFn: (r: ServiceRow) => r.replicasRunning / Math.max(1, r.replicasTotal),
		},
		{ key: "ports", labelKey: "pages.services.columns.ports", sortable: false },
		{ key: "status", labelKey: "columns.status" },
	]);

	readonly rows$: Observable<ServiceRow[]> = this.apollo
		.watchQuery<{ services: ServiceRow[] }>({ query: QUERY_SERVICES, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.services ?? []) as ServiceRow[]));
}
