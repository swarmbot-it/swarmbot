/**
 * Docker Swarm adapter: wraps the existing Dockerode-based engine code
 * behind the Orchestrator interface. Pure refactor — behaviour matches the
 * previous direct Dockerode usage in the resolvers 1:1.
 */
import type Dockerode from "dockerode";
import type { SwarmbotyConfig } from "../../config.js";
import {
	aggregateStacks,
	countRunningTasksByService,
	createDocker,
	mapConfigSummary,
	mapNetworkSummary,
	mapNodeSummary,
	mapServiceDetail,
	mapServiceSummary,
	mapStamped,
	mapTaskSummary,
	mapVolumeSummary,
	setupDockerApi,
	type ConfigSummary,
	type NetworkSummary,
	type NodeSummary,
	type ServiceDetail,
	type ServiceSummary,
	type StackAgg,
	type StampedSummary,
	type TaskSummary,
	type VolumeSummary,
} from "../../docker/engine.js";
import { stackDeploy } from "../../docker/cli.js";
import { evaluateClusterHealth, type ClusterHealth } from "../../cluster-health.js";
import type { Orchestrator, OrchestratorCapabilities } from "../types.js";

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

	/** Exposed for Swarm-specific consumers (mutations, mock helpers). */
	readonly docker: Dockerode;

	constructor(
		private readonly cfg: SwarmbotyConfig,
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
		const [list, tasks] = await Promise.all([this.docker.listServices(), this.docker.listTasks()]);
		const running = countRunningTasksByService(tasks);
		return list.map((s) => {
			const summary = mapServiceSummary(s);
			return { ...summary, replicasRunning: running.get(summary.id) ?? 0 };
		});
	}

	async getService(id: string): Promise<ServiceDetail | null> {
		let inspected: unknown;
		try {
			inspected = await this.docker.getService(id).inspect();
		} catch {
			return null;
		}
		const tasks = await this.docker.listTasks();
		const running = countRunningTasksByService(tasks);
		const detail = mapServiceDetail(inspected);
		return { ...detail, replicasRunning: running.get(detail.id) ?? 0 };
	}

	async listTasks(): Promise<TaskSummary[]> {
		const tasks = await this.docker.listTasks();
		return tasks.map(mapTaskSummary);
	}

	async listStacks(): Promise<StackAgg[]> {
		const [services, networks, volRes, secrets, configs] = await Promise.all([
			this.docker.listServices(),
			this.docker.listNetworks(),
			this.docker.listVolumes(),
			this.swarmDocker.listSecrets(),
			this.swarmDocker.listConfigs(),
		]);
		const volumes = ((volRes as { Volumes?: unknown[] }).Volumes ?? []).map(mapVolumeSummary);
		return aggregateStacks(
			services,
			networks.map(mapNetworkSummary),
			volumes,
			configs.map(mapStamped),
			secrets.map(mapStamped)
		);
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

	async listConfigs(): Promise<ConfigSummary[]> {
		const list = await this.swarmDocker.listConfigs();
		return list.map(mapConfigSummary);
	}

	async clusterHealth(): Promise<ClusterHealth> {
		const nodes = await this.docker.listNodes();
		return evaluateClusterHealth(nodes as unknown as Parameters<typeof evaluateClusterHealth>[0]);
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
