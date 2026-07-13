/**
 * Kubernetes counterpart of swarm-mapper: maps an agent-reported container
 * to its pod / workload / namespace.
 *
 * Resolution order:
 *   1. metadata pushed by the agent in the payload (namespace/pod/workload),
 *   2. the container id itself (`{namespace}/{pod}/{container}`),
 *   3. the apiserver (pod list cached for ~45 s, like swarm-mapper).
 */
import type { KubeApi, KubePod } from "../orchestrator/kubernetes/kube-api.js";
import { podOwnerWorkload, podTaskId, workloadId } from "../orchestrator/kubernetes/adapter.js";
import type { ParsedContainerStats } from "./stats-ingest.js";
import type { ContainerMapping } from "./swarm-mapper.js";

export type KubeContainerMapping = ContainerMapping & {
	namespace: string | null;
};

const REFRESH_MS = 45_000;

let podsByKey = new Map<string, KubePod>();
let lastRefresh = 0;

/** Split an agent container id `{namespace}/{pod}/{container}` into parts. */
export function parseKubeContainerId(
	containerId: string
): { namespace: string; pod: string; container: string } | null {
	const parts = containerId.split("/");
	if (parts.length !== 3) return null;
	const [namespace, pod, container] = parts;
	if (!namespace || !pod || !container) return null;
	return { namespace, pod, container };
}

async function refreshPodCache(kube: KubeApi): Promise<void> {
	const pods = await kube.listPods();
	const next = new Map<string, KubePod>();
	for (const p of pods) {
		const ns = p.metadata?.namespace;
		const name = p.metadata?.name;
		if (ns && name) next.set(`${ns}/${name}`, p);
	}
	podsByKey = next;
	lastRefresh = Date.now();
}

async function podFromApiserver(
	kube: KubeApi | null,
	namespace: string,
	pod: string
): Promise<KubePod | null> {
	if (!kube) return null;
	if (Date.now() - lastRefresh > REFRESH_MS) {
		try {
			await refreshPodCache(kube);
		} catch {
			/* keep stale cache */
		}
	}
	return podsByKey.get(`${namespace}/${pod}`) ?? null;
}

/**
 * Resolve a container reported by the agent to a task/workload/stack mapping.
 * Prefers payload metadata; falls back to the container id format and then
 * to the (cached) apiserver pod list.
 */
export async function resolveKubeContainerMapping(
	kube: KubeApi | null,
	c: ParsedContainerStats
): Promise<KubeContainerMapping | null> {
	const fromId = parseKubeContainerId(c.containerId);
	const namespace = c.namespace ?? fromId?.namespace ?? null;
	const pod = c.pod ?? fromId?.pod ?? null;
	if (!namespace || !pod) return null;

	let workload = c.workload;
	let workloadKind = c.workloadKind;

	if (!workload) {
		const apiPod = await podFromApiserver(kube, namespace, pod);
		const owner = apiPod ? podOwnerWorkload(apiPod) : null;
		if (owner) {
			workload = owner.name;
			workloadKind = owner.kind;
		}
	}

	const kind = normalizeWorkloadKind(workloadKind);
	return {
		taskId: podTaskId(namespace, pod),
		serviceId: workload && kind ? workloadId(kind, namespace, workload) : "",
		serviceName: workload ?? pod,
		stack: namespace,
		namespace,
	};
}

function normalizeWorkloadKind(
	kind: string | null | undefined
): "Deployment" | "StatefulSet" | "DaemonSet" | null {
	switch ((kind ?? "").toLowerCase()) {
		case "deployment":
			return "Deployment";
		case "statefulset":
			return "StatefulSet";
		case "daemonset":
			return "DaemonSet";
		default:
			return null;
	}
}

/** Test-only reset. */
export function __clearKubeMapperForTests(): void {
	podsByKey.clear();
	lastRefresh = 0;
}
