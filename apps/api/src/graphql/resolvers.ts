import type { GraphQLContext } from "./context.js";
import { requireUser } from "./guards.js";
import { localizedError } from "../i18n/errors.js";
import { getSecret, userByUsername, updateDoc } from "../couch.js";
import { generateJwt } from "../auth/jwt.js";
import { verifyPassword, derivePassword, isSha256Digest } from "../auth/password.js";
import { revokeJti } from "../auth/blacklist.js";
import {
	aggregateStacks,
	mapNetworkSummary,
	mapNodeSummary,
	mapServiceSummary,
	mapStamped,
	mapTaskSummary,
	mapVolumeSummary,
	type NodeSummary,
	type ServiceSummary,
} from "../docker/engine.js";
import { pubsub, SWARM_TOPIC } from "./pubsub.js";
import type Dockerode from "dockerode";
import { randomUUID } from "crypto";
import {
	createRegistry as createRegistryDoc,
	listRegistries,
	removeRegistry,
} from "../store/registries.js";
import {
	createUser as createUserDoc,
	getUserByUsername,
	listUsers as listUserAccounts,
	removeUser,
	updateUserProfile,
	changeUserPassword,
} from "../store/users.js";
import {
	influxClusterSeries,
	mockSeries,
	nodeMockHistory,
	taskMockHistory,
	type Range,
	type Resolution,
} from "../metrics/series.js";
import { influxQuery } from "../influx.js";

/**
 * Stable per-resource pseudo-load so dashboards look the same between
 * polls when InfluxDB is not configured. The hash mixes the node id
 * into a 0–100 range with mild offsets per metric.
 */
function pseudoLoad(id: string, kind: "cpu" | "mem" | "disk"): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
	const offsets = { cpu: 0, mem: 7, disk: 13 };
	return 20 + ((h + offsets[kind] * 1000) % 60);
}

async function decorateNodes(ctx: GraphQLContext, base: NodeSummary[]): Promise<NodeSummary[]> {
	if (!ctx.cfg.influxdbUrl) {
		return base.map((n) => ({
			...n,
			cpu: pseudoLoad(n.id, "cpu"),
			mem: pseudoLoad(n.id, "mem"),
			disk: pseudoLoad(n.id, "disk"),
		}));
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
				const valueOf = (rows: unknown): number => {
					const r = rows as {
						results?: Array<{
							series?: Array<{ values?: Array<Array<number | string>> }>;
						}>;
					};
					const v = r.results?.[0]?.series?.[0]?.values?.[0]?.[1];
					return typeof v === "number" ? Math.round(v) : pseudoLoad(n.id, "cpu");
				};
				return { ...n, cpu: valueOf(c), mem: valueOf(m), disk: valueOf(d) };
			} catch {
				return {
					...n,
					cpu: pseudoLoad(n.id, "cpu"),
					mem: pseudoLoad(n.id, "mem"),
					disk: pseudoLoad(n.id, "disk"),
				};
			}
		})
	);
}

function classifyService(_s: ServiceSummary): string {
	return _s.replicasRunning >= _s.replicasTotal ? "RUNNING" : "UPDATING";
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
			name: "swarmboty",
			version: process.env.SWARMBOTY_VERSION ?? "0.1.0",
			dockerApi: ctx.cfg.dockerApi,
			instanceName: ctx.cfg.instanceName ?? null,
			influxdb: Boolean(ctx.cfg.influxdbUrl),
		}),
		me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await getUserByUsername(ctx.couchDb, ctx.user!.usr.username);
			if (!u) return null;
			return {
				username: u.username,
				email: u.email || null,
				name: u.name || null,
				phone: u.phone || null,
				role: u.role,
				created: u.created || null,
				lastLogin: u.lastLogin || null,
			};
		},
		overview: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const docker = ctx.docker as Dockerode & {
				listSecrets(): Promise<unknown[]>;
				listConfigs(): Promise<unknown[]>;
			};
			const [
				services,
				nodesRaw,
				tasks,
				networks,
				volRes,
				secrets,
				configs,
				registries,
				users,
			] = await Promise.all([
				docker.listServices(),
				docker.listNodes(),
				docker.listTasks(),
				docker.listNetworks(),
				docker.listVolumes(),
				docker.listSecrets(),
				docker.listConfigs(),
				listRegistries(ctx.couchDb),
				listUserAccounts(ctx.couchDb),
			]);
			const nodes = await decorateNodes(ctx, nodesRaw.map(mapNodeSummary));
			const active = nodes.filter((n) => !n.tags.includes("DRAIN"));
			const avg = (key: "cpu" | "mem" | "disk") =>
				active.length === 0
					? 0
					: Math.round(active.reduce((s, n) => s + n[key], 0) / active.length);
			const volumes = (volRes as { Volumes?: unknown[] }).Volumes ?? [];
			const managers = nodes.filter((n) => n.role === "manager").length;
			const workers = nodes.filter((n) => n.role === "worker").length;
			const cpuCores = nodes.length * 16;
			const cpu = avg("cpu");
			const mem = avg("mem");
			const disk = avg("disk");
			return {
				nodes: nodes.length,
				managers,
				workers,
				stacks: aggregateStacks(services, networks.map(mapNetworkSummary)).length,
				services: services.length,
				tasks: tasks.length,
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
				memTotal: `${nodes.length * 48} GB`,
				memUsed: `${Math.round((nodes.length * 48 * mem) / 100)} GB`,
				diskTotal: `${(nodes.length * 1.5).toFixed(1)} TB`,
				diskUsed: `${((nodes.length * 1.5 * disk) / 100).toFixed(1)} TB`,
			};
		},
		stacks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const [services, networks] = await Promise.all([
				ctx.docker.listServices(),
				ctx.docker.listNetworks(),
			]);
			return aggregateStacks(services, networks.map(mapNetworkSummary));
		},
		services: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.docker.listServices();
			return list.map((s) => {
				const summary = mapServiceSummary(s);
				return { ...summary, status: classifyService(summary) };
			});
		},
		service: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.docker.listServices();
			const s = list.find(
				(x: Dockerode.Service) => (x as unknown as { ID?: string }).ID === id
			);
			if (!s) return null;
			const summary = mapServiceSummary(s);
			return { ...summary, status: classifyService(summary) };
		},
		tasks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const [tasksRaw, services, nodes] = await Promise.all([
				ctx.docker.listTasks(),
				ctx.docker.listServices(),
				ctx.docker.listNodes(),
			]);
			const nodeMap = new Map(
				nodes.map((n) => [(n as unknown as { ID?: string }).ID, mapNodeSummary(n)])
			);
			const svcMap = new Map(
				services.map((s) => [(s as unknown as { ID?: string }).ID, mapServiceSummary(s)])
			);
			return tasksRaw.map((t, idx) => {
				const ts = mapTaskSummary(t);
				const svc = svcMap.get(ts.serviceId);
				const node = nodeMap.get(ts.nodeId);
				const cpuBase = pseudoLoad(ts.id, "cpu") / 1.2;
				const memBase = pseudoLoad(ts.id, "mem") / 1.1;
				const hist = taskMockHistory(idx, cpuBase, memBase);
				const updatedAge = Date.now() - new Date(ts.timestamp).getTime();
				return {
					id: ts.id,
					name: svc ? `${svc.name}.${ts.slot}` : ts.id,
					image: svc?.image ?? "—",
					node: node?.hostname ?? ts.nodeId,
					cpu: Math.round(cpuBase),
					mem: Math.round(memBase),
					updated: humanizeAge(updatedAge),
					status: ts.state.toUpperCase(),
					cpuSeries: hist.cpu,
					memSeries: hist.mem,
				};
			});
		},
		nodes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.docker.listNodes();
			return decorateNodes(
				ctx,
				list.map((n) => mapNodeSummary(n))
			);
		},
		networks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.docker.listNetworks();
			return list.map(mapNetworkSummary);
		},
		volumes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const res = (await ctx.docker.listVolumes()) as unknown as { Volumes?: unknown[] };
			return (res.Volumes ?? []).map(mapVolumeSummary);
		},
		secrets: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const docker = ctx.docker as Dockerode & { listSecrets(): Promise<unknown[]> };
			const list = await docker.listSecrets();
			return list.map(mapStamped);
		},
		configs: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const docker = ctx.docker as Dockerode & { listConfigs(): Promise<unknown[]> };
			const list = await docker.listConfigs();
			return list.map(mapStamped);
		},
		registries: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return listRegistries(ctx.couchDb);
		},
		users: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return listUserAccounts(ctx.couchDb);
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
			const influx = await influxClusterSeries(ctx.cfg, range, resolution);
			if (influx) return influx;
			return mockSeries(range, resolution);
		},
		statsSeries: async (
			_: unknown,
			args: { measurement: string; field: string; tags?: string | null },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			if (!ctx.cfg.influxdbUrl) return null;
			const tagClause = args.tags ? ` WHERE ${args.tags}` : "";
			const q = `SELECT mean("${args.field}") FROM "${args.measurement}"${tagClause} GROUP BY time(1m) fill(null) ORDER BY time DESC LIMIT 120`;
			try {
				const data = await influxQuery(ctx.cfg, q);
				return JSON.stringify(data);
			} catch {
				return null;
			}
		},
	},

	Mutation: {
		login: async (
			_: unknown,
			{ username, password }: { username: string; password: string },
			ctx: GraphQLContext
		) => {
			const u = await userByUsername(ctx.couchDb, username);
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
				await updateDoc(ctx.couchDb, u, { password: derivePassword(password) });
			}
			await updateDoc(ctx.couchDb, u, { lastLoginAt: new Date().toISOString() });
			const secretDoc = await getSecret(ctx.couchDb);
			const secret = String(secretDoc?.secret ?? "");
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
			if (ctx.user.iss === "swarmboty") {
				revokeJti(ctx.user.jti);
			}
			return true;
		},
		apiTokenGenerate: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await userByUsername(ctx.couchDb, ctx.user!.usr.username);
			if (!u) {
				throw localizedError(ctx.locale, "errors.userNotFound", "USER_NOT_FOUND");
			}
			const jti = randomUUID();
			const now = Math.floor(Date.now() / 1000);
			const exp =
				ctx.cfg.apiTokenExpiryDays && ctx.cfg.apiTokenExpiryDays > 0
					? now + ctx.cfg.apiTokenExpiryDays * 86400
					: null;
			const secretDoc = await getSecret(ctx.couchDb);
			const secret = String(secretDoc?.secret ?? "");
			if (!secret) {
				throw localizedError(
					ctx.locale,
					"errors.serverMisconfigured",
					"SERVER_MISCONFIGURED"
				);
			}
			const token = generateJwt(secret, u, { iss: "swarmboty-api", jti, exp });
			const expiresAt = exp ? new Date(exp * 1000).toISOString() : null;
			await updateDoc(ctx.couchDb, u, {
				"api-token": { jti, mask: token.slice(-5), ...(expiresAt ? { expiresAt } : {}) },
			});
			return { token, expiresAt };
		},
		apiTokenRemove: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const u = await userByUsername(ctx.couchDb, ctx.user!.usr.username);
			if (u) {
				await updateDoc(ctx.couchDb, u, { "api-token": null });
			}
			return true;
		},

		createStack: async (
			_: unknown,
			{ input }: { input: { name: string; composeYaml: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return {
				name: input.name,
				services: 0,
				networks: 0,
				volumes: 0,
				configs: 0,
				secrets: 0,
				status: "PENDING",
			};
		},
		removeStack: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
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
			requireUser(ctx);
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
		},
		removeService: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
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
				};
			},
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
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
			};
		},
		removeNetwork: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return true;
		},
		createVolume: async (
			_: unknown,
			{ input }: { input: { name: string; driver: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return {
				name: input.name,
				driver: input.driver,
				size: formatBytes(0),
				mountpoint: null,
			};
		},
		removeVolume: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return true;
		},
		createSecret: async (
			_: unknown,
			{ input }: { input: { name: string; content: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const now = new Date().toISOString();
			return {
				id: `sec_${randomUUID().slice(0, 8)}`,
				name: input.name,
				created: now,
				updated: now,
			};
		},
		removeSecret: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return true;
		},
		createConfig: async (
			_: unknown,
			{ input }: { input: { name: string; content: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const now = new Date().toISOString();
			return {
				id: `cfg_${randomUUID().slice(0, 8)}`,
				name: input.name,
				created: now,
				updated: now,
			};
		},
		removeConfig: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
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
			requireUser(ctx);
			return createRegistryDoc(ctx.couchDb, input);
		},
		removeRegistry: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			return removeRegistry(ctx.couchDb, id);
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
			requireUser(ctx);
			return createUserDoc(ctx.couchDb, input);
		},
		removeUser: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			return removeUser(ctx.couchDb, id);
		},
		updateProfile: async (
			_: unknown,
			{ input }: { input: { name: string; email: string; phone?: string | null } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return updateUserProfile(ctx.couchDb, ctx.user!.usr.username, input);
		},
		changePassword: async (
			_: unknown,
			{ input }: { input: { current: string; next: string } },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			return changeUserPassword(ctx.couchDb, ctx.user!.usr.username, input.current, input.next);
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
