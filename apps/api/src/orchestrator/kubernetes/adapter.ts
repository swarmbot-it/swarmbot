/**
 * Kubernetes/k3s adapter.
 *
 * Maps Kubernetes concepts onto the Swarmbot domain model:
 *   workloads (Deployment/StatefulSet/DaemonSet) → services,
 *   pods → tasks, namespaces → stacks, PVCs → volumes,
 *   ConfigMaps/Secrets → configs/secrets. Networks have no equivalent.
 */
import yaml from "js-yaml";
import type { SwarmbotConfig } from "../../config.js";
import type { ClusterHealth } from "../../cluster-health.js";
import { quorumSize } from "../../cluster-health.js";
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
} from "../../docker/engine.js";
import type { Orchestrator, OrchestratorCapabilities } from "../types.js";
import type {
	KubeApi,
	KubeNode,
	KubePod,
	KubeService,
	KubeStamped,
	KubeWorkload,
	KubeWorkloadKind,
} from "./kube-api.js";

const CONTROL_PLANE_LABELS = [
	"node-role.kubernetes.io/control-plane",
	"node-role.kubernetes.io/master",
];

/** Stable workload id used as ServiceSummary.id and TaskSummary.serviceId. */
export function workloadId(kind: KubeWorkloadKind, namespace: string, name: string): string {
	return `${kind}:${namespace}:${name}`;
}

export function parseWorkloadId(
	id: string
): { kind: KubeWorkloadKind; namespace: string; name: string } | null {
	const parts = id.split(":");
	if (parts.length !== 3) return null;
	const [kind, namespace, name] = parts;
	if (kind !== "Deployment" && kind !== "StatefulSet" && kind !== "DaemonSet") return null;
	if (!namespace || !name) return null;
	return { kind, namespace, name };
}

/** Task id for a pod: `{namespace}/{pod}` — matches agent container id prefixes. */
export function podTaskId(namespace: string, pod: string): string {
	return `${namespace}/${pod}`;
}

/**
 * Owning workload of a pod, derived from ownerReferences.
 * ReplicaSet owners are collapsed to their Deployment by stripping the
 * trailing pod-template hash (`myapp-6d4cf56db6` → `myapp`).
 */
export function podOwnerWorkload(pod: KubePod): { kind: KubeWorkloadKind; name: string } | null {
	const owner = pod.metadata?.ownerReferences?.find((o) => o.kind && o.name);
	if (!owner?.kind || !owner.name) return null;
	if (owner.kind === "ReplicaSet") {
		const i = owner.name.lastIndexOf("-");
		return { kind: "Deployment", name: i > 0 ? owner.name.slice(0, i) : owner.name };
	}
	if (owner.kind === "StatefulSet" || owner.kind === "DaemonSet") {
		return { kind: owner.kind, name: owner.name };
	}
	return null;
}

/** StatefulSet ordinal from the pod name (`db-2` → 2); 0 otherwise. */
export function podSlot(podName: string): number {
	const m = /-(\d+)$/.exec(podName);
	return m ? parseInt(m[1]!, 10) : 0;
}

function iso(v: string | Date | undefined): string {
	if (v instanceof Date) return v.toISOString();
	if (typeof v === "string" && v) return new Date(v).toISOString();
	return new Date().toISOString();
}

function nodeRole(n: KubeNode): "manager" | "worker" {
	const labels = n.metadata?.labels ?? {};
	return CONTROL_PLANE_LABELS.some((l) => l in labels) ? "manager" : "worker";
}

function nodeReady(n: KubeNode): boolean {
	return (n.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
}

/** Parse a Kubernetes quantity (`10Gi`, `500m`, `1e9`) to a plain number (bytes or cores). */
export function parseQuantity(q: string | undefined): number | undefined {
	if (!q) return undefined;
	const milli = /^([0-9.]+)m$/.exec(q.trim());
	if (milli) return parseFloat(milli[1]!) / 1000;
	const m = /^([0-9.eE+-]+)([KMGTPE]i?)?$/.exec(q.trim());
	if (!m) return undefined;
	const n = parseFloat(m[1]!);
	if (!Number.isFinite(n)) return undefined;
	const suffix = m[2];
	if (!suffix) return n;
	const binary = suffix.endsWith("i");
	const base = binary ? 1024 : 1000;
	const exp = { K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 }[suffix[0] as "K"] ?? 0;
	return n * Math.pow(base, exp);
}

export function mapKubeNode(n: KubeNode): NodeSummary {
	const name = n.metadata?.name ?? "";
	const role = nodeRole(n);
	const availability = n.spec?.unschedulable ? "drain" : "active";
	const ready = nodeReady(n);
	const ip =
		n.status?.addresses?.find((a) => a.type === "InternalIP")?.address ??
		n.status?.addresses?.find((a) => a.type === "ExternalIP")?.address ??
		null;
	const tags: string[] = [];
	if (role === "manager") tags.push("MANAGER", "CONTROL-PLANE");
	if (role === "worker") tags.push("WORKER");
	if (ready) tags.push("READY");
	tags.push(availability === "drain" ? "DRAIN" : "ACTIVE");
	const capacity = n.status?.capacity ?? {};
	return {
		id: name,
		hostname: name,
		role,
		availability,
		ip,
		dockerVersion: n.status?.nodeInfo?.containerRuntimeVersion ?? null,
		tags,
		cpu: 0,
		mem: 0,
		disk: 0,
		cpuCores: parseQuantity(capacity["cpu"]) ?? null,
		memBytes: parseQuantity(capacity["memory"]) ?? null,
	};
}

function selectorMatches(
	selector: Record<string, string>,
	labels: Record<string, string>
): boolean {
	const keys = Object.keys(selector);
	if (keys.length === 0) return false;
	return keys.every((k) => labels[k] === selector[k]);
}

/** `published→target` port strings from v1.Services selecting the workload's pods. */
export function workloadPorts(w: KubeWorkload, services: KubeService[]): string[] {
	const podLabels = w.spec?.template?.metadata?.labels ?? {};
	const ns = w.metadata?.namespace;
	const out: string[] = [];
	for (const s of services) {
		if (s.metadata?.namespace !== ns) continue;
		const selector = s.spec?.selector ?? {};
		if (!selectorMatches(selector, podLabels)) continue;
		for (const p of s.spec?.ports ?? []) {
			const target = typeof p.targetPort === "number" ? p.targetPort : (p.port ?? 0);
			const published = p.nodePort ?? p.port ?? target;
			out.push(`${published}→${target}`);
		}
	}
	return out;
}

type WorkloadEntry = { kind: KubeWorkloadKind; workload: KubeWorkload };

function replicaCounts(e: WorkloadEntry): { running: number; total: number } {
	if (e.kind === "DaemonSet") {
		return {
			running: e.workload.status?.numberReady ?? 0,
			total: e.workload.status?.desiredNumberScheduled ?? 0,
		};
	}
	return {
		running: e.workload.status?.readyReplicas ?? 0,
		total: e.workload.spec?.replicas ?? e.workload.status?.replicas ?? 0,
	};
}

export function mapWorkloadSummary(e: WorkloadEntry, services: KubeService[]): ServiceSummary {
	const meta = e.workload.metadata ?? {};
	const ns = meta.namespace ?? "default";
	const name = meta.name ?? "";
	const image = e.workload.spec?.template?.spec?.containers?.[0]?.image ?? null;
	const { running, total } = replicaCounts(e);
	return {
		id: workloadId(e.kind, ns, name),
		name,
		image,
		replicasRunning: running,
		replicasTotal: total,
		ports: workloadPorts(e.workload, services),
		status: "RUNNING",
		stack: ns,
	};
}

export function mapWorkloadDetail(e: WorkloadEntry, services: KubeService[]): ServiceDetail {
	const summary = mapWorkloadSummary(e, services);
	const meta = e.workload.metadata ?? {};
	const template = e.workload.spec?.template;
	const containers = template?.spec?.containers ?? [];
	const first = containers[0];
	const volumes = template?.spec?.volumes ?? [];

	const mountPathByVolume = new Map<string, { path: string; readOnly: boolean }>();
	for (const c of containers) {
		for (const m of c.volumeMounts ?? []) {
			if (m.name && m.mountPath && !mountPathByVolume.has(m.name)) {
				mountPathByVolume.set(m.name, {
					path: m.mountPath,
					readOnly: Boolean(m.readOnly),
				});
			}
		}
	}

	const mounts: ServiceDetail["mounts"] = [];
	const secretNames = new Set<string>();
	const configNames = new Set<string>();
	for (const v of volumes) {
		const mount = v.name ? mountPathByVolume.get(v.name) : undefined;
		if (v.hostPath?.path) {
			mounts.push({
				type: "bind",
				source: v.hostPath.path,
				target: mount?.path ?? "",
				readOnly: mount?.readOnly ?? false,
			});
		} else if (v.persistentVolumeClaim?.claimName) {
			mounts.push({
				type: "volume",
				source: v.persistentVolumeClaim.claimName,
				target: mount?.path ?? "",
				readOnly: Boolean(v.persistentVolumeClaim.readOnly || mount?.readOnly),
			});
		} else if (v.secret?.secretName) {
			secretNames.add(v.secret.secretName);
		} else if (v.configMap?.name) {
			configNames.add(v.configMap.name);
		}
	}
	for (const c of containers) {
		for (const ef of c.envFrom ?? []) {
			if (ef.secretRef?.name) secretNames.add(ef.secretRef.name);
			if (ef.configMapRef?.name) configNames.add(ef.configMapRef.name);
		}
	}

	return {
		...summary,
		mode: e.kind === "DaemonSet" ? "global" : "replicated",
		created: iso(meta.creationTimestamp),
		updated: iso(meta.creationTimestamp),
		env: (first?.env ?? [])
			.filter((v) => v.name)
			.map((v) => `${v.name}=${v.value ?? ""}`),
		labels: Object.entries(meta.labels ?? {}).map(([k, v]) => ({ k, v })),
		networks: [],
		mounts,
		secrets: [...secretNames],
		configs: [...configNames],
	};
}

export function mapPodTask(p: KubePod): TaskSummary {
	const ns = p.metadata?.namespace ?? "default";
	const name = p.metadata?.name ?? "";
	const owner = podOwnerWorkload(p);
	const phase = (p.status?.phase ?? "unknown").toLowerCase();
	return {
		id: podTaskId(ns, name),
		serviceId: owner ? workloadId(owner.kind, ns, owner.name) : "",
		nodeId: p.spec?.nodeName ?? "",
		state: phase === "succeeded" ? "complete" : phase,
		desiredState: "running",
		slot: podSlot(name),
		timestamp: iso(p.status?.startTime),
		name,
	};
}

/** Cluster health from node readiness; control-plane nodes count as managers. */
export function evaluateKubeClusterHealth(nodes: KubeNode[]): ClusterHealth {
	if (nodes.length === 0) {
		return { status: "unknown", managersReady: 0, managersTotal: 0 };
	}
	const managers = nodes.filter((n) => nodeRole(n) === "manager");
	const managersTotal = managers.length;
	const managersReady = managers.filter(nodeReady).length;
	const allReady = nodes.every((n) => nodeReady(n) && !n.spec?.unschedulable);
	if (managersTotal > 0 && managersReady < quorumSize(managersTotal)) {
		return { status: "unhealthy", managersReady, managersTotal };
	}
	return { status: allReady ? "healthy" : "degraded", managersReady, managersTotal };
}

function formatSize(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes)) return "—";
	if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
	if (bytes >= 1e9) return `${Math.round(bytes / 1e9)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.round(bytes / 1e3)} KB`;
}

function mapStampedKube(s: KubeStamped): StampedSummary {
	const created = iso(s.metadata?.creationTimestamp);
	return {
		id: s.metadata?.uid ?? `${s.metadata?.namespace}/${s.metadata?.name}`,
		name: s.metadata?.name ?? "",
		created,
		updated: created,
		stack: s.metadata?.namespace ?? null,
	};
}

export class ManifestValidationError extends Error {
	constructor(
		public readonly detail: string,
		options?: ErrorOptions
	) {
		super(`invalid manifest: ${detail}`, options);
		this.name = "ManifestValidationError";
	}
}

/**
 * Validate a multi-document manifest YAML: every document must be an object
 * with apiVersion, kind and metadata.name. Returns the parsed documents.
 */
export function validateManifestYaml(yamlText: string): Array<Record<string, unknown>> {
	if (!yamlText.trim()) throw new ManifestValidationError("empty manifest");
	let docs: unknown[];
	try {
		docs = yaml.loadAll(yamlText);
	} catch (e) {
		throw new ManifestValidationError(e instanceof Error ? e.message : String(e), { cause: e });
	}
	const out: Array<Record<string, unknown>> = [];
	for (const doc of docs) {
		if (doc === null || doc === undefined) continue;
		if (typeof doc !== "object" || Array.isArray(doc)) {
			throw new ManifestValidationError("each document must be a mapping");
		}
		const d = doc as Record<string, unknown>;
		const meta = d.metadata as { name?: unknown } | undefined;
		if (typeof d.apiVersion !== "string" || !d.apiVersion) {
			throw new ManifestValidationError("document is missing apiVersion");
		}
		if (typeof d.kind !== "string" || !d.kind) {
			throw new ManifestValidationError("document is missing kind");
		}
		if (typeof meta?.name !== "string" || !meta.name) {
			throw new ManifestValidationError("document is missing metadata.name");
		}
		out.push(d);
	}
	if (out.length === 0) throw new ManifestValidationError("no documents in manifest");
	return out;
}

const CLUSTER_SCOPED_KINDS = new Set([
	"Namespace",
	"Node",
	"ClusterRole",
	"ClusterRoleBinding",
	"PersistentVolume",
	"StorageClass",
	"CustomResourceDefinition",
	"PriorityClass",
	"IngressClass",
]);

export class KubernetesOrchestrator implements Orchestrator {
	readonly kind = "kubernetes" as const;
	readonly capabilities: OrchestratorCapabilities = {
		composeDeploy: false,
		manifestApply: true,
		networks: false,
	};

	constructor(
		private readonly cfg: SwarmbotConfig,
		readonly kube: KubeApi
	) {}

	private get ns(): string | undefined {
		return this.cfg.k8sNamespace;
	}

	private async listWorkloadEntries(): Promise<WorkloadEntry[]> {
		const [deployments, statefulSets, daemonSets] = await Promise.all([
			this.kube.listDeployments(this.ns),
			this.kube.listStatefulSets(this.ns),
			this.kube.listDaemonSets(this.ns),
		]);
		return [
			...deployments.map((workload): WorkloadEntry => ({ kind: "Deployment", workload })),
			...statefulSets.map((workload): WorkloadEntry => ({ kind: "StatefulSet", workload })),
			...daemonSets.map((workload): WorkloadEntry => ({ kind: "DaemonSet", workload })),
		];
	}

	async listNodes(): Promise<NodeSummary[]> {
		const nodes = await this.kube.listNodes();
		return nodes.map(mapKubeNode);
	}

	async listServices(): Promise<ServiceSummary[]> {
		const [entries, services] = await Promise.all([
			this.listWorkloadEntries(),
			this.kube.listServices(this.ns),
		]);
		return entries.map((e) => mapWorkloadSummary(e, services));
	}

	async getService(id: string): Promise<ServiceDetail | null> {
		const ref = parseWorkloadId(id);
		if (!ref) return null;
		const [entries, services] = await Promise.all([
			this.listWorkloadEntries(),
			this.kube.listServices(this.ns),
		]);
		const entry = entries.find(
			(e) =>
				e.kind === ref.kind &&
				e.workload.metadata?.namespace === ref.namespace &&
				e.workload.metadata?.name === ref.name
		);
		return entry ? mapWorkloadDetail(entry, services) : null;
	}

	async listTasks(): Promise<TaskSummary[]> {
		const pods = await this.kube.listPods(this.ns);
		return pods.map(mapPodTask);
	}

	async listStacks(): Promise<StackAgg[]> {
		const [namespaces, entries, pvcs, configMaps, secrets] = await Promise.all([
			this.kube.listNamespaces(),
			this.listWorkloadEntries(),
			this.kube.listPvcs(this.ns),
			this.kube.listConfigMaps(this.ns),
			this.kube.listSecrets(this.ns),
		]);
		const countByNs = (items: Array<{ metadata?: { namespace?: string } }>) => {
			const m = new Map<string, number>();
			for (const it of items) {
				const ns = it.metadata?.namespace;
				if (!ns) continue;
				m.set(ns, (m.get(ns) ?? 0) + 1);
			}
			return m;
		};
		const workloadsByNs = countByNs(entries.map((e) => e.workload));
		const pvcByNs = countByNs(pvcs);
		const cmByNs = countByNs(configMaps);
		const secByNs = countByNs(secrets);
		return namespaces
			.map((n) => n.metadata?.name ?? "")
			.filter((name) => name && (!this.ns || name === this.ns))
			.map((name) => ({
				name,
				services: workloadsByNs.get(name) ?? 0,
				networks: 0,
				volumes: pvcByNs.get(name) ?? 0,
				configs: cmByNs.get(name) ?? 0,
				secrets: secByNs.get(name) ?? 0,
				status: "RUNNING",
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async listNetworks(): Promise<NetworkSummary[]> {
		return [];
	}

	async listVolumes(): Promise<VolumeSummary[]> {
		const pvcs = await this.kube.listPvcs(this.ns);
		return pvcs.map((p) => ({
			name: p.metadata?.name ?? "",
			driver: p.spec?.storageClassName ?? "pvc",
			size: formatSize(
				parseQuantity(
					p.status?.capacity?.["storage"] ?? p.spec?.resources?.requests?.["storage"]
				)
			),
			mountpoint: null,
			stack: p.metadata?.namespace ?? null,
		}));
	}

	async listSecrets(): Promise<StampedSummary[]> {
		const secrets = await this.kube.listSecrets(this.ns);
		return secrets
			.filter((s) => s.type !== "kubernetes.io/service-account-token")
			.map(mapStampedKube);
	}

	async listConfigs(): Promise<ConfigSummary[]> {
		const configMaps = await this.kube.listConfigMaps(this.ns);
		return configMaps.map((c) => ({ ...mapStampedKube(c), content: null }));
	}

	async clusterHealth(): Promise<ClusterHealth> {
		const nodes = await this.kube.listNodes();
		return evaluateKubeClusterHealth(nodes);
	}

	async serviceLogs(serviceId: string, opts?: { tail?: number }): Promise<string> {
		const ref = parseWorkloadId(serviceId);
		if (!ref) throw new Error(`invalid workload id: ${serviceId}`);
		const pods = await this.kube.listPods(ref.namespace);
		const pod = pods
			.map((p) => ({ pod: p, owner: podOwnerWorkload(p) }))
			.find(
				(x) =>
					x.owner?.kind === ref.kind &&
					x.owner.name === ref.name &&
					(x.pod.status?.phase ?? "") === "Running"
			)?.pod;
		if (!pod?.metadata?.name) {
			throw new Error(`no running pod for workload ${serviceId}`);
		}
		return this.kube.podLogs(ref.namespace, pod.metadata.name, {
			tail: opts?.tail ?? 500,
		});
	}

	/** Server-side apply of raw manifests into namespace `name` (the "stack"). */
	async deployStack(name: string, manifestYaml: string): Promise<void> {
		const docs = validateManifestYaml(manifestYaml);
		const namespaced = docs.map((d) => {
			const kind = String(d.kind ?? "");
			if (CLUSTER_SCOPED_KINDS.has(kind)) return d;
			const meta = { ...(d.metadata as Record<string, unknown>) };
			if (!meta.namespace) meta.namespace = name;
			return { ...d, metadata: meta };
		});
		const hasNamespaceDoc = docs.some((d) => d.kind === "Namespace");
		const manifests = hasNamespaceDoc
			? namespaced
			: [
					{
						apiVersion: "v1",
						kind: "Namespace",
						metadata: { name },
					},
					...namespaced,
				];
		await this.kube.apply(manifests);
	}
}
