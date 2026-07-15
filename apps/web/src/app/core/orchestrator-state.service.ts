import { computed, Injectable, signal } from "@angular/core";

export type OrchestratorKind = "swarm" | "kubernetes";

/**
 * Which orchestrator the backend runs on (from the `version` GraphQL query).
 * Drives the topbar badge and mode-dependent labels ("Stacks" → "Namespaces").
 */
@Injectable({ providedIn: "root" })
export class OrchestratorStateService {
	private readonly kind = signal<OrchestratorKind>("swarm");

	readonly orchestrator = this.kind.asReadonly();
	readonly isKubernetes = computed(() => this.kind() === "kubernetes");

	/** i18n key for the "Stacks" navigation family, per backend. */
	readonly stacksNavKey = computed(() => (this.isKubernetes() ? "nav.namespaces" : "nav.stacks"));
	/** i18n key for the stack/namespace column header. */
	readonly stackColumnKey = computed(() =>
		this.isKubernetes() ? "pages.stacks.columns.namespace" : "pages.stacks.columns.stack"
	);

	set(kind: string | null | undefined): void {
		this.kind.set(kind === "kubernetes" ? "kubernetes" : "swarm");
	}
}
