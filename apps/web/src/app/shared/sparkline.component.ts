import { ChangeDetectionStrategy, Component, Input, computed, signal } from "@angular/core";
import { NgIf } from "@angular/common";

/**
 * Compact area sparkline. Draws a smoothed line between data points
 * and an under-line gradient. Used in node tiles and task rows.
 */
@Component({
	selector: "sb-sparkline",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<svg [attr.width]="width" [attr.height]="height" style="display:block">
			<defs>
				<linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" [attr.stop-color]="color" stop-opacity="0.35"></stop>
					<stop offset="100%" [attr.stop-color]="color" stop-opacity="0"></stop>
				</linearGradient>
			</defs>
			<path *ngIf="area" [attr.d]="paths().area" [attr.fill]="'url(#' + gradientId + ')'" />
			<path
				[attr.d]="paths().line"
				[attr.stroke]="color"
				[attr.stroke-width]="strokeWidth"
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	`,
	imports: [NgIf],
})
export class SparklineComponent {
	/** Numeric samples plotted left-to-right. */
	@Input() set data(values: number[]) {
		this._data.set(values ?? []);
	}
	/** SVG width in pixels. */
	@Input() width = 120;
	/** SVG height in pixels. */
	@Input() height = 32;
	/** Stroke and gradient fill color (CSS color). */
	@Input() color = "var(--primary-500)";
	/** Line stroke width. */
	@Input() strokeWidth = 1.5;
	/** When true, fills the area under the line with a gradient. */
	@Input() area = true;

	readonly gradientId = `spark-${Math.random().toString(36).slice(2, 9)}`;
	private readonly _data = signal<number[]>([]);

	readonly paths = computed(() => {
		const data = this._data();
		if (!data.length) return { line: "", area: "" };
		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = max - min || 1;
		const stepX = this.width / Math.max(1, data.length - 1);
		const pts = data.map((v, i) => {
			const x = i * stepX;
			const y = this.height - ((v - min) / range) * (this.height - 4) - 2;
			return [x, y] as const;
		});
		const line = pts
			.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
			.join(" ");
		const area = `${line} L ${this.width} ${this.height} L 0 ${this.height} Z`;
		return { line, area };
	});
}
