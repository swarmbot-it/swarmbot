import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { NgFor } from "@angular/common";

/** Inline pill-style toggle group used for chart range/resolution selection. */
@Component({
	selector: "sb-segmented",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="segmented">
			<div
				*ngFor="let opt of options"
				class="segmented__item"
				[class.segmented__item--active]="opt.value === value"
				(click)="select.emit(opt.value)"
			>
				{{ opt.label }}
			</div>
		</div>
	`,
	imports: [NgFor],
})
export class SegmentedComponent {
	/** Selectable segments shown as pill buttons. */
	@Input() options: Array<{ value: string; label: string }> = [];
	/** Currently selected segment value. */
	@Input() value: string = "";
	/** Emitted when the user picks a different segment. */
	@Output() select = new EventEmitter<string>();
}
