import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";

/** One plotted metric line in {@link LineChartComponent} (name, samples, and stroke color). */
export type Series = { name: string; data: number[]; color: string };

/**
 * Multi-series area + line chart for the dashboard.
 *
 * Renders a grid background, axis ticks, and one filled-area path per
 * series. Hover support paints a vertical guide and a dot per series
 * at the active index.
 *
 * The chart uses a fixed virtual viewBox (1000 × 260 by default) and is
 * stretched responsively by SVG `preserveAspectRatio="none"`, so it
 * looks crisp at any container width.
 */
@Component({
	selector: "sb-line-chart",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="chart" (mousemove)="onMove($event)" (mouseleave)="hover.set(null)" #wrap>
			<svg
				[attr.viewBox]="'0 0 ' + width() + ' ' + height()"
				preserveAspectRatio="none"
				width="100%"
			>
				<!-- Y grid + ticks -->
				<g>
					<line
						*ngFor="let y of yLines(); index as i"
						[attr.x1]="padL"
						[attr.y1]="y.y"
						[attr.x2]="width() - padR"
						[attr.y2]="y.y"
						stroke="var(--chart-grid)"
						stroke-width="1"
					/>
					<text
						*ngFor="let y of yLines()"
						[attr.x]="padL - 8"
						[attr.y]="y.y + 3"
						text-anchor="end"
						font-size="10"
						fill="var(--chart-axis)"
						font-family="var(--font-mono)"
					>
						{{ y.label }}%
					</text>
				</g>
				<!-- X labels -->
				<g>
					<text
						*ngFor="let x of xLabels()"
						[attr.x]="x.x"
						[attr.y]="height() - 8"
						text-anchor="middle"
						font-size="10"
						fill="var(--chart-axis)"
						font-family="var(--font-mono)"
					>
						{{ x.label }}
					</text>
				</g>
				<!-- Series -->
				<g *ngFor="let s of seriesPaths(); index as si">
					<defs>
						<linearGradient [attr.id]="'sb-area-' + si" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.18" />
							<stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0" />
						</linearGradient>
					</defs>
					<path [attr.d]="s.area" [attr.fill]="'url(#sb-area-' + si + ')'" />
					<path
						[attr.d]="s.line"
						[attr.stroke]="s.color"
						stroke-width="1.75"
						fill="none"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
				</g>
				<!-- Hover -->
				<g *ngIf="hover() !== null && hover() !== undefined">
					<line
						[attr.x1]="hoverX()"
						[attr.x2]="hoverX()"
						[attr.y1]="padT"
						[attr.y2]="padT + chartH()"
						stroke="var(--chart-axis)"
						stroke-dasharray="3 3"
						stroke-width="1"
					/>
					<circle
						*ngFor="let p of hoverPoints()"
						[attr.cx]="p.x"
						[attr.cy]="p.y"
						r="3.5"
						[attr.fill]="p.color"
						stroke="var(--surface)"
						stroke-width="2"
					/>
				</g>
			</svg>
			<div
				class="chart__tooltip"
				[class.chart__tooltip--flip]="tooltipFlip()"
				*ngIf="hover() !== null && hover() !== undefined"
				[style.left.%]="((padL + (hover() ?? 0) * stepX()) / width()) * 100"
			>
				<div class="chart__tooltip-time">{{ labels()[hover()!] }}</div>
				<div class="chart__tooltip-row" *ngFor="let s of series()">
					<span class="chart__tooltip-swatch" [style.background]="s.color"></span>
					<span class="chart__tooltip-name">{{ s.name }}</span>
					<span class="chart__tooltip-value">{{ fmt(s.data[hover()!]) }}%</span>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.chart {
				position: relative;
				width: 100%;
				overflow: hidden;
			}
			.chart__tooltip {
				position: absolute;
				top: 12px;
				background: var(--surface);
				border: 1px solid var(--border);
				border-radius: 8px;
				padding: 8px 10px;
				box-shadow: var(--shadow-2);
				font-size: 12px;
				pointer-events: none;
				min-width: 130px;
				transform: translateX(8px);
			}
			.chart__tooltip--flip {
				transform: translateX(calc(-100% - 8px));
			}
			.chart__tooltip-time {
				font-weight: 600;
				margin-bottom: 4px;
				font-size: 11px;
				color: var(--muted);
				font-family: var(--font-mono);
			}
			.chart__tooltip-row {
				display: flex;
				justify-content: space-between;
				gap: 12px;
				align-items: center;
				color: var(--text-2);
			}
			.chart__tooltip-swatch {
				width: 8px;
				height: 8px;
				border-radius: 2px;
				display: inline-block;
				margin-right: 6px;
			}
			.chart__tooltip-name {
				flex: 1;
			}
			.chart__tooltip-value {
				font-family: var(--font-mono);
				font-weight: 600;
				color: var(--text);
			}
		`,
	],
	imports: [NgFor, NgIf],
})
export class LineChartComponent {
	/** Metrics to render as stacked area + line paths. */
	readonly series = input<Series[]>([]);
	/** X-axis tick labels (one per data point). */
	readonly labels = input<string[]>([]);
	/** Virtual SVG width for the viewBox. */
	readonly width = input(1000);
	/** Virtual SVG height for the viewBox. */
	readonly height = input(260);

	readonly padL = 36;
	readonly padR = 12;
	readonly padT = 12;
	readonly padB = 28;

	readonly hover = signal<number | null>(null);

	readonly chartW = computed(() => this.width() - this.padL - this.padR);
	readonly chartH = computed(() => this.height() - this.padT - this.padB);

	stepX = computed(() => {
		const n = this.labels().length || 1;
		return this.chartW() / Math.max(1, n - 1);
	});

	yLines = computed(() => {
		const ticks = 5;
		const max = this.maxValue();
		const chartH = this.chartH();
		return Array.from({ length: ticks + 1 }, (_, i) => ({
			y: this.padT + (chartH / ticks) * i,
			label: Math.round(max - (max / ticks) * i),
		}));
	});

	xLabels = computed(() => {
		const labels = this.labels();
		const n = labels.length;
		if (n === 0) return [] as Array<{ x: number; label: string }>;
		const stride = Math.max(1, Math.floor(n / 8));
		const out: Array<{ x: number; label: string }> = [];
		for (let i = 0; i < n; i++) {
			if (i % stride === 0 || i === n - 1) {
				out.push({ x: this.padL + i * this.stepX(), label: labels[i] });
			}
		}
		return out;
	});

	seriesPaths = computed(() => {
		const n = this.labels().length;
		const max = this.maxValue();
		const chartH = this.chartH();
		return this.series().map((s) => {
			const pts = s.data.map((v, i) => {
				const x = this.padL + i * this.stepX();
				const y = this.padT + (1 - v / Math.max(1, max)) * chartH;
				return [x, y] as const;
			});
			const line = pts
				.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
				.join(" ");
			const area = `${line} L ${this.padL + (n - 1) * this.stepX()} ${this.padT + chartH} L ${this.padL} ${this.padT + chartH} Z`;
			return { line, area, color: s.color };
		});
	});

	hoverX = computed(() => this.padL + (this.hover() ?? 0) * this.stepX());

	/** Flip the tooltip to the left of the cursor once it would otherwise overflow the chart's right edge. */
	tooltipFlip = computed(() => this.hoverX() / this.width() > 0.65);

	hoverPoints = computed(() => {
		const idx = this.hover();
		if (idx === null || idx === undefined) return [];
		const max = this.maxValue();
		const chartH = this.chartH();
		return this.series().map((s) => ({
			x: this.padL + idx * this.stepX(),
			y: this.padT + (1 - s.data[idx] / Math.max(1, max)) * chartH,
			color: s.color,
		}));
	});

	onMove(event: MouseEvent): void {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const pxRatio = rect.width / this.width();
		const x = (event.clientX - rect.left) / pxRatio - this.padL;
		if (x < 0 || x > this.chartW()) {
			this.hover.set(null);
			return;
		}
		const idx = Math.max(0, Math.min(this.labels().length - 1, Math.round(x / this.stepX())));
		this.hover.set(idx);
	}

	fmt(v: number): string {
		return v.toFixed(1);
	}

	private maxValue(): number {
		const all = this.series().flatMap((s) => s.data);
		if (!all.length) return 100;
		const m = Math.max(100, Math.ceil(Math.max(...all) / 10) * 10);
		return m;
	}
}
