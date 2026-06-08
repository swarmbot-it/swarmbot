import { historyToMetricsSeries } from "./chart-series.js";
import type { Range, Resolution, MetricsSeries } from "./series.js";
import type { ParsedNodeStats } from "./stats-ingest.js";

/** How long a node sample stays valid (swarmagent default tick is 30s). */
const SAMPLE_TTL_MS = 120_000;
const MAX_POINTS = 96;

type Point = { at: number; cpu: number; mem: number; disk: number };
type NodeState = ParsedNodeStats & { at: number };

const latestByNode = new Map<string, NodeState>();
const historyByNode = new Map<string, Point[]>();
const clusterHistory: Point[] = [];

function pruneStale(): void {
	const cutoff = Date.now() - SAMPLE_TTL_MS;
	for (const [id, s] of latestByNode) {
		if (s.at < cutoff) latestByNode.delete(id);
	}
}

/** One entry per agent sample (hostname alias keys may point at the same state). */
function uniqueNodeStates(): NodeState[] {
	pruneStale();
	const seen = new Set<NodeState>();
	const out: NodeState[] = [];
	for (const s of latestByNode.values()) {
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

function pushHistory(buf: Point[], point: Point): void {
	buf.push(point);
	while (buf.length > MAX_POINTS) buf.shift();
}

function clusterPointFromLatest(): Point | null {
	const nodes = uniqueNodeStates();
	if (nodes.length === 0) return null;

	let cores = 0;
	let cpuWeighted = 0;
	let memTotal = 0;
	let memUsed = 0;
	let diskTotal = 0;
	let diskUsed = 0;

	for (const n of nodes) {
		cores += n.cpuCores;
		cpuWeighted += n.cpu * n.cpuCores;
		memTotal += n.memTotal;
		memUsed += n.memUsed;
		diskTotal += n.diskTotal;
		diskUsed += n.diskUsed;
	}

	const at = Math.max(...nodes.map((n) => n.at));
	return {
		at,
		cpu: cores > 0 ? Math.round(cpuWeighted / cores) : 0,
		mem: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
		disk: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
	};
}

export function ingestNodeStats(sample: ParsedNodeStats): void {
	const at = Date.now();
	const state: NodeState = { ...sample, at };
	const storeKey = sample.nodeId || sample.hostname || "";
	if (!storeKey) return;
	latestByNode.set(storeKey, state);
	if (sample.hostname && sample.hostname !== storeKey) {
		latestByNode.set(sample.hostname, state);
	}

	const nodeHist = historyByNode.get(storeKey) ?? [];
	pushHistory(nodeHist, { at, cpu: sample.cpu, mem: sample.mem, disk: sample.disk });
	historyByNode.set(storeKey, nodeHist);
	if (sample.hostname && sample.hostname !== storeKey) {
		historyByNode.set(sample.hostname, nodeHist);
	}

	const cluster = clusterPointFromLatest();
	if (cluster) pushHistory(clusterHistory, cluster);
}

export function hasLiveStats(): boolean {
	return uniqueNodeStates().length > 0;
}

function findNodeState(nodeId: string, hostname?: string | null): NodeState | undefined {
	pruneStale();
	return latestByNode.get(nodeId) ?? (hostname ? latestByNode.get(hostname) : undefined);
}

export function getNodeLiveMetrics(
	nodeId: string,
	hostname?: string | null
): Pick<ParsedNodeStats, "cpu" | "mem" | "disk"> | null {
	const s = findNodeState(nodeId, hostname);
	if (!s) return null;
	return { cpu: s.cpu, mem: s.mem, disk: s.disk };
}

/** Latest swarmagent version reported for a Swarm node (while sample is fresh). */
export function getNodeAgentVersion(nodeId: string, hostname?: string | null): string | null {
	return findNodeState(nodeId, hostname)?.agentVersion ?? null;
}

export type ClusterOverviewMetrics = {
	cpu: number;
	mem: number;
	disk: number;
	cpuCores: number;
	cpuUsed: number;
	memTotalBytes: number;
	memUsedBytes: number;
	diskTotalBytes: number;
	diskUsedBytes: number;
};

export function getClusterOverviewMetrics(): ClusterOverviewMetrics | null {
	const nodes = uniqueNodeStates();
	if (nodes.length === 0) return null;

	let cpuCores = 0;
	let cpuWeighted = 0;
	let memTotalBytes = 0;
	let memUsedBytes = 0;
	let diskTotalBytes = 0;
	let diskUsedBytes = 0;

	for (const n of nodes) {
		cpuCores += n.cpuCores;
		cpuWeighted += n.cpu * n.cpuCores;
		memTotalBytes += n.memTotal;
		memUsedBytes += n.memUsed;
		diskTotalBytes += n.diskTotal;
		diskUsedBytes += n.diskUsed;
	}

	const cpuPct = cpuCores > 0 ? cpuWeighted / cpuCores : 0;
	return {
		cpu: Math.round(cpuPct),
		mem: memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 100) : 0,
		disk: diskTotalBytes > 0 ? Math.round((diskUsedBytes / diskTotalBytes) * 100) : 0,
		cpuCores,
		cpuUsed: Math.round((cpuCores * cpuPct) / 100),
		memTotalBytes,
		memUsedBytes,
		diskTotalBytes,
		diskUsedBytes,
	};
}

export function getClusterMetricsSeries(
	range: Range,
	resolution: Resolution
): MetricsSeries | null {
	return historyToMetricsSeries(clusterHistory, range, resolution);
}

export function getNodeMetricsSeries(
	nodeId: string,
	range: Range,
	resolution: Resolution,
	hostname?: string | null
): MetricsSeries | null {
	const hist =
		historyByNode.get(nodeId) ?? (hostname ? historyByNode.get(hostname) : undefined);
	if (!hist) return null;
	return historyToMetricsSeries(hist, range, resolution);
}

/** Test-only reset. */
export function __clearStatsStoreForTests(): void {
	latestByNode.clear();
	historyByNode.clear();
	clusterHistory.length = 0;
}
