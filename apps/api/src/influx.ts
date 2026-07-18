import type { SwarmbotConfig } from "./config.js";

export function authHeaders(cfg: SwarmbotConfig): Record<string, string> {
	return cfg.influxdbToken ? { Authorization: `Token ${cfg.influxdbToken}` } : {};
}

export async function influxPing(url: string): Promise<boolean> {
	try {
		const r = await fetch(`${url.replace(/\/$/, "")}/health`, { method: "GET" });
		return r.ok;
	} catch {
		return false;
	}
}

export async function influxQuery(
	cfg: SwarmbotConfig,
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

export async function createDatabase(cfg: SwarmbotConfig, name = "swarmbot"): Promise<void> {
	const base = cfg.influxdbUrl?.replace(/\/$/, "");
	if (!base) return;
	const r = await fetch(`${base}/query`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", ...authHeaders(cfg) },
		body: new URLSearchParams({ q: `CREATE DATABASE "${name}"` }),
	});
	if (!r.ok && r.status !== 400) {
		throw new Error(`influx_create_db:${r.status}`);
	}
}
