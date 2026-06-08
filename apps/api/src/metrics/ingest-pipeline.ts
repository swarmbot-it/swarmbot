import type { SwarmbotyConfig } from "../config.js";
import type Dockerode from "dockerode";
import { ingestContainerSample } from "./container-store.js";
import { writeStatsToInflux } from "./influx-write.js";
import { parseStatsBatch } from "./stats-ingest.js";
import { ingestNodeStats } from "./stats-store.js";
import { resolveContainerMapping, resolveStackName } from "./swarm-mapper.js";

/** Handle one swarmagent `stats` event: memory store + InfluxDB write. */
export async function processStatsEvent(
	cfg: SwarmbotyConfig,
	docker: Dockerode,
	message: unknown
): Promise<void> {
	const batch = parseStatsBatch(message);
	if (!batch) return;
	ingestNodeStats(batch.node);

	const mappings = new Map<
		string,
		Awaited<ReturnType<typeof resolveContainerMapping>>
	>();
	const stacksByContainer = new Map<string, string | null>();

	for (const c of batch.containers) {
		const map = await resolveContainerMapping(docker, c.containerId, c.containerName);
		mappings.set(c.containerId, map);
		const stack = await resolveStackName(docker, c.containerId, c.containerName);
		stacksByContainer.set(c.containerId, stack);
		const taskKey = map?.taskId ?? c.containerId;
		ingestContainerSample(taskKey, stack, c.cpu, c.mem);
	}

	if (!cfg.influxdbUrl) return;
	try {
		await writeStatsToInflux(cfg, batch.node, batch.containers, mappings, stacksByContainer);
	} catch (e) {
		console.warn("InfluxDB stats write failed:", e);
	}
}
