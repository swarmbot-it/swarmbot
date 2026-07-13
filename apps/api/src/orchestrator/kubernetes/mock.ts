/**
 * Mock Kubernetes apiserver (KubeApi implementation).
 *
 * Enabled with SW4RM_BOT_MOCK=true + SW4RM_BOT_MOCK_ORCHESTRATOR=kubernetes.
 * Rich enough for the Angular UI to be demoed and e2e-tested end-to-end
 * without a real k3s cluster.
 */
import type {
	KubeApi,
	KubeNamespace,
	KubeNode,
	KubePod,
	KubePvc,
	KubeService,
	KubeStamped,
	KubeWorkload,
	KubeWorkloadKind,
} from "./kube-api.js";

const CREATED = "2026-05-01T08:00:00Z";

function node(name: string, ip: string, controlPlane: boolean, ready = true): KubeNode {
	return {
		metadata: {
			name,
			labels: controlPlane ? { "node-role.kubernetes.io/control-plane": "true" } : {},
			creationTimestamp: CREATED,
		},
		spec: {},
		status: {
			addresses: [{ type: "InternalIP", address: ip }],
			conditions: [{ type: "Ready", status: ready ? "True" : "False" }],
			nodeInfo: {
				kubeletVersion: "v1.30.2+k3s1",
				containerRuntimeVersion: "containerd://1.7.17-k3s1",
			},
		},
	};
}

const NODES: KubeNode[] = [
	node("k3s-server-01", "10.0.8.11", true),
	node("k3s-agent-01", "10.0.8.21", false),
	node("k3s-agent-02", "10.0.8.22", false),
	node("k3s-agent-03", "10.0.8.23", false),
];

type WorkloadSeed = {
	kind: KubeWorkloadKind;
	namespace: string;
	name: string;
	image: string;
	replicas: number;
	labels: Record<string, string>;
	ports?: Array<{ port: number; targetPort: number; nodePort?: number; type?: string }>;
};

const WORKLOADS: WorkloadSeed[] = [
	{
		kind: "Deployment",
		namespace: "frontend",
		name: "nginx",
		image: "nginx:1.27-alpine",
		replicas: 3,
		labels: { app: "nginx" },
		ports: [{ port: 80, targetPort: 8080, nodePort: 30080, type: "NodePort" }],
	},
	{
		kind: "Deployment",
		namespace: "frontend",
		name: "web",
		image: "ghcr.io/sw4rmbot/web:2.14.0",
		replicas: 4,
		labels: { app: "web" },
		ports: [{ port: 3000, targetPort: 3000 }],
	},
	{
		kind: "Deployment",
		namespace: "api",
		name: "gateway",
		image: "traefik:v3.0",
		replicas: 2,
		labels: { app: "gateway" },
		ports: [
			{ port: 80, targetPort: 8000, nodePort: 30081, type: "NodePort" },
			{ port: 443, targetPort: 8443, nodePort: 30443, type: "NodePort" },
		],
	},
	{
		kind: "Deployment",
		namespace: "api",
		name: "auth",
		image: "ghcr.io/sw4rmbot/auth:1.8.3",
		replicas: 2,
		labels: { app: "auth" },
		ports: [{ port: 8000, targetPort: 8000 }],
	},
	{
		kind: "StatefulSet",
		namespace: "databases",
		name: "postgres",
		image: "postgres:16.3-alpine",
		replicas: 3,
		labels: { app: "postgres" },
		ports: [{ port: 5432, targetPort: 5432 }],
	},
	{
		kind: "StatefulSet",
		namespace: "databases",
		name: "redis",
		image: "redis:7.2-alpine",
		replicas: 3,
		labels: { app: "redis" },
		ports: [{ port: 6379, targetPort: 6379 }],
	},
	{
		kind: "Deployment",
		namespace: "monitoring",
		name: "prometheus",
		image: "prom/prometheus:v2.52.0",
		replicas: 1,
		labels: { app: "prometheus" },
		ports: [{ port: 9090, targetPort: 9090 }],
	},
	{
		kind: "Deployment",
		namespace: "monitoring",
		name: "grafana",
		image: "grafana/grafana:11.0.0",
		replicas: 1,
		labels: { app: "grafana" },
		ports: [{ port: 3000, targetPort: 3000, nodePort: 30300, type: "NodePort" }],
	},
	{
		kind: "DaemonSet",
		namespace: "monitoring",
		name: "node-exporter",
		image: "prom/node-exporter:v1.8.1",
		replicas: NODES.length,
		labels: { app: "node-exporter" },
	},
	{
		kind: "DaemonSet",
		namespace: "sw4rmbot",
		name: "swarmagent",
		image: "ghcr.io/sw4rmbot/swarmagent:0.4.0",
		replicas: NODES.length,
		labels: { app: "swarmagent" },
	},
	{
		kind: "Deployment",
		namespace: "sw4rmbot",
		name: "sw4rmbot",
		image: "ghcr.io/sw4rmbot/sw4rmbot:0.1.4",
		replicas: 1,
		labels: { app: "sw4rmbot" },
		ports: [{ port: 8080, targetPort: 8080, nodePort: 30880, type: "NodePort" }],
	},
];

function workload(seed: WorkloadSeed): KubeWorkload {
	const status =
		seed.kind === "DaemonSet"
			? { desiredNumberScheduled: seed.replicas, numberReady: seed.replicas }
			: { replicas: seed.replicas, readyReplicas: seed.replicas };
	return {
		metadata: {
			name: seed.name,
			namespace: seed.namespace,
			uid: `uid-${seed.kind}-${seed.namespace}-${seed.name}`,
			labels: { ...seed.labels, "app.kubernetes.io/part-of": seed.namespace },
			creationTimestamp: CREATED,
		},
		spec: {
			replicas: seed.kind === "DaemonSet" ? undefined : seed.replicas,
			selector: { matchLabels: seed.labels },
			template: {
				metadata: { labels: seed.labels },
				spec: {
					containers: [
						{
							name: seed.name,
							image: seed.image,
							env: [{ name: "LOG_LEVEL", value: "info" }],
						},
					],
				},
			},
		},
		status,
	};
}

function buildPods(): KubePod[] {
	const pods: KubePod[] = [];
	let counter = 0;
	for (const seed of WORKLOADS) {
		for (let i = 0; i < seed.replicas; i++) {
			counter++;
			const n = NODES[counter % NODES.length]!;
			const suffix =
				seed.kind === "StatefulSet"
					? `${i}`
					: `${(counter * 7919).toString(36).slice(-5)}-${(counter * 104729).toString(36).slice(-5)}`;
			const podName =
				seed.kind === "Deployment"
					? `${seed.name}-6d4cf56db6-${suffix}`
					: seed.kind === "StatefulSet"
						? `${seed.name}-${suffix}`
						: `${seed.name}-${suffix}`;
			const ownerName = seed.kind === "Deployment" ? `${seed.name}-6d4cf56db6` : seed.name;
			const ownerKind = seed.kind === "Deployment" ? "ReplicaSet" : seed.kind;
			pods.push({
				metadata: {
					name: podName,
					namespace: seed.namespace,
					uid: `uid-pod-${seed.namespace}-${podName}`,
					labels: seed.labels,
					ownerReferences: [{ kind: ownerKind, name: ownerName, controller: true }],
				},
				spec: {
					nodeName: n.metadata!.name!,
					containers: [{ name: seed.name, image: seed.image }],
				},
				status: {
					phase: "Running",
					startTime: new Date(Date.now() - (counter % 8) * 3600_000).toISOString(),
					conditions: [{ type: "Ready", status: "True" }],
				},
			});
		}
	}
	return pods;
}
const PODS = buildPods();

const SERVICES: KubeService[] = WORKLOADS.filter((w) => w.ports?.length).map((w) => ({
	metadata: { name: w.name, namespace: w.namespace, creationTimestamp: CREATED },
	spec: {
		type: w.ports![0]!.type ?? "ClusterIP",
		selector: w.labels,
		ports: w.ports!.map((p) => ({
			port: p.port,
			targetPort: p.targetPort,
			nodePort: p.nodePort,
			protocol: "TCP",
		})),
	},
}));

const NAMESPACES: KubeNamespace[] = [
	"frontend",
	"api",
	"databases",
	"monitoring",
	"sw4rmbot",
	"kube-system",
].map((name) => ({
	metadata: { name, creationTimestamp: CREATED },
	status: { phase: "Active" },
}));

const PVCS: KubePvc[] = [
	pvc("databases", "data-postgres-0", "local-path", "180Gi"),
	pvc("databases", "data-postgres-1", "local-path", "180Gi"),
	pvc("databases", "data-postgres-2", "local-path", "180Gi"),
	pvc("databases", "data-redis-0", "local-path", "12Gi"),
	pvc("databases", "data-redis-1", "local-path", "12Gi"),
	pvc("databases", "data-redis-2", "local-path", "12Gi"),
	pvc("monitoring", "prometheus-data", "local-path", "90Gi"),
	pvc("monitoring", "grafana-data", "local-path", "2Gi"),
	pvc("sw4rmbot", "couchdb-data", "local-path", "8Gi"),
	pvc("sw4rmbot", "influxdb-data", "local-path", "32Gi"),
];

function pvc(namespace: string, name: string, sc: string, storage: string): KubePvc {
	return {
		metadata: {
			name,
			namespace,
			uid: `uid-pvc-${namespace}-${name}`,
			creationTimestamp: CREATED,
		},
		spec: { storageClassName: sc, resources: { requests: { storage } } },
		status: { phase: "Bound", capacity: { storage } },
	};
}

function stamped(namespace: string, name: string, type?: string): KubeStamped {
	return {
		metadata: {
			name,
			namespace,
			uid: `uid-st-${namespace}-${name}`,
			creationTimestamp: CREATED,
		},
		...(type ? { type } : {}),
	};
}

const CONFIGMAPS: KubeStamped[] = [
	stamped("frontend", "nginx-conf"),
	stamped("api", "gateway-static"),
	stamped("api", "gateway-dynamic"),
	stamped("monitoring", "prometheus-config"),
	stamped("monitoring", "grafana-datasources"),
	stamped("databases", "postgres-init"),
	stamped("sw4rmbot", "sw4rmbot-env"),
];

const SECRETS: KubeStamped[] = [
	stamped("databases", "postgres-password", "Opaque"),
	stamped("api", "jwt-signing-key", "Opaque"),
	stamped("api", "tls-wildcard", "kubernetes.io/tls"),
	stamped("sw4rmbot", "couchdb-credentials", "Opaque"),
	stamped("kube-system", "default-token-x1y2z", "kubernetes.io/service-account-token"),
];

const LOG_SAMPLE =
	"2026-05-16T08:00:01.123Z starting nginx...\n" +
	"2026-05-16T08:00:01.420Z listening on 0.0.0.0:80\n" +
	"2026-05-16T08:00:14.901Z 200 GET / 1.2ms\n" +
	"2026-05-16T08:00:23.502Z 200 GET /favicon.ico 0.8ms\n" +
	"2026-05-16T08:00:42.118Z 200 GET / 1.1ms\n";

function inNs<T extends { metadata?: { namespace?: string } }>(
	items: T[],
	namespace?: string
): T[] {
	return namespace ? items.filter((i) => i.metadata?.namespace === namespace) : items;
}

export function createMockKube(): KubeApi {
	const workloads = WORKLOADS.map((s) => ({ seed: s, obj: workload(s) }));
	const byKind = (kind: KubeWorkloadKind, ns?: string) =>
		inNs(
			workloads.filter((w) => w.seed.kind === kind).map((w) => w.obj),
			ns
		);
	return {
		contextName: () => "k3d-sw4rmbot-mock",
		listNodes: async () => NODES,
		listNamespaces: async () => NAMESPACES,
		listPods: async (ns?: string) => inNs(PODS, ns),
		listDeployments: async (ns?: string) => byKind("Deployment", ns),
		listStatefulSets: async (ns?: string) => byKind("StatefulSet", ns),
		listDaemonSets: async (ns?: string) => byKind("DaemonSet", ns),
		listServices: async (ns?: string) => inNs(SERVICES, ns),
		listPvcs: async (ns?: string) => inNs(PVCS, ns),
		listConfigMaps: async (ns?: string) => inNs(CONFIGMAPS, ns),
		listSecrets: async (ns?: string) => inNs(SECRETS, ns),
		podLogs: async () => LOG_SAMPLE,
		apply: async () => {
			/* mock: accepted, nothing to do */
		},
	};
}
