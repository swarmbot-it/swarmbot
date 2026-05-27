/** Parses swarmagent `stats` event payloads posted to `/events`. */

export type AgentStatsPayload = {
	id?: string;
	hostname?: string;
	agentVersion?: string;
	cpu?: { used_percentage?: number; cores?: number };
	memory?: { total?: number; used?: number; used_percentage?: number; free?: number };
	disk?: { total?: number; used?: number; used_percentage?: number; free?: number };
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

function num(v: unknown, fallback = 0): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pct(v: unknown): number {
	return Math.max(0, Math.min(100, Math.round(num(v))));
}

export function parseStatsMessage(message: unknown): ParsedNodeStats | null {
	if (!message || typeof message !== "object") return null;
	const m = message as AgentStatsPayload;
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
		memTotal > 0
			? pct((memUsed / memTotal) * 100)
			: pct(m.memory?.used_percentage);
	const diskPct =
		diskTotal > 0
			? pct((diskUsed / diskTotal) * 100)
			: pct(m.disk?.used_percentage);

	const agentRaw = m.agentVersion;
	const agentVersion =
		typeof agentRaw === "string" && agentRaw.trim().length > 0 ? agentRaw.trim() : null;

	return {
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
}
