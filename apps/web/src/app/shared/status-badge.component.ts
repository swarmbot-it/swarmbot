import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { TranslocoService } from "@jsverse/transloco";
import { I18nStateService } from "../core/i18n/i18n-state.service";

/**
 * Status pill that follows the design's variant palette (success / info /
 * warning / danger / neutral). Status strings come from Docker Swarm so
 * the mapping is forgiving and falls back to the raw label.
 */

type Variant = "success" | "info" | "warning" | "danger" | "neutral";

const VARIANTS: Record<string, Variant> = {
	RUNNING: "success",
	HEALTHY: "success",
	READY: "success",
	STARTING: "info",
	UPDATING: "info",
	PENDING: "warning",
	PAUSED: "neutral",
	FAILED: "danger",
	REJECTED: "danger",
	COMPLETE: "info",
	SHUTDOWN: "neutral",
	STOPPED: "neutral",
};

@Component({
	selector: "sb-status",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<span
			class="badge"
			[class.badge--success]="cfg().variant === 'success'"
			[class.badge--info]="cfg().variant === 'info'"
			[class.badge--warning]="cfg().variant === 'warning'"
			[class.badge--danger]="cfg().variant === 'danger'"
			[class.badge--neutral]="cfg().variant === 'neutral'"
		>
			<span
				class="dot"
				[class.dot--success]="cfg().variant === 'success'"
				[class.dot--warning]="cfg().variant === 'warning' || cfg().variant === 'neutral'"
				[class.dot--danger]="cfg().variant === 'danger'"
			></span>
			{{ cfg().label }}
		</span>
	`,
	imports: [],
})
export class StatusBadgeComponent {
	private readonly transloco = inject(TranslocoService);
	private readonly i18n = inject(I18nStateService);

	/** Raw Swarm/Docker status string (mapped to label and color variant). */
	readonly status = input<string>("");

	readonly cfg = computed(() => {
		this.i18n.activeLang();
		const raw = this.status() || "";
		const upper = raw.toUpperCase();
		const variant = VARIANTS[upper] ?? "neutral";
		const key = `status.${upper}`;
		const translated = this.transloco.translate(key);
		const label =
			translated !== key
				? translated
				: raw || this.transloco.translate("status.UNKNOWN");
		return { label, variant };
	});
}
