import type { SwarmBotConfig } from "../config.js";
import type { Orchestrator } from "../orchestrator/types.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";
import { KubernetesOrchestrator } from "../orchestrator/kubernetes/adapter.js";
import { ingestContainerSample } from "./container-store.js";
import { writeStatsToInflux } from "./influx-write.js";
import { parseStatsBatch } from "./stats-ingest.js";
import { ingestNodeStats } from "./stats-store.js";
import type { ContainerMapping } from "./swarm-mapper.js";
import { resolveContainerMapping, resolveStackName } from "./swarm-mapper.js";
import { resolveKubeContainerMapping } from "./kube-mapper.js";

/**
 * Handle one swarmagent `stats` event: memory store + InfluxDB write.
 *
 * The payload may carry `orchestrator` ("swarm" | "kubernetes"); it wins over
 * the server's own backend when mapping containers, so a k8s agent talking to
 * a server that was started in Swarm mode is still ingested sensibly.
 */
export async function processStatsEvent(
	cfg: SwarmBotConfig,
	orchestrator: Orchestrator,
	message: unknown
): Promise<void> {
	const batch = parseStatsBatch(message);
	if (!batch) return;
	ingestNodeStats(batch.node);

	const kind = batch.orchestrator ?? orchestrator.kind;
	const mappings = new Map<string, ContainerMapping | null>();
	const stacksByContainer = new Map<string, string | null>();

	if (kind === "kubernetes") {
		const kube = orchestrator instanceof KubernetesOrchestrator ? orchestrator.kube : null;
		for (const c of batch.containers) {
			const map = await resolveKubeContainerMapping(kube, c);
			mappings.set(c.containerId, map);
			stacksByContainer.set(c.containerId, map?.stack ?? null);
			const taskKey = map?.taskId ?? c.containerId;
			ingestContainerSample(taskKey, map?.stack ?? null, c.cpu, c.mem);
		}
	} else {
		const docker = orchestrator instanceof SwarmOrchestrator ? orchestrator.docker : null;
		if (docker) {
			for (const c of batch.containers) {
				const map = await resolveContainerMapping(docker, c.containerId, c.containerName);
				mappings.set(c.containerId, map);
				const stack = await resolveStackName(docker, c.containerId, c.containerName);
				stacksByContainer.set(c.containerId, stack);
				const taskKey = map?.taskId ?? c.containerId;
				ingestContainerSample(taskKey, stack, c.cpu, c.mem);
			}
		}
	}

	if (!cfg.influxdbUrl) return;
	try {
		await writeStatsToInflux(
			cfg,
			batch.node,
			batch.containers,
			mappings,
			stacksByContainer,
			kind
		);
	} catch (e) {
		console.warn("InfluxDB stats write failed:", e);
	}
}
