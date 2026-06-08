/** Parse annotated CSV from InfluxDB Flux query responses. */

export type FluxPoint = { time: string; value: number };

export type FluxTable = {
	tags: Record<string, string>;
	points: Array<{ time: string; value: number }>;
};

const TAG_COLUMNS = ["stack", "node_id", "task_id", "service_id", "hostname", "container_id"];

function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = "";
	let esc = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (esc) {
			cur += ch;
			esc = false;
			continue;
		}
		if (ch === "\\") {
			esc = true;
			continue;
		}
		if (ch === ",") {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out;
}

/**
 * Splits a Flux CSV response into logical tables (one per series / tag group).
 */
export function parseFluxCsv(csv: string): FluxTable[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
	const tables: FluxTable[] = [];
	let header: string[] | null = null;
	let tags: Record<string, string> = {};
	const points: Array<{ time: string; value: number }> = [];

	const flush = () => {
		if (header && points.length > 0) {
			tables.push({ tags: { ...tags }, points: [...points] });
		}
		header = null;
		tags = {};
		points.length = 0;
	};

	for (const line of lines) {
		if (line.startsWith("#")) continue;
		const cols = parseCsvLine(line);
		if (cols[0] === "" && cols[1] === "result") {
			flush();
			header = cols;
			continue;
		}
		if (!header) continue;

		const row: Record<string, string> = {};
		for (let i = 0; i < header.length; i++) {
			const key = header[i];
			if (key) row[key] = cols[i] ?? "";
		}

		for (const k of TAG_COLUMNS) {
			if (row[k]) tags[k] = row[k]!;
		}

		const t = row["_time"];
		const v = row["_value"];
		if (t && v !== undefined && v !== "") {
			const num = Number(v);
			if (Number.isFinite(num)) points.push({ time: t, value: num });
		}
	}
	flush();
	return tables;
}

/** Single-series points in time order (one table or merged). */
export function pointsFromFluxCsv(csv: string): FluxPoint[] {
	const tables = parseFluxCsv(csv);
	if (tables.length === 0) return [];
	const all = tables.flatMap((t) => t.points);
	all.sort((a, b) => a.time.localeCompare(b.time));
	return all.map((p) => ({ time: p.time, value: Math.round(p.value * 10) / 10 }));
}

/** Single-series values in time order (one table or merged). */
export function valuesFromFluxCsv(csv: string): number[] {
	return pointsFromFluxCsv(csv).map((p) => p.value);
}

/** Group rows by `stack` tag with timestamps (multi-stack Flux tables). */
export function pointsByStackTag(csv: string): Map<string, FluxPoint[]> {
	const map = new Map<string, FluxPoint[]>();
	const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
	let header: string[] | null = null;

	for (const line of lines) {
		if (line.startsWith("#")) continue;
		const cols = parseCsvLine(line);
		if (cols[0] === "" && cols[1] === "result") {
			header = cols;
			continue;
		}
		if (!header) continue;

		const row: Record<string, string> = {};
		for (let i = 0; i < header.length; i++) {
			const key = header[i];
			if (key) row[key] = cols[i] ?? "";
		}
		const stack = row["stack"];
		const t = row["_time"];
		const v = row["_value"];
		if (!stack || !t || v === "") continue;
		const num = Number(v);
		if (!Number.isFinite(num)) continue;
		const list = map.get(stack) ?? [];
		list.push({ time: t, value: Math.round(num * 10) / 10 });
		map.set(stack, list);
	}

	for (const [stack, pts] of map) {
		pts.sort((a, b) => a.time.localeCompare(b.time));
		map.set(stack, pts);
	}
	return map;
}

/** Group rows by `stack` column into numeric series (values only). */
export function seriesByStackTag(csv: string): Map<string, number[]> {
	const out = new Map<string, number[]>();
	for (const [stack, pts] of pointsByStackTag(csv)) {
		out.set(
			stack,
			pts.map((p) => p.value)
		);
	}
	return out;
}
