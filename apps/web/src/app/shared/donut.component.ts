import { ChangeDetectionStrategy, Component, Input, computed, signal } from "@angular/core";
import { NgIf } from "@angular/common";

/**
 * Pure-SVG donut chart used on the dashboard resource tiles.
 * The arc length is driven by stroke-dashoffset so the value transition
 * is smooth without external charting libraries.
 */
@Component({
	selector: "sb-donut",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="donut" [style.width.px]="size" [style.height.px]="size">
			<svg
				[attr.width]="size"
				[attr.height]="size"
				[attr.viewBox]="'0 0 ' + size + ' ' + size"
			>
				<g [attr.transform]="'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'">
					<circle
						[attr.cx]="size / 2"
						[attr.cy]="size / 2"
						[attr.r]="radius"
						stroke="var(--surface-2)"
						[attr.stroke-width]="stroke"
						fill="none"
					/>
					<circle
						*ngIf="!unavailable()"
						[attr.cx]="size / 2"
						[attr.cy]="size / 2"
						[attr.r]="radius"
						[attr.stroke]="color"
						[attr.stroke-width]="stroke"
						fill="none"
						stroke-linecap="round"
						[attr.stroke-dasharray]="circumference"
						[attr.stroke-dashoffset]="offset"
					/>
				</g>
			</svg>
			<div class="donut__center">
				<div class="donut__value" [class.donut__value--na]="unavailable()">
					<ng-container *ngIf="unavailable(); else pct">{{ naLabel }}</ng-container>
					<ng-template #pct>{{ rounded() }}<span class="donut__pct">%</span></ng-template>
				</div>
				<div class="donut__label" *ngIf="label">{{ label }}</div>
			</div>
		</div>
	`,
	styles: [
		`
			.donut {
				position: relative;
			}
			.donut__center {
				position: absolute;
				inset: 0;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
			}
			.donut__value {
				font-size: 18px;
				font-weight: 700;
				line-height: 1;
				font-variant-numeric: tabular-nums;
			}
			.donut__value--na {
				font-size: 15px;
				color: var(--muted);
			}
			.donut__pct {
				font-size: 12px;
				color: var(--muted);
				margin-left: 1px;
			}
			.donut__label {
				font-size: 10px;
				color: var(--muted);
				font-weight: 600;
				margin-top: 2px;
			}
			circle {
				transition: stroke-dashoffset 0.6s cubic-bezier(0.2, 0.8, 0.4, 1);
			}
		`,
	],
	imports: [NgIf],
	host: { "[style.display]": "'inline-block'" },
})
export class DonutComponent {
	/** Fill percentage (0–100) for the active arc; null shows {@link naLabel}. */
	@Input() set value(v: number | null | undefined) {
		this._value.set(v == null ? null : v);
	}
	/** Caption when {@link value} is null (default "N/A"). */
	@Input() naLabel = "N/A";
	/** Outer diameter of the chart in pixels. */
	@Input() size = 96;
	/** Ring thickness in pixels. */
	@Input() stroke = 14;
	/** Color of the filled arc (CSS color). */
	@Input() color = "var(--primary-500)";
	/** Optional caption shown under the percentage. */
	@Input() label?: string;

	private readonly _value = signal<number | null>(null);

	readonly unavailable = computed(() => this._value() == null);

	get radius() {
		return (this.size - this.stroke) / 2;
	}
	get circumference() {
		return 2 * Math.PI * this.radius;
	}
	get offset() {
		const v = this._value() ?? 0;
		return this.circumference * (1 - v / 100);
	}
	rounded = computed(() => Math.round(this._value() ?? 0));
}
