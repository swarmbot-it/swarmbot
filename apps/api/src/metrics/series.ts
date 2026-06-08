export {
	influxClusterSeries,
	influxNodeSeries,
	influxStackSeries,
	influxTaskSeries,
	influxStackLoadSeries,
	influxNodeLivePercent,
	type StackMetricSeries,
} from "./influx-queries.js";

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

export const RANGE_POINTS: Record<Range, number> = {
	"15m": 30,
	"1h": 60,
	"6h": 72,
	"24h": 96,
};

/** Wall-clock span for each UI range preset (ms). */
export const RANGE_MS: Record<Range, number> = {
	"15m": 15 * 60 * 1000,
	"1h": 60 * 60 * 1000,
	"6h": 6 * 60 * 60 * 1000,
	"24h": 24 * 60 * 60 * 1000,
};

export const RANGE_LABEL = (r: Range, n: number, i: number): string => {
	const remaining = n - i;
	switch (r) {
		case "15m":
			return `${remaining}m`;
		case "1h":
			return `${remaining}m`;
		case "6h":
			return `${remaining * 5}m`;
		case "24h":
			return `${Math.max(1, Math.floor(remaining / 4))}h`;
	}
};

export const RES_STRIDE: Record<Resolution, number> = { low: 4, medium: 2, high: 1 };

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
