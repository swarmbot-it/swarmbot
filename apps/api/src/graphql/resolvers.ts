import type { GraphQLContext } from "./context.js";
import { requireUser, requireAdmin, requireEditor } from "./guards.js";
import { localizedError } from "../i18n/errors.js";
import { getAppSecret } from "../db.js";
import { decryptAtRest } from "../crypto/secret-box.js";
import { allowAttempt } from "../auth/rate-limit.js";
import { generateJwt } from "../auth/jwt.js";
import { verifyPassword, derivePassword, isSha256Digest } from "../auth/password.js";
import { revokeJti } from "../auth/blacklist.js";
import {
	validateInput,
	createUserInputSchema,
	createRegistryInputSchema,
	createNetworkInputSchema,
} from "../validation/schemas.js";
import {
	forceUpdateService,
	mapConfigSummary,
	mapNetworkSummary,
	mapNodeSummary,
	mapServiceSummary,
	mapStamped,
	mapVolumeSummary,
	rollbackServiceById,
	scaleServiceById,
	serviceIdsForStack,
	setNodeAvailability,
	type NodeSummary,
	type ServiceSummary,
	type TaskSummary,
} from "../docker/engine.js";
import { stackRemove } from "../docker/cli.js";
import { ManifestValidationError } from "../orchestrator/kubernetes/adapter.js";
import yaml from "js-yaml";
import { pubsub, SWARM_TOPIC } from "./pubsub.js";
import type Dockerode from "dockerode";
import { randomUUID } from "crypto";
import {
	createRegistry as createRegistryDoc,
	getRegistryByName,
	listRegistries,
	removeRegistry,
	setDefaultRegistry,
} from "../store/registries.js";
import {
	createUser as createUserDoc,
	findAuthUser,
	getUserByUsername,
	listUsers as listUserAccounts,
	removeUser,
	setApiToken,
	touchLastLogin,
	updateUserProfile,
	changeUserPassword,
	upgradePasswordHash,
} from "../store/users.js";
import {
	influxClusterSeries,
	influxNodeSeries,
	mockSeries,
	nodeMockHistory,
	relativeLabel,
	taskMockHistory,
	type Range,
	type Resolution,
} from "../metrics/series.js";
import { influxQuery } from "../influx.js";
import { recentEvents } from "../events/hub.js";
import { recordDailySnapshot, weekOverWeekDeltas } from "../store/metrics-history.js";

/** Raised for operations with no equivalent on the active orchestrator backend. */
function notSupportedError(ctx: GraphQLContext): Error {
	return localizedError(
		ctx.locale,
		"errors.notSupportedInOrchestrator",
		"NOT_SUPPORTED_IN_ORCHESTRATOR"
	);
}

/** Guard for Swarm-only mutations (they drive Dockerode/`docker stack` directly). */
function requireSwarm(ctx: GraphQLContext): void {
	if (ctx.orchestrator.kind !== "swarm") {
		throw notSupportedError(ctx);
	}
}

function summarizeDockerEvent(raw: string): string {
	try {
		const obj = JSON.parse(raw) as Record<string, unknown>;
		const type = String(obj["Type"] ?? obj["typ"] ?? obj["type"] ?? "resource");
		const action = String(obj["Action"] ?? obj["action"] ?? "event");
		const actor = (obj["Actor"] ?? obj["actor"] ?? {}) as Record<string, unknown>;
		const attrs = (actor["Attributes"] ?? actor["attributes"] ?? {}) as Record<string, unknown>;
		const name =
			(attrs["name"] as string) ??
			(attrs["Name"] as string) ??
			(actor["ID"] as string) ??
			(actor["id"] as string) ??
			"";
		return `${type}${name ? ` "${name}"` : ""} ${action}`.trim();
	} catch {
		return raw.slice(0, 140);
	}
}

/** Measurements/fields this app ever writes (see events/stats-writer.ts) — the only ones `Query.statsSeries` may read. */
const STATS_MEASUREMENTS = new Set(["cpu", "memory", "disk", "container_stats"]);
const STATS_FIELDS = new Set(["percent", "total_bytes", "used_bytes", "cpu_percent", "mem_percent"]);

/**
 * Stable per-resource pseudo-load so dashboards look the same between
 * polls when InfluxDB is not configured. The hash mixes the node id
 * into a 0–100 range with mild offsets per metric.
 */
function pseudoLoad(id: string, kind: "cpu" | "mem" | "disk"): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	// gcd(1000, 60) = 20, so offset*1000 mod 60 only depends on offset mod 3 (cycles
	// through 0/40/20) — offsets must land in different residue classes mod 3, or the
	// mod-60 reduction collapses two of them onto the same value (e.g. 7 and 13 both ≡1).
	const offsets = { cpu: 0, mem: 1, disk: 2 };
	return 20 + ((h + offsets[kind] * 1000) % 60);
}

/** Rough, stable hash used only to seed the mock-mode history sparkline (not for pseudoLoad's real value). */
function historySeed(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	return h % 100;
}

/** Attaches the CPU/mem/disk sparkline history the Nodes page renders per host, alongside its live values. */
async function nodeHistoryFields(
	ctx: GraphQLContext,
	n: NodeSummary,
	cpu: number,
	mem: number,
	disk: number
): Promise<Pick<NodeSummary, "cpuHistory" | "memHistory" | "diskHistory">> {
	if (ctx.cfg.mock) {
		const h = nodeMockHistory(historySeed(n.id), cpu, mem, disk);
		return { cpuHistory: h.cpu, memHistory: h.mem, diskHistory: h.disk };
	}
	if (!ctx.cfg.influxdbUrl) {
		return { cpuHistory: null, memHistory: null, diskHistory: null };
	}
	const series = await influxNodeSeries(ctx.cfg, n.id, "1h", "low");
	return {
		cpuHistory: series?.cpu ?? null,
		memHistory: series?.mem ?? null,
		diskHistory: series?.disk ?? null,
	};
}

async function decorateNodes(ctx: GraphQLContext, base: NodeSummary[]): Promise<NodeSummary[]> {
	if (!ctx.cfg.influxdbUrl) {
		return Promise.all(
			base.map(async (n) => {
				const cpu = pseudoLoad(n.id, "cpu");
				const mem = pseudoLoad(n.id, "mem");
				const disk = pseudoLoad(n.id, "disk");
				return { ...n, cpu, mem, disk, ...(await nodeHistoryFields(ctx, n, cpu, mem, disk)) };
			})
		);
	}
	return Promise.all(
		base.map(async (n) => {
			try {
				const cpuQuery = `SELECT mean("percent") FROM "cpu" WHERE "node" = '${n.id}' AND time > now() - 5m`;
				const memQuery = `SELECT mean("percent") FROM "memory" WHERE "node" = '${n.id}' AND time > now() - 5m`;
				const diskQuery = `SELECT mean("percent") FROM "disk" WHERE "node" = '${n.id}' AND time > now() - 5m`;
				const [c, m, d] = await Promise.all([
					influxQuery(ctx.cfg, cpuQuery),
					influxQuery(ctx.cfg, memQuery),
					influxQuery(ctx.cfg, diskQuery),
				]);
				// Influx being configured but returning no rows means the agent isn't
				// connected/reporting for this node yet — not that its real usage is
				// some plausible-looking number. Only synthesize a placeholder when
				// there's no telemetry backend at all (handled by the branch above);
				// here, honest 0 beats a believable fake reading.
				const valueOf = (rows: unknown): number => {
					const r = rows as {
						results?: Array<{
							series?: Array<{ values?: Array<Array<number | string>> }>;
						}>;
					};
					const v = r.results?.[0]?.series?.[0]?.values?.[0]?.[1];
					return typeof v === "number" ? Math.round(v) : 0;
				};
				const cpu = valueOf(c);
				const mem = valueOf(m);
				const disk = valueOf(d);
				return { ...n, cpu, mem, disk, ...(await nodeHistoryFields(ctx, n, cpu, mem, disk)) };
			} catch {
				// Same reasoning as above: a failed Influx query means "no data",
				// not "here's a plausible number."
				return { ...n, cpu: 0, mem: 0, disk: 0, ...(await nodeHistoryFields(ctx, n, 0, 0, 0)) };
			}
		})
	);
}

/** Sum of each node's latest reported real disk capacity (written by swarmagent's stats payload). */
async function latestDiskBytesTotal(ctx: GraphQLContext): Promise<number> {
	if (!ctx.cfg.influxdbUrl) return 0;
	try {
		const q = `SELECT last("total_bytes") FROM "disk" GROUP BY "node"`;
		const raw = (await influxQuery(ctx.cfg, q)) as {
			results?: Array<{ series?: Array<{ values?: Array<[string, number]> }> }>;
		};
		const series = raw.results?.[0]?.series ?? [];
		return series.reduce((sum, s) => sum + (s.values?.[0]?.[1] ?? 0), 0);
	} catch {
		return 0;
	}
}

function classifyService(_s: ServiceSummary): string {
	return _s.replicasRunning >= _s.replicasTotal ? "RUNNING" : "UPDATING";
}

/** Shared task fetch+map used by both `Query.tasks` and `Query.nodeMap` so they never drift. */
async function loadTaskInfos(ctx: GraphQLContext): Promise<ReturnType<typeof mapTaskInfo>[]> {
	const [tasks, services, nodes, containerStats] = await Promise.all([
		ctx.orchestrator.listTasks(),
		ctx.orchestrator.listServices(),
		ctx.orchestrator.listNodes(),
		fetchTaskContainerStats(ctx),
	]);
	const nodeMap = new Map(nodes.map((n) => [n.id as string | undefined, n]));
	const svcMap = new Map(services.map((s) => [s.id as string | undefined, s]));
	const hasInflux = Boolean(ctx.cfg.influxdbUrl);
	const kind = ctx.orchestrator.kind;
	return tasks.map((t, idx) => mapTaskInfo(t, idx, kind, svcMap, nodeMap, containerStats, hasInflux));
}

/**
 * Coarse, best-effort guess at what a service "is" from its image name, for
 * Node Map's chip coloring. An approximation, not a guarantee — a custom
 * image built on postgres won't necessarily match, and that's fine for v1.
 */
export function categorizeImage(image: string): string {
	const name = image.toLowerCase();
	if (/postgres|mysql|redis|mongo/.test(name)) return "data";
	if (/keycloak|dex|vault/.test(name)) return "identity";
	if (/traefik|nginx|haproxy/.test(name)) return "network";
	if (/prometheus|grafana/.test(name)) return "ops";
	return "app";
}

type ContainerSeries = { cpu: number[]; mem: number[] };

/**
 * One InfluxDB round-trip for every task's CPU/Memory history, keyed by the
 * agent's container-naming convention (`/<service>.<slot>.<taskId>`) so
 * {@link mapTaskInfo} can look each task up without a per-row query.
 */
async function fetchTaskContainerStats(ctx: GraphQLContext): Promise<Map<string, ContainerSeries>> {
	const map = new Map<string, ContainerSeries>();
	if (!ctx.cfg.influxdbUrl) return map;
	try {
		const q = `SELECT mean("cpu_percent") AS cpu, mean("mem_percent") AS mem FROM "container_stats" WHERE time > now() - 15m GROUP BY "container", time(1m) fill(none)`;
		const raw = (await influxQuery(ctx.cfg, q)) as {
			results?: Array<{
				series?: Array<{
					tags?: { container?: string };
					values?: Array<[string, number | null, number | null]>;
				}>;
			}>;
		};
		for (const s of raw.results?.[0]?.series ?? []) {
			const container = s.tags?.container;
			if (!container) continue;
			const cpu: number[] = [];
			const mem: number[] = [];
			for (const v of s.values ?? []) {
				if (typeof v[1] === "number") cpu.push(v[1]);
				if (typeof v[2] === "number") mem.push(v[2]);
			}
			map.set(container, { cpu, mem });
		}
	} catch {
		// best-effort — callers fall back to 0/empty when a task has no entry
	}
	return map;
}

/**
 * Container-stats lookup for one task. The agent tags each series with the
 * container name: Swarm uses `/{service}.{slot}.{taskId}`, Kubernetes uses
 * the unique `{namespace}/{pod}/{container}` id (the task id is `{ns}/{pod}`,
 * so a prefix match aggregates over the pod's containers).
 */
function taskContainerSeries(
	kind: string,
	ts: TaskSummary,
	svc: ServiceSummary | undefined,
	containerStats: Map<string, ContainerSeries>
): ContainerSeries | undefined {
	if (kind === "kubernetes") {
		for (const [key, series] of containerStats) {
			if (key.startsWith(`${ts.id}/`)) return series;
		}
		return undefined;
	}
	return svc ? containerStats.get(`/${svc.name}.${ts.slot}.${ts.id}`) : undefined;
}

/** Shared per-task mapping used by both the tasks list and the single-task detail lookup. */
function mapTaskInfo(
	ts: TaskSummary,
	idx: number,
	kind: string,
	svcMap: Map<string | undefined, ServiceSummary>,
	nodeMap: Map<string | undefined, NodeSummary>,
	containerStats: Map<string, ContainerSeries>,
	hasInflux: boolean
) {
	const svc = svcMap.get(ts.serviceId);
	const node = nodeMap.get(ts.nodeId);
	const stats = taskContainerSeries(kind, ts, svc, containerStats);

	// A task that isn't running has no live process to measure — showing a
	// pseudo/mock number here would misrepresent a dead task as consuming
	// real CPU/memory. Only running tasks are eligible for the placeholder
	// (no-Influx) fallback; every other state always gets honest zeros.
	const isRunning = ts.state === "running";
	let cpu: number;
	let mem: number;
	let cpuSeries: number[];
	let memSeries: number[];
	if (isRunning && stats && (stats.cpu.length > 0 || stats.mem.length > 0)) {
		cpuSeries = stats.cpu;
		memSeries = stats.mem;
		cpu = cpuSeries.length ? Math.round(cpuSeries[cpuSeries.length - 1]) : 0;
		mem = memSeries.length ? Math.round(memSeries[memSeries.length - 1]) : 0;
	} else if (isRunning && !hasInflux) {
		const cpuBase = pseudoLoad(ts.id, "cpu") / 1.2;
		const memBase = pseudoLoad(ts.id, "mem") / 1.1;
		const hist = taskMockHistory(idx, cpuBase, memBase);
		cpu = Math.round(cpuBase);
		mem = Math.round(memBase);
		cpuSeries = hist.cpu;
		memSeries = hist.mem;
	} else {
		cpu = 0;
		mem = 0;
		cpuSeries = [];
		memSeries = [];
	}

	const updatedAge = Date.now() - new Date(ts.timestamp).getTime();
	return {
		id: ts.id,
		name: ts.name ?? (svc ? `${svc.name}.${ts.slot}` : ts.id),
		image: svc?.image ?? "—",
		node: node?.hostname ?? ts.nodeId,
		cpu,
		mem,
		updated: humanizeAge(updatedAge),
		status: ts.state.toUpperCase(),
		cpuSeries,
		memSeries,
		serviceName: svc?.name ?? null,
		nodeHostname: node?.hostname ?? ts.nodeId ?? null,
		desiredState: ts.desiredState.toUpperCase(),
		message: ts.message ?? null,
	};
}

function formatBytes(bytes: number): string {
	if (bytes >= 1_000_000_000_000) return `${(bytes / 1e12).toFixed(1)} TB`;
	if (bytes >= 1_000_000_000) return `${Math.round(bytes / 1e9)} GB`;
	if (bytes >= 1_000_000) return `${Math.round(bytes / 1e6)} MB`;
	return `${bytes} B`;
}

export const resolvers = {
	JSON: {
		__serialize(v: unknown) {
			return v;
		},
	},
	Query: {
		health: () => "ok",
		version: async (_: unknown, __: unknown, ctx: GraphQLContext) => ({
			name: "swarmbot.it",
			version: process.env.SWARMBOT_VERSION ?? "0.1.0",
			dockerApi: ctx.cfg.dockerApi,
			instanceName: ctx.cfg.instanceName ?? null,
			orchestrator: ctx.orchestrator.kind,
			influxdb: Boolean(ctx.cfg.influxdbUrl),
		}),
		me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await getUserByUsername(ctx.db, ctx.user!.usr.username);
			if (!u) return null;
			return {
				username: u.username,
				email: u.email || null,
				name: u.name || null,
				phone: u.phone || null,
				role: u.role,
				created: u.created || null,
				lastLogin: u.lastLogin || null,
				apiTokenMask: u.apiTokenMask,
				apiTokenExpiresAt: u.apiTokenExpiresAt,
			};
		},
		overview: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const orch = ctx.orchestrator;
			const [
				services,
				nodesBase,
				tasks,
				networks,
				volumes,
				secrets,
				configs,
				stacksList,
				health,
				registries,
				users,
			] = await Promise.all([
				orch.listServices(),
				orch.listNodes(),
				orch.listTasks(),
				orch.listNetworks(),
				orch.listVolumes(),
				orch.listSecrets(),
				orch.listConfigs(),
				orch.listStacks(),
				orch.clusterHealth(),
				listRegistries(ctx.db),
				listUserAccounts(ctx.db),
			]);
			const nodes = await decorateNodes(ctx, nodesBase);
			const active = nodes.filter((n) => !n.tags.includes("DRAIN"));
			const avg = (key: "cpu" | "mem" | "disk") =>
				active.length === 0
					? 0
					: Math.round(active.reduce((s, n) => s + n[key], 0) / active.length);
			const managersTotal = health.managersTotal;
			const managersReady = health.managersReady;
			const workers = nodes.filter((n) => n.role === "worker").length;
			const cpuCores =
				Math.round(nodes.reduce((s, n) => s + (n.cpuCores ?? 0), 0)) || nodes.length * 16;
			const memBytesTotal =
				nodes.reduce((s, n) => s + (n.memBytes ?? 0), 0) || nodes.length * 48e9;
			const diskBytesTotal = (await latestDiskBytesTotal(ctx)) || nodes.length * 1.5e12;
			const cpu = avg("cpu");
			const mem = avg("mem");
			const disk = avg("disk");
			const stacksCount = stacksList.length;
			const tasksRunning = tasks.filter((t) => t.state === "running").length;
			const counts = { stacks: stacksCount, services: services.length, tasks: tasks.length };
			await recordDailySnapshot(ctx.db, counts);
			const deltas = await weekOverWeekDeltas(ctx.db, counts);
			return {
				nodes: nodes.length,
				managersTotal,
				managersReady,
				workers,
				stacks: stacksCount,
				services: services.length,
				tasks: tasks.length,
				tasksRunning,
				...deltas,
				networks: networks.length,
				volumes: volumes.length,
				secrets: secrets.length,
				configs: configs.length,
				registries: registries.length,
				users: users.length,
				cpu,
				mem,
				disk,
				cpuCores,
				cpuUsed: Math.round((cpuCores * cpu) / 100),
				memTotal: `${(memBytesTotal / 1e9).toFixed(1)} GB`,
				memUsed: `${((memBytesTotal / 1e9) * (mem / 100)).toFixed(1)} GB`,
				diskTotal: `${(diskBytesTotal / 1e12).toFixed(1)} TB`,
				diskUsed: `${((diskBytesTotal / 1e12) * (disk / 100)).toFixed(1)} TB`,
			};
		},
		stacks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listStacks();
		},
		services: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.orchestrator.listServices();
			return list.map((s) => ({ ...s, status: classifyService(s) }));
		},
		service: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			const detail = await ctx.orchestrator.getService(id);
			if (!detail) return null;
			return { ...detail, status: classifyService(detail) };
		},
		tasks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return loadTaskInfos(ctx);
		},
		task: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			const [tasks, services, nodes, containerStats] = await Promise.all([
				ctx.orchestrator.listTasks(),
				ctx.orchestrator.listServices(),
				ctx.orchestrator.listNodes(),
				fetchTaskContainerStats(ctx),
			]);
			const idx = tasks.findIndex((t) => t.id === id);
			if (idx < 0) return null;
			const nodeMap = new Map(nodes.map((n) => [n.id as string | undefined, n]));
			const svcMap = new Map(services.map((s) => [s.id as string | undefined, s]));
			return mapTaskInfo(
				tasks[idx],
				idx,
				ctx.orchestrator.kind,
				svcMap,
				nodeMap,
				containerStats,
				Boolean(ctx.cfg.influxdbUrl)
			);
		},
		taskStats: async (
			_: unknown,
			args: { id: string; range?: string | null },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const range = (args.range ?? "1h") as Range;
			const empty = { labels: [] as string[], cpu: [] as number[], mem: [] as number[] };

			const [tasks, services] = await Promise.all([
				ctx.orchestrator.listTasks(),
				ctx.orchestrator.listServices(),
			]);
			const ts = tasks.find((t) => t.id === args.id) ?? null;
			// A dead task (failed/shutdown/rejected/...) has no live container to
			// measure — only "running" is eligible for real stats or, absent
			// Influx, the mock placeholder. Everything else gets an honest empty
			// series instead of a fabricated chart.
			const isRunning = ts?.state === "running";
			const kind = ctx.orchestrator.kind;
			// Task ids are spliced into an InfluxQL regex — restrict them to the
			// backend's id alphabet (Swarm: hex-ish, Kubernetes: `{ns}/{pod}`).
			const idOk =
				kind === "kubernetes"
					? /^[a-z0-9.-]+\/[a-z0-9.-]+$/i.test(args.id)
					: /^[a-z0-9]+$/i.test(args.id);

			if (ctx.cfg.influxdbUrl && ts && idOk) {
				try {
					const svcMap = new Map(services.map((s) => [s.id as string | undefined, s]));
					const svc = svcMap.get(ts.serviceId);
					if (svc || kind === "kubernetes") {
						const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
						const pattern =
							kind === "kubernetes"
								? `^${escape(ts.id)}\\/`
								: `^\\/?${escape(svc!.name)}\\.${ts.slot}\\.${args.id}`;
						const RANGES: Record<string, { window: string; bucket: string }> = {
							"15m": { window: "15m", bucket: "30s" },
							"1h": { window: "1h", bucket: "1m" },
							"6h": { window: "6h", bucket: "5m" },
							"24h": { window: "24h", bucket: "20m" },
						};
						const { window, bucket } = RANGES[range] ?? RANGES["1h"];
						const extract = async (field: string) => {
							const q = `SELECT mean("${field}") AS "value" FROM "container_stats" WHERE "container" =~ /${pattern}/ AND time > now() - ${window} GROUP BY time(${bucket}) fill(null) ORDER BY time ASC`;
							const raw2 = (await influxQuery(ctx.cfg, q)) as {
								results?: Array<{
									series?: Array<{ values?: Array<[string, number | null]> }>;
								}>;
							};
							return raw2?.results?.[0]?.series?.[0]?.values ?? [];
						};
						const [cpuRows, memRows] = await Promise.all([
							extract("cpu_percent"),
							extract("mem_percent"),
						]);
						if (cpuRows.length > 0) {
							return {
								labels: cpuRows.map((v) => relativeLabel(String(v[0]))),
								cpu: cpuRows.map((v) => v[1] ?? 0),
								mem: memRows.map((v) => v[1] ?? 0),
							};
						}
					}
				} catch {
					/* fall through to empty below */
				}
				return empty;
			}

			if (!ctx.cfg.influxdbUrl && isRunning) {
				let seed = 0;
				for (let i = 0; i < args.id.length; i++) seed = (seed * 31 + args.id.charCodeAt(i)) >>> 0;
				const mock = mockSeries(range, "medium", seed % 5);
				return { labels: mock.labels, cpu: mock.cpu, mem: mock.mem };
			}
			return empty;
		},
		nodes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return decorateNodes(ctx, await ctx.orchestrator.listNodes());
		},
		nodeMap: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const [nodes, taskInfos] = await Promise.all([
				decorateNodes(ctx, await ctx.orchestrator.listNodes()),
				loadTaskInfos(ctx),
			]);
			const byHostname = new Map<string, typeof taskInfos>();
			for (const t of taskInfos) {
				if (!t.nodeHostname) continue;
				const bucket = byHostname.get(t.nodeHostname);
				if (bucket) bucket.push(t);
				else byHostname.set(t.nodeHostname, [t]);
			}
			return nodes.map((node) => ({
				node,
				services: (byHostname.get(node.hostname) ?? []).map((t) => ({
					taskId: t.id,
					serviceName: t.serviceName ?? t.name,
					image: t.image,
					category: categorizeImage(t.image),
					cpu: t.cpu,
					mem: t.mem,
					status: t.status,
				})),
			}));
		},
		networks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listNetworks();
		},
		volumes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listVolumes();
		},
		secrets: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listSecrets();
		},
		configs: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listConfigs();
		},
		registries: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return listRegistries(ctx.db);
		},
		users: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return listUserAccounts(ctx.db);
		},
		metricsSeries: async (
			_: unknown,
			{ input }: { input: { range: Range; resolution?: Resolution; nodeId?: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const range = input.range;
			const resolution = input.resolution ?? "medium";
			if (input.nodeId) {
				const nodeInflux = await influxNodeSeries(ctx.cfg, input.nodeId, range, resolution);
				if (nodeInflux) return nodeInflux;
				if (ctx.cfg.mock) {
					const hist = nodeMockHistory(
						input.nodeId.charCodeAt(0) % 8,
						pseudoLoad(input.nodeId, "cpu"),
						pseudoLoad(input.nodeId, "mem"),
						pseudoLoad(input.nodeId, "disk")
					);
					return {
						labels: hist.cpu.map((_v, i) => `${hist.cpu.length - i}`),
						cpu: hist.cpu,
						mem: hist.mem,
						disk: hist.disk,
					};
				}
				return null;
			}
			const influx = await influxClusterSeries(ctx.cfg, range, resolution);
			if (influx) return influx;
			if (ctx.cfg.mock) return mockSeries(range, resolution);
			return null;
		},
		statsSeries: async (
			_: unknown,
			args: { measurement: string; field: string; tags?: string | null },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			if (!ctx.cfg.influxdbUrl) return null;
			// Whitelist against the fixed set of measurements/fields this app ever writes
			// (see events/stats-writer.ts) — args are otherwise spliced directly into InfluxQL.
			if (!STATS_MEASUREMENTS.has(args.measurement)) return null;
			if (!STATS_FIELDS.has(args.field)) return null;
			// Only a single `tag = 'value'` equality clause is allowed, never a raw WHERE fragment.
			if (args.tags && !/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*'[^'\\]*'$/.test(args.tags)) return null;
			const tagClause = args.tags ? ` WHERE ${args.tags}` : "";
			const q = `SELECT mean("${args.field}") FROM "${args.measurement}"${tagClause} GROUP BY time(1m) fill(null) ORDER BY time DESC LIMIT 120`;
			try {
				const data = await influxQuery(ctx.cfg, q);
				return JSON.stringify(data);
			} catch {
				return null;
			}
		},
		recentActivity: async (
			_: unknown,
			{ limit }: { limit?: number | null },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return recentEvents(limit ?? 20).map((e) => ({
				time: e.time,
				summary: summarizeDockerEvent(e.message),
			}));
		},
		stackStats: async (
			_: unknown,
			args: { name: string; range?: string | null },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const range = (args.range ?? "1h") as Range;
			const resolution: Resolution = "medium";
			const empty = { labels: [] as string[], cpu: [] as number[], mem: [] as number[] };

			if (ctx.cfg.influxdbUrl) {
				try {
					const kind = ctx.orchestrator.kind;
					const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
					let pattern: string | null = null;
					if (kind === "kubernetes") {
						// The agent's container ids are `{namespace}/{pod}/{container}`
						// and the stack IS the namespace.
						pattern = `^${escape(args.name)}\\/`;
					} else {
						const services = await ctx.orchestrator.listServices();
						const names = services
							.filter((s) => s.stack === args.name)
							.map((s) => s.name)
							.filter(Boolean);
						if (names.length > 0) {
							pattern = `^\\/?(${names.map(escape).join("|")})\\.`;
						}
					}
					if (pattern) {
						const RANGES: Record<string, { window: string; bucket: string }> = {
							"15m": { window: "15m", bucket: "30s" },
							"1h": { window: "1h", bucket: "1m" },
							"6h": { window: "6h", bucket: "5m" },
							"24h": { window: "24h", bucket: "20m" },
						};
						const { window, bucket } = RANGES[range] ?? RANGES["1h"];
						const extract = async (field: string) => {
							const q = `SELECT mean("${field}") AS "value" FROM "container_stats" WHERE "container" =~ /${pattern}/ AND time > now() - ${window} GROUP BY time(${bucket}) fill(null) ORDER BY time ASC`;
							const raw = (await influxQuery(ctx.cfg, q)) as {
								results?: Array<{
									series?: Array<{ values?: Array<[string, number | null]> }>;
								}>;
							};
							return raw?.results?.[0]?.series?.[0]?.values ?? [];
						};
						const [cpuRows, memRows] = await Promise.all([
							extract("cpu_percent"),
							extract("mem_percent"),
						]);
						if (cpuRows.length > 0) {
							return {
								labels: cpuRows.map((v) => relativeLabel(String(v[0]))),
								cpu: cpuRows.map((v) => v[1] ?? 0),
								mem: memRows.map((v) => v[1] ?? 0),
							};
						}
					}
				} catch {
					/* fall through to empty below */
				}
				// Influx is configured but has no matching container_stats rows for
				// this stack (agent not connected/reporting yet) — an honest empty
				// series, not a fabricated chart.
				return empty;
			}

			// No telemetry backend configured at all: keep the demo/mock-mode
			// placeholder so the chart isn't just blank in that specific setup.
			let seed = 0;
			for (let i = 0; i < args.name.length; i++) seed = (seed * 31 + args.name.charCodeAt(i)) >>> 0;
			const mock = mockSeries(range, resolution, seed % 5);
			return { labels: mock.labels, cpu: mock.cpu, mem: mock.mem };
		},
	},

	Mutation: {
		login: async (
			_: unknown,
			{ username, password }: { username: string; password: string },
			ctx: GraphQLContext
		) => {
			if (!allowAttempt(`${ctx.ip}:${username.toLowerCase()}`)) {
				throw localizedError(ctx.locale, "errors.tooManyAttempts", "TOO_MANY_ATTEMPTS");
			}
			const u = await findAuthUser(ctx.db, username);
			if (!u || typeof u.password !== "string") {
				throw localizedError(
					ctx.locale,
					"errors.invalidCredentials",
					"INVALID_CREDENTIALS"
				);
			}
			const ok = verifyPassword(password, u.password);
			if (!ok) {
				throw localizedError(
					ctx.locale,
					"errors.invalidCredentials",
					"INVALID_CREDENTIALS"
				);
			}
			if (isSha256Digest(password, u.password)) {
				await upgradePasswordHash(ctx.db, u.username, derivePassword(password));
			}
			await touchLastLogin(ctx.db, u.username);
			const secret = await getAppSecret(ctx.db).catch(() => "");
			if (!secret) {
				throw localizedError(
					ctx.locale,
					"errors.serverMisconfigured",
					"SERVER_MISCONFIGURED"
				);
			}
			const token = generateJwt(secret, u);
			return { token };
		},
		logout: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			if (!ctx.user) return true;
			if (ctx.user.iss === "swarmbot") {
				await revokeJti(ctx.db, ctx.user.jti);
			}
			return true;
		},
		apiTokenGenerate: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await findAuthUser(ctx.db, ctx.user!.usr.username);
			if (!u) {
				throw localizedError(ctx.locale, "errors.userNotFound", "USER_NOT_FOUND");
			}
			const jti = randomUUID();
			const now = Math.floor(Date.now() / 1000);
			const exp =
				ctx.cfg.apiTokenExpiryDays && ctx.cfg.apiTokenExpiryDays > 0
					? now + ctx.cfg.apiTokenExpiryDays * 86400
					: null;
			const secret = await getAppSecret(ctx.db).catch(() => "");
			if (!secret) {
				throw localizedError(
					ctx.locale,
					"errors.serverMisconfigured",
					"SERVER_MISCONFIGURED"
				);
			}
			const token = generateJwt(secret, u, { iss: "swarmbot-api", jti, exp });
			const expiresAt = exp ? new Date(exp * 1000).toISOString() : null;
			await setApiToken(ctx.db, u.username, {
				jti,
				mask: token.slice(-5),
				...(expiresAt ? { expiresAt } : {}),
			});
			return { token, expiresAt };
		},
		apiTokenRemove: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await findAuthUser(ctx.db, ctx.user!.usr.username);
			if (u) {
				await setApiToken(ctx.db, u.username, null);
			}
			return true;
		},

		createStack: async (
			_: unknown,
			{ input }: { input: { name: string; composeYaml: string } },
			ctx: GraphQLContext
		) => {
			requireEditor(ctx);
			const orch = ctx.orchestrator;
			if (ctx.cfg.mock && orch.kind === "swarm") {
				let compose: unknown;
				try {
					compose = yaml.load(input.composeYaml);
				} catch (e) {
					throw new Error(`Invalid compose YAML: ${(e as Error).message}`, { cause: e });
				}
				const services = (compose as { services?: Record<string, unknown> } | null)?.services;
				if (!services || typeof services !== "object") {
					throw new Error("Invalid compose YAML: missing services");
				}
				return {
					name: input.name,
					services: Object.keys(services).length,
					networks: 0,
					volumes: 0,
					configs: 0,
					secrets: 0,
					status: "PENDING",
				};
			}
			try {
				// Swarm: compose YAML via `docker stack deploy`.
				// Kubernetes: multi-document manifest YAML applied into the namespace.
				await orch.deployStack(input.name, input.composeYaml);
			} catch (e) {
				if (e instanceof ManifestValidationError) {
					// Compose input on Kubernetes is a capability gap, not a syntax
					// error — surface it as NOT_SUPPORTED_IN_ORCHESTRATOR.
					const parsed = (() => {
						try {
							return yaml.load(input.composeYaml) as Record<string, unknown> | null;
						} catch {
							return null;
						}
					})();
					if (parsed && typeof parsed === "object" && "services" in parsed) {
						throw notSupportedError(ctx);
					}
				}
				throw e;
			}
			const stacks = await orch.listStacks();
			return (
				stacks.find((s) => s.name === input.name) ?? {
					name: input.name,
					services: 0,
					networks: 0,
					volumes: 0,
					configs: 0,
					secrets: 0,
					status: "PENDING",
				}
			);
		},
		removeStack: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await stackRemove(ctx.cfg, name);
			return true;
		},
		redeployStack: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			const ids = await serviceIdsForStack(ctx.docker, name);
			for (const id of ids) await forceUpdateService(ctx.docker, id);
			return true;
		},
		rollbackStack: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			const ids = await serviceIdsForStack(ctx.docker, name);
			for (const id of ids) await rollbackServiceById(ctx.docker, id);
			return true;
		},
		deactivateStack: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			const ids = await serviceIdsForStack(ctx.docker, name);
			for (const id of ids) await scaleServiceById(ctx.docker, id, 0);
			return true;
		},
		reactivateStack: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			const ids = await serviceIdsForStack(ctx.docker, name);
			for (const id of ids) await scaleServiceById(ctx.docker, id, 1);
			return true;
		},
		createService: async (
			_: unknown,
			{
				input,
			}: {
				input: {
					name: string;
					image: string;
					registry: string;
					replicas: number;
					ports?: string[];
					stack?: string;
				};
			},
			ctx: GraphQLContext
		) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) {
				return {
					id: `svc_${randomUUID().slice(0, 8)}`,
					name: input.name,
					image: input.image,
					replicasRunning: 0,
					replicasTotal: input.replicas,
					ports: input.ports ?? [],
					status: "PENDING",
					stack: input.stack ?? null,
				};
			}
			const registryDoc = await getRegistryByName(ctx.db, input.registry);
			const authconfig = registryDoc?.registryUser
				? {
						username: registryDoc.registryUser,
						password: await decryptAtRest(ctx.db, registryDoc.password ?? undefined),
						serveraddress: registryDoc.url ?? "",
					}
				: undefined;
			const ports = (input.ports ?? []).map((p) => {
				const [hostRaw, containerRaw] = p.split(":");
				const published = parseInt(hostRaw, 10);
				const target = containerRaw ? parseInt(containerRaw, 10) : published;
				return { Protocol: "tcp", TargetPort: target, PublishedPort: published };
			});
			const spec = {
				Name: input.name,
				Labels: input.stack ? { "com.docker.stack.namespace": input.stack } : undefined,
				TaskTemplate: { ContainerSpec: { Image: input.image } },
				Mode: { Replicated: { Replicas: input.replicas } },
				EndpointSpec: ports.length ? { Ports: ports } : undefined,
			} as unknown as Dockerode.CreateServiceOptions;
			const svc = authconfig
				? await ctx.docker.createService(authconfig, spec)
				: await ctx.docker.createService(spec);
			const inspected = await svc.inspect();
			const summary = mapServiceSummary(inspected as unknown as Dockerode.Service);
			return { ...summary, replicasRunning: 0, status: "PENDING" };
		},
		removeService: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await ctx.docker.getService(id).remove();
			return true;
		},
		redeployService: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await forceUpdateService(ctx.docker, id);
			return true;
		},
		rollbackService: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await rollbackServiceById(ctx.docker, id);
			return true;
		},
		scaleService: async (
			_: unknown,
			{ id, replicas }: { id: string; replicas: number },
			ctx: GraphQLContext
		) => {
			requireEditor(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await scaleServiceById(ctx.docker, id, replicas);
			return true;
		},
		createNetwork: async (
			_: unknown,
			{
				input,
			}: {
				input: {
					name: string;
					driver: string;
					subnet?: string;
					gateway?: string;
					attachable?: boolean;
					internal?: boolean;
					ingress?: boolean;
					labels?: Array<{ k: string; v: string }>;
				};
			},
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			input = validateInput(createNetworkInputSchema, input, ctx.locale);
			if (ctx.cfg.mock) {
				return {
					id: `net_${randomUUID().slice(0, 8)}`,
					name: input.name,
					driver: input.driver,
					subnet: input.subnet ?? null,
					gateway: input.gateway ?? null,
					scope: input.driver === "overlay" ? "swarm" : "local",
					attachable: Boolean(input.attachable),
					internal: Boolean(input.internal),
					ingress: Boolean(input.ingress),
					stack: null,
				};
			}
			const opts: Record<string, unknown> = {
				Name: input.name,
				Driver: input.driver,
				Attachable: Boolean(input.attachable),
				Internal: Boolean(input.internal),
				Ingress: Boolean(input.ingress),
				Labels: input.labels?.length
					? Object.fromEntries(input.labels.map((l) => [l.k, l.v]))
					: undefined,
			};
			if (input.subnet) {
				opts.IPAM = {
					Config: [{ Subnet: input.subnet, ...(input.gateway ? { Gateway: input.gateway } : {}) }],
				};
			}
			const net = await ctx.docker.createNetwork(opts as unknown as Dockerode.NetworkCreateOptions);
			const inspected = await net.inspect();
			return mapNetworkSummary(inspected);
		},
		removeNetwork: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await ctx.docker.getNetwork(id).remove();
			return true;
		},
		createVolume: async (
			_: unknown,
			{ input }: { input: { name: string; driver: string; labels?: Array<{ k: string; v: string }> } },
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) {
				return {
					name: input.name,
					driver: input.driver,
					size: formatBytes(0),
					mountpoint: null,
					stack: null,
				};
			}
			await ctx.docker.createVolume({
				Name: input.name,
				Driver: input.driver || "local",
				Labels: input.labels?.length
					? Object.fromEntries(input.labels.map((l) => [l.k, l.v]))
					: undefined,
			} as unknown as Dockerode.VolumeCreateOptions);
			const inspected = await ctx.docker.getVolume(input.name).inspect();
			return mapVolumeSummary(inspected);
		},
		removeVolume: async (_: unknown, { name }: { name: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await ctx.docker.getVolume(name).remove();
			return true;
		},
		createSecret: async (
			_: unknown,
			{ input }: { input: { name: string; content: string } },
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) {
				const now = new Date().toISOString();
				return { id: `sec_${randomUUID().slice(0, 8)}`, name: input.name, created: now, updated: now, stack: null };
			}
			const data = Buffer.from(input.content, "utf8").toString("base64");
			const secret = await ctx.docker.createSecret({ Name: input.name, Data: data });
			const inspected = await secret.inspect();
			return mapStamped(inspected);
		},
		removeSecret: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await ctx.docker.getSecret(id).remove();
			return true;
		},
		createConfig: async (
			_: unknown,
			{ input }: { input: { name: string; content: string } },
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) {
				const now = new Date().toISOString();
				return {
					id: `cfg_${randomUUID().slice(0, 8)}`,
					name: input.name,
					created: now,
					updated: now,
					stack: null,
					content: input.content,
				};
			}
			const data = Buffer.from(input.content, "utf8").toString("base64");
			const config = await ctx.docker.createConfig({ Name: input.name, Data: data });
			const inspected = await config.inspect();
			return mapConfigSummary(inspected);
		},
		removeConfig: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (ctx.cfg.mock) return true;
			await ctx.docker.getConfig(id).remove();
			return true;
		},

		createRegistry: async (
			_: unknown,
			{
				input,
			}: {
				input: {
					name: string;
					url: string;
					type: string;
					user?: string;
					password?: string;
					default?: boolean;
				};
			},
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			input = validateInput(createRegistryInputSchema, input, ctx.locale);
			return createRegistryDoc(ctx.db, input);
		},
		removeRegistry: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			return removeRegistry(ctx.db, id);
		},
		setDefaultRegistry: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			return setDefaultRegistry(ctx.db, id);
		},
		setNodeAvailability: async (
			_: unknown,
			{ id, availability }: { id: string; availability: string },
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			requireSwarm(ctx);
			if (availability !== "active" && availability !== "drain") {
				throw new Error("availability must be \"active\" or \"drain\"");
			}
			if (ctx.cfg.mock) {
				const list = await ctx.docker.listNodes();
				const decorated = await decorateNodes(ctx, list.map((n) => mapNodeSummary(n)));
				return decorated.find((n) => n.id === id) ?? decorated[0];
			}
			await setNodeAvailability(ctx.docker, id, availability);
			const inspected = await ctx.docker.getNode(id).inspect();
			const [decorated] = await decorateNodes(ctx, [mapNodeSummary(inspected)]);
			return decorated;
		},
		createUser: async (
			_: unknown,
			{
				input,
			}: {
				input: {
					username: string;
					password: string;
					name?: string;
					email: string;
					phone?: string;
					role: string;
				};
			},
			ctx: GraphQLContext
		) => {
			requireAdmin(ctx);
			input = validateInput(createUserInputSchema, input, ctx.locale);
			return createUserDoc(ctx.db, input);
		},
		removeUser: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireAdmin(ctx);
			return removeUser(ctx.db, id);
		},
		updateProfile: async (
			_: unknown,
			{ input }: { input: { name: string; email: string; phone?: string | null } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return updateUserProfile(ctx.db, ctx.user!.usr.username, input);
		},
		changePassword: async (
			_: unknown,
			{ input }: { input: { current: string; next: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return changeUserPassword(ctx.db, ctx.user!.usr.username, input.current, input.next);
		},
	},

	Subscription: {
		swarmEvent: {
			subscribe: () => pubsub.asyncIterator([SWARM_TOPIC]),
		},
	},
};

function humanizeAge(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
	const w = Math.floor(d / 7);
	return `${w} week${w === 1 ? "" : "s"} ago`;
}
