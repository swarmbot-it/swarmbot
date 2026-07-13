import type { SwarmBotConfig } from "./config.js";

function authHeaders(cfg: SwarmBotConfig): Record<string, string> {
	return cfg.influxdbToken ? { Authorization: `Token ${cfg.influxdbToken}` } : {};
}

export function influxOrg(cfg: SwarmBotConfig): string {
	return cfg.influxOrg ?? "swarmbot";
}

export function influxBucket(cfg: SwarmBotConfig): string {
	return cfg.influxBucket ?? "swarmbot";
}

export async function influxPing(url: string): Promise<boolean> {
	try {
		const r = await fetch(`${url.replace(/\/$/, "")}/health`, { method: "GET" });
		return r.ok;
	} catch {
		return false;
	}
}

/** InfluxDB 2.x — execute Flux and return annotated CSV text. */
export async function influxQueryFlux(cfg: SwarmBotConfig, flux: string): Promise<string> {
	const base = cfg.influxdbUrl?.replace(/\/$/, "");
	if (!base) throw new Error("influx_not_configured");
	const org = encodeURIComponent(influxOrg(cfg));
	const r = await fetch(`${base}/api/v2/query?org=${org}`, {
		method: "POST",
		headers: {
			...authHeaders(cfg),
			Accept: "application/csv",
			"Content-Type": "application/vnd.flux",
		},
		body: flux,
	});
	if (!r.ok) {
		const text = await r.text().catch(() => "");
		throw new Error(`influx_flux_failed:${r.status}:${text.slice(0, 200)}`);
	}
	return r.text();
}

/** InfluxDB 2.x — write line protocol (nanosecond precision). */
export async function influxWrite(cfg: SwarmBotConfig, lines: string[]): Promise<void> {
	if (lines.length === 0) return;
	const base = cfg.influxdbUrl?.replace(/\/$/, "");
	if (!base) throw new Error("influx_not_configured");
	const org = encodeURIComponent(influxOrg(cfg));
	const bucket = encodeURIComponent(influxBucket(cfg));
	const body = lines.join("\n");
	const r = await fetch(`${base}/api/v2/write?org=${org}&bucket=${bucket}&precision=ns`, {
		method: "POST",
		headers: {
			...authHeaders(cfg),
			"Content-Type": "text/plain; charset=utf-8",
		},
		body,
	});
	if (!r.ok) {
		const text = await r.text().catch(() => "");
		throw new Error(`influx_write_failed:${r.status}:${text.slice(0, 200)}`);
	}
}

/** Legacy InfluxQL (InfluxDB 1.x compatibility) — kept for tests only. */
export async function influxQuery(
	cfg: SwarmBotConfig,
	influxql: string,
	db = "swarmbot"
): Promise<unknown> {
	const base = cfg.influxdbUrl?.replace(/\/$/, "");
	if (!base) throw new Error("influx_not_configured");
	const u = new URL(`${base}/query`);
	u.searchParams.set("db", db);
	u.searchParams.set("q", influxql);
	const r = await fetch(u, { method: "GET", headers: authHeaders(cfg) });
	if (!r.ok) throw new Error(`influx_query_failed:${r.status}`);
	return r.json();
}

export async function createDatabase(cfg: SwarmBotConfig, _name = "swarmbot"): Promise<void> {
	if (!cfg.influxdbUrl) return;
	await influxPing(cfg.influxdbUrl);
}
