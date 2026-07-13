import type { SwarmBotConfig } from "../config.js";
import { influxBucket, influxQueryFlux } from "../influx.js";
import { buildMetricsFromFluxPoints } from "./chart-series.js";
import { pointsByStackTag, pointsFromFluxCsv, valuesFromFluxCsv } from "./flux-csv.js";
import type { FluxPoint } from "./flux-csv.js";
import type { MetricsSeries, Range, Resolution } from "./series.js";

const RANGE_DURATION: Record<Range, string> = {
	"15m": "15m",
	"1h": "1h",
	"6h": "6h",
	"24h": "24h",
};

const RANGE_WINDOW: Record<Range, string> = {
	"15m": "30s",
	"1h": "1m",
	"6h": "5m",
	"24h": "15m",
};

function bucket(cfg: SwarmBotConfig): string {
	return influxBucket(cfg);
}

function fluxNodeMetric(
	cfg: SwarmBotConfig,
	measurement: string,
	range: Range,
	nodeId?: string
): string {
	const b = bucket(cfg);
	const filterNode = nodeId
		? `|> filter(fn: (r) => r["node_id"] == "${nodeId.replace(/"/g, '\\"')}")`
		: "";
	return `
from(bucket: "${b}")
  |> range(start: -${RANGE_DURATION[range]})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "percent")
  ${filterNode}
  |> aggregateWindow(every: ${RANGE_WINDOW[range]}, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value"])
`.trim();
}

function fluxContainerMetric(
	cfg: SwarmBotConfig,
	measurement: string,
	range: Range,
	filterClause: string
): string {
	return `
from(bucket: "${bucket(cfg)}")
  |> range(start: -${RANGE_DURATION[range]})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "percent")
  |> filter(fn: (r) => ${filterClause})
  |> aggregateWindow(every: ${RANGE_WINDOW[range]}, fn: mean, createEmpty: false)
  |> group(columns: ["_time"])
  |> mean()
  |> keep(columns: ["_time", "_value"])
`.trim();
}

async function queryMetricPoints(
	cfg: SwarmBotConfig,
	measurement: string,
	range: Range,
	nodeId?: string
): Promise<FluxPoint[]> {
	const csv = await influxQueryFlux(cfg, fluxNodeMetric(cfg, measurement, range, nodeId));
	return pointsFromFluxCsv(csv);
}

async function queryContainerPoints(
	cfg: SwarmBotConfig,
	measurement: string,
	range: Range,
	filterClause: string
): Promise<FluxPoint[]> {
	const csv = await influxQueryFlux(cfg, fluxContainerMetric(cfg, measurement, range, filterClause));
	return pointsFromFluxCsv(csv);
}

export async function influxClusterSeries(
	cfg: SwarmBotConfig,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	try {
		const [cpu, mem, disk] = await Promise.all([
			queryMetricPoints(cfg, "node_cpu", range),
			queryMetricPoints(cfg, "node_memory", range),
			queryMetricPoints(cfg, "node_disk", range),
		]);
		return buildMetricsFromFluxPoints(cpu, mem, resolution, disk);
	} catch {
		return null;
	}
}

export async function influxNodeSeries(
	cfg: SwarmBotConfig,
	nodeId: string,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	try {
		const [cpu, mem, disk] = await Promise.all([
			queryMetricPoints(cfg, "node_cpu", range, nodeId),
			queryMetricPoints(cfg, "node_memory", range, nodeId),
			queryMetricPoints(cfg, "node_disk", range, nodeId),
		]);
		return buildMetricsFromFluxPoints(cpu, mem, resolution, disk);
	} catch {
		return null;
	}
}

export async function influxStackSeries(
	cfg: SwarmBotConfig,
	stack: string,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	const esc = stack.replace(/"/g, '\\"');
	const filter = `r["stack"] == "${esc}"`;
	try {
		const [cpu, mem] = await Promise.all([
			queryContainerPoints(cfg, "container_cpu", range, filter),
			queryContainerPoints(cfg, "container_memory", range, filter),
		]);
		return buildMetricsFromFluxPoints(cpu, mem, resolution);
	} catch {
		return null;
	}
}

export async function influxTaskSeries(
	cfg: SwarmBotConfig,
	taskId: string,
	range: Range,
	resolution: Resolution
): Promise<MetricsSeries | null> {
	if (!cfg.influxdbUrl) return null;
	const esc = taskId.replace(/"/g, '\\"');
	const filter = `r["task_id"] == "${esc}"`;
	try {
		const [cpu, mem] = await Promise.all([
			queryContainerPoints(cfg, "container_cpu", range, filter),
			queryContainerPoints(cfg, "container_memory", range, filter),
		]);
		return buildMetricsFromFluxPoints(cpu, mem, resolution);
	} catch {
		return null;
	}
}

export type StackMetricSeries = {
	stack: string;
	labels: string[];
	cpu: number[];
	mem: number[];
	disk: number[];
};

export async function influxStackLoadSeries(
	cfg: SwarmBotConfig,
	range: Range,
	resolution: Resolution,
	limit = 7
): Promise<StackMetricSeries[]> {
	if (!cfg.influxdbUrl) return [];
	const b = bucket(cfg);
	const fluxCpu = `
from(bucket: "${b}")
  |> range(start: -${RANGE_DURATION[range]})
  |> filter(fn: (r) => r._measurement == "container_cpu")
  |> filter(fn: (r) => r._field == "percent")
  |> filter(fn: (r) => exists r["stack"] and r["stack"] != "")
  |> group(columns: ["stack", "_time"])
  |> mean()
  |> group()
`.trim();
	const fluxMem = `
from(bucket: "${b}")
  |> range(start: -${RANGE_DURATION[range]})
  |> filter(fn: (r) => r._measurement == "container_memory")
  |> filter(fn: (r) => r._field == "percent")
  |> filter(fn: (r) => exists r["stack"] and r["stack"] != "")
  |> group(columns: ["stack", "_time"])
  |> mean()
  |> group()
`.trim();

	try {
		const [cpuCsv, memCsv] = await Promise.all([
			influxQueryFlux(cfg, fluxCpu),
			influxQueryFlux(cfg, fluxMem),
		]);
		const cpuByStack = pointsByStackTag(cpuCsv);
		const memByStack = pointsByStackTag(memCsv);

		const ranked = [...cpuByStack.entries()]
			.map(([stack, cpuPts]) => ({
				stack,
				cpuPts,
				current: cpuPts[cpuPts.length - 1]?.value ?? 0,
			}))
			.sort((a, b) => b.current - a.current)
			.slice(0, limit);

		const out: StackMetricSeries[] = [];
		for (const r of ranked) {
			const memPts = memByStack.get(r.stack) ?? [];
			const series = buildMetricsFromFluxPoints(r.cpuPts, memPts, resolution);
			if (!series) continue;
			out.push({ stack: r.stack, ...series });
		}
		return out;
	} catch {
		return [];
	}
}

/** Latest node CPU% from Influx (last 5m), for node list tiles. */
export async function influxNodeLivePercent(
	cfg: SwarmBotConfig,
	nodeId: string,
	measurement: "node_cpu" | "node_memory" | "node_disk"
): Promise<number | null> {
	if (!cfg.influxdbUrl) return null;
	const esc = nodeId.replace(/"/g, '\\"');
	const flux = `
from(bucket: "${bucket(cfg)}")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "percent")
  |> filter(fn: (r) => r["node_id"] == "${esc}")
  |> last()
  |> keep(columns: ["_value"])
`.trim();
	try {
		const vals = valuesFromFluxCsv(await influxQueryFlux(cfg, flux));
		const v = vals[vals.length - 1];
		return v !== undefined ? Math.round(v) : null;
	} catch {
		return null;
	}
}
