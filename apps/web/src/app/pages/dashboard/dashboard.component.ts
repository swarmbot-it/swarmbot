import { ChangeDetectionStrategy, Component, effect, inject, signal } from "@angular/core";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { Apollo } from "apollo-angular";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { combineLatest, forkJoin, from, Observable, timer } from "rxjs";
import { map, startWith } from "rxjs/operators";

import { QUERY_METRICS_SERIES, QUERY_NODES, QUERY_OVERVIEW } from "../../core/graphql.queries";
import { BootService } from "../../core/boot.service";
import { DonutComponent } from "../../shared/donut.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import { TagComponent } from "../../shared/tag.component";
import { IconComponent } from "../../shared/icon.component";
import { lastSample, pctOrNa } from "../../core/metrics-display";

type Overview = {
	nodes: number;
	managers: number;
	workers: number;
	stacks: number;
	services: number;
	tasks: number;
	cpu: number | null;
	mem: number | null;
	disk: number | null;
	cpuCores: number | null;
	cpuUsed: number | null;
	memTotal: string | null;
	memUsed: string | null;
	diskTotal: string | null;
	diskUsed: string | null;
	stacksDelta?: string;
	servicesDelta?: string;
	tasksDelta?: string;
};

type NodeSummary = {
	id: string;
	hostname: string;
	ip: string;
	dockerVersion: string;
	role: string;
	tags: string[];
	cpu: number | null;
	mem: number | null;
	disk: number | null;
};

type MetricsResponse = {
	metricsSeries: { labels: string[]; cpu: number[]; mem: number[]; disk: number[] } | null;
};

/**
 * Cluster overview dashboard. Aggregates counts, resource donuts, metrics charts, and node summaries.
 */
@Component({
	selector: "sb-dashboard",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="vm$ | async as vm">
			<div class="page-header">
				<div>
					<h1 class="page-header__title">{{ "dashboard.title" | transloco }}</h1>
					<div class="page-header__subtitle">
						{{
							"dashboard.subtitle"
								| transloco
									: {
											cluster: "prod-eu-1",
											nodes: vm.overview.nodes,
											services: vm.overview.services,
											tasks: vm.overview.tasks,
									  }
						}}
					</div>
				</div>
				<div style="display:flex; gap:8px; align-items:center;">
					<span style="font-size:12px; color: var(--muted)">{{
						"dashboard.liveRefreshed" | transloco
					}}</span>
					<button class="btn btn--secondary btn--sm" (click)="refresh()">
						<sb-icon name="refresh" [size]="14"></sb-icon>
						{{ "dashboard.refresh" | transloco }}
					</button>
				</div>
			</div>

			<!-- Summary counters -->
			<div class="dash-summary">
				<div class="summary-card">
					<div class="summary-card__label">{{ "nav.stacks" | transloco }}</div>
					<div class="summary-card__value">{{ vm.overview.stacks }}</div>
					<div class="summary-card__delta" *ngIf="vm.overview.stacksDelta as d">
						▲ {{ d }} <span>{{ "dashboard.thisWeek" | transloco }}</span>
					</div>
				</div>
				<div class="summary-card">
					<div class="summary-card__label">{{ "nav.services" | transloco }}</div>
					<div class="summary-card__value">{{ vm.overview.services }}</div>
					<div class="summary-card__delta" *ngIf="vm.overview.servicesDelta as d">
						▲ {{ d }} <span>{{ "dashboard.thisWeek" | transloco }}</span>
					</div>
				</div>
				<div class="summary-card">
					<div class="summary-card__label">{{ "nav.tasks" | transloco }}</div>
					<div class="summary-card__value">{{ vm.overview.tasks }}</div>
					<div
						class="summary-card__delta summary-card__delta--down"
						*ngIf="vm.overview.tasksDelta as d"
					>
						▼ {{ d }} <span>{{ "dashboard.thisWeek" | transloco }}</span>
					</div>
				</div>
				<div class="summary-card">
					<div class="summary-card__label">{{ "nav.nodes" | transloco }}</div>
					<div class="summary-card__value">
						{{ vm.overview.nodes }}
						<small>{{ vm.overview.managers }}M · {{ vm.overview.workers }}W</small>
					</div>
				</div>
			</div>

			<!-- Donut tiles -->
			<div class="dash-grid">
				<div class="dash-tile">
					<sb-donut
						[value]="vm.overview.cpu"
						[naLabel]="'common.na' | transloco"
						[size]="96"
						[stroke]="14"
						color="var(--primary-500)"
					></sb-donut>
					<div>
						<div class="dash-tile__label">{{ "dashboard.cpu" | transloco }}</div>
						<div class="dash-tile__value-spacer" aria-hidden="true"></div>
						<div
							class="dash-tile__sub"
							*ngIf="vm.overview.cpuUsed != null || vm.overview.cpuCores != null"
						>
							<strong>{{ cap(vm.overview.cpuUsed) }}</strong> /
							{{ cap(vm.overview.cpuCores) }}
							<span *ngIf="vm.overview.cpuCores != null">{{
								"dashboard.cores" | transloco
							}}</span>
						</div>
						<div class="dash-tile__sub">{{ "dashboard.cpuSub" | transloco }}</div>
					</div>
				</div>
				<div class="dash-tile">
					<sb-donut
						[value]="vm.overview.mem"
						[naLabel]="'common.na' | transloco"
						[size]="96"
						[stroke]="14"
						color="#3b82f6"
					></sb-donut>
					<div>
						<div class="dash-tile__label">{{ "dashboard.memory" | transloco }}</div>
						<div class="dash-tile__value-spacer" aria-hidden="true"></div>
						<div
							class="dash-tile__sub"
							*ngIf="vm.overview.memUsed != null || vm.overview.memTotal != null"
						>
							<strong>{{ cap(vm.overview.memUsed) }}</strong> /
							{{ cap(vm.overview.memTotal) }}
						</div>
						<div class="dash-tile__sub">{{ "dashboard.memSub" | transloco }}</div>
					</div>
				</div>
				<div class="dash-tile">
					<sb-donut
						[value]="vm.overview.disk"
						[naLabel]="'common.na' | transloco"
						[size]="96"
						[stroke]="14"
						color="#10b981"
					></sb-donut>
					<div>
						<div class="dash-tile__label">{{ "dashboard.disk" | transloco }}</div>
						<div class="dash-tile__value-spacer" aria-hidden="true"></div>
						<div
							class="dash-tile__sub"
							*ngIf="vm.overview.diskUsed != null || vm.overview.diskTotal != null"
						>
							<strong>{{ cap(vm.overview.diskUsed) }}</strong> /
							{{ cap(vm.overview.diskTotal) }}
						</div>
						<div class="dash-tile__sub">{{ "dashboard.diskSub" | transloco }}</div>
					</div>
				</div>
			</div>

			<!-- Histogram -->
			<div class="card" style="margin-bottom: 16px;">
				<div class="card__header">
					<div>
						<div class="card__title">
							{{ "dashboard.resourceUtilization" | transloco }}
						</div>
						<div style="font-size:12px; color: var(--muted); margin-top: 2px;">
							{{ "dashboard.influxHint" | transloco }}
						</div>
					</div>
					<sb-segmented
						[options]="ranges"
						[value]="range()"
						(select)="range.set($any($event))"
					>
					</sb-segmented>
				</div>
				<div class="card__body" style="padding-top: 8px;">
					<ng-container *ngIf="vm.metrics !== undefined; else loadingChart">
						<ng-container *ngIf="vm.metrics; else noMetrics">
							<div
								style="display:flex; gap: 18px; margin-bottom: 6px; font-size: 12px;"
							>
								<span class="legend"
									><i style="background: var(--primary-500)"></i
									>{{ "dashboard.cpu" | transloco }}
									<strong
										>{{ pct(last(vm.metrics.cpu))
										}}<span *ngIf="last(vm.metrics.cpu) != null"
											>%</span
										></strong
									></span
								>
								<span class="legend"
									><i style="background:#3b82f6"></i
									>{{ "dashboard.memory" | transloco }}
									<strong
										>{{ pct(last(vm.metrics.mem))
										}}<span *ngIf="last(vm.metrics.mem) != null"
											>%</span
										></strong
									></span
								>
								<span class="legend"
									><i style="background:#10b981"></i
									>{{ "dashboard.disk" | transloco }}
									<strong
										>{{ pct(last(vm.metrics.disk))
										}}<span *ngIf="last(vm.metrics.disk) != null"
											>%</span
										></strong
									></span
								>
							</div>
							<sb-line-chart
								[labels]="vm.metrics.labels"
								[series]="seriesFor(vm.metrics)"
								[width]="1000"
								[height]="200"
							>
							</sb-line-chart>
						</ng-container>
					</ng-container>
					<ng-template #loadingChart>
						<div style="color: var(--muted); padding: 32px 0;">
							{{ "dashboard.loadingMetrics" | transloco }}
						</div>
					</ng-template>
					<ng-template #noMetrics>
						<div class="metrics-empty">
							{{ "dashboard.noMetrics" | transloco }}
						</div>
					</ng-template>
				</div>
			</div>

			<!-- Nodes summary -->
			<div class="card">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "dashboard.nodesTitle" | transloco }}</div>
						<div style="font-size:12px; color: var(--muted); margin-top: 2px;">
							{{
								"dashboard.nodesSubtitle"
									| transloco
										: {
												count: vm.nodes.length,
												managers: vm.overview.managers,
												workers: vm.overview.workers,
										  }
							}}
						</div>
					</div>
				</div>
				<div class="card__body">
					<div class="nodes-summary">
						<div class="nodes-bucket">
							<div class="nodes-bucket__title">
								<sb-icon name="leader" [size]="14"></sb-icon>
								{{ "dashboard.managers" | transloco }}
								<span class="nodes-bucket__count">{{ vm.overview.managers }}</span>
							</div>
							<div *ngFor="let n of managers(vm.nodes)" class="node-row">
								<span
									class="dot"
									[class.dot--warning]="n.tags.includes('DRAIN')"
									[class.dot--success]="!n.tags.includes('DRAIN')"
								></span>
								<span class="node-row__name">{{ n.hostname }}</span>
								<span class="node-row__ip">{{ n.ip }}</span>
								<span class="node-row__spacer"></span>
								<sb-tag
									*ngIf="n.tags.includes('LEADER')"
									[text]="'dashboard.tags.leader' | transloco"
									>{{ "dashboard.tags.leader" | transloco }}</sb-tag
								>
								<span class="node-row__usage"
									>{{ pct(n.cpu) }}<span *ngIf="n.cpu != null">%</span></span
								>
							</div>
						</div>
						<div class="nodes-bucket">
							<div class="nodes-bucket__title">
								<sb-icon name="server" [size]="14"></sb-icon>
								{{ "dashboard.workers" | transloco }}
								<span class="nodes-bucket__count">{{ vm.overview.workers }}</span>
							</div>
							<div *ngFor="let n of workers(vm.nodes)" class="node-row">
								<span
									class="dot"
									[class.dot--warning]="n.tags.includes('DRAIN')"
									[class.dot--success]="!n.tags.includes('DRAIN')"
								></span>
								<span class="node-row__name">{{ n.hostname }}</span>
								<span class="node-row__ip">{{ n.ip }}</span>
								<span class="node-row__spacer"></span>
								<sb-tag
									*ngIf="n.tags.includes('DRAIN')"
									[text]="'dashboard.tags.drain' | transloco"
									>{{ "dashboard.tags.drain" | transloco }}</sb-tag
								>
								<span class="node-row__usage"
									>{{ pct(n.cpu) }}<span *ngIf="n.cpu != null">%</span></span
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		</ng-container>
	`,
	styles: [
		`
			.dash-summary {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 16px;
				margin-bottom: 16px;
			}
			.summary-card {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				padding: 16px 18px;
				box-shadow: var(--shadow-1);
			}
			.summary-card__label {
				font-size: 12px;
				color: var(--muted);
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.summary-card__value {
				font-size: 22px;
				font-weight: 700;
				margin-top: 6px;
				display: flex;
				align-items: baseline;
				gap: 6px;
			}
			.summary-card__value small {
				font-size: 13px;
				color: var(--muted);
				font-weight: 600;
			}
			.dash-grid {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 16px;
				margin-bottom: 16px;
			}
			.dash-tile {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				padding: 20px;
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 18px;
				align-items: center;
				box-shadow: var(--shadow-1);
			}
			.dash-tile__label {
				font-size: 12px;
				color: var(--muted);
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.dash-tile__value-spacer {
				min-height: 30px;
				margin: 4px 0 6px;
			}
			.dash-tile__sub {
				font-size: 12px;
				color: var(--muted);
				margin-top: 2px;
			}
			.dash-tile__sub strong {
				color: var(--text-2);
				font-weight: 600;
			}
			.legend {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				color: var(--muted);
			}
			.legend i {
				display: inline-block;
				width: 10px;
				height: 10px;
				border-radius: 3px;
			}
			.legend strong {
				font-family: var(--font-mono);
				font-weight: 600;
				color: var(--text);
				margin-left: 4px;
			}
			.metrics-empty {
				color: var(--muted);
				padding: 32px 0;
				font-size: 13px;
			}
			.nodes-summary {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px;
			}
			.nodes-bucket {
				display: flex;
				flex-direction: column;
				gap: 10px;
			}
			.nodes-bucket__title {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 13px;
				font-weight: 700;
				color: var(--primary-500);
			}
			.nodes-bucket__count {
				font-size: 11px;
				color: var(--muted);
				font-weight: 600;
				margin-left: 4px;
			}
			.node-row {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 10px 12px;
				background: var(--surface-2);
				border-radius: var(--r-md);
				font-size: 12.5px;
			}
			.node-row__name {
				font-weight: 600;
			}
			.node-row__ip {
				color: var(--muted);
				font-family: var(--font-mono);
				font-size: 11.5px;
			}
			.node-row__spacer {
				flex: 1;
			}
			.node-row__usage {
				font-size: 11.5px;
				color: var(--muted);
				font-family: var(--font-mono);
				min-width: 40px;
				text-align: right;
			}
			.summary-card__delta {
				font-size: 11.5px;
				font-weight: 600;
				color: var(--success);
				display: inline-flex;
				align-items: center;
				gap: 3px;
				margin-top: 4px;
			}
			.summary-card__delta span {
				color: var(--muted);
				font-weight: 500;
			}
			.summary-card__delta--down {
				color: var(--danger);
			}
		`,
	],
	imports: [
		NgIf,
		NgFor,
		AsyncPipe,
		TranslocoPipe,
		DonutComponent,
		LineChartComponent,
		SegmentedComponent,
		IconComponent,
		TagComponent,
	],
})
export class DashboardComponent {
	private readonly apollo = inject(Apollo);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	private readonly bootService = inject(BootService);

	readonly ranges = [
		{ value: "15m", label: "15m" },
		{ value: "1h", label: "1h" },
		{ value: "6h", label: "6h" },
		{ value: "24h", label: "24h" },
	];

	readonly range = signal<"15m" | "1h" | "6h" | "24h">("1h");

	private readonly overviewRef = this.apollo.watchQuery<{ overview: Overview }>({
		query: QUERY_OVERVIEW,
		pollInterval: 30_000,
	});

	private readonly nodesRef = this.apollo.watchQuery<{ nodes: NodeSummary[] }>({
		query: QUERY_NODES,
		pollInterval: 30_000,
	});

	private readonly metricsRef = this.apollo.watchQuery<MetricsResponse>({
		query: QUERY_METRICS_SERIES,
		variables: { input: { range: this.range(), resolution: "high" } },
		fetchPolicy: "network-only",
	});

	constructor() {
		effect(() => {
			void this.metricsRef.refetch({ input: { range: this.range(), resolution: "high" } });
		});
	}

	refresh(): void {
		this.bootService.startRefresh();

		forkJoin([
			forkJoin([
				from(this.overviewRef.refetch()),
				from(this.nodesRef.refetch()),
				from(
					this.metricsRef.refetch({ input: { range: this.range(), resolution: "high" } })
				),
			]),
			timer(500),
		]).subscribe({
			next: () => this.bootService.endRefresh(),
			error: () => this.bootService.endRefresh(),
		});
	}

	private readonly overview$ = this.overviewRef.valueChanges.pipe(
		map((x) => (x.data?.overview ?? {}) as Overview)
	);

	private readonly nodes$ = this.nodesRef.valueChanges.pipe(
		map((x) => (x.data?.nodes ?? []) as NodeSummary[])
	);

	private readonly metrics$ = this.metricsRef.valueChanges.pipe(
		map((x) => x.data?.metricsSeries as MetricsResponse["metricsSeries"] | undefined),
		startWith(undefined)
	);

	readonly vm$: Observable<{
		overview: Overview;
		nodes: NodeSummary[];
		metrics: MetricsResponse["metricsSeries"] | null | undefined;
	}> = combineLatest([this.overview$, this.nodes$, this.metrics$]).pipe(
		map(([overview, nodes, metrics]) => ({ overview, nodes, metrics }))
	);

	pct(value: number | null | undefined): string {
		return pctOrNa(value, this.transloco.translate("common.na"));
	}

	cap(value: number | string | null | undefined): string {
		return value == null ? this.transloco.translate("common.na") : String(value);
	}

	last = lastSample;

	seriesFor(metrics: NonNullable<MetricsResponse["metricsSeries"]>): Series[] {
		this.i18n.activeLang();
		return [
			{
				name: this.transloco.translate("dashboard.cpu"),
				data: metrics.cpu,
				color: "var(--primary-500)",
			},
			{
				name: this.transloco.translate("dashboard.memory"),
				data: metrics.mem,
				color: "#3b82f6",
			},
			{
				name: this.transloco.translate("dashboard.disk"),
				data: metrics.disk,
				color: "#10b981",
			},
		];
	}

	managers(nodes: NodeSummary[]): NodeSummary[] {
		return nodes.filter((n) => n.role === "manager");
	}
	workers(nodes: NodeSummary[]): NodeSummary[] {
		return nodes.filter((n) => n.role === "worker");
	}
}
