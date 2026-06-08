import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { AsyncPipe, NgFor, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { combineLatest, map, switchMap } from "rxjs";
import { TranslocoPipe } from "@jsverse/transloco";
import { I18nStateService } from "../../core/i18n/i18n-state.service";
import { QUERY_METRICS_SERIES, QUERY_TASKS } from "../../core/graphql.queries";
import type { ChartRange } from "../../core/chart-range";
import { BackLinkComponent } from "../../shared/back-link.component";
import { IconComponent } from "../../shared/icon.component";
import { StatusBadgeComponent } from "../../shared/status-badge.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";
import { formatRelativeTime } from "../../core/relative-time";

type TaskRow = {
	id: string;
	name: string;
	image: string;
	node: string;
	status: string;
	cpu: number;
	mem: number;
	updatedAt: string;
	cpuSeries: number[];
	memSeries: number[];
};

function digestFromId(id: string): string {
	let hex = "";
	for (let i = 0; i < 64; i++) {
		const c = id.charCodeAt(i % id.length) ^ (i * 17);
		hex += (c % 16).toString(16);
	}
	return `sha256:${hex}`;
}

@Component({
	selector: "sb-task-detail-page",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-container *ngIf="vm$ | async as vm">
			<sb-back-link link="/app/tasks" [label]="'pages.taskDetail.back' | transloco"></sb-back-link>
			<div class="page-header">
				<div>
					<h1 class="page-header__title" style="display:flex;align-items:center;gap:14px;">
						<sb-icon name="tasks" [size]="22"></sb-icon>
						{{ vm.task?.name }}
						<sb-status *ngIf="vm.task" [status]="vm.task.status ?? 'UNKNOWN'"></sb-status>
					</h1>
					<div class="page-header__subtitle mono" style="font-size:12.5px">
						{{ vm.task?.image }}
						{{ "pages.taskDetail.on" | transloco }}
						<strong style="color:var(--text-2)">{{ vm.task?.node }}</strong>
					</div>
				</div>
			</div>

			<div class="task-detail__hero" *ngIf="vm.task">
				<div class="svc-meta" *ngFor="let f of vm.metaFields">
					<div class="svc-meta__label">{{ f.label }}</div>
					<div class="svc-meta__value" [class.mono]="f.mono">
						<sb-status *ngIf="f.badge; else plain" [status]="f.value"></sb-status>
						<ng-template #plain>{{ f.value }}</ng-template>
					</div>
				</div>
			</div>

			<div class="card" style="margin-bottom:16px">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "pages.taskDetail.cpuUsage" | transloco }}</div>
						<div style="font-size:12px;color:var(--muted);margin-top:2px">
							{{ "pages.taskDetail.lastHour" | transloco }}
							<strong class="mono" style="color:var(--text-2)">{{ vm.task?.cpu }}%</strong>
						</div>
					</div>
				</div>
				<div class="card__body" style="padding-top:8px">
					<sb-line-chart
						*ngIf="vm.labels.length"
						[labels]="vm.labels"
						[series]="vm.cpuSeries"
						[height]="220"
					></sb-line-chart>
					<div *ngIf="!vm.labels.length" class="t-empty" style="padding:24px 0">
						{{ "pages.taskDetail.noMetrics" | transloco }}
					</div>
				</div>
			</div>
			<div class="card">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "pages.taskDetail.memUsage" | transloco }}</div>
						<div style="font-size:12px;color:var(--muted);margin-top:2px">
							{{ "pages.taskDetail.lastHour" | transloco }}
							<strong class="mono" style="color:var(--text-2)">{{ vm.task?.mem }}%</strong>
						</div>
					</div>
				</div>
				<div class="card__body" style="padding-top:8px">
					<sb-line-chart
						*ngIf="vm.labels.length"
						[labels]="vm.labels"
						[series]="vm.memSeries"
						[height]="220"
					></sb-line-chart>
					<div *ngIf="!vm.labels.length" class="t-empty" style="padding:24px 0">
						{{ "pages.taskDetail.noMetrics" | transloco }}
					</div>
				</div>
			</div>
		</ng-container>
	`,
	imports: [
		NgIf,
		NgFor,
		AsyncPipe,
		TranslocoPipe,
		BackLinkComponent,
		IconComponent,
		StatusBadgeComponent,
		LineChartComponent,
	],
})
export class TaskDetailPageComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly apollo = inject(Apollo);
	private readonly i18n = inject(I18nStateService);

	readonly vm$ = this.route.paramMap.pipe(
		switchMap((params) => {
			const id = params.get("id") ?? "";
			const range: ChartRange = "1h";
			return combineLatest([
				this.apollo.watchQuery<{ tasks: TaskRow[] }>({ query: QUERY_TASKS }).valueChanges,
				this.apollo.watchQuery<{
					metricsSeries: { labels: string[]; cpu: number[]; mem: number[] } | null;
				}>({
					query: QUERY_METRICS_SERIES,
					variables: { input: { range, resolution: "medium", taskId: id } },
					pollInterval: 30_000,
				}).valueChanges,
			]).pipe(
				map(([tasksRes, metricsRes]) => {
					const task = ((tasksRes.data?.tasks ?? []) as TaskRow[]).find(
						(t) => t.id === id
					);
					const locale = this.i18n.activeLang();
					const metrics = metricsRes.data?.metricsSeries;
					const labels = metrics?.labels ?? [];
					const cpuData = metrics?.cpu ?? [];
					const memData = metrics?.mem ?? [];
					return {
						task,
						labels,
						cpuSeries: [
							{ name: "CPU", data: cpuData, color: "var(--primary-500)" },
						] as Series[],
						memSeries: [{ name: "Memory", data: memData, color: "#3b82f6" }] as Series[],
						metaFields: task
							? [
									{
										label: "Task ID",
										value: task.id,
										mono: true,
									},
									{
										label: "Status",
										value: task.status ?? "UNKNOWN",
										badge: true,
									},
									{ label: "Image", value: task.image, mono: true },
									{
										label: "Image digest",
										value: digestFromId(task.id),
										mono: true,
									},
									{
										label: "Created",
										value: formatRelativeTime(task.updatedAt, locale),
									},
									{
										label: "Last updated",
										value: formatRelativeTime(task.updatedAt, locale),
									},
								]
							: [],
					};
				})
			);
		})
	);
}
