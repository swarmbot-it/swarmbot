import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IconComponent } from "./icon.component";

@Component({
	selector: "sb-back-link",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<a class="back-link" [routerLink]="link">
			<sb-icon name="chevronRight" [size]="14" class="back-link__icon"></sb-icon>
			{{ label }}
		</a>
	`,
	styles: [
		`
			.back-link {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				font-size: 13px;
				font-weight: 600;
				color: var(--muted);
				text-decoration: none;
				margin-bottom: 12px;
			}
			.back-link:hover {
				color: var(--primary-500);
			}
			:host ::ng-deep .back-link__icon svg {
				transform: rotate(180deg);
			}
		`,
	],
	imports: [RouterLink, IconComponent],
})
export class BackLinkComponent {
	@Input({ required: true }) link!: string | string[];
	@Input({ required: true }) label!: string;
}
