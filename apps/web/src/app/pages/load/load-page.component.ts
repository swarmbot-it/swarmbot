import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";

import { AsyncPipe, NgFor, NgIf } from "@angular/common";

import { Apollo } from "apollo-angular";

import { TranslocoPipe } from "@jsverse/transloco";

import { map, switchMap } from "rxjs";

import { toObservable } from "@angular/core/rxjs-interop";

import { QUERY_STACK_LOAD_SERIES } from "../../core/graphql.queries";

import { SegmentedComponent } from "../../shared/segmented.component";

import { LineChartComponent, Series } from "../../shared/line-chart.component";

import type { ChartRange } from "../../core/chart-range";

import { LOAD_STACK_COLORS } from "../../core/chart-range";

import { formatPeak } from "../../core/load-series";



type StackLoadRow = {

	stack: string;

	labels: string[];

	cpu: number[];

	mem: number[];

	disk: number[];

};



@Component({

	selector: "sb-load-page",

	standalone: true,

	changeDetection: ChangeDetectionStrategy.OnPush,

	template: `

		<ng-container *ngIf="vm$ | async as vm">

			<div class="page-header">

				<div>

					<h1 class="page-header__title">{{ "pages.load.title" | transloco }}</h1>

					<div class="page-header__count">{{ "pages.load.subtitle" | transloco }}</div>

				</div>

				<sb-segmented

					[options]="rangeOptions"

					[value]="range()"

					(select)="range.set($any($event))"

				></sb-segmented>

			</div>



			<div class="load-legend" *ngIf="vm.stacks.length">

				<span class="load-legend__item" *ngFor="let s of vm.stacks; let i = index">

					<span

						class="load-legend__swatch"

						[style.background]="s.color"

					></span>

					<span class="load-legend__name">{{ s.name }}</span>

				</span>

			</div>



			<div class="card load-chart-card" *ngFor="let block of vm.blocks">

				<div class="card__header">

					<div>

						<div class="card__title">{{ block.title }}</div>

						<div class="load-chart-card__sub">

							{{

								"pages.load.peak"

									| transloco

										: {

												peak: block.peak,

												count: vm.stacks.length,

										  }

							}}

						</div>

					</div>

				</div>

				<div class="card__body">

					<sb-line-chart

						*ngIf="block.series.length && vm.labels.length"

						[labels]="vm.labels"

						[series]="block.series"

						[height]="220"

					></sb-line-chart>

					<div *ngIf="!vm.stacks.length" class="metrics-empty">

						{{ "pages.load.empty" | transloco }}

					</div>

				</div>

			</div>

		</ng-container>

	`,

	styles: [

		`

			.load-chart-card {

				margin-bottom: 16px;

			}

			.load-chart-card__sub {

				font-size: 12px;

				color: var(--muted);

				margin-top: 2px;

			}

		`,

	],

	imports: [NgIf, NgFor, AsyncPipe, TranslocoPipe, SegmentedComponent, LineChartComponent],

})

export class LoadPageComponent {

	private readonly apollo = inject(Apollo);



	readonly range = signal<ChartRange>("1h");

	readonly rangeOptions = [

		{ value: "15m", label: "15m" },

		{ value: "1h", label: "1h" },

		{ value: "6h", label: "6h" },

		{ value: "24h", label: "24h" },

	];



	private readonly range$ = toObservable(this.range);



	readonly vm$ = this.range$.pipe(

		switchMap((range) =>

			this.apollo

				.watchQuery<{ stackLoadSeries: StackLoadRow[] }>({

					query: QUERY_STACK_LOAD_SERIES,

					variables: { range, resolution: "medium" },

					pollInterval: 30_000,

				})

				.valueChanges.pipe(

					map((res) => {

						const rows = res.data?.stackLoadSeries ?? [];

						const stacks = rows.map((r, i) => ({

							name: r.stack,

							color: LOAD_STACK_COLORS[i] ?? LOAD_STACK_COLORS[0],

						}));

						const labels = rows[0]?.labels ?? [];

						const toSeries = (metric: "cpu" | "mem" | "disk"): Series[] =>

							rows.map((r, i) => ({
								name: r.stack ?? "",
								data: [...(r[metric] ?? [])],

								color: LOAD_STACK_COLORS[i] ?? LOAD_STACK_COLORS[0],

							}));

						return {

							labels,

							stacks,

							blocks: [

								{

									title: "CPU",

									series: toSeries("cpu"),

									peak: formatPeak(rows.flatMap((r) => r.cpu ?? [])),

								},

								{

									title: "Memory",

									series: toSeries("mem"),

									peak: formatPeak(rows.flatMap((r) => r.mem ?? [])),

								},

								{

									title: "Disk",

									series: toSeries("disk"),

									peak: formatPeak(rows.flatMap((r) => r.disk ?? [])),

								},

							],

						};

					})

				)

		)

	);

}

