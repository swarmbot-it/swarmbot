import { describe, it, expect } from "vitest";
import {
	aggregateStacks,
	formatPorts,
	mapNetworkSummary,
	mapNodeSummary,
	mapServiceSummary,
	replicaCountsByService,
	mapStamped,
	mapTaskSummary,
	mapVolumeSummary,
	negotiateApiVersion,
} from "./engine.js";

describe("negotiateApiVersion", () => {
	it("clamps to daemon max", () => {
		expect(negotiateApiVersion("1.30", "1.44")).toBe("1.30");
	});
	it("clamps to our max", () => {
		expect(negotiateApiVersion("99.0", "1.44")).toBe("1.44");
	});
});

describe("mapServiceSummary", () => {
	it("extracts replicas, image, ports, stack label", () => {
		const s = {
			ID: "abc",
			Spec: {
				Name: "frontend_web",
				Labels: { "com.docker.stack.namespace": "frontend" },
				TaskTemplate: { ContainerSpec: { Image: "nginx:alpine" } },
				Mode: { Replicated: { Replicas: 3 } },
				EndpointSpec: {
					Ports: [{ PublishedPort: 80, TargetPort: 8080 }],
				},
			},
		};
		expect(mapServiceSummary(s as never)).toEqual({
			id: "abc",
			name: "frontend_web",
			image: "nginx:alpine",
			replicasRunning: 0,
			replicasTotal: 3,
			ports: ["80→8080"],
			status: "RUNNING",
			stack: "frontend",
		});
		expect(mapServiceSummary(s as never, { running: 2, total: 3 })).toMatchObject({
			replicasRunning: 2,
			replicasTotal: 3,
		});
	});

	it("uses task counts for global services", () => {
		const s = {
			ID: "g",
			Spec: {
				Name: "agent",
				TaskTemplate: { ContainerSpec: { Image: "x" } },
				Mode: { Global: {} },
			},
		};
		const r = mapServiceSummary(s as never, { running: 3, total: 3 });
		expect(r.replicasRunning).toBe(3);
		expect(r.replicasTotal).toBe(3);
	});
});

describe("replicaCountsByService", () => {
	it("counts running tasks per service id", () => {
		const m = replicaCountsByService([
			{ ServiceID: "s1", Status: { State: "running" } },
			{ ServiceID: "s1", Status: { State: "shutdown" } },
			{ ServiceID: "s1", Status: { State: "running" } },
			{ ServiceID: "s2", Status: { State: "failed" } },
		]);
		expect(m.get("s1")).toEqual({ running: 2, total: 3 });
		expect(m.get("s2")).toEqual({ running: 0, total: 1 });
	});
});

describe("mapNodeSummary", () => {
	it("builds tags from role, leader, availability", () => {
		const n = {
			ID: "n1",
			Description: { Hostname: "host-a", Engine: { EngineVersion: "26.1.3" } },
			Status: { Addr: "10.0.0.1", State: "ready" },
			Spec: { Role: "manager", Availability: "active" },
			ManagerStatus: { Leader: true, Reachability: "reachable" },
		};
		const r = mapNodeSummary(n as never);
		expect(r.hostname).toBe("host-a");
		expect(r.ip).toBe("10.0.0.1");
		expect(r.dockerVersion).toBe("26.1.3");
		expect(r.tags).toContain("LEADER");
		expect(r.tags).toContain("MANAGER");
		expect(r.tags).toContain("ACTIVE");
		expect(r.tags).toContain("READY");
	});

	it("flags DRAIN availability", () => {
		const n = {
			ID: "n2",
			Description: { Hostname: "h" },
			Spec: { Role: "worker", Availability: "drain" },
		};
		expect(mapNodeSummary(n as never).tags).toContain("DRAIN");
	});
});

describe("network/volume/task/stamped mappers", () => {
	it("network extracts subnet/gateway from IPAM", () => {
		const n = {
			Id: "net1",
			Name: "frontend_default",
			Driver: "overlay",
			Scope: "swarm",
			Attachable: true,
			IPAM: { Config: [{ Subnet: "10.0.1.0/24", Gateway: "10.0.1.1" }] },
		};
		expect(mapNetworkSummary(n)).toMatchObject({
			id: "net1",
			name: "frontend_default",
			driver: "overlay",
			subnet: "10.0.1.0/24",
			gateway: "10.0.1.1",
			attachable: true,
			internal: false,
		});
	});

	it("volume mapper formats size", () => {
		const v = { Name: "data", Driver: "local", UsageData: { Size: 12_000_000_000 } };
		expect(mapVolumeSummary(v).size).toBe("12 GB");
	});

	it("task mapper extracts node/service/state", () => {
		const t = {
			ID: "t1",
			ServiceID: "svc1",
			NodeID: "n1",
			DesiredState: "running",
			Slot: 2,
			Status: { State: "running", Timestamp: "2026-05-01T00:00:00Z" },
		};
		expect(mapTaskSummary(t)).toMatchObject({
			id: "t1",
			serviceId: "svc1",
			nodeId: "n1",
			state: "running",
			slot: 2,
		});
	});

	it("stamped mapper extracts created/updated/name", () => {
		const x = {
			ID: "x",
			Spec: { Name: "n" },
			CreatedAt: "2026-01-01T00:00:00Z",
			UpdatedAt: "2026-02-01T00:00:00Z",
		};
		expect(mapStamped(x)).toEqual({
			id: "x",
			name: "n",
			created: "2026-01-01T00:00:00Z",
			updated: "2026-02-01T00:00:00Z",
		});
	});
});

describe("formatPorts", () => {
	it("uses published→target", () => {
		expect(
			formatPorts({
				EndpointSpec: { Ports: [{ PublishedPort: 8443, TargetPort: 443 }] },
			} as never)
		).toEqual(["8443→443"]);
	});
});

describe("aggregateStacks", () => {
	it("buckets services by namespace label", () => {
		const services = [
			{
				ID: "1",
				Spec: {
					Name: "fe_web",
					Labels: { "com.docker.stack.namespace": "fe" },
					TaskTemplate: { ContainerSpec: { Image: "n" } },
					Mode: { Replicated: { Replicas: 1 } },
				},
			},
			{
				ID: "2",
				Spec: {
					Name: "fe_api",
					Labels: { "com.docker.stack.namespace": "fe" },
					TaskTemplate: { ContainerSpec: { Image: "n" } },
					Mode: { Replicated: { Replicas: 1 } },
				},
			},
			{
				ID: "3",
				Spec: {
					Name: "db_pg",
					Labels: { "com.docker.stack.namespace": "db" },
					TaskTemplate: { ContainerSpec: { Image: "n" } },
					Mode: { Replicated: { Replicas: 1 } },
				},
			},
		];
		const stacks = aggregateStacks(services as never, []);
		expect(stacks).toHaveLength(2);
		const fe = stacks.find((s) => s.name === "fe")!;
		expect(fe.services).toBe(2);
	});
});
