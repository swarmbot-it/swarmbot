/** Parses swarmagent `stats` event payloads posted to `/events`. */

export type AgentContainerPayload = {
	id?: string;
	name?: string;
	cpuPercentage?: number;
	memoryPercentage?: number;
	/** Kubernetes mode only (id is then `{namespace}/{pod}/{container}`). */
	namespace?: string;
	pod?: string;
	workload?: string;
	workloadKind?: string;
};

export type AgentStatsPayload = {
	/** Swarm: node id; Kubernetes: node name. */
	id?: string;
	hostname?: string;
	agentVersion?: string;
	/** Which backend the agent detected ("swarm" | "kubernetes"). */
	orchestrator?: string;
	cpu?: { used_percentage?: number; cores?: number };
	memory?: { total?: number; used?: number; used_percentage?: number; free?: number };
	disk?: { total?: number; used?: number; used_percentage?: number; free?: number };
	tasks?: AgentContainerPayload[];
	/** Current swarmagent field name (was `tasks`). */
	containers?: AgentContainerPayload[];
};

export type ParsedNodeStats = {
	nodeId: string;
	hostname: string | null;
	cpu: number;
	mem: number;
	disk: number;
	cpuCores: number;
	memTotal: number;
	memUsed: number;
	diskTotal: number;
	diskUsed: number;
	agentVersion: string | null;
};

export type ParsedContainerStats = {
	containerId: string;
	containerName: string;
	cpu: number;
	mem: number;
	namespace: string | null;
	pod: string | null;
	workload: string | null;
	workloadKind: string | null;
};

export type ParsedStatsBatch = {
	node: ParsedNodeStats;
	containers: ParsedContainerStats[];
	orchestrator: "swarm" | "kubernetes" | null;
};

function num(v: unknown, fallback = 0): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pct(v: unknown): number {
	return Math.max(0, Math.min(100, Math.round(num(v))));
}

/** Normalize agent container list (array, or JSON string of array). */
function containerPayloads(m: AgentStatsPayload): AgentContainerPayload[] {
	let raw: unknown = m.containers ?? m.tasks;
	if (typeof raw === "string") {
		try {
			raw = JSON.parse(raw) as unknown;
		} catch {
			return [];
		}
	}
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === "object") {
		return Object.values(raw as Record<string, AgentContainerPayload>);
	}
	return [];
}

export function parseStatsMessage(message: unknown): ParsedNodeStats | null {
	const batch = parseStatsBatch(message);
	return batch?.node ?? null;
}

export function parseStatsBatch(message: unknown): ParsedStatsBatch | null {
	let payload = message;
	if (payload && typeof payload === "object" && "message" in payload) {
		const inner = (payload as { message?: unknown }).message;
		if (inner && typeof inner === "object") payload = inner;
	}
	if (!payload || typeof payload !== "object") return null;
	const m = payload as AgentStatsPayload;
	const swarmId = String(m.id ?? "").trim();
	const hostname =
		typeof m.hostname === "string" && m.hostname.trim().length > 0
			? m.hostname.trim()
			: null;
	const nodeId = swarmId || hostname;
	if (!nodeId) return null;

	const cpuCores = Math.max(1, Math.round(num(m.cpu?.cores, 1)));
	const memTotal = Math.max(0, Math.round(num(m.memory?.total)));
	const memUsed = Math.max(0, Math.round(num(m.memory?.used)));
	const diskTotal = Math.max(0, Math.round(num(m.disk?.total)));
	const diskUsed = Math.max(0, Math.round(num(m.disk?.used)));

	const memPct =
		memTotal > 0 ? pct((memUsed / memTotal) * 100) : pct(m.memory?.used_percentage);
	const diskPct =
		diskTotal > 0 ? pct((diskUsed / diskTotal) * 100) : pct(m.disk?.used_percentage);

	const agentRaw = m.agentVersion;
	const agentVersion =
		typeof agentRaw === "string" && agentRaw.trim().length > 0 ? agentRaw.trim() : null;

	const node: ParsedNodeStats = {
		nodeId: swarmId || hostname!,
		hostname,
		cpu: pct(m.cpu?.used_percentage),
		mem: memPct,
		disk: diskPct,
		cpuCores,
		memTotal,
		memUsed,
		diskTotal,
		diskUsed,
		agentVersion,
	};

	const containers: ParsedContainerStats[] = [];
	const payloads = containerPayloads(m);

	for (const t of payloads) {
		const row = t as AgentContainerPayload & { ID?: string; Id?: string };
		const containerId = String(row.id ?? row.ID ?? row.Id ?? "").trim();
		if (!containerId) continue;
		containers.push({
			containerId,
			containerName: String(t.name ?? "").trim(),
			cpu: pct(t.cpuPercentage),
			mem: pct(t.memoryPercentage),
			namespace: str(t.namespace),
			pod: str(t.pod),
			workload: str(t.workload),
			workloadKind: str(t.workloadKind),
		});
	}

	const orchRaw = String(m.orchestrator ?? "").toLowerCase();
	const orchestrator =
		orchRaw === "swarm" || orchRaw === "kubernetes" ? orchRaw : null;

	return { node, containers, orchestrator };
}

function str(v: unknown): string | null {
	return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
