import { describe, it, expect } from "vitest";
import { loadConfig, type Sw4rmBotConfig } from "../../config.js";
import {
	evaluateKubeClusterHealth,
	KubernetesOrchestrator,
	ManifestValidationError,
	mapKubeNode,
	mapPodTask,
	parseQuantityBytes,
	parseWorkloadId,
	podOwnerWorkload,
	podSlot,
	validateManifestYaml,
	workloadId,
	workloadPorts,
} from "./adapter.js";
import { createMockKube } from "./mock.js";
import type { KubeNode, KubePod } from "./kube-api.js";

function cfg(overrides: Partial<Sw4rmBotConfig> = {}): Sw4rmBotConfig {
	return { ...loadConfig(), mock: true, mockOrchestrator: "kubernetes", ...overrides };
}

function orch(overrides: Partial<Sw4rmBotConfig> = {}): KubernetesOrchestrator {
	return new KubernetesOrchestrator(cfg(overrides), createMockKube());
}

const readyNode = (name: string, controlPlane: boolean, ready = true): KubeNode => ({
	metadata: {
		name,
		labels: controlPlane ? { "node-role.kubernetes.io/control-plane": "" } : {},
	},
	status: { conditions: [{ type: "Ready", status: ready ? "True" : "False" }] },
});

describe("workload / pod identity helpers", () => {
	it("round-trips workload ids", () => {
		const id = workloadId("Deployment", "frontend", "nginx");
		expect(parseWorkloadId(id)).toEqual({
			kind: "Deployment",
			namespace: "frontend",
			name: "nginx",
		});
	});

	it("rejects malformed workload ids", () => {
		expect(parseWorkloadId("nginx")).toBeNull();
		expect(parseWorkloadId("Job:ns:x")).toBeNull();
	});

	it("collapses ReplicaSet owners to the Deployment", () => {
		const pod: KubePod = {
			metadata: {
				name: "web-6d4cf56db6-abcde",
				namespace: "frontend",
				ownerReferences: [{ kind: "ReplicaSet", name: "web-6d4cf56db6" }],
			},
		};
		expect(podOwnerWorkload(pod)).toEqual({ kind: "Deployment", name: "web" });
	});

	it("keeps StatefulSet/DaemonSet owners as-is", () => {
		const pod: KubePod = {
			metadata: { ownerReferences: [{ kind: "StatefulSet", name: "postgres" }] },
		};
		expect(podOwnerWorkload(pod)).toEqual({ kind: "StatefulSet", name: "postgres" });
	});

	it("extracts StatefulSet ordinals as slots", () => {
		expect(podSlot("postgres-2")).toBe(2);
		expect(podSlot("web-6d4cf56db6-abcde")).toBe(0);
	});
});

describe("mapKubeNode", () => {
	it("maps a control-plane node to the manager role", () => {
		const n = mapKubeNode({
			metadata: { name: "cp-1", labels: { "node-role.kubernetes.io/control-plane": "" } },
			status: {
				addresses: [{ type: "InternalIP", address: "10.0.0.1" }],
				conditions: [{ type: "Ready", status: "True" }],
				nodeInfo: { containerRuntimeVersion: "containerd://1.7" },
			},
		});
		expect(n.role).toBe("manager");
		expect(n.tags).toContain("CONTROL-PLANE");
		expect(n.tags).toContain("READY");
		expect(n.ip).toBe("10.0.0.1");
		expect(n.dockerVersion).toBe("containerd://1.7");
	});

	it("maps cordoned nodes to drain availability", () => {
		const n = mapKubeNode({
			metadata: { name: "w1" },
			spec: { unschedulable: true },
			status: { conditions: [] },
		});
		expect(n.availability).toBe("drain");
		expect(n.tags).toContain("DRAIN");
		expect(n.role).toBe("worker");
	});
});

describe("mapPodTask", () => {
	it("maps a running pod to a task", () => {
		const t = mapPodTask({
			metadata: {
				name: "postgres-1",
				namespace: "databases",
				ownerReferences: [{ kind: "StatefulSet", name: "postgres" }],
			},
			spec: { nodeName: "k3s-agent-01" },
			status: { phase: "Running", startTime: "2026-07-01T10:00:00Z" },
		});
		expect(t.id).toBe("databases/postgres-1");
		expect(t.serviceId).toBe("StatefulSet:databases:postgres");
		expect(t.nodeId).toBe("k3s-agent-01");
		expect(t.state).toBe("running");
		expect(t.slot).toBe(1);
		expect(t.name).toBe("postgres-1");
	});
});

describe("workloadPorts", () => {
	it("resolves published ports from matching v1.Services", () => {
		const ports = workloadPorts(
			{
				metadata: { namespace: "frontend", name: "nginx" },
				spec: { template: { metadata: { labels: { app: "nginx" } } } },
			},
			[
				{
					metadata: { namespace: "frontend", name: "nginx" },
					spec: {
						type: "NodePort",
						selector: { app: "nginx" },
						ports: [{ port: 80, targetPort: 8080, nodePort: 30080 }],
					},
				},
				{
					metadata: { namespace: "other", name: "nginx" },
					spec: { selector: { app: "nginx" }, ports: [{ port: 99 }] },
				},
			]
		);
		expect(ports).toEqual(["30080→8080"]);
	});
});

describe("evaluateKubeClusterHealth", () => {
	it("is healthy when every node is ready", () => {
		const h = evaluateKubeClusterHealth([readyNode("cp", true), readyNode("w1", false)]);
		expect(h).toEqual({ status: "healthy", managersReady: 1, managersTotal: 1 });
	});

	it("is unhealthy when the control plane loses quorum", () => {
		const h = evaluateKubeClusterHealth([
			readyNode("cp1", true, false),
			readyNode("cp2", true, false),
			readyNode("cp3", true, true),
			readyNode("w1", false),
		]);
		expect(h.status).toBe("unhealthy");
	});

	it("is degraded when a worker is down", () => {
		const h = evaluateKubeClusterHealth([readyNode("cp", true), readyNode("w1", false, false)]);
		expect(h.status).toBe("degraded");
	});

	it("is unknown without nodes", () => {
		expect(evaluateKubeClusterHealth([]).status).toBe("unknown");
	});
});

describe("parseQuantityBytes", () => {
	it("parses binary and decimal suffixes", () => {
		expect(parseQuantityBytes("1Ki")).toBe(1024);
		expect(parseQuantityBytes("10Gi")).toBe(10 * 1024 ** 3);
		expect(parseQuantityBytes("5G")).toBe(5e9);
		expect(parseQuantityBytes("123")).toBe(123);
		expect(parseQuantityBytes("wat")).toBeUndefined();
	});
});

describe("validateManifestYaml", () => {
	it("accepts multi-document manifests", () => {
		const docs = validateManifestYaml(
			"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: b\n"
		);
		expect(docs).toHaveLength(2);
	});

	it("rejects documents without kind/apiVersion/name", () => {
		expect(() => validateManifestYaml("kind: ConfigMap\nmetadata: {name: a}")).toThrow(
			ManifestValidationError
		);
		expect(() => validateManifestYaml("apiVersion: v1\nmetadata: {name: a}")).toThrow(/kind/);
		expect(() => validateManifestYaml("apiVersion: v1\nkind: ConfigMap")).toThrow(
			/metadata.name/
		);
		expect(() => validateManifestYaml("")).toThrow(/empty/);
		expect(() => validateManifestYaml("just a string")).toThrow(ManifestValidationError);
	});
});

describe("KubernetesOrchestrator over the mock apiserver", () => {
	it("lists nodes with a control-plane manager", async () => {
		const nodes = await orch().listNodes();
		expect(nodes.length).toBeGreaterThanOrEqual(4);
		expect(nodes.filter((n) => n.role === "manager").length).toBeGreaterThanOrEqual(1);
	});

	it("lists workloads as services with namespace as stack", async () => {
		const services = await orch().listServices();
		const nginx = services.find((s) => s.name === "nginx");
		expect(nginx).toBeDefined();
		expect(nginx!.stack).toBe("frontend");
		expect(nginx!.replicasTotal).toBeGreaterThan(0);
		expect(nginx!.replicasRunning).toBe(nginx!.replicasTotal);
		expect(nginx!.ports.length).toBeGreaterThan(0);
	});

	it("lists pods as tasks pointing at their workloads", async () => {
		const o = orch();
		const [tasks, services] = await Promise.all([o.listTasks(), o.listServices()]);
		expect(tasks.length).toBeGreaterThan(0);
		const serviceIds = new Set(services.map((s) => s.id));
		const linked = tasks.filter((t) => serviceIds.has(t.serviceId));
		expect(linked.length).toBe(tasks.length);
		for (const t of tasks) expect(t.id).toMatch(/^[a-z0-9-]+\/.+$/);
	});

	it("lists namespaces as stacks with resource counts", async () => {
		const stacks = await orch().listStacks();
		const databases = stacks.find((s) => s.name === "databases");
		expect(databases).toBeDefined();
		expect(databases!.services).toBeGreaterThanOrEqual(2);
		expect(databases!.volumes).toBeGreaterThan(0);
	});

	it("respects the namespace filter", async () => {
		const o = orch({ k8sNamespace: "frontend" });
		const [stacks, services, tasks] = await Promise.all([
			o.listStacks(),
			o.listServices(),
			o.listTasks(),
		]);
		expect(stacks.map((s) => s.name)).toEqual(["frontend"]);
		expect(services.every((s) => s.stack === "frontend")).toBe(true);
		expect(tasks.every((t) => t.id.startsWith("frontend/"))).toBe(true);
	});

	it("exposes service detail with env and published ports", async () => {
		const o = orch();
		const services = await o.listServices();
		const nginx = services.find((s) => s.name === "nginx")!;
		const detail = await o.getService(nginx.id);
		expect(detail).not.toBeNull();
		expect(detail!.mode).toBe("replicated");
		expect(detail!.env).toEqual([{ key: "LOG_LEVEL", value: "info" }]);
		expect(detail!.publishedPorts.some((p) => p.hostPort === 30080)).toBe(true);
	});

	it("returns null detail for unknown ids", async () => {
		expect(await orch().getService("Deployment:none:none")).toBeNull();
		expect(await orch().getService("garbage")).toBeNull();
	});

	it("filters service-account token secrets", async () => {
		const secrets = await orch().listSecrets();
		expect(secrets.some((s) => s.name.includes("default-token"))).toBe(false);
		expect(secrets.length).toBeGreaterThan(0);
	});

	it("hides networks and lists PVCs as volumes", async () => {
		const o = orch();
		expect(await o.listNetworks()).toEqual([]);
		const volumes = await o.listVolumes();
		expect(volumes.length).toBeGreaterThan(0);
		expect(volumes[0]!.driver).toBe("local-path");
		expect(volumes[0]!.size).not.toBe("—");
	});

	it("reports healthy cluster and a display name", async () => {
		const o = orch();
		expect((await o.clusterHealth()).status).toBe("healthy");
		expect(await o.clusterDisplayName()).toBe("k3d-sw4rmbot-mock");
	});

	it("fetches pod logs for a workload", async () => {
		const o = orch();
		const services = await o.listServices();
		const nginx = services.find((s) => s.name === "nginx")!;
		const logs = await o.serviceLogs(nginx.id);
		expect(logs).toContain("nginx");
	});

	it("deploys manifests into the stack namespace", async () => {
		const applied: unknown[] = [];
		const kube = {
			...createMockKube(),
			apply: async (m: unknown[]) => void applied.push(...m),
		};
		const o = new KubernetesOrchestrator(cfg(), kube);
		await o.deployStack(
			"demo",
			"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n"
		);
		const kinds = applied.map((d) => (d as { kind: string }).kind);
		expect(kinds).toEqual(["Namespace", "Deployment"]);
		const deploy = applied[1] as { metadata: { namespace?: string } };
		expect(deploy.metadata.namespace).toBe("demo");
	});
});
