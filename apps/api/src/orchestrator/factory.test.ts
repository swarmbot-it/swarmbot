import { describe, it, expect, afterEach } from "vitest";
import { loadConfig, type SwarmbotyConfig } from "../config.js";
import {
	createOrchestrator,
	detectOrchestrator,
	OrchestratorDetectionError,
	SERVICE_ACCOUNT_TOKEN_PATH,
	type DetectionProbes,
} from "./factory.js";
import { SwarmOrchestrator } from "./swarm/adapter.js";
import { KubernetesOrchestrator } from "./kubernetes/adapter.js";

function cfg(overrides: Partial<SwarmbotyConfig> = {}): SwarmbotyConfig {
	return { ...loadConfig(), mock: false, orchestrator: "auto", ...overrides };
}

function probes(env: Record<string, string>, files: string[]): DetectionProbes {
	const set = new Set(files);
	return { env, fileExists: (p) => set.has(p) };
}

describe("detectOrchestrator", () => {
	it("honours explicit SWARMBOTY_ORCHESTRATOR=swarm even with kube env present", () => {
		const d = detectOrchestrator(
			cfg({ orchestrator: "swarm" }),
			probes({ KUBERNETES_SERVICE_HOST: "10.0.0.1" }, [SERVICE_ACCOUNT_TOKEN_PATH])
		);
		expect(d.kind).toBe("swarm");
	});

	it("honours explicit SWARMBOTY_ORCHESTRATOR=kubernetes without any probe hit", () => {
		const d = detectOrchestrator(cfg({ orchestrator: "kubernetes" }), probes({}, []));
		expect(d.kind).toBe("kubernetes");
	});

	it("auto: picks kubernetes for in-cluster ServiceAccount", () => {
		const d = detectOrchestrator(
			cfg(),
			probes({ KUBERNETES_SERVICE_HOST: "10.43.0.1" }, [SERVICE_ACCOUNT_TOKEN_PATH])
		);
		expect(d.kind).toBe("kubernetes");
		expect(d.reason).toMatch(/ServiceAccount/);
	});

	it("auto: requires the token file, not just the env var", () => {
		const d = detectOrchestrator(
			cfg({ dockerSock: "/var/run/docker.sock" }),
			probes({ KUBERNETES_SERVICE_HOST: "10.43.0.1" }, ["/var/run/docker.sock"])
		);
		expect(d.kind).toBe("swarm");
	});

	it("auto: picks kubernetes for SWARMBOTY_KUBECONFIG", () => {
		const d = detectOrchestrator(
			cfg({ kubeconfig: "/home/x/kubeconfig.yaml" }),
			probes({}, ["/home/x/kubeconfig.yaml"])
		);
		expect(d.kind).toBe("kubernetes");
		expect(d.reason).toContain("/home/x/kubeconfig.yaml");
	});

	it("auto: picks kubernetes for KUBECONFIG env", () => {
		const d = detectOrchestrator(
			cfg(),
			probes({ KUBECONFIG: "/home/x/.kube/config" }, ["/home/x/.kube/config"])
		);
		expect(d.kind).toBe("kubernetes");
	});

	it("auto: ignores a KUBECONFIG pointing at a missing file", () => {
		const d = detectOrchestrator(
			cfg({ dockerSock: "/var/run/docker.sock" }),
			probes({ KUBECONFIG: "/nope" }, ["/var/run/docker.sock"])
		);
		expect(d.kind).toBe("swarm");
	});

	it("auto: picks swarm for an existing docker socket", () => {
		const d = detectOrchestrator(
			cfg({ dockerSock: "/var/run/docker.sock" }),
			probes({}, ["/var/run/docker.sock"])
		);
		expect(d.kind).toBe("swarm");
	});

	it("auto: picks swarm for an http docker endpoint", () => {
		const d = detectOrchestrator(cfg({ dockerSock: "http://docker:2375" }), probes({}, []));
		expect(d.kind).toBe("swarm");
	});

	it("auto: throws a readable error when nothing is available", () => {
		expect(() => detectOrchestrator(cfg({ dockerSock: "/no/sock" }), probes({}, []))).toThrow(
			OrchestratorDetectionError
		);
		try {
			detectOrchestrator(cfg({ dockerSock: "/no/sock" }), probes({}, []));
		} catch (e) {
			expect(String(e)).toMatch(/SWARMBOTY_ORCHESTRATOR/);
			expect(String(e)).toMatch(/SWARMBOTY_DOCKER_SOCK|\/no\/sock/);
		}
	});
});

describe("createOrchestrator (mock mode)", () => {
	it("returns the swarm mock by default", async () => {
		const { orchestrator, detection } = await createOrchestrator(cfg({ mock: true }));
		expect(orchestrator).toBeInstanceOf(SwarmOrchestrator);
		expect(orchestrator.kind).toBe("swarm");
		expect(detection.reason).toMatch(/mock/);
	});

	it("returns the kubernetes mock for SWARMBOTY_MOCK_ORCHESTRATOR=kubernetes", async () => {
		const { orchestrator } = await createOrchestrator(
			cfg({ mock: true, mockOrchestrator: "kubernetes" })
		);
		expect(orchestrator).toBeInstanceOf(KubernetesOrchestrator);
		expect(orchestrator.kind).toBe("kubernetes");
		const nodes = await orchestrator.listNodes();
		expect(nodes.length).toBeGreaterThan(0);
	});
});

describe("loadConfig orchestrator envs", () => {
	const saved = { ...process.env };
	afterEach(() => {
		process.env = { ...saved };
	});

	it("parses SWARMBOTY_ORCHESTRATOR and kube settings", () => {
		process.env.SWARMBOTY_ORCHESTRATOR = "kubernetes";
		process.env.SWARMBOTY_KUBECONFIG = "/tmp/kc.yaml";
		process.env.SWARMBOTY_K8S_NAMESPACE = "prod";
		process.env.SWARMBOTY_MOCK_ORCHESTRATOR = "kubernetes";
		const c = loadConfig();
		expect(c.orchestrator).toBe("kubernetes");
		expect(c.kubeconfig).toBe("/tmp/kc.yaml");
		expect(c.k8sNamespace).toBe("prod");
		expect(c.mockOrchestrator).toBe("kubernetes");
	});

	it("defaults to auto and falls back on invalid values", () => {
		delete process.env.SWARMBOTY_ORCHESTRATOR;
		expect(loadConfig().orchestrator).toBe("auto");
		process.env.SWARMBOTY_ORCHESTRATOR = "nomad";
		expect(loadConfig().orchestrator).toBe("auto");
	});
});
