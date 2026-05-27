import { describe, it, expect } from "vitest";
import { evaluateClusterHealth, quorumSize } from "./cluster-health.js";

describe("quorumSize", () => {
	it("matches Swarm Raft formula", () => {
		expect(quorumSize(1)).toBe(1);
		expect(quorumSize(3)).toBe(2);
		expect(quorumSize(5)).toBe(3);
	});
});

describe("evaluateClusterHealth", () => {
	const manager = (ready: boolean, drain = false): object => ({
		Spec: { Role: "manager", Availability: drain ? "drain" : "active" },
		Status: { State: ready ? "ready" : "down" },
		ManagerStatus: { Reachability: "reachable" },
	});

	const worker = (ready: boolean): object => ({
		Spec: { Role: "worker", Availability: "active" },
		Status: { State: ready ? "ready" : "down" },
	});

	it("healthy when quorum met and all nodes ready", () => {
		const h = evaluateClusterHealth([
			manager(true),
			manager(true),
			manager(true),
			worker(true),
		] as never[]);
		expect(h.status).toBe("healthy");
		expect(h.managersReady).toBe(3);
		expect(h.managersTotal).toBe(3);
	});

	it("unhealthy when quorum lost", () => {
		const h = evaluateClusterHealth([
			manager(true),
			manager(false),
			manager(false),
		] as never[]);
		expect(h.status).toBe("unhealthy");
		expect(h.managersReady).toBe(1);
	});

	it("degraded when quorum ok but worker down", () => {
		const h = evaluateClusterHealth([manager(true), manager(true), worker(false)] as never[]);
		expect(h.status).toBe("degraded");
	});
});
