import { computed, Injectable, signal } from "@angular/core";

export type OrchestratorKind = "swarm" | "kubernetes";

/**
 * Which orchestrator the backend runs on (from the `version` GraphQL query).
 * Drives the topbar badge and mode-dependent behaviour (e.g. hiding networks).
 */
@Injectable({ providedIn: "root" })
export class OrchestratorStateService {
	private readonly kind = signal<OrchestratorKind>("swarm");

	readonly orchestrator = this.kind.asReadonly();
	readonly isKubernetes = computed(() => this.kind() === "kubernetes");

	/** i18n key for the "Pod" navigation family (unified label across backends). */
	readonly stacksNavKey = computed(() => "nav.stacks");
	/** i18n key for the "Pod" column header (unified label across backends). */
	readonly stackColumnKey = computed(() => "pages.stacks.columns.stack");

	set(kind: string | null | undefined): void {
		this.kind.set(kind === "kubernetes" ? "kubernetes" : "swarm");
	}
}
