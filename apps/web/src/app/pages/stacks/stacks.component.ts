import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject } from "@angular/core";
import { AsyncPipe, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from "@angular/common";
import { Apollo } from "apollo-angular";
import { TranslocoPipe } from "@jsverse/transloco";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { Router } from "@angular/router";
import { DataTableComponent } from "../../shared/data-table.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { IconComponent } from "../../shared/icon.component";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { TranslocoService } from "@jsverse/transloco";
import { QUERY_STACKS } from "../../core/graphql.queries";
import { AuthService } from "../../core/auth.service";
import { OrchestratorStateService } from "../../core/orchestrator-state.service";

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
					<h1 class="page-header__title">{{ "nav.stacks" | transloco }}</h1>
					<div class="page-header__count">
						<strong>{{ rows.length }}</strong>
						{{ "pages.stacks.countSuffix" | transloco }}
					</div>
				</div>
				<button *ngIf="auth.isEditor()" class="btn btn--primary" (click)="createRequested.emit()">
					<sb-icon name="plus" [size]="16"></sb-icon>
					{{ "pages.stacks.add" | transloco }}
				</button>
			</div>
			<sb-data-table [columns]="cols()" [rows]="rows" [searchKeys]="['name', 'status']" (rowClick)="open($event.name)">
				<ng-template #cell let-row let-key="key">
					<ng-container [ngSwitch]="key">
						<span
							*ngSwitchCase="'name'"
							style="display:inline-flex; align-items:center; gap:10px"
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
		TranslocoPipe,
	],
})
export class StacksPageComponent {
	@Output() createRequested = new EventEmitter<void>();
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	private readonly router = inject(Router);
	readonly auth = inject(AuthService);
	readonly orch = inject(OrchestratorStateService);

	open(name: string): void {
		this.router.navigate(["/stacks", name]);
	}

	private readonly baseCols = translatedColumns<Stack>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "pages.stacks.columns.stack" },
		{ key: "services", labelKey: "pages.stacks.columns.services", align: "right" },
		{ key: "networks", labelKey: "pages.stacks.columns.networks", align: "right" },
		{ key: "volumes", labelKey: "pages.stacks.columns.volumes", align: "right" },
		{ key: "configs", labelKey: "pages.stacks.columns.configs", align: "right" },
		{ key: "secrets", labelKey: "pages.stacks.columns.secrets", align: "right" },
		{ key: "status", labelKey: "columns.status" },
	]);

	/** Mode-dependent "name" column header: "Stack" becomes "Namespace" on Kubernetes. */
	readonly cols = computed(() => {
		const columnKey = this.orch.stackColumnKey();
		return this.baseCols().map((c) =>
			c.key === "name" ? { ...c, label: this.transloco.translate(columnKey) } : c
		);
	});

	readonly rows$: Observable<Stack[]> = this.apollo
		.watchQuery<{ stacks: Stack[] }>({ query: QUERY_STACKS, pollInterval: 30_000 })
		.valueChanges.pipe(map((x) => (x.data?.stacks ?? []) as Stack[]));
}
