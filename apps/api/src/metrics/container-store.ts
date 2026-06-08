import { historyToMetricsSeries } from "./chart-series.js";
import type { StackMetricSeries } from "./influx-queries.js";
import type { Range, Resolution, MetricsSeries } from "./series.js";

const MAX_POINTS = 96;

type Point = { at: number; cpu: number; mem: number };
type Live = { cpu: number; mem: number; at: number };

const latestByTask = new Map<string, Live>();
const historyByTask = new Map<string, Point[]>();
const historyByStack = new Map<string, Point[]>();

function pushHistory(buf: Point[], point: Point): void {
	buf.push(point);
	while (buf.length > MAX_POINTS) buf.shift();
}

export function ingestContainerSample(
	taskId: string,
	stack: string | null,
	cpu: number,
	mem: number
): void {
	if (!taskId) return;
	const at = Date.now();
	const live = { cpu, mem, at };
	latestByTask.set(taskId, live);

	const taskHist = historyByTask.get(taskId) ?? [];
	pushHistory(taskHist, { at, cpu, mem });
	historyByTask.set(taskId, taskHist);

	if (stack) {
		const stackHist = historyByStack.get(stack) ?? [];
		const existing = stackHist[stackHist.length - 1];
		if (existing && existing.at === at) {
			existing.cpu = Math.round((existing.cpu + cpu) / 2);
			existing.mem = Math.round((existing.mem + mem) / 2);
		} else {
			pushHistory(stackHist, { at, cpu, mem });
		}
		historyByStack.set(stack, stackHist);
	}
}

export function getTaskLiveMetrics(
	taskId: string
): { cpu: number; mem: number } | null {
	const s = latestByTask.get(taskId);
	if (!s) return null;
	return { cpu: s.cpu, mem: s.mem };
}

export function getTaskMetricsSeries(
	taskId: string,
	range: Range,
	resolution: Resolution
): MetricsSeries | null {
	const hist = historyByTask.get(taskId);
	if (!hist) return null;
	return historyToMetricsSeries(hist, range, resolution);
}

export function getStackMetricsSeries(
	stack: string,
	range: Range,
	resolution: Resolution
): MetricsSeries | null {
	const hist = historyByStack.get(stack);
	if (!hist) return null;
	return historyToMetricsSeries(hist, range, resolution);
}

/** Top stacks by latest CPU from in-memory history (fallback when Influx is empty). */
export function getStackLoadSeries(
	range: Range,
	resolution: Resolution,
	limit = 7
): StackMetricSeries[] {
	const ranked = [...historyByStack.entries()]
		.map(([stack, hist]) => {
			const series = historyToMetricsSeries(hist, range, resolution);
			if (!series || series.cpu.length === 0) return null;
			return {
				stack,
				series,
				current: series.cpu[series.cpu.length - 1] ?? 0,
			};
		})
		.filter((x): x is NonNullable<typeof x> => x != null)
		.sort((a, b) => b.current - a.current)
		.slice(0, limit);

	return ranked.map((r) => ({
		stack: r.stack,
		labels: r.series.labels,
		cpu: r.series.cpu,
		mem: r.series.mem,
		disk: r.series.disk,
	}));
}

export function getTaskSparkline(taskId: string, points = 16): { cpu: number[]; mem: number[] } {
	const hist = historyByTask.get(taskId) ?? [];
	const slice = hist.slice(-points);
	if (slice.length === 0) return { cpu: [], mem: [] };
	return {
		cpu: slice.map((p) => p.cpu),
		mem: slice.map((p) => p.mem),
	};
}

/** Test-only reset. */
export function __clearContainerStoreForTests(): void {
	latestByTask.clear();
	historyByTask.clear();
	historyByStack.clear();
}
