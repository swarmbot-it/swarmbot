import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

/**
 * Status pill that follows the design's variant palette (success / info /
 * warning / danger / neutral). Status strings come from Docker Swarm so
 * the mapping is forgiving and falls back to the raw label.
 */

type Variant = "success" | "info" | "warning" | "danger" | "neutral";

const VARIANTS: Record<string, { label: string; variant: Variant }> = {
	RUNNING: { label: "Running", variant: "success" },
	HEALTHY: { label: "Healthy", variant: "success" },
	READY: { label: "Ready", variant: "success" },
	STARTING: { label: "Starting", variant: "info" },
	UPDATING: { label: "Updating", variant: "info" },
	PENDING: { label: "Pending", variant: "warning" },
	PAUSED: { label: "Paused", variant: "neutral" },
	FAILED: { label: "Failed", variant: "danger" },
	REJECTED: { label: "Rejected", variant: "danger" },
	COMPLETE: { label: "Complete", variant: "info" },
	SHUTDOWN: { label: "Shutdown", variant: "neutral" },
};

@Component({
	selector: "sb-status",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<span
			class="badge"
			[class.badge--success]="cfg.variant === 'success'"
			[class.badge--info]="cfg.variant === 'info'"
			[class.badge--warning]="cfg.variant === 'warning'"
			[class.badge--danger]="cfg.variant === 'danger'"
			[class.badge--neutral]="cfg.variant === 'neutral'"
		>
			<span
				class="dot"
				[class.dot--success]="cfg.variant === 'success'"
				[class.dot--warning]="cfg.variant === 'warning' || cfg.variant === 'neutral'"
				[class.dot--danger]="cfg.variant === 'danger'"
			></span>
			{{ cfg.label }}
		</span>
	`,
	imports: [],
})
export class StatusBadgeComponent {
	/** Raw Swarm/Docker status string (mapped to label and color variant). */
	@Input() status: string = "";

	get cfg(): { label: string; variant: Variant } {
		const upper = (this.status || "").toUpperCase();
		return VARIANTS[upper] ?? { label: this.status || "Unknown", variant: "neutral" };
	}
}
