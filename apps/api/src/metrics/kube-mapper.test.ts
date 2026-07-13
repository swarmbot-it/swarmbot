import { describe, it, expect, beforeEach } from "vitest";
import {
	__clearKubeMapperForTests,
	parseKubeContainerId,
	resolveKubeContainerMapping,
} from "./kube-mapper.js";
import type { ParsedContainerStats } from "./stats-ingest.js";
import { createMockKube } from "../orchestrator/kubernetes/mock.js";
import type { KubeApi } from "../orchestrator/kubernetes/kube-api.js";

function container(overrides: Partial<ParsedContainerStats>): ParsedContainerStats {
	return {
		containerId: "frontend/nginx-6d4cf56db6-abcde/nginx",
		containerName: "nginx",
		cpu: 10,
		mem: 20,
		namespace: null,
		pod: null,
		workload: null,
		workloadKind: null,
		...overrides,
	};
}

beforeEach(() => {
	__clearKubeMapperForTests();
});

describe("parseKubeContainerId", () => {
	it("splits {namespace}/{pod}/{container}", () => {
		expect(parseKubeContainerId("ns/pod-1/app")).toEqual({
			namespace: "ns",
			pod: "pod-1",
			container: "app",
		});
	});
	it("rejects other formats", () => {
		expect(parseKubeContainerId("abcdef123456")).toBeNull();
		expect(parseKubeContainerId("ns/pod")).toBeNull();
		expect(parseKubeContainerId("a/b/c/d")).toBeNull();
	});
});

describe("resolveKubeContainerMapping", () => {
	it("prefers payload metadata and never hits the apiserver", async () => {
		const explodingKube = {
			listPods: async () => {
				throw new Error("apiserver should not be called");
			},
		} as unknown as KubeApi;
		const map = await resolveKubeContainerMapping(
			explodingKube,
			container({
				namespace: "frontend",
				pod: "nginx-6d4cf56db6-abcde",
				workload: "nginx",
				workloadKind: "Deployment",
			})
		);
		expect(map).toEqual({
			taskId: "frontend/nginx-6d4cf56db6-abcde",
			serviceId: "Deployment:frontend:nginx",
			serviceName: "nginx",
			stack: "frontend",
			namespace: "frontend",
		});
	});

	it("falls back to the container id format without payload metadata", async () => {
		const map = await resolveKubeContainerMapping(null, container({}));
		expect(map?.taskId).toBe("frontend/nginx-6d4cf56db6-abcde");
		expect(map?.stack).toBe("frontend");
		expect(map?.namespace).toBe("frontend");
		// workload unknown without apiserver → serviceName falls back to pod
		expect(map?.serviceId).toBe("");
		expect(map?.serviceName).toBe("nginx-6d4cf56db6-abcde");
	});

	it("resolves the workload from the apiserver when payload lacks it", async () => {
		const kube = createMockKube();
		const pods = await kube.listPods("frontend");
		const nginxPod = pods.find((p) => p.metadata?.name?.startsWith("nginx-"))!;
		const map = await resolveKubeContainerMapping(
			kube,
			container({
				containerId: `frontend/${nginxPod.metadata!.name}/nginx`,
			})
		);
		expect(map?.serviceId).toBe("Deployment:frontend:nginx");
		expect(map?.serviceName).toBe("nginx");
	});

	it("caches the pod list between calls", async () => {
		const kube = createMockKube();
		let calls = 0;
		const counting: KubeApi = {
			...kube,
			listPods: async (ns?: string) => {
				calls++;
				return kube.listPods(ns);
			},
		};
		const pods = await kube.listPods("frontend");
		const podName = pods.find((p) => p.metadata?.name?.startsWith("nginx-"))!.metadata!.name!;
		const c = container({ containerId: `frontend/${podName}/nginx` });
		await resolveKubeContainerMapping(counting, c);
		await resolveKubeContainerMapping(counting, c);
		await resolveKubeContainerMapping(counting, c);
		expect(calls).toBe(1);
	});

	it("returns null when neither payload nor id yields a pod", async () => {
		const map = await resolveKubeContainerMapping(null, container({ containerId: "abc" }));
		expect(map).toBeNull();
	});
});
