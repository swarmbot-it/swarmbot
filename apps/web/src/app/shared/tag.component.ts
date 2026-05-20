import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

/**
 * Small uppercase tag used for node roles (LEADER, MANAGER, WORKER…),
 * registry "DEFAULT" markers, and other categorical chips. Picks a
 * variant automatically based on common token values.
 */
type Variant = "success" | "info" | "warning" | "danger" | "primary" | "neutral";

const AUTO: Record<string, Variant> = {
	LEADER: "primary",
	MANAGER: "info",
	WORKER: "info",
	READY: "success",
	ACTIVE: "success",
	REACHABLE: "success",
	DRAIN: "warning",
	DOWN: "danger",
	DEFAULT: "primary",
};

@Component({
	selector: "sb-tag",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<span
		class="tag"
		[class.tag--success]="resolved === 'success'"
		[class.tag--info]="resolved === 'info'"
		[class.tag--warning]="resolved === 'warning'"
		[class.tag--primary]="resolved === 'primary'"
		><ng-content></ng-content
	></span>`,
	imports: [],
})
export class TagComponent {
	@Input() text?: string;
	@Input() variant?: Variant;

	get resolved(): Variant {
		if (this.variant) return this.variant;
		const t = (this.text ?? "").toUpperCase();
		return AUTO[t] ?? "neutral";
	}
}
