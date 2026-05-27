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
	Description?: { Hostname?: string; Engine?: { EngineVersion?: string } };
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
	IPAM?: { Config?: Array<{ Subnet?: string; Gateway?: string }> };
};

type VolumeLike = {
	Name?: string;
	Driver?: string;
	Mountpoint?: string;
	UsageData?: { Size?: number };
};

type StampedLike = {
	ID?: string;
	CreatedAt?: string;
	UpdatedAt?: string;
	Spec?: { Name?: string };
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
	agentVersion: string | null;
	tags: string[];
	cpu: number | null;
	mem: number | null;
	disk: number | null;
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
};

export type VolumeSummary = {
	name: string;
	driver: string;
	size: string;
	mountpoint: string | null;
};

export type StampedSummary = {
	id: string;
	name: string;
	created: string;
	updated: string;
};

/** Format published ports as "host→container" strings used by the UI. */
export function formatPorts(spec: ServiceLike["Spec"]): string[] {
	const ports = spec?.EndpointSpec?.Ports ?? [];
	return ports.map((p) => {
		const target = p.TargetPort ?? 0;
		const published = p.PublishedPort ?? target;
		return `${published}→${target}`;
	});
}

export type ServiceReplicaCounts = { running: number; total: number };

/** Count Swarm tasks per service for running / total replica display. */
export function replicaCountsByService(tasks: unknown[]): Map<string, ServiceReplicaCounts> {
	const out = new Map<string, ServiceReplicaCounts>();
	for (const raw of tasks) {
		const tl = raw as TaskLike;
		const serviceId = tl.ServiceID ?? "";
		if (!serviceId) continue;
		const prev = out.get(serviceId) ?? { running: 0, total: 0 };
		prev.total += 1;
		if (tl.Status?.State?.toLowerCase() === "running") prev.running += 1;
		out.set(serviceId, prev);
	}
	return out;
}

export function mapServiceSummary(
	s: Dockerode.Service,
	taskCounts?: ServiceReplicaCounts
): ServiceSummary {
	const sl = s as unknown as ServiceLike;
	const id = sl.ID ?? "";
	const spec = sl.Spec;
	const name = spec?.Name ?? "";
	const image = spec?.TaskTemplate?.ContainerSpec?.Image ?? null;
	const stack = spec?.Labels?.["com.docker.stack.namespace"] ?? null;
	const isGlobal = Boolean(spec?.Mode?.Global);
	const desired = spec?.Mode?.Replicated?.Replicas ?? 0;
	const running = taskCounts?.running ?? 0;
	const replicasTotal = isGlobal
		? Math.max(taskCounts?.total ?? 0, running)
		: desired;
	return {
		id,
		name,
		image,
		replicasRunning: running,
		replicasTotal: replicasTotal,
		ports: formatPorts(spec),
		status: "RUNNING",
		stack,
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
		agentVersion: null,
		tags,
		cpu: null,
		mem: null,
		disk: null,
		cpuHistory: null,
		memHistory: null,
		diskHistory: null,
	};
}

/** Human-readable cluster label: configured instance name or Docker daemon hostname. */
export async function resolveClusterDisplayName(
	cfg: SwarmbotyConfig,
	docker: Dockerode
): Promise<string | null> {
	if (cfg.instanceName) return cfg.instanceName;
	try {
		const info = (await docker.info()) as { Name?: string };
		const name = info.Name?.trim();
		return name || null;
	} catch {
		return null;
	}
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
	};
}

export function mapStamped(s: unknown): StampedSummary {
	const sl = s as StampedLike;
	return {
		id: sl.ID ?? "",
		name: sl.Spec?.Name ?? "",
		created: sl.CreatedAt ?? new Date().toISOString(),
		updated: sl.UpdatedAt ?? sl.CreatedAt ?? new Date().toISOString(),
	};
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
	networks: NetworkSummary[]
): StackAgg[] {
	const byStack = new Map<string, StackAgg>();
	for (const s of services) {
		const sl = s as unknown as ServiceLike;
		const stack = sl.Spec?.Labels?.["com.docker.stack.namespace"];
		if (!stack) continue;
		const entry = byStack.get(stack) ?? {
			name: stack,
			services: 0,
			networks: 0,
			volumes: 0,
			configs: 0,
			secrets: 0,
			status: "RUNNING",
		};
		entry.services += 1;
		byStack.set(stack, entry);
	}
	for (const n of networks) {
		const prefix = n.name.split("_")[0];
		if (prefix && byStack.has(prefix)) {
			byStack.get(prefix)!.networks += 1;
		}
	}
	return [...byStack.values()].sort((a, b) => a.name.localeCompare(b.name));
}
