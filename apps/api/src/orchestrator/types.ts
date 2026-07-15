/**
 * Orchestrator abstraction: the domain model shared by GraphQL/UI and the
 * per-backend adapters (Docker Swarm, Kubernetes).
 *
 * The vocabulary is Swarm-flavoured for historical reasons; the Kubernetes
 * adapter maps its concepts onto it:
 *
 *   Node    → v1.Node
 *   Service → Deployment / StatefulSet / DaemonSet (a "workload")
 *   Task    → Pod
 *   Stack   → Namespace
 *
 * The summary types are the ones the Docker engine module already exposes —
 * the adapters produce them and the resolvers consume them unchanged.
 */
import type { ClusterHealth } from "../cluster-health.js";
import type {
	ConfigSummary,
	NetworkSummary,
	NodeSummary,
	ServiceDetail,
	ServiceSummary,
	StackAgg,
	StampedSummary,
	TaskSummary,
	VolumeSummary,
} from "../docker/engine.js";

export type OrchestratorKind = "swarm" | "kubernetes";

export type OrchestratorCapabilities = {
	/** `docker stack deploy` from a compose file. */
	composeDeploy: boolean;
	/** Server-side apply of raw Kubernetes manifests. */
	manifestApply: boolean;
	networks: boolean;
};

export interface Orchestrator {
	readonly kind: OrchestratorKind;
	readonly capabilities: OrchestratorCapabilities;

	listNodes(): Promise<NodeSummary[]>;
	listServices(): Promise<ServiceSummary[]>;
	getService(id: string): Promise<ServiceDetail | null>;
	listTasks(): Promise<TaskSummary[]>;
	listStacks(): Promise<StackAgg[]>;
	listNetworks(): Promise<NetworkSummary[]>;
	listVolumes(): Promise<VolumeSummary[]>;
	listSecrets(): Promise<StampedSummary[]>;
	listConfigs(): Promise<ConfigSummary[]>;

	clusterHealth(): Promise<ClusterHealth>;

	/** Recent logs of one running task/pod of the given service/workload. */
	serviceLogs(serviceId: string, opts?: { tail?: number }): Promise<string>;

	/**
	 * Deploy a stack. Swarm: compose YAML via `docker stack deploy`.
	 * Kubernetes: multi-document manifest YAML applied into namespace `name`.
	 */
	deployStack(name: string, yaml: string): Promise<void>;
}

/** Raised when an operation has no equivalent on the active backend. */
export class OrchestratorUnsupportedError extends Error {
	constructor(operation: string, kind: OrchestratorKind) {
		super(`${operation} is not supported on ${kind}`);
		this.name = "OrchestratorUnsupportedError";
	}
}
