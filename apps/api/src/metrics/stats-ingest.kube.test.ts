import { describe, it, expect } from "vitest";
import { parseStatsBatch } from "./stats-ingest.js";
import { buildInfluxLines } from "./influx-write.js";

const kubeStatsMessage = {
	type: "stats",
	message: {
		id: "k3s-agent-01",
		hostname: "k3s-agent-01",
		agentVersion: "0.4.0",
		orchestrator: "kubernetes",
		cpu: { used_percentage: 41, cores: 8 },
		memory: { total: 16_000, used: 8_000 },
		disk: { total: 100_000, used: 25_000 },
		containers: [
			{
				id: "frontend/nginx-6d4cf56db6-abcde/nginx",
				name: "nginx",
				cpuPercentage: 12,
				memoryPercentage: 30,
				namespace: "frontend",
				pod: "nginx-6d4cf56db6-abcde",
				workload: "nginx",
				workloadKind: "Deployment",
			},
		],
	},
};

describe("parseStatsBatch (kubernetes payload)", () => {
	it("carries orchestrator and per-container kube metadata", () => {
		const batch = parseStatsBatch(kubeStatsMessage);
		expect(batch).not.toBeNull();
		expect(batch!.orchestrator).toBe("kubernetes");
		expect(batch!.node.nodeId).toBe("k3s-agent-01");
		const c = batch!.containers[0]!;
		expect(c.containerId).toBe("frontend/nginx-6d4cf56db6-abcde/nginx");
		expect(c.namespace).toBe("frontend");
		expect(c.pod).toBe("nginx-6d4cf56db6-abcde");
		expect(c.workload).toBe("nginx");
		expect(c.workloadKind).toBe("Deployment");
	});

	it("keeps orchestrator null for legacy swarm payloads", () => {
		const batch = parseStatsBatch({
			message: {
				id: "n1",
				hostname: "h1",
				containers: [{ id: "c1", name: "web", cpuPercentage: 1 }],
			},
		});
		expect(batch!.orchestrator).toBeNull();
		const c = batch!.containers[0]!;
		expect(c.namespace).toBeNull();
		expect(c.workloadKind).toBeNull();
	});

	it("normalizes unknown orchestrator values to null", () => {
		const batch = parseStatsBatch({ message: { id: "n1", orchestrator: "nomad" } });
		expect(batch!.orchestrator).toBeNull();
	});
});

describe("buildInfluxLines (kubernetes)", () => {
	it("tags series with orchestrator and namespace-as-stack", () => {
		const batch = parseStatsBatch(kubeStatsMessage)!;
		const mappings = new Map([
			[
				batch.containers[0]!.containerId,
				{
					taskId: "frontend/nginx-6d4cf56db6-abcde",
					serviceId: "Deployment:frontend:nginx",
					serviceName: "nginx",
					stack: "frontend",
				},
			],
		]);
		const lines = buildInfluxLines(
			batch.node,
			batch.containers,
			mappings,
			new Map([[batch.containers[0]!.containerId, "frontend"]]),
			"kubernetes"
		);
		const nodeLine = lines.find((l) => l.startsWith("node_cpu,"))!;
		expect(nodeLine).toContain("orchestrator=kubernetes");
		const containerLine = lines.find((l) => l.startsWith("container_cpu,"))!;
		expect(containerLine).toContain("orchestrator=kubernetes");
		expect(containerLine).toContain("stack=frontend");
		expect(containerLine).toContain("namespace=frontend");
		expect(containerLine).toContain("service_name=nginx");
	});

	it("defaults to swarm tagging without the extra namespace tag", () => {
		const batch = parseStatsBatch({
			message: { id: "n1", containers: [{ id: "c1", name: "w" }] },
		})!;
		const lines = buildInfluxLines(batch.node, batch.containers, new Map());
		const containerLine = lines.find((l) => l.startsWith("container_cpu,"))!;
		expect(containerLine).toContain("orchestrator=swarm");
		expect(containerLine).not.toContain("namespace=");
	});
});
