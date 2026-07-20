import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { DecimalPipe, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { TranslocoPipe } from "@jsverse/transloco";
import { QUERY_TASK_DETAIL, QUERY_TASK_STATS } from "../../core/graphql.queries";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { SegmentedComponent } from "../../shared/segmented.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";

type TaskDetail = {
	id: string;
	name: string;
	image: string;
	node: string;
	nodeHostname: string | null;
	serviceName: string | null;
	status: string;
	desiredState: string | null;
	message: string | null;
	updated: string;
};

type Range = "15m" | "1h" | "6h" | "24h";

/** Single task's placement, status, and live CPU/memory history. */
@Component({
	selector: "sb-task-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgIf, DecimalPipe, TranslocoPipe, IconComponent, StatusBadgeComponent, SegmentedComponent, LineChartComponent],
	template: `
		@if (loading()) {
			<div class="t-empty">{{ "common.loading" | transloco }}</div>
		} @else if (task(); as t) {
			<div class="page-header" style="align-items:flex-start">
				<div>
					<button class="btn btn--ghost btn--sm" (click)="back()" style="margin-bottom:8px">
						<sb-icon name="chevronLeft" [size]="14"></sb-icon>
						{{ "pages.tasks.detail.back" | transloco }}
					</button>
					<h1 class="page-header__title" style="display:flex; align-items:center; gap:12px">
						<sb-icon name="tasks" [size]="20" style="color:var(--primary-500)"></sb-icon>
						{{ t.name }}
						<sb-status [status]="t.status"></sb-status>
					</h1>
					<div class="page-header__subtitle mono">
						{{ t.image }} · {{ "pages.tasks.detail.on" | transloco }} <strong style="color:var(--text-2)">{{ t.nodeHostname || t.node || "—" }}</strong>
					</div>
				</div>
			</div>

			<div class="card" style="margin-bottom:16px">
				<div class="card__body">
					<div class="meta-grid">
						<div class="meta">
							<div class="meta__label">{{ "pages.services.detail.serviceId" | transloco }}</div>
							<div class="meta__value mono" style="word-break:break-all">{{ t.id }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "columns.service" | transloco }}</div>
							<div class="meta__value">{{ t.serviceName || "—" }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "pages.tasks.detail.desiredState" | transloco }}</div>
							<div class="meta__value">{{ t.desiredState || "—" }}</div>
						</div>
						<div class="meta">
							<div class="meta__label">{{ "columns.updated" | transloco }}</div>
							<div class="meta__value">{{ t.updated }}</div>
						</div>
					</div>
				</div>
			</div>

			<div class="card" style="margin-bottom:16px" *ngIf="t.message">
				<div class="card__header">
					<div class="card__title">{{ "pages.tasks.detail.statusMessage" | transloco }}</div>
				</div>
				<div class="card__body mono" style="font-size:12.5px; color:var(--text-2)">{{ t.message }}</div>
			</div>

			<div class="card" style="margin-bottom:16px">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "dashboard.cpu" | transloco }}</div>
						<div style="font-size:12px; color:var(--muted); margin-top:2px">
							<strong class="mono" style="color:var(--text-2)">{{ lastCpu() | number: "1.0-1" }}%</strong>
						</div>
					</div>
					<sb-segmented [options]="rangeOpts" [value]="range()" (select)="onRangeChange($any($event))"></sb-segmented>
				</div>
				<div class="card__body" style="padding-top:8px">
					@if (cpuSeries().length > 1) {
						<sb-line-chart [width]="1000" [height]="200" [labels]="chartLabels()" [series]="cpuChartSeries()"></sb-line-chart>
					} @else {
						<div class="t-empty">{{ "pages.stacks.detail.noMetrics" | transloco }}</div>
					}
				</div>
			</div>

			<div class="card">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "dashboard.memory" | transloco }}</div>
						<div style="font-size:12px; color:var(--muted); margin-top:2px">
							<strong class="mono" style="color:var(--text-2)">{{ lastMemory() | number: "1.0-1" }}%</strong>
						</div>
					</div>
				</div>
				<div class="card__body" style="padding-top:8px">
					@if (memorySeries().length > 1) {
						<sb-line-chart [width]="1000" [height]="200" [labels]="chartLabels()" [series]="memoryChartSeries()"></sb-line-chart>
					} @else {
						<div class="t-empty">{{ "pages.stacks.detail.noMetrics" | transloco }}</div>
					}
				</div>
			</div>
		} @else {
			<div class="t-empty">{{ "pages.tasks.detail.notFound" | transloco }}</div>
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
			.meta-grid {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 18px;
			}
			.meta__label {
				font-size: 11px;
				color: var(--muted);
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.meta__value {
				font-size: 14px;
				font-weight: 600;
				margin-top: 4px;
			}
		`,
	],
})
export class TaskDetailPageComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly apollo = inject(Apollo);
	private readonly destroyRef = inject(DestroyRef);

	private readonly id = this.route.snapshot.paramMap.get("id") || "";

	readonly loading = signal(true);
	readonly task = signal<TaskDetail | null>(null);

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
	readonly cpuChartSeries = computed<Series[]>(() => [
		{ name: "CPU", data: this.cpuSeries(), color: "var(--primary-500)" },
	]);
	readonly memoryChartSeries = computed<Series[]>(() => [
		{ name: "Memory", data: this.memorySeries(), color: "#3b82f6" },
	]);

	ngOnInit(): void {
		this.loadTask();
		this.loadStats();
	}

	private loadTask(): void {
		this.apollo
			.query<{ task: TaskDetail | null }>({
				query: QUERY_TASK_DETAIL,
				variables: { id: this.id },
				fetchPolicy: "network-only",
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				this.task.set(r.data?.task ?? null);
				this.loading.set(false);
			});
	}

	private loadStats(): void {
		this.apollo
			.query<{ taskStats: { labels: string[]; cpu: number[]; mem: number[] } }>({
				query: QUERY_TASK_STATS,
				variables: { id: this.id, range: this.range() },
				fetchPolicy: "network-only",
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((r) => {
				const data = r.data?.taskStats;
				this.cpuSeries.set(data?.cpu ?? []);
				this.memorySeries.set(data?.mem ?? []);
				this.chartLabels.set(data?.labels ?? []);
			});
	}

	onRangeChange(v: Range): void {
		this.range.set(v);
		this.loadStats();
	}

	back(): void {
		this.router.navigate(["/tasks"]);
	}
}
