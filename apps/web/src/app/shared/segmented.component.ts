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
				role="button"
				tabindex="0"
				(click)="choose(opt.value)"
				(keydown.enter)="choose(opt.value)"
				(keydown.space)="choose(opt.value); $event.preventDefault()"
			>
				{{ opt.label }}
			</div>
		</div>
	`,
	imports: [NgFor],
})
export class SegmentedComponent {
	/** Selectable segments shown as pill buttons. */
	@Input() options: { value: string; label: string }[] = [];
	/** Currently selected segment value. */
	@Input() value = "";
	/** Emitted when the user picks a different segment. */
	@Output() selectionChange = new EventEmitter<string>();

	choose(value: string): void {
		this.selectionChange.emit(value);
	}
}
