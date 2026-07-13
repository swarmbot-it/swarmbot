/**
 * Docker Swarm adapter: wraps the existing Dockerode-based engine code
 * behind the Orchestrator interface. Pure refactor — behaviour matches the
 * previous direct Dockerode usage in the resolvers 1:1.
 */
import type Dockerode from "dockerode";
import type { SwarmBotConfig } from "../../config.js";
import {
	aggregateStacks,
	createDocker,
	mapNetworkSummary,
	mapNodeSummary,
	mapServiceDetail,
	mapServiceSummary,
	mapStamped,
	mapTaskSummary,
	mapVolumeSummary,
	replicaCountsByService,
	resolveClusterDisplayName,
	setupDockerApi,
} from "../../docker/engine.js";
import { stackDeploy } from "../../docker/cli.js";
import { evaluateClusterHealth, type ClusterHealth } from "../../cluster-health.js";
import type {
	NetworkSummary,
	NodeSummary,
	Orchestrator,
	OrchestratorCapabilities,
	ServiceDetail,
	ServiceSummary,
	StackAgg,
	StampedSummary,
	TaskSummary,
	VolumeSummary,
} from "../types.js";

type SwarmDocker = Dockerode & {
	listSecrets(): Promise<unknown[]>;
	listConfigs(): Promise<unknown[]>;
};

export class SwarmOrchestrator implements Orchestrator {
	readonly kind = "swarm" as const;
	readonly capabilities: OrchestratorCapabilities = {
		composeDeploy: true,
		manifestApply: false,
		networks: true,
	};

	/** Exposed for Swarm-specific consumers (metrics mapper, mock helpers). */
	readonly docker: Dockerode;

	constructor(
		private readonly cfg: SwarmBotConfig,
		docker?: Dockerode
	) {
		this.docker = docker ?? createDocker(cfg);
	}

	async init(): Promise<void> {
		await setupDockerApi(this.cfg, this.docker);
	}

	private get swarmDocker(): SwarmDocker {
		return this.docker as SwarmDocker;
	}

	async listNodes(): Promise<NodeSummary[]> {
		const list = await this.docker.listNodes();
		return list.map((n) => mapNodeSummary(n));
	}

	async listServices(): Promise<ServiceSummary[]> {
		const [list, tasks] = await Promise.all([
			this.docker.listServices(),
			this.docker.listTasks(),
		]);
		const counts = replicaCountsByService(tasks);
		return list.map((s) => {
			const sid = (s as unknown as { ID?: string }).ID ?? "";
			return mapServiceSummary(s, counts.get(sid));
		});
	}

	async getService(id: string): Promise<ServiceDetail | null> {
		const [list, tasks] = await Promise.all([
			this.docker.listServices(),
			this.docker.listTasks(),
		]);
		const s = list.find((x) => (x as unknown as { ID?: string }).ID === id);
		if (!s) return null;
		return mapServiceDetail(s, replicaCountsByService(tasks).get(id));
	}

	async listTasks(): Promise<TaskSummary[]> {
		const tasks = await this.docker.listTasks();
		return tasks.map(mapTaskSummary);
	}

	async listStacks(): Promise<StackAgg[]> {
		const [services, networks] = await Promise.all([
			this.docker.listServices(),
			this.docker.listNetworks(),
		]);
		return aggregateStacks(services, networks.map(mapNetworkSummary));
	}

	async listNetworks(): Promise<NetworkSummary[]> {
		const list = await this.docker.listNetworks();
		return list.map(mapNetworkSummary);
	}

	async listVolumes(): Promise<VolumeSummary[]> {
		const res = (await this.docker.listVolumes()) as unknown as { Volumes?: unknown[] };
		return (res.Volumes ?? []).map(mapVolumeSummary);
	}

	async listSecrets(): Promise<StampedSummary[]> {
		const list = await this.swarmDocker.listSecrets();
		return list.map(mapStamped);
	}

	async listConfigs(): Promise<StampedSummary[]> {
		const list = await this.swarmDocker.listConfigs();
		return list.map(mapStamped);
	}

	async clusterHealth(): Promise<ClusterHealth> {
		const nodes = await this.docker.listNodes();
		return evaluateClusterHealth(nodes);
	}

	async clusterDisplayName(): Promise<string | null> {
		return resolveClusterDisplayName(this.cfg, this.docker);
	}

	async serviceLogs(serviceId: string, opts?: { tail?: number }): Promise<string> {
		const tasks = await this.docker.listTasks({
			filters: { service: [serviceId], "desired-state": ["running"] },
		});
		const task = tasks[0] as
			| { Status?: { ContainerStatus?: { ContainerID?: string } } }
			| undefined;
		const containerId = task?.Status?.ContainerStatus?.ContainerID;
		if (!containerId) {
			throw new NoRunningTaskError(serviceId);
		}
		const c = this.docker.getContainer(containerId);
		const logStream = await c.logs({
			stdout: true,
			stderr: true,
			tail: opts?.tail ?? 500,
			timestamps: true,
			follow: false,
		});
		return Buffer.from(logStream).toString("utf8");
	}

	async deployStack(name: string, composeYaml: string): Promise<void> {
		await stackDeploy(this.cfg, name, composeYaml);
	}
}

export class NoRunningTaskError extends Error {
	constructor(serviceId: string) {
		super(`no running task for service ${serviceId}`);
		this.name = "NoRunningTaskError";
	}
}
