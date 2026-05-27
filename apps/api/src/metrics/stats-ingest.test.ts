import { describe, it, expect } from "vitest";
import { parseStatsMessage } from "./stats-ingest.js";

describe("parseStatsMessage", () => {
	it("returns null without node id", () => {
		expect(parseStatsMessage({ cpu: { used_percentage: 10 } })).toBeNull();
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
