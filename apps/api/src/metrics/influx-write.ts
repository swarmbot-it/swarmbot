import type { Sw4rmBotConfig } from "../config.js";
import { influxWrite } from "../influx.js";
import type { ContainerMapping } from "./swarm-mapper.js";
import type { ParsedContainerStats, ParsedNodeStats } from "./stats-ingest.js";

function escapeTag(v: string): string {
	return v.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/ /g, "\\ ").replace(/=/g, "\\=");
}

function escapeFieldStr(v: string): string {
	return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function line(
	measurement: string,
	tags: Record<string, string>,
	fields: Record<string, number | string>,
	timestampNs: bigint
): string {
	const tagPart = Object.entries(tags)
		.filter(([, v]) => v.length > 0)
		.map(([k, v]) => `${k}=${escapeTag(v)}`)
		.join(",");
	const fieldPart = Object.entries(fields)
		.map(([k, v]) =>
			typeof v === "number"
				? `${k}=${Number.isInteger(v) ? `${v}i` : v}`
				: `${k}=${escapeFieldStr(v)}`
		)
		.join(",");
	const prefix = tagPart ? `${measurement},${tagPart}` : measurement;
	return `${prefix} ${fieldPart} ${timestampNs}`;
}

export function buildInfluxLines(
	node: ParsedNodeStats,
	containers: ParsedContainerStats[],
	mappings: Map<string, ContainerMapping | null>,
	stacksByContainer: Map<string, string | null> = new Map(),
	orchestrator: "swarm" | "kubernetes" = "swarm"
): string[] {
	const ts = BigInt(Date.now()) * 1_000_000n;
	const lines: string[] = [];

	const nodeTags: Record<string, string> = {
		node_id: node.nodeId,
		orchestrator,
	};
	if (node.hostname) nodeTags["hostname"] = node.hostname;

	lines.push(
		line("node_cpu", nodeTags, { percent: node.cpu }, ts),
		line("node_memory", nodeTags, { percent: node.mem }, ts),
		line("node_disk", nodeTags, { percent: node.disk }, ts)
	);

	for (const c of containers) {
		const map = mappings.get(c.containerId);
		const tags: Record<string, string> = {
			node_id: node.nodeId,
			container_id: c.containerId,
			orchestrator,
		};
		if (map?.taskId) tags["task_id"] = map.taskId;
		if (map?.serviceId) tags["service_id"] = map.serviceId;
		if (map?.serviceName) tags["service_name"] = map.serviceName;
		// Kubernetes: the namespace plays the role of the stack, and is also
		// tagged explicitly so k8s-native queries can filter on `namespace`.
		const namespace = c.namespace ?? null;
		const stackTag =
			stacksByContainer.get(c.containerId) ?? map?.stack ?? namespace ?? null;
		if (stackTag) tags["stack"] = stackTag;
		if (orchestrator === "kubernetes" && (namespace ?? stackTag)) {
			tags["namespace"] = (namespace ?? stackTag)!;
		}

		lines.push(
			line("container_cpu", tags, { percent: c.cpu }, ts),
			line("container_memory", tags, { percent: c.mem }, ts)
		);
	}

	return lines;
}

export async function writeStatsToInflux(
	cfg: Sw4rmBotConfig,
	node: ParsedNodeStats,
	containers: ParsedContainerStats[],
	mappings: Map<string, ContainerMapping | null>,
	stacksByContainer: Map<string, string | null> = new Map(),
	orchestrator: "swarm" | "kubernetes" = "swarm"
): Promise<void> {
	if (!cfg.influxdbUrl) return;
	const lines = buildInfluxLines(node, containers, mappings, stacksByContainer, orchestrator);
	await influxWrite(cfg, lines);
}
