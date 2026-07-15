import type { SwarmbotyConfig } from "../config.js";
import { authHeaders } from "../influx.js";
import { logger } from "../logger.js";

/**
 * Shape of the periodic "stats" event posted by swarmagent to `/events`
 * (see github.com/no-human-tech/sw4rm.agent, src/models.rs::Status).
 */
type StatsPayload = {
	id: string;
	/** "swarm" | "kubernetes" — stamped by the agent on every payload. */
	orchestrator?: string;
	cpu: { used_percentage: number; cores: number };
	memory: { total: number; used: number; used_percentage: number; free: number };
	disk: { total: number; used: number; used_percentage: number; free: number };
	tasks?: Array<{
		name: string;
		id: string;
		namespace?: string;
		cpuPercentage: number;
		memory: number;
		memoryLimit: number;
		memoryPercentage: number;
	}>;
};

/**
 * Persists agent stats payloads into InfluxDB using the measurement/field
 * names the rest of the API already queries:
 *   - `cpu` / `memory` / `disk`, tagged by `node`, field `percent`
 *     (see decorateNodes() and influxClusterSeries() in graphql/resolvers.ts)
 *   - `container_stats`, tagged by `node` and `container`, fields
 *     `cpu_percent` / `mem_percent` (see stackStats() in graphql/resolvers.ts)
 */
export function startStatsWriter(cfg: SwarmbotyConfig): (event: Record<string, unknown>) => void {
	const influxUrl = cfg.influxdbUrl?.replace(/\/$/, "");
	if (!influxUrl) return () => {};

	const writeUrl = `${influxUrl}/write?db=swarmboty&precision=s`;

	return (event) => {
		if (event.type !== "stats" || !event.message) return;
		let msg: StatsPayload;
		try {
			msg = (typeof event.message === "string" ? JSON.parse(event.message) : event.message) as StatsPayload;
		} catch {
			return;
		}
		const ts = Math.floor(Date.now() / 1000);
		const nodeId = msg.id || "unknown";

		const lines: string[] = [];

		if (msg.cpu) {
			lines.push(`cpu,node=${nodeId} percent=${msg.cpu.used_percentage} ${ts}`);
		}
		if (msg.memory) {
			lines.push(`memory,node=${nodeId} percent=${msg.memory.used_percentage} ${ts}`);
		}
		if (msg.disk) {
			lines.push(
				`disk,node=${nodeId} percent=${msg.disk.used_percentage},total_bytes=${msg.disk.total}i,used_bytes=${msg.disk.used}i ${ts}`
			);
		}
		if (msg.tasks) {
			const isKube = msg.orchestrator === "kubernetes";
			for (const t of msg.tasks) {
				// Kubernetes container names are not unique across pods — tag with
				// the unique `{namespace}/{pod}/{container}` id instead, which the
				// resolvers match by `{namespace}/{pod}` prefix (the task id).
				const raw = isKube ? t.id : t.name || t.id.slice(0, 12);
				const cname = raw.replace(/ /g, "\\ ").replace(/,/g, "\\,");
				const nsTag = isKube && t.namespace ? `,namespace=${t.namespace}` : "";
				lines.push(
					`container_stats,node=${nodeId},container=${cname}${nsTag} cpu_percent=${t.cpuPercentage},mem_percent=${t.memoryPercentage} ${ts}`
				);
			}
		}

		if (lines.length === 0) return;
		const body = lines.join("\n");
		fetch(writeUrl, { method: "POST", body, headers: authHeaders(cfg) })
			.then(async (res) => {
				if (!res.ok) {
					logger.warn(
						{ status: res.status, body: await res.text().catch(() => "") },
						"InfluxDB stats write rejected"
					);
				}
			})
			.catch((err) => {
				logger.warn({ err }, "InfluxDB stats write failed");
			});
	};
}
