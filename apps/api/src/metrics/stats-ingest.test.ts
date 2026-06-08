import { describe, it, expect } from "vitest";
import { parseStatsBatch, parseStatsMessage } from "./stats-ingest.js";

describe("parseStatsMessage", () => {
	it("returns null without node id", () => {
		expect(parseStatsMessage({ cpu: { used_percentage: 10 } })).toBeNull();
	});

	it("parses containers when sent as a JSON string", () => {
		const batch = parseStatsBatch({
			id: "node-abc",
			containers: JSON.stringify([
				{ id: "c1", name: "/stack_svc.1.x", cpuPercentage: 12, memoryPercentage: 34 },
			]),
		});
		expect(batch?.containers).toHaveLength(1);
	});

	it("parses containers array from current agent", () => {
		const batch = parseStatsBatch({
			id: "node-abc",
			containers: [{ id: "c1", name: "/stack_svc.1.x", cpuPercentage: 12, memoryPercentage: 34 }],
		});
		expect(batch?.containers).toHaveLength(1);
	});

	it("parses container tasks in batch", () => {
		const batch = parseStatsBatch({
			id: "node-abc",
			tasks: [{ id: "c1", name: "/stack_svc.1.x", cpuPercentage: 12, memoryPercentage: 34 }],
		});
		expect(batch?.containers).toHaveLength(1);
		expect(batch?.containers[0]?.cpu).toBe(12);
	});

	it("parses agent status payload", () => {
		const parsed = parseStatsMessage({
			id: "node-abc",
			hostname: "swarm-manager",
			agentVersion: "0.1.0",
			cpu: { used_percentage: 42.7, cores: 8 },
			memory: { total: 16_000_000_000, used: 8_000_000_000, used_percentage: 50 },
			disk: { total: 1_000_000_000_000, used: 250_000_000_000, used_percentage: 25 },
		});
		expect(parsed).toMatchObject({
			nodeId: "node-abc",
			cpu: 43,
			mem: 50,
			disk: 25,
			cpuCores: 8,
			agentVersion: "0.1.0",
		});
	});
});
