import { GraphQLError } from "graphql";
import type { GraphQLContext } from "./context.js";
import { requireUser } from "./guards.js";
import { localizedError } from "../i18n/errors.js";
import { t } from "../i18n/translate.js";
import { validateStackName } from "../docker/cli.js";
import {
	ComposeValidationError,
	countComposeResources,
	validateComposeYaml,
} from "../docker/compose-validate.js";
import {
	ManifestValidationError,
	validateManifestYaml,
} from "../orchestrator/kubernetes/adapter.js";
import { getSecret, userByUsername, updateDoc } from "../couch.js";
import { generateJwt } from "../auth/jwt.js";
import { verifyPassword, derivePassword, isSha256Digest } from "../auth/password.js";
import { revokeJti } from "../auth/blacklist.js";
import type { NodeSummary, ServiceSummary } from "../orchestrator/types.js";
import { pubsub, SWARM_TOPIC } from "./pubsub.js";
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
import { mockSeries, taskMockHistory, type Range, type Resolution } from "../metrics/series.js";
import {
	influxClusterSeries,
	influxNodeLivePercent,
	influxNodeSeries,
	influxStackLoadSeries,
	influxStackSeries,
	influxTaskSeries,
} from "../metrics/influx-queries.js";
import {
	getTaskLiveMetrics,
	getTaskMetricsSeries,
	getTaskSparkline,
	getStackMetricsSeries,
	getStackLoadSeries,
} from "../metrics/container-store.js";
import {
	getClusterMetricsSeries,
	getClusterOverviewMetrics,
	getNodeAgentVersion,
	getNodeLiveMetrics,
	getNodeMetricsSeries,
	hasLiveStats,
} from "../metrics/stats-store.js";
import { influxQuery } from "../influx.js";
import { appVersion } from "../app-version.js";

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

function nodeHistoryFields(
	n: NodeSummary
): Pick<NodeSummary, "cpuHistory" | "memHistory" | "diskHistory"> {
	const hist = getNodeMetricsSeries(n.id, "1h", "high", n.hostname);
	return {
		cpuHistory: hist?.cpu ?? null,
		memHistory: hist?.mem ?? null,
		diskHistory: hist?.disk ?? null,
	};
}

function withAgentVersion(n: NodeSummary, extra: Partial<NodeSummary> = {}): NodeSummary {
	return { ...n, ...extra, agentVersion: getNodeAgentVersion(n.id, n.hostname) };
}

async function decorateNodes(ctx: GraphQLContext, base: NodeSummary[]): Promise<NodeSummary[]> {
	return Promise.all(
		base.map(async (n) => {
			const history = nodeHistoryFields(n);
			const live = getNodeLiveMetrics(n.id, n.hostname);
			if (live) return withAgentVersion(n, { ...live, ...history });

			if (ctx.cfg.influxdbUrl) {
				try {
					const [cpu, mem, disk] = await Promise.all([
						influxNodeLivePercent(ctx.cfg, n.id, "node_cpu"),
						influxNodeLivePercent(ctx.cfg, n.id, "node_memory"),
						influxNodeLivePercent(ctx.cfg, n.id, "node_disk"),
					]);
					if (cpu != null || mem != null || disk != null) {
						return withAgentVersion(n, { cpu, mem, disk, ...history });
					}
				} catch {
					/* fall through */
				}
			}

			return withAgentVersion(n, { cpu: null, mem: null, disk: null, ...history });
		})
	);
}

function classifyService(_s: ServiceSummary): string {
	return _s.replicasRunning >= _s.replicasTotal ? "RUNNING" : "UPDATING";
}

function looksLikeComposeYaml(yamlText: string): boolean {
	try {
		validateComposeYaml(yamlText);
		return true;
	} catch {
		return false;
	}
}

function validateManifestYamlOrThrow(
	ctx: GraphQLContext,
	yamlText: string
): Array<Record<string, unknown>> {
	try {
		return validateManifestYaml(yamlText);
	} catch (e) {
		if (e instanceof ManifestValidationError) {
			// A compose file submitted against Kubernetes is a mode mismatch,
			// not a syntax error — surface it as NOT_SUPPORTED_IN_ORCHESTRATOR.
			if (looksLikeComposeYaml(yamlText)) {
				throw localizedError(
					ctx.locale,
					"errors.notSupportedInOrchestrator",
					"NOT_SUPPORTED_IN_ORCHESTRATOR"
				);
			}
			throw new GraphQLError(`${t(ctx.locale, "errors.invalidManifest")} ${e.detail}`, {
				extensions: { code: "INVALID_MANIFEST" },
			});
		}
		throw e;
	}
}

function countManifestResources(docs: Array<Record<string, unknown>>) {
	const kinds = docs.map((d) => String(d.kind ?? ""));
	const count = (...wanted: string[]) => kinds.filter((k) => wanted.includes(k)).length;
	return {
		services: count("Deployment", "StatefulSet", "DaemonSet"),
		networks: 0,
		volumes: count("PersistentVolumeClaim"),
		configs: count("ConfigMap"),
		secrets: count("Secret"),
	};
}

function composeValidationMessage(
	locale: GraphQLContext["locale"],
	err: ComposeValidationError
): string {
	const base = t(locale, err.messageKey);
	if (err.detail) {
		return `${base} ${err.detail}`;
	}
	return base;
}

async function stackSummaryAfterDeploy(
	ctx: GraphQLContext,
	name: string,
	fallback: ReturnType<typeof countComposeResources>
) {
	const found = (await ctx.orchestrator.listStacks()).find((s) => s.name === name);
	if (found) return found;
	return {
		name,
		...fallback,
		status: "DEPLOYING",
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
			name: "swarmbot",
			version: appVersion(),
			dockerApi: ctx.cfg.dockerApi,
			instanceName: await ctx.orchestrator.clusterDisplayName(),
			influxdb: Boolean(ctx.cfg.influxdbUrl),
			orchestrator: ctx.orchestrator.kind,
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
			const orch = ctx.orchestrator;
			const [
				services,
				nodesBase,
				tasks,
				networks,
				volumes,
				secrets,
				configs,
				stacks,
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
				listRegistries(ctx.couchDb),
				listUserAccounts(ctx.couchDb),
			]);
			const nodes = await decorateNodes(ctx, nodesBase);
			const managers = nodes.filter((n) => n.role === "manager").length;
			const workers = nodes.filter((n) => n.role === "worker").length;
			const live = hasLiveStats() ? getClusterOverviewMetrics() : null;
			const cpu = live?.cpu ?? null;
			const mem = live?.mem ?? null;
			const disk = live?.disk ?? null;
			const cpuCores = live?.cpuCores ?? null;
			const cpuUsed = live?.cpuUsed ?? null;
			const memTotal = live ? formatBytes(live.memTotalBytes) : null;
			const memUsed = live ? formatBytes(live.memUsedBytes) : null;
			const diskTotal = live ? formatBytes(live.diskTotalBytes) : null;
			const diskUsed = live ? formatBytes(live.diskUsedBytes) : null;
			return {
				nodes: nodes.length,
				managers,
				workers,
				stacks: stacks.length,
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
				cpuUsed,
				memTotal,
				memUsed,
				diskTotal,
				diskUsed,
				clusterStatus: health.status,
				managersReady: health.managersReady,
				managersTotal: health.managersTotal,
			};
		},
		stacks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return ctx.orchestrator.listStacks();
		},
		services: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.orchestrator.listServices();
			return list.map((summary) => ({ ...summary, status: classifyService(summary) }));
		},
		service: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
			requireUser(ctx);
			const detail = await ctx.orchestrator.getService(id);
			if (!detail) return null;
			return { ...detail, status: classifyService(detail) };
		},
		tasks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const [tasks, services, nodes] = await Promise.all([
				ctx.orchestrator.listTasks(),
				ctx.orchestrator.listServices(),
				ctx.orchestrator.listNodes(),
			]);
			const nodeMap = new Map(nodes.map((n) => [n.id, n]));
			const svcMap = new Map(services.map((s) => [s.id, s]));
			return tasks.map((ts, idx) => {
				const svc = svcMap.get(ts.serviceId);
				const node = nodeMap.get(ts.nodeId);
				const live = getTaskLiveMetrics(ts.id);
				const spark = getTaskSparkline(ts.id);
				const cpuBase = live?.cpu ?? pseudoLoad(ts.id, "cpu") / 1.2;
				const memBase = live?.mem ?? pseudoLoad(ts.id, "mem") / 1.1;
				const hist = spark.cpu.length > 0 ? spark : taskMockHistory(idx, cpuBase, memBase);
				const updatedAge = Date.now() - new Date(ts.timestamp).getTime();
				return {
					id: ts.id,
					serviceId: ts.serviceId,
					name: ts.name ?? (svc ? `${svc.name}.${ts.slot}` : ts.id),
					image: svc?.image ?? "—",
					node: node?.hostname ?? ts.nodeId,
					stack: svc?.stack ?? null,
					cpu: Math.round(cpuBase),
					mem: Math.round(memBase),
					updated: humanizeAge(updatedAge),
					updatedAt: ts.timestamp,
					status: ts.state.toUpperCase(),
					cpuSeries: hist.cpu,
					memSeries: hist.mem,
				};
			});
		},
		nodes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			const list = await ctx.orchestrator.listNodes();
			return decorateNodes(ctx, list);
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
			return listRegistries(ctx.couchDb);
		},
		users: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
			requireUser(ctx);
			return listUserAccounts(ctx.couchDb);
		},
		metricsSeries: async (
			_: unknown,
			{
				input,
			}: {
				input: {
					range: Range;
					resolution?: Resolution;
					nodeId?: string;
					stack?: string;
					serviceId?: string;
					taskId?: string;
				};
			},
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const range = input.range;
			const resolution = input.resolution ?? "medium";

			if (input.taskId) {
				const influx = await influxTaskSeries(ctx.cfg, input.taskId, range, resolution);
				if (influx) return influx;
				return getTaskMetricsSeries(input.taskId, range, resolution);
			}

			if (input.stack) {
				const influx = await influxStackSeries(ctx.cfg, input.stack, range, resolution);
				if (influx) return influx;
				return getStackMetricsSeries(input.stack, range, resolution);
			}

			if (input.nodeId) {
				const live = getNodeMetricsSeries(input.nodeId, range, resolution);
				if (live) return live;
				const influx = await influxNodeSeries(ctx.cfg, input.nodeId, range, resolution);
				if (influx) return influx;
				return null;
			}

			const live = getClusterMetricsSeries(range, resolution);
			if (live) return live;
			const influx = await influxClusterSeries(ctx.cfg, range, resolution);
			if (influx) return influx;
			if (ctx.cfg.mock) return mockSeries(range, resolution);
			return null;
		},
		stackLoadSeries: async (
			_: unknown,
			{ range, resolution }: { range: Range; resolution?: Resolution },
			ctx: GraphQLContext
		) => {
			requireUser(ctx);
			const r = range ?? "1h";
			const res = resolution ?? "medium";
			const fromMemory = getStackLoadSeries(r, res);
			if (fromMemory.length > 0) return fromMemory;
			try {
				const fromInflux = await influxStackLoadSeries(ctx.cfg, r, res);
				if (fromInflux.length > 0) return fromInflux;
			} catch (e) {
				console.warn("stackLoadSeries Influx query failed:", e);
			}
			return fromMemory;
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
			if (ctx.user.iss === "swarmbot") {
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
			const token = generateJwt(secret, u, { iss: "swarmbot-api", jti, exp });
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
			const name = input.name.trim();
			try {
				validateStackName(name);
			} catch {
				throw localizedError(ctx.locale, "errors.invalidStackName", "INVALID_STACK_NAME");
			}

			const orch = ctx.orchestrator;

			if (orch.kind === "kubernetes") {
				// Kubernetes deploys raw manifests (server-side apply into the
				// namespace named after the stack) — compose is not supported.
				const docs = validateManifestYamlOrThrow(ctx, input.composeYaml);
				const counts = countManifestResources(docs);
				if (!ctx.cfg.mock) {
					try {
						await orch.deployStack(name, input.composeYaml);
					} catch (e) {
						const detail = e instanceof Error ? e.message.trim() : String(e);
						throw new GraphQLError(
							`${t(ctx.locale, "errors.stackDeployFailed")} ${detail}`,
							{ extensions: { code: "STACK_DEPLOY_FAILED" } }
						);
					}
				}
				return stackSummaryAfterDeploy(ctx, name, counts);
			}

			if (!orch.capabilities.composeDeploy) {
				throw localizedError(
					ctx.locale,
					"errors.notSupportedInOrchestrator",
					"NOT_SUPPORTED_IN_ORCHESTRATOR"
				);
			}

			let doc;
			try {
				doc = validateComposeYaml(input.composeYaml);
			} catch (e) {
				if (e instanceof ComposeValidationError) {
					throw new GraphQLError(composeValidationMessage(ctx.locale, e), {
						extensions: { code: "INVALID_COMPOSE" },
					});
				}
				throw e;
			}

			const counts = countComposeResources(doc);

			if (!ctx.cfg.mock) {
				try {
					await orch.deployStack(name, input.composeYaml);
				} catch (e) {
					let detail = e instanceof Error ? e.message.trim() : String(e);
					if (
						e &&
						typeof e === "object" &&
						"code" in e &&
						(e as NodeJS.ErrnoException).code === "ENOENT"
					) {
						detail =
							ctx.locale === "pl"
								? "nie znaleziono programu docker (zainstaluj Docker CLI lub ustaw SWARMBOT_DOCKER_CLI)"
								: "docker CLI not found (install Docker CLI or set SWARMBOT_DOCKER_CLI)";
					}
					throw new GraphQLError(
						detail
							? `${t(ctx.locale, "errors.stackDeployFailed")} ${detail}`
							: t(ctx.locale, "errors.stackDeployFailed"),
						{ extensions: { code: "STACK_DEPLOY_FAILED" } }
					);
				}
			}

			return stackSummaryAfterDeploy(ctx, name, counts);
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
			return changeUserPassword(
				ctx.couchDb,
				ctx.user!.usr.username,
				input.current,
				input.next
			);
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
