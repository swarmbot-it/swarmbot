import type { Series } from "../shared/line-chart.component";
import { LOAD_STACK_COLORS } from "./chart-range";

export type TaskRow = {
	cpu: number;
	mem: number;
	cpuSeries: number[];
	memSeries: number[];
	stack?: string | null;
};

export type StackLoadSlice = {
	name: string;
	color: string;
	currentCpu: number;
	currentMem: number;
	currentDisk: number;
	cpuSeries: number[];
	memSeries: number[];
	diskSeries: number[];
};

function avgSeries(seriesList: number[][]): number[] {
	if (seriesList.length === 0) return [];
	const len = Math.max(...seriesList.map((s) => s.length), 0);
	if (len === 0) return [];
	const out = new Array<number>(len).fill(0);
	for (const s of seriesList) {
		for (let i = 0; i < len; i++) {
			out[i] += s[i] ?? s[s.length - 1] ?? 0;
		}
	}
	return out.map((v) => v / seriesList.length);
}

function peak(values: number[]): number {
	if (!values.length) return 0;
	return Math.max(...values);
}

/** Picks top stacks by current CPU and builds per-metric multi-line series. */
export function buildStackLoadCharts(
	tasks: TaskRow[],
	services: { stack: string | null }[],
	labels: string[]
): {
	stacks: StackLoadSlice[];
	cpuSeries: Series[];
	memSeries: Series[];
	diskSeries: Series[];
} {
	const stackNames = new Set<string>();
	for (const s of services) {
		if (s.stack) stackNames.add(s.stack);
	}

	const byStack = new Map<string, TaskRow[]>();
	for (const t of tasks) {
		const stack = t.stack;
		if (!stack) continue;
		const list = byStack.get(stack) ?? [];
		list.push(t);
		byStack.set(stack, list);
	}

	const ranked = [...stackNames]
		.map((name) => {
			const list = byStack.get(name) ?? [];
			const currentCpu =
				list.length > 0
					? list.reduce((a, t) => a + t.cpu, 0) / list.length
					: 0;
			const currentMem =
				list.length > 0
					? list.reduce((a, t) => a + t.mem, 0) / list.length
					: 0;
			const cpuSeries = avgSeries(list.map((t) => t.cpuSeries));
			const memSeries = avgSeries(list.map((t) => t.memSeries));
			const diskSeries = cpuSeries.map((v) => Math.min(100, Math.round(v * 0.85)));
			return {
				name,
				currentCpu,
				currentMem,
				currentDisk: currentMem * 0.9,
				cpuSeries,
				memSeries,
				diskSeries,
			};
		})
		.sort((a, b) => b.currentCpu - a.currentCpu)
		.slice(0, 7);

	const stacks: StackLoadSlice[] = ranked.map((r, i) => ({
		...r,
		color: LOAD_STACK_COLORS[i] ?? LOAD_STACK_COLORS[0],
	}));

	const cpuSeries: Series[] = stacks.map((s) => ({
		name: s.name,
		data: alignSeries(s.cpuSeries, labels.length),
		color: s.color,
	}));
	const memSeries: Series[] = stacks.map((s) => ({
		name: s.name,
		data: alignSeries(s.memSeries, labels.length),
		color: s.color,
	}));
	const diskSeries: Series[] = stacks.map((s) => ({
		name: s.name,
		data: alignSeries(s.diskSeries, labels.length),
		color: s.color,
	}));

	return { stacks, cpuSeries, memSeries, diskSeries };
}

function alignSeries(data: number[], len: number): number[] {
	if (len <= 0) return data;
	if (data.length === len) return data;
	if (data.length === 0) return new Array(len).fill(0);
	if (data.length > len) return data.slice(-len);
	const pad = new Array(len - data.length).fill(data[0] ?? 0);
	return [...pad, ...data];
}

export function formatPeak(values: number[]): string {
	return peak(values).toFixed(1);
}
