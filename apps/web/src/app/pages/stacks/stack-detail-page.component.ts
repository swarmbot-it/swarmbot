import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AsyncPipe, DecimalPipe, NgFor, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { combineLatest, map, switchMap } from "rxjs";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import {
	QUERY_METRICS_SERIES,
	QUERY_NETWORKS,
	QUERY_SECRETS,
	QUERY_CONFIGS,
	QUERY_SERVICES,
	QUERY_STACKS,
	QUERY_VOLUMES,
} from "../../core/graphql.queries";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { SplitButtonComponent } from "../../shared/split-button.component";
import { DonutComponent } from "../../shared/donut.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";
import { DataTableComponent } from "../../shared/data-table.component";
import { DetailSectionComponent } from "../../shared/detail-section.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import type { ChartRange } from "../../core/chart-range";
import { resourceBelongsToStack } from "../../core/stack-scope";
import { toObservable } from "@angular/core/rxjs-interop";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { OrchestratorStateService } from "../../core/orchestrator-state.service";

type StackRow = {
	name: string;
	services: number;
	networks: number;
	volumes: number;
	configs: number;
	secrets: number;
	status: string;
};
type ServiceRow = {
	id: string;
	name: string;
	image: string;
	status: string;
	stack: string | null;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
};
type NetworkRow = { name: string; driver: string; subnet: string; gateway: string };
type VolumeRow = { name: string; driver: string; size: string };
type NamedRow = { name: string; updated: string };

@Component({
	selector: "sb-stack-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="vm$ | async as vm">
			<div class="page-header page-header--stack">
				<div>
					<div class="stack-detail__crumb">
						<a class="stack-detail__crumb-link" routerLink="/app/stacks">
							<sb-icon name="stacks" [size]="14"></sb-icon>
							{{ orch.stacksNavKey() | transloco }}
						</a>
						<sb-icon name="chevronRight" [size]="12" style="color:var(--muted-2)"></sb-icon>
						<span>{{ vm.stack?.name }}</span>
					</div>
					<div class="stack-detail__title-row">
						<h1 class="page-header__title">{{ vm.stack?.name }}</h1>
						<sb-status *ngIf="vm.stack" [status]="vm.stack.status"></sb-status>
					</div>
					<div class="page-header__subtitle" *ngIf="vm.resourceSummary">
						{{ vm.resourceSummary }}
					</div>
				</div>
				<div class="page-header__actions">
					<a class="btn btn--secondary btn--sm" routerLink="/app/stacks">
						<sb-icon name="chevronLeft" [size]="14"></sb-icon>
						{{ "common.back" | transloco }}
					</a>
					<sb-split-button [actions]="stackActions" (action)="onAction($event)"></sb-split-button>
				</div>
			</div>

			<div class="dash-grid">
				<div class="dash-tile" *ngFor="let d of vm.donuts">
					<sb-donut
						[value]="d.value"
						[naLabel]="'common.na' | transloco"
						[size]="84"
						[stroke]="12"
						[color]="d.color"
						[label]="d.label"
					></sb-donut>
					<div class="dash-tile__side">
						<div class="dash-tile__label">{{ d.label }}</div>
						<div class="dash-tile__value" *ngIf="d.value != null">
							{{ d.value | number: "1.0-0"
							}}<span style="font-size:14px;color:var(--muted)">%</span>
						</div>
						<div class="dash-tile__value" *ngIf="d.value == null" style="font-size:22px">
							{{ "common.na" | transloco }}
						</div>
						<div class="dash-tile__spark" *ngIf="d.spark.length">
							<sb-sparkline
								[data]="d.spark"
								[width]="220"
								[height]="28"
								[color]="d.color"
							></sb-sparkline>
						</div>
					</div>
				</div>
			</div>

			<div class="card" style="margin-bottom:16px;">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "pages.stackDetail.utilization" | transloco }}</div>
						<div style="font-size:12px;color:var(--muted);margin-top:2px">
							{{ "pages.stackDetail.utilizationSub" | transloco: { count: vm.services.length } }}
						</div>
					</div>
					<sb-segmented
						[options]="rangeOptions"
						[value]="range()"
						(select)="range.set($any($event))"
					></sb-segmented>
				</div>
				<div class="card__body" style="padding-top:8px">
					<div
						style="display:flex;gap:18px;margin-bottom:6px;font-size:12px"
						*ngIf="vm.chartLabels.length && vm.chartLegend.length"
					>
						<span
							*ngFor="let leg of vm.chartLegend"
							style="display:inline-flex;align-items:center;gap:6px"
						>
							<span
								[style.width.px]="10"
								[style.height.px]="10"
								[style.borderRadius.px]="3"
								[style.background]="leg.color"
							></span>
							<span style="color:var(--muted)">{{ leg.name }}</span>
							<span class="mono" style="font-weight:600;margin-left:4px">{{
								leg.value != null ? leg.value + "%" : "—"
							}}</span>
						</span>
					</div>
					<sb-line-chart
						*ngIf="vm.chartLabels.length"
						[labels]="vm.chartLabels"
						[series]="vm.chartSeries"
						[height]="220"
					></sb-line-chart>
					<div *ngIf="!vm.chartLabels.length" class="t-empty" style="padding:24px 0">
						{{ "pages.stackDetail.noMetrics" | transloco }}
					</div>
				</div>
			</div>

			<sb-detail-section
				[title]="'pages.stacks.columns.services' | transloco"
				icon="services"
				[count]="vm.services.length"
			>
				<div *ngIf="!vm.services.length" class="t-empty">
					{{ "pages.stackDetail.noServices" | transloco }}
				</div>
				<sb-data-table
					*ngIf="vm.services.length"
					[columns]="serviceCols()"
					[rows]="vm.services"
					[pageSize]="8"
					[searchKeys]="['name', 'image', 'status']"
					[rowRoute]="serviceRowRoute"
				>
					<ng-template #cell let-row let-key="key">
						<div *ngIf="key === 'name'">
							<span class="link-name">{{ row.name }}</span>
							<div class="mono" style="font-size:11.5px;color:var(--muted);margin-top:2px">
								{{ row.image }}
							</div>
						</div>
						<div *ngIf="key === 'replicas'" class="replica">
							<div class="replica__bar">
								<div
									class="replica__bar-fill"
									[style.width.%]="row.replicaPct"
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
						<div *ngIf="key === 'ports'" style="display:flex;flex-wrap:wrap;gap:4px">
							<span
								*ngFor="let p of row.ports"
								class="tag"
								style="background:var(--surface-2);text-transform:none"
								>{{ p }}</span
							>
							<span *ngIf="!row.ports?.length">—</span>
						</div>
						<sb-status *ngIf="key === 'status'" [status]="row.status"></sb-status>
					</ng-template>
				</sb-data-table>
			</sb-detail-section>

			<div class="detail-grid">
				<sb-detail-section
					[title]="'pages.stacks.columns.networks' | transloco"
					icon="networks"
					[count]="vm.networks.length"
				>
					<div *ngIf="!vm.networks.length" class="t-empty">
						{{ "pages.stackDetail.noNetworks" | transloco }}
					</div>
					<sb-data-table
						*ngIf="vm.networks.length"
						[columns]="networkCols()"
						[rows]="vm.networks"
						[pageSize]="6"
						[searchKeys]="['name', 'driver']"
					>
						<ng-template #cell let-row let-key="key">
							<div
								*ngIf="key === 'name'"
								style="display:flex;align-items:center;gap:8px"
							>
								<sb-icon name="networks" [size]="13" style="color:var(--primary-500)"></sb-icon>
								<span style="font-weight:600">{{ row.name }}</span>
							</div>
							<span
								*ngIf="key === 'driver'"
								class="badge badge--neutral"
								style="text-transform:uppercase;font-size:10.5px;letter-spacing:.06em"
								>{{ row.driver }}</span
							>
							<span *ngIf="key === 'subnet'" class="mono">{{ row.subnet }}</span>
							<span *ngIf="key === 'gateway'" class="mono">{{ row.gateway }}</span>
						</ng-template>
					</sb-data-table>
				</sb-detail-section>

				<sb-detail-section
					[title]="'pages.stacks.columns.volumes' | transloco"
					icon="volumes"
					[count]="vm.volumes.length"
				>
					<div *ngIf="!vm.volumes.length" class="t-empty">
						{{ "pages.stackDetail.noVolumes" | transloco }}
					</div>
					<sb-data-table
						*ngIf="vm.volumes.length"
						[columns]="volumeCols()"
						[rows]="vm.volumes"
						[pageSize]="6"
						[searchKeys]="['name', 'driver']"
					>
						<ng-template #cell let-row let-key="key">
							<div
								*ngIf="key === 'name'"
								style="display:flex;align-items:center;gap:8px"
							>
								<sb-icon name="volumes" [size]="13" style="color:var(--primary-500)"></sb-icon>
								<span style="font-weight:600">{{ row.name }}</span>
							</div>
							<span
								*ngIf="key === 'driver'"
								class="badge badge--neutral"
								style="text-transform:uppercase;font-size:10.5px;letter-spacing:.06em"
								>{{ row.driver }}</span
							>
							<span *ngIf="key === 'size'" class="mono">{{ row.size }}</span>
						</ng-template>
					</sb-data-table>
				</sb-detail-section>
			</div>

			<div class="detail-grid">
				<sb-detail-section
					[title]="'pages.stackDetail.configs' | transloco"
					icon="configs"
					[count]="vm.configs.length"
				>
					<div *ngIf="!vm.configs.length" class="t-empty">
						{{ "pages.stackDetail.noConfigs" | transloco }}
					</div>
					<sb-data-table
						*ngIf="vm.configs.length"
						[columns]="namedCols()"
						[rows]="vm.configs"
						[pageSize]="6"
						[searchKeys]="['name']"
					>
						<ng-template #cell let-row let-key="key">
							<div
								*ngIf="key === 'name'"
								style="display:flex;align-items:center;gap:8px"
							>
								<sb-icon name="configs" [size]="13" style="color:var(--primary-500)"></sb-icon>
								<span class="mono" style="font-weight:600;font-size:12.5px">{{
									row.name
								}}</span>
							</div>
							<span *ngIf="key === 'updated'" class="mono">{{ row.updated }}</span>
						</ng-template>
					</sb-data-table>
				</sb-detail-section>

				<sb-detail-section
					[title]="'pages.stackDetail.secrets' | transloco"
					icon="secrets"
					[count]="vm.secrets.length"
				>
					<div *ngIf="!vm.secrets.length" class="t-empty">
						{{ "pages.stackDetail.noSecrets" | transloco }}
					</div>
					<sb-data-table
						*ngIf="vm.secrets.length"
						[columns]="namedCols()"
						[rows]="vm.secrets"
						[pageSize]="6"
						[searchKeys]="['name']"
					>
						<ng-template #cell let-row let-key="key">
							<div
								*ngIf="key === 'name'"
								style="display:flex;align-items:center;gap:8px"
							>
								<sb-icon name="secrets" [size]="13" style="color:var(--primary-500)"></sb-icon>
								<span class="mono" style="font-weight:600;font-size:12.5px">{{
									row.name
								}}</span>
							</div>
							<span *ngIf="key === 'updated'" class="mono">{{ row.updated }}</span>
						</ng-template>
					</sb-data-table>
				</sb-detail-section>
			</div>
		</ng-container>
	`,
	imports: [
		NgIf,
		NgFor,
		AsyncPipe,
		DecimalPipe,
		RouterLink,
		TranslocoPipe,
		IconComponent,
		StatusBadgeComponent,
		SplitButtonComponent,
		DonutComponent,
		SparklineComponent,
		LineChartComponent,
		SegmentedComponent,
		DataTableComponent,
		DetailSectionComponent,
	],
})
export class StackDetailPageComponent {
	private readonly route = inject(ActivatedRoute);
	readonly orch = inject(OrchestratorStateService);
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	readonly range = signal<ChartRange>("1h");
	readonly rangeOptions = [
		{ value: "15m", label: "15m" },
		{ value: "1h", label: "1h" },
		{ value: "6h", label: "6h" },
		{ value: "24h", label: "24h" },
	];
	private readonly range$ = toObservable(this.range);

	readonly stackActions = [
		{ id: "edit", label: "Edit", icon: "settings", primary: true },
		{ id: "redeploy", label: "Redeploy", icon: "refresh" },
		{ id: "rollback", label: "Rollback", icon: "rollback" },
		{ id: "deactivate", label: "Deactivate", icon: "pause" },
		{ id: "delete", label: "Delete", icon: "trash", danger: true, separator: true },
	];

	readonly serviceCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "pages.services.columns.service" },
		{ key: "replicas", labelKey: "columns.replicas", width: 180 },
		{ key: "ports", labelKey: "columns.ports" },
		{ key: "status", labelKey: "columns.status" },
	]);

	readonly networkCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "driver", labelKey: "columns.driver" },
		{ key: "subnet", labelKey: "columns.subnet" },
		{ key: "gateway", labelKey: "columns.gateway" },
	]);

	readonly volumeCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "driver", labelKey: "columns.driver" },
		{ key: "size", labelKey: "columns.size", align: "right" as const },
	]);

	readonly namedCols = translatedColumns(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "updated", labelKey: "columns.updated" },
	]);

	readonly vm$ = this.route.paramMap.pipe(
		switchMap((params) => {
			const name = params.get("name") ?? "";
			return combineLatest([
				this.apollo.watchQuery<{ stacks: StackRow[] }>({ query: QUERY_STACKS })
					.valueChanges,
				this.apollo.watchQuery<{ services: ServiceRow[] }>({ query: QUERY_SERVICES })
					.valueChanges,
				this.apollo.watchQuery<{ networks: NetworkRow[] }>({ query: QUERY_NETWORKS })
					.valueChanges,
				this.apollo.watchQuery<{ volumes: VolumeRow[] }>({ query: QUERY_VOLUMES })
					.valueChanges,
				this.apollo.watchQuery<{ configs: NamedRow[] }>({ query: QUERY_CONFIGS }).valueChanges,
				this.apollo.watchQuery<{ secrets: NamedRow[] }>({ query: QUERY_SECRETS }).valueChanges,
				this.range$.pipe(
					switchMap((range) =>
						this.apollo
							.watchQuery<{
								metricsSeries: {
									labels: string[];
									cpu: number[];
									mem: number[];
									disk: number[];
								} | null;
							}>({
								query: QUERY_METRICS_SERIES,
								variables: {
									input: { range, resolution: "medium", stack: name },
								},
							})
							.valueChanges
					)
				),
			]).pipe(
				map(([st, sv, nw, vol, cf, sec, met]) => {
					const stacks = (st.data?.stacks ?? []) as StackRow[];
					const stack = stacks.find((s) => s.name === name);
					const services = ((sv.data?.services ?? []) as ServiceRow[])
						.filter((s) => s.stack === name)
						.map((s) => ({
							...s,
							replicaPct:
								s.replicasTotal > 0
									? (s.replicasRunning / s.replicasTotal) * 100
									: 0,
						}));
					const metrics = met.data?.metricsSeries ?? null;
					const last = (arr: number[] | undefined) =>
						arr?.length ? arr[arr.length - 1] : null;
					const cpu = last(metrics?.cpu);
					const mem = last(metrics?.mem);
					const disk = last(metrics?.disk);
					const chartSeries: Series[] = metrics
						? [
								{
									name: "CPU",
									data: [...(metrics.cpu ?? [])],
									color: "var(--primary-500)",
								},
								{ name: "Memory", data: [...(metrics.mem ?? [])], color: "#3b82f6" },
								{ name: "Disk", data: [...(metrics.disk ?? [])], color: "#10b981" },
							]
						: [];
					const networks = ((nw.data?.networks ?? []) as NetworkRow[]).filter((n) =>
						resourceBelongsToStack(name, n.name)
					);
					const volumes = ((vol.data?.volumes ?? []) as VolumeRow[]).filter((v) =>
						resourceBelongsToStack(name, v.name)
					);
					const configs = ((cf.data?.configs ?? []) as NamedRow[]).filter((c) =>
						resourceBelongsToStack(name, c.name)
					);
					const secrets = ((sec.data?.secrets ?? []) as NamedRow[]).filter((s) =>
						resourceBelongsToStack(name, s.name)
					);
					const resourceSummary = stack
						? `${services.length} ${this.transloco.translate("pages.stacks.columns.services")} · ${networks.length} ${this.transloco.translate("pages.stacks.columns.networks")} · ${volumes.length} ${this.transloco.translate("pages.stacks.columns.volumes")} · ${configs.length} ${this.transloco.translate("pages.stacks.columns.configs")} · ${secrets.length} ${this.transloco.translate("pages.stacks.columns.secrets")}`
						: "";
					return {
						stack,
						services,
						networks,
						volumes,
						configs,
						secrets,
						resourceSummary,
						chartLabels: metrics?.labels ?? [],
						chartSeries,
						chartLegend: [
							{ name: "CPU", color: "var(--primary-500)", value: cpu },
							{ name: "Memory", color: "#3b82f6", value: mem },
							{ name: "Disk", color: "#10b981", value: disk },
						],
						donuts: [
							{
								label: "CPU",
								value: cpu ?? lastVal(metrics?.cpu),
								color: "var(--primary-500)",
								spark: metrics?.cpu ?? [],
							},
							{
								label: "Memory",
								value: mem ?? lastVal(metrics?.mem),
								color: "#3b82f6",
								spark: metrics?.mem ?? [],
							},
							{
								label: "Disk",
								value: disk ?? lastVal(metrics?.disk),
								color: "#10b981",
								spark: metrics?.disk ?? [],
							},
						],
					};
				})
			);
		})
	);

	readonly serviceRowRoute = (row: ServiceRow) => ["/app/services", row.id];

	onAction(_id: string): void {}
}

function lastVal(arr: number[] | undefined): number | null {
	if (!arr?.length) return null;
	return Math.round(arr[arr.length - 1]!);
}
