import { describe, it, expect, beforeEach } from "vitest";
import {
	__clearStatsStoreForTests,
	getClusterOverviewMetrics,
	getNodeAgentVersion,
	getNodeLiveMetrics,
	getClusterMetricsSeries,
	ingestNodeStats,
} from "./stats-store.js";

describe("stats-store", () => {
	beforeEach(() => __clearStatsStoreForTests());

	it("aggregates cluster metrics from node samples", () => {
		ingestNodeStats({
			nodeId: "n1",
			hostname: "swarm-manager",
			agentVersion: "0.1.0",
			cpu: 40,
			mem: 50,
			disk: 60,
			cpuCores: 4,
			memTotal: 8e9,
			memUsed: 4e9,
			diskTotal: 1e12,
			diskUsed: 5e11,
		});
		ingestNodeStats({
			nodeId: "n2",
			hostname: "swarm-worker-1",
			agentVersion: null,
			cpu: 80,
			mem: 30,
			disk: 20,
			cpuCores: 8,
			memTotal: 16e9,
			memUsed: 4.8e9,
			diskTotal: 2e12,
			diskUsed: 4e11,
		});

		const live = getNodeLiveMetrics("n1", "swarm-manager");
		expect(live).toEqual({ cpu: 40, mem: 50, disk: 60 });
		expect(getNodeAgentVersion("n1", "swarm-manager")).toBe("0.1.0");
		expect(getNodeAgentVersion("n2", "swarm-worker-1")).toBeNull();

		const cluster = getClusterOverviewMetrics();
		expect(cluster?.cpuCores).toBe(12);
		expect(cluster?.cpu).toBe(Math.round((40 * 4 + 80 * 8) / 12));
		expect(cluster?.mem).toBeGreaterThan(0);

		const series = getClusterMetricsSeries("1h", "high");
		expect(series?.cpu.length).toBeGreaterThan(0);
	});
});
