import type { SwarmbotyConfig } from "../config.js";
import { influxQuery } from "../influx.js";

/**
 * Telemetry series generator and InfluxDB query helpers.
 *
 * The admin Dashboard needs ~30–96 point cluster series for CPU/MEM/DISK
 * across configurable ranges (15m, 1h, 6h, 24h) and resolutions (low,
 * medium, high). Per-node sparklines on the Nodes page need similar
 * shorter histories.
 *
 * When InfluxDB is configured we query the `cpu` / `memory` / `disk`
 * measurements. When it is not (mock mode or no Influx) we fall back
 * to a deterministic sine-wave generator that mirrors the design's
 * mock data so the UI still gets believable curves.
 */

export type Range = "15m" | "1h" | "6h" | "24h";
export type Resolution = "low" | "medium" | "high";

const RANGE_POINTS: Record<Range, number> = {
	"15m": 30,
	"1h": 60,
	"6h": 72,
	"24h": 96,
};

const RANGE_LABEL = (r: Range, n: number, i: number): string => {
	const remaining = n - i;
	switch (r) {
		case "15m":
			return `${remaining}m ago`;
		case "1h":
			return `${remaining}m ago`;
		case "6h":
			return `${remaining * 5}m ago`;
		case "24h":
			return `${Math.max(1, Math.floor(remaining / 4))}h ago`;
	}
};

const RES_STRIDE: Record<Resolution, number> = { low: 4, medium: 2, high: 1 };

/** Short "how long ago" label for a raw InfluxDB timestamp, e.g. "42m ago", "3h ago". */
export function relativeLabel(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const minutes = Math.round(diffMs / 60000);
	if (minutes <= 0) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

export type MetricsSeries = {
	labels: string[];
	cpu: number[];
	mem: number[];
	disk: number[];
};

/** Smooth sine-wave with mild jitter; clamped to [2, 98]. */
function genSeries(
	points: number,
	base: number,
	ampl: number,
	phase: number,
	jitter: number
): number[] {
	const out: number[] = [];
	for (let i = 0; i < points; i++) {
		const wave = Math.sin((i / points) * Math.PI * 4 + phase) * ampl;
		const jit = (Math.sin(i * 13.13 + phase * 7) * 0.5 + Math.cos(i * 7.7) * 0.5) * jitter;
		const v = Math.max(2, Math.min(98, base + wave + jit));
		out.push(Math.round(v * 10) / 10);
	}
	return out;
}

/**
 * Deterministic mock series — same family of curves the design exports.
 * Phase offsets make CPU/MEM/DISK visually distinct.
 */
export function mockSeries(range: Range, resolution: Resolution, seed = 0): MetricsSeries {
	const n = RANGE_POINTS[range];
	const stride = RES_STRIDE[resolution];
	const cpu = genSeries(n, 44 + seed, 22, 0.6 + seed * 0.13, 6);
	const mem = genSeries(n, 56 + seed, 12, 1.5 + seed * 0.21, 4);
	const disk = genSeries(n, 46 + seed, 6, 2.1 + seed * 0.07, 1);
	const labels = Array.from({ length: n }, (_, i) => RANGE_LABEL(range, n, i));
	return {
		labels: labels.filter((_, i) => i % stride === 0),
		cpu: cpu.filter((_, i) => i % stride === 0),
		mem: mem.filter((_, i) => i % stride === 0),
		disk: disk.filter((_, i) => i % stride === 0),
	};
}

type InfluxRows = {
	results?: Array<{
		series?: Array<{ values?: Array<Array<number | string | null>> }>;
	}>;
};

/** `null` marks an empty `fill(null)` bucket — distinct from a real reading of exactly 0. */
function extractField(rows: InfluxRows): Array<number | null> {
	const series = rows.results?.[0]?.series?.[0]?.values ?? [];
	return series.map((row) => (row[1] === null || row[1] === undefined ? null : Number(row[1])));
}

/**
 * Turns three raw (possibly gappy) per-bucket arrays into an aligned series:
 * drops the leading stretch before any real data exists (so a freshly
 * started agent doesn't render as a flat-zero cliff), then fills any
 * remaining internal gaps forward from the last known value.
 */
function assembleSeries(
	range: Range,
	resolution: Resolution,
	cpuRaw: Array<number | null>,
	memRaw: Array<number | null>,
	diskRaw: Array<number | null>
): MetricsSeries | null {
	const len = cpuRaw.length;
	let start = len;
	for (let i = 0; i < len; i++) {
		if (cpuRaw[i] !== null && memRaw[i] !== null && diskRaw[i] !== null) {
			start = i;
			break;
		}
	}
	if (start >= len) return null;

	const fillForward = (arr: Array<number | null>): number[] => {
		let last = 0;
		return arr.slice(start).map((v) => {
			if (v !== null) last = v;
			return last;
		});
	};
	const cpu = fillForward(cpuRaw);
	const mem = fillForward(memRaw);
	const disk = fillForward(diskRaw);

	const stride = RES_STRIDE[resolution];
	const labels = Array.from({ length: len }, (_, i) => RANGE_LABEL(range, len, i)).slice(start);
	return {
		labels: labels.filter((_, i) => i % stride === 0),
		cpu: cpu.filter((_, i) => i % stride === 0),
		mem: mem.filter((_, i) => i % stride === 0),
		disk: disk.filter((_, i) => i % stride === 0),
	};
}

/**
 * Run a cluster-wide metrics query against InfluxDB. The schema follows
 * the agent's `stats` payload: measurements `cpu` / `memory` / `disk`
 * with a `percent` field aggregated cluster-wide.
 */
export async function influxClusterSeries(
	cfg: SwarmbotyConfig,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	const window = { "15m": "30s", "1h": "1m", "6h": "5m", "24h": "15m" }[range];
	const since = range;
	try {
		const ql = (measurement: string, field = "percent") =>
			`SELECT mean("${field}") FROM "${measurement}" WHERE time > now() - ${since} GROUP BY time(${window}) fill(null)`;
		const [cpuRows, memRows, diskRows] = await Promise.all([
			influxQuery(cfg, ql("cpu")) as Promise<InfluxRows>,
			influxQuery(cfg, ql("memory")) as Promise<InfluxRows>,
			influxQuery(cfg, ql("disk")) as Promise<InfluxRows>,
		]);
		return assembleSeries(
			range,
			resolution,
			extractField(cpuRows),
			extractField(memRows),
			extractField(diskRows)
		);
	} catch {
		return null;
	}
}

/** Per-node metrics query, same measurements as {@link influxClusterSeries} but scoped to one node. */
export async function influxNodeSeries(
	cfg: SwarmbotyConfig,
	nodeId: string,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	const window = { "15m": "30s", "1h": "1m", "6h": "5m", "24h": "15m" }[range];
	const since = range;
	try {
		const ql = (measurement: string, field = "percent") =>
			`SELECT mean("${field}") FROM "${measurement}" WHERE "node" = '${nodeId}' AND time > now() - ${since} GROUP BY time(${window}) fill(null)`;
		const [cpuRows, memRows, diskRows] = await Promise.all([
			influxQuery(cfg, ql("cpu")) as Promise<InfluxRows>,
			influxQuery(cfg, ql("memory")) as Promise<InfluxRows>,
			influxQuery(cfg, ql("disk")) as Promise<InfluxRows>,
		]);
		return assembleSeries(
			range,
			resolution,
			extractField(cpuRows),
			extractField(memRows),
			extractField(diskRows)
		);
	} catch {
		return null;
	}
}

/** Per-node short history used by Nodes tiles & dashboard sparklines. */
export function nodeMockHistory(
	seed: number,
	baseCpu: number,
	baseMem: number,
	baseDisk: number
): {
	cpu: number[];
	mem: number[];
	disk: number[];
} {
	return {
		cpu: genSeries(32, baseCpu, 16, seed * 0.7 + 0.3, 6),
		mem: genSeries(32, baseMem, 10, seed * 0.9 + 0.6, 4),
		disk: genSeries(32, baseDisk, 3, seed * 1.1 + 0.9, 1),
	};
}

/** Per-task short sparkline (~16 points). */
export function taskMockHistory(
	seed: number,
	baseCpu: number,
	baseMem: number
): {
	cpu: number[];
	mem: number[];
} {
	return {
		cpu: genSeries(16, baseCpu || 8, (baseCpu || 8) * 0.25, seed * 0.5, (baseCpu || 8) * 0.12),
		mem: genSeries(
			16,
			baseMem || 14,
			(baseMem || 14) * 0.25,
			seed * 0.31,
			(baseMem || 14) * 0.12
		),
	};
}

export const __test__ = { genSeries, RANGE_POINTS };
