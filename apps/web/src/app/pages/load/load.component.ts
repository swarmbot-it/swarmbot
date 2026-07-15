import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { Apollo } from "apollo-angular";
import { TranslocoPipe } from "@jsverse/transloco";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { QUERY_STACKS, QUERY_STACK_STATS } from "../../core/graphql.queries";
import { SegmentedComponent } from "../../shared/segmented.component";
import { LineChartComponent, Series } from "../../shared/line-chart.component";

type StackStatsResponse = { stackStats: { labels: string[]; cpu: number[]; mem: number[] } };

interface StackSeries {
	name: string;
	color: string;
	cpu: number[];
	mem: number[];
	labels: string[];
}

const PALETTE = ["#f97316", "#3b82f6", "#10b981", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];

/**
 * Top stacks by CPU/memory usage, each rendered as its own line in two
 * cluster-wide charts. Complements the per-cluster donuts on the Dashboard.
 */
@Component({
	selector: "sb-load",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgIf, NgFor, TranslocoPipe, SegmentedComponent, LineChartComponent],
	template: `
		<div class="page-header">
			<div>
				<h1 class="page-header__title">{{ "load.title" | transloco }}</h1>
				<div class="page-header__subtitle">
					{{ "load.subtitle" | transloco: { count: top().length } }}
				</div>
			</div>
			<sb-segmented [options]="ranges" [value]="range()" (select)="onRangeChange($any($event))">
			</sb-segmented>
		</div>

		<div class="card" *ngIf="loading()">
			<div class="card__body" style="color:var(--muted); padding:32px 0; text-align:center">
				{{ "load.loading" | transloco }}
			</div>
		</div>

		<div class="card" *ngIf="!loading() && top().length === 0">
			<div class="card__body" style="color:var(--muted); padding:32px 0; text-align:center">
				{{ "load.empty" | transloco }}
			</div>
		</div>

		<ng-container *ngIf="!loading() && top().length > 0">
			<div class="load-legend">
				<span class="load-legend__item" *ngFor="let s of top()">
					<span class="load-legend__swatch" [style.background]="s.color"></span>
					<span>{{ s.name }}</span>
				</span>
			</div>

			<div class="card" style="margin-bottom:16px">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "load.cpu" | transloco }}</div>
						<div style="font-size:12px; color:var(--muted); margin-top:2px">
							{{ "load.peak" | transloco }}
							<strong class="mono" style="color:var(--text-2)">{{ peak("cpu") }}%</strong>
						</div>
					</div>
				</div>
				<div class="card__body" style="padding-top:8px">
					<sb-line-chart
						[width]="1100"
						[height]="220"
						[labels]="labels()"
						[series]="seriesFor('cpu')"
					></sb-line-chart>
				</div>
			</div>

			<div class="card">
				<div class="card__header">
					<div>
						<div class="card__title">{{ "load.memory" | transloco }}</div>
						<div style="font-size:12px; color:var(--muted); margin-top:2px">
							{{ "load.peak" | transloco }}
							<strong class="mono" style="color:var(--text-2)">{{ peak("mem") }}%</strong>
						</div>
					</div>
				</div>
				<div class="card__body" style="padding-top:8px">
					<sb-line-chart
						[width]="1100"
						[height]="220"
						[labels]="labels()"
						[series]="seriesFor('mem')"
					></sb-line-chart>
				</div>
			</div>
		</ng-container>
	`,
	styles: [
		`
			.load-legend {
				display: flex;
				flex-wrap: wrap;
				gap: 14px;
				margin-bottom: 14px;
			}
			.load-legend__item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				font-size: 12.5px;
				color: var(--text-2);
			}
			.load-legend__swatch {
				width: 10px;
				height: 10px;
				border-radius: 3px;
				display: inline-block;
			}
		`,
	],
})
export class LoadPageComponent implements OnInit {
	private readonly apollo = inject(Apollo);

	readonly ranges = [
		{ value: "15m", label: "15m" },
		{ value: "1h", label: "1h" },
		{ value: "6h", label: "6h" },
		{ value: "24h", label: "24h" },
	];

	readonly range = signal<"15m" | "1h" | "6h" | "24h">("1h");
	readonly loading = signal(true);
	readonly top = signal<StackSeries[]>([]);

	ngOnInit(): void {
		this.load();
	}

	onRangeChange(v: "15m" | "1h" | "6h" | "24h"): void {
		this.range.set(v);
		this.load();
	}

	private load(): void {
		this.loading.set(true);
		this.apollo
			.query<{ stacks: { name: string }[] }>({
				query: QUERY_STACKS,
				fetchPolicy: "network-only",
			})
			.subscribe((r) => {
				const stacks = r.data?.stacks ?? [];
				if (stacks.length === 0) {
					this.top.set([]);
					this.loading.set(false);
					return;
				}
				const requests = stacks.map((st) =>
					this.apollo
						.query<StackStatsResponse>({
							query: QUERY_STACK_STATS,
							variables: { name: st.name, range: this.range() },
							fetchPolicy: "network-only",
						})
						.pipe(catchError(() => of(null)))
				);
				forkJoin(requests).subscribe((results) => {
					const all: StackSeries[] = stacks
						.map((st, i) => {
							const data = results[i]?.data?.stackStats;
							return {
								name: st.name,
								color: "",
								cpu: data?.cpu ?? [],
								mem: data?.mem ?? [],
								labels: data?.labels ?? [],
							};
						})
						.filter((s) => s.cpu.length > 0);

					all.sort((a, b) => (b.cpu[b.cpu.length - 1] || 0) - (a.cpu[a.cpu.length - 1] || 0));
					this.top.set(
						all.slice(0, 7).map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }))
					);
					this.loading.set(false);
				});
			});
	}

	labels(): string[] {
		return this.top()[0]?.labels ?? [];
	}

	seriesFor(metric: "cpu" | "mem"): Series[] {
		return this.top().map((s) => ({ name: s.name, data: s[metric], color: s.color }));
	}

	peak(metric: "cpu" | "mem"): string {
		const vals = this.top().flatMap((s) => s[metric]);
		return vals.length ? Math.max(...vals).toFixed(1) : "0";
	}
}
