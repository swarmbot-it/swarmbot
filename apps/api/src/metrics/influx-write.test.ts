import { describe, it, expect } from "vitest";
import { buildInfluxLines } from "./influx-write.js";

describe("buildInfluxLines", () => {
	it("writes node and container measurements", () => {
		const lines = buildInfluxLines(
			{
				nodeId: "n1",
				hostname: "host1",
				cpu: 10,
				mem: 20,
				disk: 30,
				cpuCores: 4,
				memTotal: 1,
				memUsed: 1,
				diskTotal: 1,
				diskUsed: 1,
				agentVersion: "0.1.0",
			},
			[
				{
					containerId: "c1",
					containerName: "/frontend_web.1.abc",
					cpu: 5,
					mem: 15,
					namespace: null,
					pod: null,
					workload: null,
					workloadKind: null,
				},
			],
			new Map([
				[
					"c1",
					{
						taskId: "t1",
						serviceId: "s1",
						serviceName: "web",
						stack: "frontend",
					},
				],
			])
		);
		expect(lines.some((l) => l.startsWith("node_cpu,"))).toBe(true);
		expect(lines.some((l) => l.includes("container_cpu,") && l.includes("stack=frontend"))).toBe(
			true
		);
	});
});
