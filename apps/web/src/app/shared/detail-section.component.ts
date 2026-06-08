import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { NgIf } from "@angular/common";
import { IconComponent } from "./icon.component";

@Component({
	selector: "sb-detail-section",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		"[class]": "hostClass",
	},
	template: `
		<header class="detail-section__head">
			<div class="detail-section__title">
				<sb-icon *ngIf="icon" [name]="icon" [size]="14"></sb-icon>
				{{ title }}
				<span class="detail-section__count" *ngIf="count != null">{{ count }}</span>
			</div>
		</header>
		<div
			class="detail-section__body"
			[class.detail-section__body--table]="table"
		>
			<ng-content></ng-content>
		</div>
	`,
	imports: [NgIf, IconComponent],
})
export class DetailSectionComponent {
	@Input({ required: true }) title!: string;
	@Input() icon = "";
	@Input() count?: number | null;
	@Input() table = true;
	/** Extra host classes, e.g. `detail-section--svc-tasks`. */
	@Input() sectionClass = "";

	get hostClass(): string {
		return ["detail-section", this.sectionClass].filter(Boolean).join(" ");
	}
}
