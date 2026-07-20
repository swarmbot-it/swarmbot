import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { DecimalPipe, NgFor, NgIf, NgSwitch, NgSwitchCase } from "@angular/common";
import { Apollo } from "apollo-angular";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { translatedColumns } from "../../core/i18n/page-columns.helper";
import { ToastService } from "../../core/toast.service";
import { AuthService } from "../../core/auth.service";
import {
	MUTATION_DEACTIVATE_STACK,
	MUTATION_REACTIVATE_STACK,
	MUTATION_REDEPLOY_STACK,
	MUTATION_REMOVE_STACK,
	MUTATION_ROLLBACK_STACK,
	QUERY_STACK_RESOURCES,
	QUERY_STACK_STATS,
} from "../../core/graphql.queries";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { DonutComponent } from "../../shared/donut.component";
import { SparklineComponent } from "../../shared/sparkline.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";
import { DataTableComponent } from "../../shared/data-table.component";
import { deriveStackStatus } from "../../shared/stack-status.util";

type Service = {
	id: string;
	name: string;
	image?: string | null;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
	stack: string | null;
};
type Network = {
	id: string;
	name: string;
	driver: string;
	subnet: string | null;
	gateway: string | null;
	stack: string | null;
};
type Volume = { name: string; driver: string; mountpoint: string | null; stack: string | null };
type NamedRes = { id: string; name: string; updated: string | null; stack: string | null };
type Task = {
	id: string;
	name: string;
	serviceName: string | null;
	nodeHostname: string | null;
	status: string;
	desiredState: string | null;
};
type Range = "15m" | "1h" | "6h" | "24h";

/**
 * Single stack's composition (services, networks, volumes, secrets, configs),
 * live CPU/memory utilization, and lifecycle actions (redeploy, rollback,
 * scale to 0/1, remove).
 */
@Component({
	selector: "sb-stack-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		NgIf,
		NgFor,
		NgSwitch,
		NgSwitchCase,
		DecimalPipe,
		TranslocoPipe,
		IconComponent,
		StatusBadgeComponent,
		DonutComponent,
		SparklineComponent,
		SegmentedComponent,
		LineChartComponent,
		DataTableComponent,
	],
	template: `
		@if (loading()) {
			<div class="t-empty">{{ "common.loading" | transloco }}</div>
		} @else if (found()) {
			<div class="page-header" style="align-items:center">
				<div>
					<div class="crumb">
						<span class="crumb__link" (click)="back()">
							<sb-icon name="stacks" [size]="14"></sb-icon>
							{{ "nav.stacks" | transloco }}
						</span>
						<sb-icon name="chevronRight" [size]="12" style="color:var(--muted-2)"></sb-icon>
						<span>{{ stackName }}</span>
					</div>
					<div style="display:flex; align-items:center; gap:14px; margin-top:8px">
						<h1 class="page-header__title" style="margin:0">{{ stackName }}</h1>
						<sb-status [status]="status()"></sb-status>
					</div>
					<div class="page-header__subtitle" style="margin-top:6px">
						{{
							"pages.stacks.detail.countsSummary"
								| transloco
									: {
											services: servicesTotal().length,
											networks: networksTotal().length,
											volumes: volumesTotal().length,
											configs: configsTotal().length,
											secrets: secretsTotal().length,
									  }
						}}
					</div>
				</div>
				<div style="display:flex; gap:8px; align-items:center">
					<button class="btn btn--ghost btn--sm" (click)="back()">
						<sb-icon name="chevronLeft" [size]="14"></sb-icon>
						{{ "common.back" | transloco }}
					</button>
					<div class="splitbtn" *ngIf="auth.isEditor()">
						<button class="btn btn--primary splitbtn__main" [disabled]="busy()" (click)="edit()">
							<sb-icon name="settings" [size]="14"></sb-icon>
							{{ busy() ? ("pages.stacks.detail.working" | transloco) : ("pages.stacks.detail.edit" | transloco) }}
						</button>
						<button
							class="btn btn--primary splitbtn__caret"
							[disabled]="busy()"
							(click)="menuOpen.set(!menuOpen())"
						>
							<sb-icon name="chevronDown" [size]="14"></sb-icon>
						</button>
						@if (menuOpen()) {
							<div class="splitbtn__menu">
								<div class="splitbtn__item" (click)="redeploy()">
									<sb-icon name="refresh" [size]="14" style="color:var(--muted)"></sb-icon>
									<span>{{ "pages.stacks.detail.redeploy" | transloco }}</span>
									<span class="splitbtn__hint">{{ "pages.stacks.detail.redeployHint" | transloco }}</span>
								</div>
								<div class="splitbtn__item" (click)="rollback()">
									<sb-icon name="chevronLeft" [size]="14" style="color:var(--muted)"></sb-icon>
									<span>{{ "pages.stacks.detail.rollback" | transloco }}</span>
									<span class="splitbtn__hint">{{ "pages.stacks.detail.rollbackHint" | transloco }}</span>
								</div>
								@if (isDeactivated()) {
									<div class="splitbtn__item" (click)="reactivate()">
										<sb-icon name="play" [size]="14" style="color:var(--muted)"></sb-icon>
										<span>{{ "pages.stacks.detail.reactivate" | transloco }}</span>
										<span class="splitbtn__hint">{{ "pages.stacks.detail.reactivateHint" | transloco }}</span>
									</div>
								} @else {
									<div class="splitbtn__item" (click)="deactivate()">
										<sb-icon name="pause" [size]="14" style="color:var(--muted)"></sb-icon>
										<span>{{ "pages.stacks.detail.deactivate" | transloco }}</span>
										<span class="splitbtn__hint">{{ "pages.stacks.detail.deactivateHint" | transloco }}</span>
									</div>
								}
								<div class="splitbtn__sep"></div>
								<div class="splitbtn__item splitbtn__item--danger" (click)="remove()">
									<sb-icon name="trash" [size]="14"></sb-icon>
									<span>{{ "pages.stacks.detail.delete" | transloco }}</span>
								</div>
							</div>
						}
					</div>
				</div>
			</div>

			<div class="dash-grid">
				<div class="dash-tile">
					<sb-donut [value]="lastCpu()" [size]="84" [stroke]="12" color="var(--primary-500)" [label]="'dashboard.cpu' | transloco"></sb-donut>
					<div style="min-width:0">
						<div class="dash-tile__label">{{ "dashboard.cpu" | transloco }}</div>
						<div class="dash-tile__value">{{ lastCpu() | number: "1.0-1" }}<span>%</span></div>
						<sb-sparkline [data]="cpuSeries()" [width]="220" [height]="28" color="var(--primary-500)"></sb-sparkline>
					</div>
				</div>
				<div class="dash-tile">
					<sb-donut [value]="lastMemory()" [size]="84" [stroke]="12" color="#3b82f6" [label]="'dashboard.memory' | transloco"></sb-donut>
					<div style="min-width:0">
						<div class="dash-tile__label">{{ "dashboard.memory" | transloco }}</div>
						<div class="dash-tile__value">{{ lastMemory() | number: "1.0-1" }}<span>%</span></div>
						<sb-sparkline [data]="memorySeries()" [width]="220" [height]="28" color="#3b82f6"></sb-sparkline>
					</div>
				</div>
				<div class="dash-tile" [title]="'pages.stacks.detail.diskHint' | transloco">
					<sb-donut [value]="0" [size]="84" [stroke]="12" color="var(--muted-2)" label="N/A"></sb-donut>
					<div style="min-width:0">
						<div class="dash-tile__label">{{ "dashboard.disk" | transloco }}</div>
						<div class="dash-tile__value" style="color:var(--muted); font-size:20px">N/A</div>
						<div class="dash-tile__sub">{{ "pages.stacks.detail.diskNotTracked" | transloco }}</div>
					</div>
				</div>
			</div>

			<div class="card" style="margin-bottom:16px">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "pages.stacks.detail.utilization" | transloco }}</div>
						<div style="font-size:12px; color:var(--muted); margin-top:2px">
							{{ "pages.stacks.detail.utilizationHint" | transloco }}
						</div>
					</div>
					<sb-segmented [options]="rangeOpts" [value]="range()" (select)="onRangeChange($any($event))"></sb-segmented>
				</div>
				<div class="card__body" style="padding-top:8px">
					<div style="display:flex; gap:18px; margin-bottom:6px; font-size:12px">
						<span class="legend"
							><i style="background:var(--primary-500)"></i>{{ "dashboard.cpu" | transloco }}
							<strong>{{ lastCpu() | number: "1.0-1" }}%</strong></span
						>
						<span class="legend"
							><i style="background:#3b82f6"></i>{{ "dashboard.memory" | transloco }}
							<strong>{{ lastMemory() | number: "1.0-1" }}%</strong></span
						>
					</div>
					@if (cpuSeries().length > 1) {
						<sb-line-chart [width]="1000" [height]="220" [labels]="chartLabels()" [series]="chartSeries()"></sb-line-chart>
					} @else {
						<div class="t-empty">{{ "pages.stacks.detail.noMetrics" | transloco }}</div>
					}
				</div>
			</div>

			<div class="detail-section">
				<div class="detail-section__head">
					<div class="detail-section__title">
						<sb-icon name="services" [size]="14" style="color:var(--primary-500)"></sb-icon>
						{{ "nav.services" | transloco }}
						<span class="detail-section__count">{{ servicesTotal().length }}</span>
					</div>
				</div>
				<div class="detail-section__body">
					@if (servicesTotal().length === 0) {
						<div class="t-empty">{{ "pages.stacks.detail.noServices" | transloco }}</div>
					} @else {
						<sb-data-table [columns]="serviceCols()" [rows]="servicesTotal()" [searchKeys]="['name']">
							<ng-template #cell let-row let-key="key">
								<ng-container [ngSwitch]="key">
									<span *ngSwitchCase="'service'" style="display:flex; flex-direction:column; cursor:pointer" (click)="openService(row.id)">
										<strong>{{ row.name }}</strong>
										<span class="mono" style="font-size:11.5px; color:var(--muted); margin-top:2px">{{ row.image }}</span>
									</span>
									<ng-container *ngSwitchCase="'replicas'">
										<span *ngIf="row.replicasTotal === 0 && row.replicasRunning === 0" class="tag">{{
											"pages.stacks.detail.stopped" | transloco
										}}</span>
										<span *ngIf="row.replicasTotal === 0 && row.replicasRunning > 0" class="tag tag--warning">{{
											"pages.stacks.detail.stopping" | transloco
										}} ({{ row.replicasRunning }})</span>
										<div class="replica" *ngIf="row.replicasTotal > 0">
											<div class="replica__bar">
												<div
													class="replica__bar-fill"
													[style.width.%]="(row.replicasRunning / row.replicasTotal) * 100"
													[style.background]="row.replicasRunning < row.replicasTotal ? 'var(--warning)' : 'var(--success)'"
												></div>
											</div>
											<span class="replica__text">{{ row.replicasRunning }}/{{ row.replicasTotal }}</span>
										</div>
									</ng-container>
									<ng-container *ngSwitchCase="'ports'">
										<span *ngIf="row.ports.length === 0" style="color:var(--muted)">&mdash;</span>
										<div *ngIf="row.ports.length > 0" style="display:flex; flex-wrap:wrap; gap:4px">
											<span
												class="tag"
												style="background:var(--surface-2); color:var(--text-2); text-transform:none"
												*ngFor="let p of row.ports"
												>{{ p }}</span
											>
										</div>
									</ng-container>
									<sb-status *ngSwitchCase="'status'" [status]="statusFor(row.name)"></sb-status>
								</ng-container>
							</ng-template>
						</sb-data-table>
					}
				</div>
			</div>

			<div class="detail-grid">
				<div class="detail-section">
					<div class="detail-section__head">
						<div class="detail-section__title">
							<sb-icon name="networks" [size]="14" style="color:var(--primary-500)"></sb-icon>
							{{ "nav.networks" | transloco }}
							<span class="detail-section__count">{{ networksTotal().length }}</span>
						</div>
					</div>
					<div class="detail-section__body">
						@if (networksTotal().length === 0) {
							<div class="t-empty">{{ "pages.stacks.detail.noNetworks" | transloco }}</div>
						} @else {
							<sb-data-table [columns]="networkCols()" [rows]="networksTotal()" [searchKeys]="['name']" [pageSize]="5">
								<ng-template #cell let-row let-key="key">
									<ng-container [ngSwitch]="key">
										<strong *ngSwitchCase="'name'">{{ row.name }}</strong>
										<span *ngSwitchCase="'driver'" class="badge badge--neutral">{{ row.driver }}</span>
										<span *ngSwitchCase="'subnet'" class="mono">{{ row.subnet || "—" }}</span>
									</ng-container>
								</ng-template>
							</sb-data-table>
						}
					</div>
				</div>
				<div class="detail-section">
					<div class="detail-section__head">
						<div class="detail-section__title">
							<sb-icon name="volumes" [size]="14" style="color:var(--primary-500)"></sb-icon>
							{{ "nav.volumes" | transloco }}
							<span class="detail-section__count">{{ volumesTotal().length }}</span>
						</div>
					</div>
					<div class="detail-section__body">
						@if (volumesTotal().length === 0) {
							<div class="t-empty">{{ "pages.stacks.detail.noVolumes" | transloco }}</div>
						} @else {
							<sb-data-table [columns]="volumeCols()" [rows]="volumesTotal()" [searchKeys]="['name']" [pageSize]="5">
								<ng-template #cell let-row let-key="key">
									<ng-container [ngSwitch]="key">
										<strong *ngSwitchCase="'name'">{{ row.name }}</strong>
										<span *ngSwitchCase="'driver'" class="badge badge--neutral">{{ row.driver }}</span>
									</ng-container>
								</ng-template>
							</sb-data-table>
						}
					</div>
				</div>
			</div>

			<div class="detail-grid">
				<div class="detail-section">
					<div class="detail-section__head">
						<div class="detail-section__title">
							<sb-icon name="configs" [size]="14" style="color:var(--primary-500)"></sb-icon>
							{{ "nav.configs" | transloco }}
							<span class="detail-section__count">{{ configsTotal().length }}</span>
						</div>
					</div>
					<div class="detail-section__body">
						@if (configsTotal().length === 0) {
							<div class="t-empty">{{ "pages.stacks.detail.noConfigs" | transloco }}</div>
						} @else {
							<sb-data-table [columns]="namedCols()" [rows]="configsTotal()" [searchKeys]="['name']" [pageSize]="5"></sb-data-table>
						}
					</div>
				</div>
				<div class="detail-section">
					<div class="detail-section__head">
						<div class="detail-section__title">
							<sb-icon name="secrets" [size]="14" style="color:var(--primary-500)"></sb-icon>
							{{ "nav.secrets" | transloco }}
							<span class="detail-section__count">{{ secretsTotal().length }}</span>
						</div>
					</div>
					<div class="detail-section__body">
						@if (secretsTotal().length === 0) {
							<div class="t-empty">{{ "pages.stacks.detail.noSecrets" | transloco }}</div>
						} @else {
							<sb-data-table [columns]="namedCols()" [rows]="secretsTotal()" [searchKeys]="['name']" [pageSize]="5"></sb-data-table>
						}
					</div>
				</div>
			</div>
		} @else {
			<div class="t-empty">{{ "pages.stacks.detail.notFound" | transloco }}</div>
		}
	`,
	styles: [
		`
			.t-empty {
				padding: 40px;
				text-align: center;
				color: var(--muted);
				font-size: 13px;
			}
			.crumb {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 12.5px;
				color: var(--muted);
			}
			.crumb__link {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				cursor: pointer;
				color: var(--muted);
			}
			.crumb__link:hover {
				color: var(--text-2);
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
			.dash-tile__value {
				font-size: 26px;
				font-weight: 700;
				letter-spacing: -0.01em;
				font-variant-numeric: tabular-nums;
			}
			.dash-tile__value span {
				font-size: 14px;
				color: var(--muted);
				margin-left: 2px;
			}
			.dash-tile__sub {
				font-size: 12px;
				color: var(--muted);
				margin-top: 2px;
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
			.detail-section {
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-lg);
				box-shadow: var(--shadow-1);
				margin-bottom: 16px;
			}
			.detail-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px;
			}
			.detail-grid .detail-section {
				margin-bottom: 0;
			}
			.detail-section__head {
				padding: 16px 20px;
				border-bottom: 1px solid var(--border);
			}
			.detail-section__title {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 14px;
				font-weight: 600;
			}
			.detail-section__count {
				font-size: 11.5px;
				color: var(--muted);
				font-weight: 600;
				background: var(--surface-2);
				border-radius: 999px;
				padding: 1px 8px;
			}
			.detail-section__body {
				padding: 20px;
			}
			.replica {
				display: flex;
				align-items: center;
				gap: 8px;
			}
			.replica__bar {
				width: 60px;
				height: 6px;
				border-radius: 999px;
				background: var(--surface-2);
				overflow: hidden;
			}
			.replica__bar-fill {
				height: 100%;
				border-radius: 999px;
			}
			.replica__text {
				font-size: 11.5px;
				color: var(--muted);
				font-family: var(--font-mono);
			}
			.splitbtn {
				position: relative;
				display: inline-flex;
			}
			.splitbtn__main {
				border-top-right-radius: 0;
				border-bottom-right-radius: 0;
			}
			.splitbtn__caret {
				border-top-left-radius: 0;
				border-bottom-left-radius: 0;
				border-left: 1px solid rgba(255, 255, 255, 0.25);
				padding-left: 8px;
				padding-right: 8px;
			}
			.splitbtn__menu {
				position: absolute;
				top: calc(100% + 6px);
				right: 0;
				min-width: 220px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: var(--r-md);
				box-shadow: var(--shadow-3);
				padding: 6px;
				z-index: 20;
			}
			.splitbtn__item {
				display: flex;
				align-items: center;
				gap: 10px;
				padding: 8px 10px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
				white-space: nowrap;
			}
			.splitbtn__item:hover {
				background: var(--surface-2);
			}
			.splitbtn__hint {
				margin-left: auto;
				font-size: 11px;
				color: var(--muted);
			}
			.splitbtn__sep {
				height: 1px;
				background: var(--border);
				margin: 6px 4px;
			}
			.splitbtn__item--danger {
				color: var(--danger);
			}
		`,
	],
})
export class StackDetailPageComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly apollo = inject(Apollo);
	private readonly toast = inject(ToastService);
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);
	readonly auth = inject(AuthService);
	private readonly destroyRef = inject(DestroyRef);

	readonly stackName = this.route.snapshot.paramMap.get("name") || "";

	readonly loading = signal(true);
	readonly menuOpen = signal(false);
	readonly busy = signal(false);

	readonly range = signal<Range>("1h");
	readonly rangeOpts = [
		{ value: "15m", label: "15m" },
		{ value: "1h", label: "1h" },
		{ value: "6h", label: "6h" },
		{ value: "24h", label: "24h" },
	];
	readonly cpuSeries = signal<number[]>([]);
	readonly memorySeries = signal<number[]>([]);
	readonly chartLabels = signal<string[]>([]);
	readonly lastCpu = computed(() => this.cpuSeries().at(-1) ?? 0);
	readonly lastMemory = computed(() => this.memorySeries().at(-1) ?? 0);
	readonly chartSeries = computed<Series[]>(() => [
		{ name: "CPU", data: this.cpuSeries(), color: "var(--primary-500)" },
		{ name: "Memory", data: this.memorySeries(), color: "#3b82f6" },
	]);

	private readonly allServices = signal<Service[]>([]);
	private readonly allNetworks = signal<Network[]>([]);
	private readonly allVolumes = signal<Volume[]>([]);
	private readonly allSecrets = signal<NamedRes[]>([]);
	private readonly allConfigs = signal<NamedRes[]>([]);
	private readonly allTasks = signal<Task[]>([]);

	readonly servicesTotal = computed(() => this.allServices().filter((s) => s.stack === this.stackName));
	readonly networksTotal = computed(() => this.allNetworks().filter((n) => n.stack === this.stackName));
	readonly volumesTotal = computed(() => this.allVolumes().filter((v) => v.stack === this.stackName));
	readonly secretsTotal = computed(() => this.allSecrets().filter((s) => s.stack === this.stackName));
	readonly configsTotal = computed(() => this.allConfigs().filter((c) => c.stack === this.stackName));

	readonly found = computed(
		() =>
			this.servicesTotal().length > 0 ||
			this.networksTotal().length > 0 ||
			this.volumesTotal().length > 0 ||
			this.secretsTotal().length > 0 ||
			this.configsTotal().length > 0
	);

	readonly stackTasks = computed(() => {
		const names = new Set(this.servicesTotal().map((s) => s.name));
		return this.allTasks().filter((t) => t.serviceName && names.has(t.serviceName));
	});
	readonly status = computed(() => deriveStackStatus(this.stackTasks()));
	readonly isDeactivated = computed(
		() => this.servicesTotal().length > 0 && this.servicesTotal().every((s) => s.replicasTotal === 0)
	);

	readonly serviceCols = translatedColumns<Service>(this.transloco, this.i18n.activeLang, [
		{ key: "service", labelKey: "pages.services.columns.service" },
		{ key: "replicas", labelKey: "pages.services.columns.replicas" },
		{ key: "ports", labelKey: "pages.services.columns.ports" },
		{ key: "status", labelKey: "columns.status" },
	]);
	readonly networkCols = translatedColumns<Network>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "driver", labelKey: "columns.driver" },
		{ key: "subnet", labelKey: "columns.subnet" },
	]);
	readonly volumeCols = translatedColumns<Volume>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
		{ key: "driver", labelKey: "columns.driver" },
	]);
	readonly namedCols = translatedColumns<NamedRes>(this.transloco, this.i18n.activeLang, [
		{ key: "name", labelKey: "columns.name" },
	]);

	ngOnInit(): void {
		this.load();
		this.loadStats();
	}

	private load(): void {
		this.apollo
			.watchQuery<{
				services: Service[];
				networks: Network[];
				volumes: Volume[];
				secrets: NamedRes[];
				configs: NamedRes[];
				tasks: Task[];
			}>({ query: QUERY_STACK_RESOURCES, fetchPolicy: "network-only" })
			.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				this.allServices.set((r.data?.services ?? []) as Service[]);
				this.allNetworks.set((r.data?.networks ?? []) as Network[]);
				this.allVolumes.set((r.data?.volumes ?? []) as Volume[]);
				this.allSecrets.set((r.data?.secrets ?? []) as NamedRes[]);
				this.allConfigs.set((r.data?.configs ?? []) as NamedRes[]);
				this.allTasks.set((r.data?.tasks ?? []) as Task[]);
				this.loading.set(false);
			});
	}

	private loadStats(): void {
		this.apollo
			.query<{ stackStats: { labels: string[]; cpu: number[]; mem: number[] } }>({
				query: QUERY_STACK_STATS,
				variables: { name: this.stackName, range: this.range() },
				fetchPolicy: "network-only",
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				const data = r.data?.stackStats;
				this.cpuSeries.set(data?.cpu ?? []);
				this.memorySeries.set(data?.mem ?? []);
				this.chartLabels.set(data?.labels ?? []);
			});
	}

	onRangeChange(v: Range): void {
		this.range.set(v);
		this.loadStats();
	}

	/** Swarm reschedules/stops tasks asynchronously, so re-fetch a couple of times to catch the settled state. */
	private reloadAfterAction(): void {
		setTimeout(() => this.load(), 2500);
		setTimeout(() => this.load(), 6000);
	}

	tasksFor(serviceName: string): Task[] {
		return this.allTasks().filter((t) => t.serviceName === serviceName);
	}

	statusFor(serviceName: string): string {
		return deriveStackStatus(this.tasksFor(serviceName));
	}

	back(): void {
		this.router.navigate(["/stacks"]);
	}

	openService(id: string): void {
		this.router.navigate(["/services", id]);
	}

	edit(): void {
		this.menuOpen.set(false);
		this.toast.push("warn", this.transloco.translate("pages.stacks.detail.editUnsupported"));
	}

	redeploy(): void {
		this.menuOpen.set(false);
		if (this.isDeactivated()) {
			this.toast.push(
				"warn",
				this.transloco.translate("pages.stacks.detail.toastNothingToRedeploy", { name: this.stackName })
			);
			return;
		}
		this.busy.set(true);
		this.apollo
			.mutate<{ redeployStack: boolean }>({ mutation: MUTATION_REDEPLOY_STACK, variables: { name: this.stackName } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.stacks.detail.toastRedeploying", { name: this.stackName }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.stacks.detail.redeployFailed"));
				},
			});
	}

	rollback(): void {
		this.menuOpen.set(false);
		this.busy.set(true);
		this.apollo
			.mutate<{ rollbackStack: boolean }>({ mutation: MUTATION_ROLLBACK_STACK, variables: { name: this.stackName } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.stacks.detail.toastRolledBack", { name: this.stackName }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.stacks.detail.rollbackFailed"));
				},
			});
	}

	deactivate(): void {
		this.menuOpen.set(false);
		this.busy.set(true);
		this.apollo
			.mutate<{ deactivateStack: boolean }>({ mutation: MUTATION_DEACTIVATE_STACK, variables: { name: this.stackName } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.stacks.detail.toastDeactivated", { name: this.stackName }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.stacks.detail.deactivateFailed"));
				},
			});
	}

	reactivate(): void {
		this.menuOpen.set(false);
		this.busy.set(true);
		this.apollo
			.mutate<{ reactivateStack: boolean }>({ mutation: MUTATION_REACTIVATE_STACK, variables: { name: this.stackName } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.stacks.detail.toastReactivated", { name: this.stackName }));
					this.reloadAfterAction();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.stacks.detail.reactivateFailed"));
				},
			});
	}

	remove(): void {
		this.menuOpen.set(false);
		if (!confirm(this.transloco.translate("pages.stacks.detail.confirmRemove", { name: this.stackName }))) return;
		this.busy.set(true);
		this.apollo
			.mutate<{ removeStack: boolean }>({ mutation: MUTATION_REMOVE_STACK, variables: { name: this.stackName } })
			.subscribe({
				next: () => {
					this.busy.set(false);
					this.toast.push("success", this.transloco.translate("pages.stacks.detail.toastRemoved", { name: this.stackName }));
					this.back();
				},
				error: (err) => {
					this.busy.set(false);
					this.toast.push("error", err?.message || this.transloco.translate("pages.stacks.detail.removeFailed"));
				},
			});
	}
}
