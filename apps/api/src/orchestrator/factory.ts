/**
 * Orchestrator backend selection.
 *
 * Priority (SWARMBOT_ORCHESTRATOR=auto):
 *   1. in-cluster ServiceAccount (KUBERNETES_SERVICE_HOST + token file) → kubernetes
 *   2. kubeconfig (SWARMBOT_KUBECONFIG, then KUBECONFIG)               → kubernetes
 *   3. reachable Docker socket (SWARMBOT_DOCKER_SOCK)                  → swarm
 *   4. none → startup error with configuration hints
 *
 * SWARMBOT_MOCK=true short-circuits to the mock backend picked by
 * SWARMBOT_MOCK_ORCHESTRATOR (default swarm).
 */
import { existsSync } from "fs";
import path from "path";
import type { SwarmBotConfig } from "../config.js";
import type { Orchestrator, OrchestratorKind } from "./types.js";
import { SwarmOrchestrator } from "./swarm/adapter.js";
import { KubernetesOrchestrator } from "./kubernetes/adapter.js";
import { createMockKube } from "./kubernetes/mock.js";

export const SERVICE_ACCOUNT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";

export type DetectionProbes = {
	env: Record<string, string | undefined>;
	fileExists: (p: string) => boolean;
};

function defaultProbes(): DetectionProbes {
	return {
		env: process.env,
		fileExists: (p) => {
			try {
				return existsSync(p);
			} catch {
				return false;
			}
		},
	};
}

export type OrchestratorDetection = { kind: OrchestratorKind; reason: string };

export class OrchestratorDetectionError extends Error {
	constructor(dockerSock: string) {
		super(
			"Unable to detect the orchestrator backend. Checked: in-cluster ServiceAccount " +
				`(${SERVICE_ACCOUNT_TOKEN_PATH}), kubeconfig (SWARMBOT_KUBECONFIG / KUBECONFIG) ` +
				`and the Docker socket (${dockerSock}). ` +
				"Fix one of: run inside Kubernetes with a ServiceAccount, point " +
				"SWARMBOT_KUBECONFIG at a kubeconfig file, mount the Docker socket " +
				"(SWARMBOT_DOCKER_SOCK), or set SWARMBOT_ORCHESTRATOR=swarm|kubernetes explicitly."
		);
		this.name = "OrchestratorDetectionError";
	}
}

function kubeconfigCandidate(cfg: SwarmBotConfig, probes: DetectionProbes): string | null {
	if (cfg.kubeconfig && probes.fileExists(cfg.kubeconfig)) return cfg.kubeconfig;
	const envKc = probes.env["KUBECONFIG"];
	if (envKc) {
		const hit = envKc
			.split(path.delimiter)
			.map((p) => p.trim())
			.find((p) => p && probes.fileExists(p));
		if (hit) return hit;
	}
	return null;
}

export function detectOrchestrator(
	cfg: SwarmBotConfig,
	probes: DetectionProbes = defaultProbes()
): OrchestratorDetection {
	if (cfg.orchestrator === "swarm" || cfg.orchestrator === "kubernetes") {
		return { kind: cfg.orchestrator, reason: `SWARMBOT_ORCHESTRATOR=${cfg.orchestrator}` };
	}

	if (probes.env["KUBERNETES_SERVICE_HOST"] && probes.fileExists(SERVICE_ACCOUNT_TOKEN_PATH)) {
		return { kind: "kubernetes", reason: "in-cluster ServiceAccount detected" };
	}

	const kubeconfig = kubeconfigCandidate(cfg, probes);
	if (kubeconfig) {
		return { kind: "kubernetes", reason: `kubeconfig found at ${kubeconfig}` };
	}

	const sock = cfg.dockerSock;
	if (sock.startsWith("http://") || sock.startsWith("https://") || probes.fileExists(sock)) {
		return { kind: "swarm", reason: `Docker endpoint available at ${sock}` };
	}

	throw new OrchestratorDetectionError(sock);
}

export async function createOrchestrator(
	cfg: SwarmBotConfig,
	probes: DetectionProbes = defaultProbes()
): Promise<{ orchestrator: Orchestrator; detection: OrchestratorDetection }> {
	if (cfg.mock) {
		if (cfg.mockOrchestrator === "kubernetes") {
			return {
				orchestrator: new KubernetesOrchestrator(cfg, createMockKube()),
				detection: {
					kind: "kubernetes",
					reason: "mock mode (SWARMBOT_MOCK_ORCHESTRATOR=kubernetes)",
				},
			};
		}
		return {
			orchestrator: new SwarmOrchestrator(cfg),
			detection: { kind: "swarm", reason: "mock mode" },
		};
	}

	const detection = detectOrchestrator(cfg, probes);
	if (detection.kind === "kubernetes") {
		// Lazy import: the Kubernetes client is only loaded when actually used.
		const { createKubeClient } = await import("./kubernetes/client.js");
		return {
			orchestrator: new KubernetesOrchestrator(cfg, createKubeClient(cfg)),
			detection,
		};
	}

	const swarm = new SwarmOrchestrator(cfg);
	await swarm.init();
	return { orchestrator: swarm, detection };
}
