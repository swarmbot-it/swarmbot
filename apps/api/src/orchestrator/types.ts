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
 */
import type { ClusterHealth } from "../cluster-health.js";

export type OrchestratorKind = "swarm" | "kubernetes";

export type ServiceSummary = {
	id: string;
	name: string;
	image: string | null;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
	status: string;
	stack: string | null;
};

export type ServiceDetail = ServiceSummary & {
	mode: string;
	created: string;
	updated: string;
	env: Array<{ key: string; value: string }>;
	labels: Array<{ key: string; value: string }>;
	publishedPorts: Array<{
		containerPort: number;
		hostPort: number | null;
		protocol: string;
		mode: string;
	}>;
	bindMounts: Array<{ containerPath: string; hostPath: string; readOnly: boolean }>;
	volumeMounts: Array<{
		containerPath: string;
		volumeName: string;
		readOnly: boolean;
		driver: string;
	}>;
	secretNames: string[];
	configNames: string[];
};

export type NodeSummary = {
	id: string;
	hostname: string;
	role: string;
	availability: string | null;
	ip: string | null;
	dockerVersion: string | null;
	agentVersion: string | null;
	tags: string[];
	cpu: number | null;
	mem: number | null;
	disk: number | null;
	cpuHistory?: number[] | null;
	memHistory?: number[] | null;
	diskHistory?: number[] | null;
};

export type TaskSummary = {
	id: string;
	serviceId: string;
	nodeId: string;
	state: string;
	desiredState: string;
	slot: number;
	timestamp: string;
	/** Display name override (Kubernetes pod name); Swarm derives `{service}.{slot}`. */
	name?: string | null;
};

export type NetworkSummary = {
	id: string;
	name: string;
	driver: string;
	scope: string;
	attachable: boolean;
	internal: boolean;
	ingress: boolean;
	subnet: string | null;
	gateway: string | null;
};

export type VolumeSummary = {
	name: string;
	driver: string;
	size: string;
	mountpoint: string | null;
};

export type StampedSummary = {
	id: string;
	name: string;
	created: string;
	updated: string;
};

export type StackAgg = {
	name: string;
	services: number;
	networks: number;
	volumes: number;
	configs: number;
	secrets: number;
	status: string;
};

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
	listConfigs(): Promise<StampedSummary[]>;

	clusterHealth(): Promise<ClusterHealth>;
	clusterDisplayName(): Promise<string | null>;

	/** Recent logs of one running task/pod of the given service/workload. */
	serviceLogs(serviceId: string, opts?: { tail?: number }): Promise<string>;

	/**
	 * Deploy a stack. Swarm: compose YAML via `docker stack deploy`.
	 * Kubernetes: multi-document manifest YAML applied into namespace `name`.
	 * Throws `OrchestratorUnsupportedError` when the backend cannot deploy
	 * the given flavour (see capabilities).
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
