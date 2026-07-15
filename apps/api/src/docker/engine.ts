import Dockerode from "dockerode";
import type { SwarmbotyConfig } from "../config.js";
import { setNegotiatedDockerApi } from "../config.js";
import { createMockDocker } from "./mock.js";

export type DockerCtx = {
	docker: Dockerode;
	cfg: SwarmbotyConfig;
};

export function createDocker(cfg: SwarmbotyConfig): Dockerode {
	if (cfg.mock) {
		return createMockDocker();
	}
	const socketPath = cfg.dockerSock;
	if (socketPath.startsWith("http://") || socketPath.startsWith("https://")) {
		const u = new URL(socketPath);
		const protocol: "http" | "https" = u.protocol === "https:" ? "https" : "http";
		const port = u.port ? parseInt(u.port, 10) : protocol === "https" ? 443 : 80;
		return new Dockerode({ host: u.hostname, port, protocol });
	}
	return new Dockerode({ socketPath });
}

export function negotiateApiVersion(daemonMax: string | undefined, ourMax = "1.45"): string {
	const parse = (s: string | undefined) => (s ? parseFloat(s) : undefined);
	const om = parse(ourMax) ?? 1.45;
	const dm = parse(daemonMax) ?? om;
	const chosen = Math.min(om, dm);
	return chosen.toFixed(2);
}

export async function setupDockerApi(_cfg: SwarmbotyConfig, docker: Dockerode): Promise<void> {
	const envOverride = process.env.SWARMBOTY_DOCKER_API;
	if (envOverride) {
		setNegotiatedDockerApi(envOverride);
		return;
	}
	try {
		const info = await docker.version();
		const apiVersion = (info as { ApiVersion?: string }).ApiVersion;
		const v = negotiateApiVersion(apiVersion);
		setNegotiatedDockerApi(v);
	} catch {
		/* keep default */
	}
}

/** Label Docker Compose/stack deploy stamps on every resource it creates. */
export const STACK_LABEL = "com.docker.stack.namespace";

/** Reads the stack-namespace label from either a service spec or a plain resource. */
function labelsOf(x: unknown): Record<string, string> {
	const anyx = x as { Spec?: { Labels?: Record<string, string> }; Labels?: Record<string, string> };
	return anyx.Spec?.Labels ?? anyx.Labels ?? {};
}

type ServiceLike = {
	ID?: string;
	Spec?: {
		Name?: string;
		Labels?: Record<string, string>;
		TaskTemplate?: { ContainerSpec?: { Image?: string } };
		Mode?: { Replicated?: { Replicas?: number }; Global?: object };
		EndpointSpec?: {
			Ports?: Array<{
				TargetPort?: number;
				PublishedPort?: number;
				Protocol?: string;
			}>;
		};
	};
};

type NodeLike = {
	ID?: string;
	id?: string;
	Description?: {
		Hostname?: string;
		Engine?: { EngineVersion?: string };
		Resources?: { NanoCPUs?: number; MemoryBytes?: number };
	};
	Status?: { Addr?: string; State?: string };
	Spec?: { Role?: string; Availability?: string };
	ManagerStatus?: { Leader?: boolean; Reachability?: string };
};

type TaskLike = {
	ID?: string;
	ServiceID?: string;
	NodeID?: string;
	DesiredState?: string;
	Slot?: number;
	Status?: { State?: string; Timestamp?: string };
};

type NetworkLike = {
	Id?: string;
	Name?: string;
	Driver?: string;
	Scope?: string;
	Attachable?: boolean;
	Internal?: boolean;
	Ingress?: boolean;
	Labels?: Record<string, string>;
	IPAM?: { Config?: Array<{ Subnet?: string; Gateway?: string }> };
};

type VolumeLike = {
	Name?: string;
	Driver?: string;
	Mountpoint?: string;
	Labels?: Record<string, string>;
	UsageData?: { Size?: number };
};

type StampedLike = {
	ID?: string;
	CreatedAt?: string;
	UpdatedAt?: string;
	Spec?: { Name?: string; Labels?: Record<string, string> };
};

export type ServiceSummary = {
	id: string;
	name: string;
	image: string | null;
	replicasRunning: number;
	replicasTotal: number;
	ports: string[];
	status: string;
	stack: string | null;
};

export type NodeSummary = {
	id: string;
	hostname: string;
	role: string;
	availability: string | null;
	ip: string | null;
	dockerVersion: string | null;
	tags: string[];
	cpu: number;
	mem: number;
	disk: number;
	cpuHistory?: number[] | null;
	memHistory?: number[] | null;
	diskHistory?: number[] | null;
};

export type TaskSummary = {
	id: string;
	serviceId: string;
	nodeId: string;
	state: string;
	desiredState: string;
	slot: number;
	timestamp: string;
};

export type NetworkSummary = {
	id: string;
	name: string;
	driver: string;
	scope: string;
	attachable: boolean;
	internal: boolean;
	ingress: boolean;
	subnet: string | null;
	gateway: string | null;
	stack: string | null;
};

export type VolumeSummary = {
	name: string;
	driver: string;
	size: string;
	mountpoint: string | null;
	stack: string | null;
};

export type StampedSummary = {
	id: string;
	name: string;
	created: string;
	updated: string;
	stack: string | null;
};

/** Strip the `@sha256:...` digest Docker appends after resolving an image, leaving the human-readable repo:tag. */
function shortImage(image: string | null): string | null {
	return image ? image.split("@")[0] : image;
}

/** Format published ports as "host→container" strings used by the UI. */
export function formatPorts(spec: ServiceLike["Spec"]): string[] {
	const ports = spec?.EndpointSpec?.Ports ?? [];
	return ports.map((p) => {
		const target = p.TargetPort ?? 0;
		const published = p.PublishedPort ?? target;
		return `${published}→${target}`;
	});
}

export function mapServiceSummary(s: Dockerode.Service): ServiceSummary {
	const sl = s as unknown as ServiceLike;
	const id = sl.ID ?? "";
	const spec = sl.Spec;
	const name = spec?.Name ?? "";
	const image = shortImage(spec?.TaskTemplate?.ContainerSpec?.Image ?? null);
	const stack = spec?.Labels?.[STACK_LABEL] ?? null;
	const replicas = spec?.Mode?.Replicated?.Replicas ?? (spec?.Mode?.Global ? 1 : 0);
	return {
		id,
		name,
		image,
		replicasRunning: replicas,
		replicasTotal: replicas,
		ports: formatPorts(spec),
		status: "RUNNING",
		stack,
	};
}

type ServiceInspect = {
	ID?: string;
	CreatedAt?: string;
	UpdatedAt?: string;
	Spec?: ServiceLike["Spec"] & {
		Mode?: { Replicated?: { Replicas?: number }; Global?: object };
		TaskTemplate?: {
			ContainerSpec?: {
				Image?: string;
				Env?: string[];
				Mounts?: Array<{ Type?: string; Source?: string; Target?: string; ReadOnly?: boolean }>;
				Secrets?: Array<{ SecretName?: string }>;
				Configs?: Array<{ ConfigName?: string }>;
			};
			Networks?: Array<{ Target?: string }>;
		};
		Networks?: Array<{ Target?: string }>;
	};
};

export type ServiceDetail = ServiceSummary & {
	mode: string | null;
	created: string | null;
	updated: string | null;
	env: string[];
	labels: Array<{ k: string; v: string }>;
	networks: string[];
	mounts: Array<{ type: string; source: string | null; target: string; readOnly: boolean }>;
	secrets: string[];
	configs: string[];
};

/** Full `docker.getService(id).inspect()` result mapped for the service detail page. */
export function mapServiceDetail(s: unknown): ServiceDetail {
	const sl = s as ServiceInspect;
	const spec = sl.Spec;
	const containerSpec = spec?.TaskTemplate?.ContainerSpec;
	const replicas = spec?.Mode?.Replicated?.Replicas ?? (spec?.Mode?.Global ? 1 : 0);
	const labelMap = spec?.Labels ?? {};
	const networkTargets = spec?.TaskTemplate?.Networks ?? spec?.Networks ?? [];
	return {
		id: sl.ID ?? "",
		name: spec?.Name ?? "",
		image: shortImage(containerSpec?.Image ?? null),
		replicasRunning: replicas,
		replicasTotal: replicas,
		ports: formatPorts(spec),
		status: "RUNNING",
		stack: labelMap[STACK_LABEL] ?? null,
		mode: spec?.Mode?.Replicated ? "replicated" : spec?.Mode?.Global ? "global" : null,
		created: sl.CreatedAt ?? null,
		updated: sl.UpdatedAt ?? null,
		env: containerSpec?.Env ?? [],
		labels: Object.entries(labelMap).map(([k, v]) => ({ k, v: String(v) })),
		networks: networkTargets.map((n) => n.Target).filter((x): x is string => Boolean(x)),
		mounts: (containerSpec?.Mounts ?? []).map((m) => ({
			type: m.Type ?? "volume",
			source: m.Source ?? null,
			target: m.Target ?? "",
			readOnly: Boolean(m.ReadOnly),
		})),
		secrets: (containerSpec?.Secrets ?? [])
			.map((sc) => sc.SecretName)
			.filter((x): x is string => Boolean(x)),
		configs: (containerSpec?.Configs ?? [])
			.map((cf) => cf.ConfigName)
			.filter((x): x is string => Boolean(x)),
	};
}

export function mapNodeSummary(n: Dockerode.Node): NodeSummary {
	const nl = n as unknown as NodeLike;
	const id = nl.ID ?? nl.id ?? "";
	const hostname = nl.Description?.Hostname ?? id;
	const role = nl.Spec?.Role ?? "unknown";
	const availability = nl.Spec?.Availability ?? null;
	const ip = nl.Status?.Addr ?? null;
	const dockerVersion = nl.Description?.Engine?.EngineVersion ?? null;
	const tags: string[] = [];
	if (nl.ManagerStatus?.Leader) tags.push("LEADER");
	if (role === "manager") tags.push("MANAGER");
	if (role === "worker") tags.push("WORKER");
	if (nl.ManagerStatus?.Reachability === "reachable" && !nl.ManagerStatus?.Leader)
		tags.push("REACHABLE");
	if (nl.Status?.State === "ready") tags.push("READY");
	if (availability === "active") tags.push("ACTIVE");
	if (availability === "drain") tags.push("DRAIN");
	return {
		id,
		hostname,
		role,
		availability,
		ip,
		dockerVersion,
		tags,
		cpu: 0,
		mem: 0,
		disk: 0,
	};
}

type NodeUpdateOpts = { _query: Record<string, unknown>; _body: unknown };

/** Set a node's scheduling availability ("active" resumes scheduling, "drain" evicts and stops new tasks). */
export async function setNodeAvailability(
	docker: Dockerode,
	id: string,
	availability: "active" | "drain"
): Promise<void> {
	const node = docker.getNode(id);
	const inspected = (await node.inspect()) as {
		Version?: { Index?: number };
		Spec?: { Role?: string; Availability?: string; Labels?: Record<string, string> };
	};
	const version = inspected.Version?.Index ?? 0;
	const spec = { ...(inspected.Spec ?? {}), Availability: availability };
	await node.update({ _query: { version }, _body: spec } as unknown as NodeUpdateOpts);
}

export function mapTaskSummary(t: unknown): TaskSummary {
	const tl = t as TaskLike;
	return {
		id: tl.ID ?? "",
		serviceId: tl.ServiceID ?? "",
		nodeId: tl.NodeID ?? "",
		state: tl.Status?.State ?? "unknown",
		desiredState: tl.DesiredState ?? "running",
		slot: tl.Slot ?? 0,
		timestamp: tl.Status?.Timestamp ?? new Date().toISOString(),
	};
}

export function mapNetworkSummary(n: unknown): NetworkSummary {
	const nl = n as NetworkLike;
	const ipam = nl.IPAM?.Config?.[0];
	return {
		id: nl.Id ?? "",
		name: nl.Name ?? "",
		driver: nl.Driver ?? "",
		scope: nl.Scope ?? "swarm",
		attachable: Boolean(nl.Attachable),
		internal: Boolean(nl.Internal),
		ingress: Boolean(nl.Ingress),
		subnet: ipam?.Subnet ?? null,
		gateway: ipam?.Gateway ?? null,
		stack: labelsOf(n)[STACK_LABEL] ?? null,
	};
}

function formatSize(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes)) return "—";
	if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
	if (bytes >= 1e9) return `${Math.round(bytes / 1e9)} GB`;
	if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
	return `${Math.round(bytes / 1e3)} KB`;
}

export function mapVolumeSummary(v: unknown): VolumeSummary {
	const vl = v as VolumeLike;
	return {
		name: vl.Name ?? "",
		driver: vl.Driver ?? "",
		size: formatSize(vl.UsageData?.Size),
		mountpoint: vl.Mountpoint ?? null,
		stack: labelsOf(v)[STACK_LABEL] ?? null,
	};
}

export function mapStamped(s: unknown): StampedSummary {
	const sl = s as StampedLike;
	return {
		id: sl.ID ?? "",
		name: sl.Spec?.Name ?? "",
		created: sl.CreatedAt ?? new Date().toISOString(),
		updated: sl.UpdatedAt ?? sl.CreatedAt ?? new Date().toISOString(),
		stack: labelsOf(s)[STACK_LABEL] ?? null,
	};
}

export type ConfigSummary = StampedSummary & { content: string | null };

/** Like {@link mapStamped}, plus the config's file content — Docker returns `Spec.Data` (base64) for configs, unlike secrets. */
export function mapConfigSummary(c: unknown): ConfigSummary {
	const data = (c as { Spec?: { Data?: string } }).Spec?.Data;
	let content: string | null = null;
	if (data) {
		try {
			content = Buffer.from(data, "base64").toString("utf8");
		} catch {
			content = null;
		}
	}
	return { ...mapStamped(c), content };
}

/**
 * Aggregate task counts per stack and decide the overall status label.
 * Looks at the namespace label on services to bucket them.
 */
export type StackAgg = {
	name: string;
	services: number;
	networks: number;
	volumes: number;
	configs: number;
	secrets: number;
	status: string;
};

export function aggregateStacks(
	services: Dockerode.Service[],
	networks: NetworkSummary[],
	volumes: VolumeSummary[] = [],
	configs: StampedSummary[] = [],
	secrets: StampedSummary[] = []
): StackAgg[] {
	const byStack = new Map<string, StackAgg>();
	const bucket = (name: string): StackAgg => {
		let entry = byStack.get(name);
		if (!entry) {
			entry = { name, services: 0, networks: 0, volumes: 0, configs: 0, secrets: 0, status: "RUNNING" };
			byStack.set(name, entry);
		}
		return entry;
	};
	for (const s of services) {
		const stack = labelsOf(s)[STACK_LABEL];
		if (!stack) continue;
		bucket(stack).services += 1;
	}
	for (const n of networks) {
		if (n.stack && byStack.has(n.stack)) bucket(n.stack).networks += 1;
	}
	for (const v of volumes) {
		if (v.stack && byStack.has(v.stack)) bucket(v.stack).volumes += 1;
	}
	for (const c of configs) {
		if (c.stack && byStack.has(c.stack)) bucket(c.stack).configs += 1;
	}
	for (const sec of secrets) {
		if (sec.stack && byStack.has(sec.stack)) bucket(sec.stack).secrets += 1;
	}
	return [...byStack.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type ServiceUpdateOpts = { _query: Record<string, unknown>; _body: unknown };

/** Bump TaskTemplate.ForceUpdate so Swarm reschedules all tasks (a "redeploy" / rolling restart). */
export async function forceUpdateService(docker: Dockerode, id: string): Promise<void> {
	const svc = docker.getService(id);
	const inspected = (await svc.inspect()) as {
		Version?: { Index?: number };
		Spec?: { TaskTemplate?: { ForceUpdate?: number } };
	};
	const version = inspected.Version?.Index ?? 0;
	const spec = inspected.Spec ?? {};
	const taskTemplate = spec.TaskTemplate ?? {};
	const nextSpec = {
		...spec,
		TaskTemplate: { ...taskTemplate, ForceUpdate: (taskTemplate.ForceUpdate ?? 0) + 1 },
	};
	await svc.update({ _query: { version }, _body: nextSpec } as unknown as ServiceUpdateOpts);
}

/** Ask the engine to revert the service to its previous spec version. */
export async function rollbackServiceById(docker: Dockerode, id: string): Promise<void> {
	const svc = docker.getService(id);
	const inspected = (await svc.inspect()) as { Version?: { Index?: number }; Spec?: unknown };
	const version = inspected.Version?.Index ?? 0;
	await svc.update({
		_query: { version, rollback: "previous" },
		_body: inspected.Spec ?? {},
	} as unknown as ServiceUpdateOpts);
}

/** Set Mode.Replicated.Replicas to a new count (no-op for global-mode services). */
export async function scaleServiceById(docker: Dockerode, id: string, replicas: number): Promise<void> {
	const svc = docker.getService(id);
	const inspected = (await svc.inspect()) as {
		Version?: { Index?: number };
		Spec?: { Mode?: { Replicated?: { Replicas?: number } } };
	};
	const version = inspected.Version?.Index ?? 0;
	const spec = inspected.Spec ?? {};
	if (!spec.Mode?.Replicated) return;
	const nextSpec = { ...spec, Mode: { Replicated: { Replicas: replicas } } };
	await svc.update({ _query: { version }, _body: nextSpec } as unknown as ServiceUpdateOpts);
}

/** Resolve every real service ID that belongs to a stack (by namespace label). */
export async function serviceIdsForStack(docker: Dockerode, stackName: string): Promise<string[]> {
	const services = await docker.listServices();
	return services
		.filter((s) => labelsOf(s)[STACK_LABEL] === stackName)
		.map((s) => (s as unknown as ServiceLike).ID ?? "")
		.filter(Boolean);
}

/** Count running tasks per service ID, for computing real replicasRunning. */
export function countRunningTasksByService(tasks: unknown[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const t of tasks) {
		const tl = t as { ServiceID?: string; Status?: { State?: string } };
		if (tl.Status?.State !== "running") continue;
		const id = tl.ServiceID ?? "";
		if (!id) continue;
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}
