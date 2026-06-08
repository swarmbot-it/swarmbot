import type { FluxPoint } from "./flux-csv.js";
import type { MetricsSeries, Range, Resolution } from "./series.js";
import { RANGE_MS, RES_STRIDE } from "./series.js";

export type HistoryPoint = { at: number; cpu: number; mem: number; disk?: number };

function roundMetric(v: number): number {
	return Math.round(v * 10) / 10;
}

/** Format timestamps for chart X axis from actual sample times. */
export function formatChartTimeLabels(timesMs: number[]): string[] {
	if (timesMs.length === 0) return [];
	const span = timesMs[timesMs.length - 1]! - timesMs[0]!;
	const twoHours = 2 * 60 * 60 * 1000;
	const twoDays = 2 * 24 * 60 * 60 * 1000;

	return timesMs.map((ms) => {
		const d = new Date(ms);
		if (span <= twoHours) {
			return d.toLocaleTimeString("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});
		}
		if (span <= twoDays) {
			return d.toLocaleTimeString("en-GB", {
				day: "2-digit",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});
		}
		return d.toLocaleString("en-GB", {
			day: "2-digit",
			month: "short",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	});
}

export function downsampleMetricsSeries(
	series: MetricsSeries,
	resolution: Resolution
): MetricsSeries {
	const stride = RES_STRIDE[resolution];
	return {
		labels: series.labels.filter((_, i) => i % stride === 0),
		cpu: series.cpu.filter((_, i) => i % stride === 0),
		mem: series.mem.filter((_, i) => i % stride === 0),
		disk: series.disk.filter((_, i) => i % stride === 0),
	};
}

/** Build aligned CPU/MEM/DISK series from Flux points (master timeline = CPU). */
export function buildMetricsFromFluxPoints(
	cpu: FluxPoint[],
	mem: FluxPoint[],
	resolution: Resolution,
	disk?: FluxPoint[]
): MetricsSeries | null {
	if (cpu.length === 0) return null;

	const memMap = new Map(mem.map((p) => [p.time, p.value]));
	const diskMap = disk && disk.length > 0 ? new Map(disk.map((p) => [p.time, p.value])) : null;
	const timesMs = cpu.map((p) => new Date(p.time).getTime());
	const labels = formatChartTimeLabels(timesMs);
	const cpuVals = cpu.map((p) => roundMetric(p.value));
	const memVals = cpu.map((p) => {
		const v = memMap.get(p.time);
		return roundMetric(v !== undefined ? v : p.value);
	});
	const diskVals = diskMap
		? cpu.map((p) => {
				const v = diskMap.get(p.time);
				return v !== undefined ? roundMetric(v) : 0;
			})
		: memVals.map((v) => Math.min(100, Math.round(v * 0.85)));

	return downsampleMetricsSeries(
		{ labels, cpu: cpuVals, mem: memVals, disk: diskVals },
		resolution
	);
}

/** In-memory history → chart series (only samples inside the selected range). */
export function historyToMetricsSeries(
	history: HistoryPoint[],
	range: Range,
	resolution: Resolution,
	diskScale = 0.85
): MetricsSeries | null {
	const cutoff = Date.now() - RANGE_MS[range];
	const slice = history.filter((p) => p.at >= cutoff);
	if (slice.length === 0) return null;

	const labels = formatChartTimeLabels(slice.map((p) => p.at));
	const cpu = slice.map((p) => p.cpu);
	const mem = slice.map((p) => p.mem);
	const disk = slice.map((p) =>
		p.disk !== undefined ? p.disk : Math.min(100, Math.round(p.mem * diskScale))
	);

	return downsampleMetricsSeries({ labels, cpu, mem, disk }, resolution);
}
