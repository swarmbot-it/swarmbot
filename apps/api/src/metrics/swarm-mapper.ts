import type Dockerode from "dockerode";
import { mapServiceSummary } from "../docker/engine.js";

export type ContainerMapping = {
	taskId: string;
	serviceId: string;
	serviceName: string;
	stack: string | null;
};

const REFRESH_MS = 45_000;

let byContainerId = new Map<string, ContainerMapping>();
let stackLabelByContainerId = new Map<string, string | null>();
let lastRefresh = 0;

/**
 * Best-effort stack name from a Swarm container name (`/{stack}_{svc}.{slot}.{id}`).
 * Prefer {@link resolveStackName} — this cannot split stack vs service when both
 * contain underscores.
 */
export function parseStackFromContainerName(name: string): string | null {
	const trimmed = name.replace(/^\//, "");
	const dot = trimmed.indexOf(".");
	if (dot <= 0) return null;
	return trimmed.slice(0, dot);
}

/** Stack namespace from container labels (cached per container id). */
export async function resolveStackName(
	docker: Dockerode,
	containerId: string,
	containerName: string
): Promise<string | null> {
	const map = await resolveContainerMapping(docker, containerId, containerName);
	if (map?.stack) return map.stack;

	if (stackLabelByContainerId.has(containerId)) {
		return stackLabelByContainerId.get(containerId) ?? null;
	}

	let fromLabel: string | null = null;
	try {
		const info = await docker.getContainer(containerId).inspect();
		const label = info.Config?.Labels?.["com.docker.stack.namespace"];
		if (typeof label === "string" && label.trim().length > 0) {
			fromLabel = label.trim();
		}
	} catch {
		/* container gone or inspect failed */
	}
	stackLabelByContainerId.set(containerId, fromLabel);
	if (fromLabel) return fromLabel;

	return parseStackFromContainerName(containerName);
}

export async function refreshContainerMappings(docker: Dockerode): Promise<void> {
	const [tasksRaw, services] = await Promise.all([
		docker.listTasks(),
		docker.listServices(),
	]);
	const svcById = new Map<string, ReturnType<typeof mapServiceSummary>>();
	for (const s of services) {
		const id = (s as { ID?: string }).ID ?? "";
		if (id) svcById.set(id, mapServiceSummary(s));
	}

	const next = new Map<string, ContainerMapping>();
	for (const t of tasksRaw) {
		const tl = t as {
			ID?: string;
			ServiceID?: string;
			Status?: { ContainerStatus?: { ContainerID?: string } };
		};
		const containerId = tl.Status?.ContainerStatus?.ContainerID;
		if (!containerId || !tl.ServiceID) continue;
		const svc = svcById.get(tl.ServiceID);
		next.set(containerId, {
			taskId: tl.ID ?? containerId,
			serviceId: tl.ServiceID,
			serviceName: svc?.name ?? "",
			stack: svc?.stack ?? null,
		});
	}
	byContainerId = next;
	lastRefresh = Date.now();
}

export async function resolveContainerMapping(
	docker: Dockerode,
	containerId: string,
	containerName = ""
): Promise<ContainerMapping | null> {
	if (Date.now() - lastRefresh > REFRESH_MS) {
		try {
			await refreshContainerMappings(docker);
		} catch {
			/* keep stale cache */
		}
	}
	const hit = byContainerId.get(containerId);
	if (hit) return hit;

	const stack = parseStackFromContainerName(containerName);
	if (!stack) return null;
	return {
		taskId: containerId,
		serviceId: "",
		serviceName: containerName.replace(/^\//, "").split(".")[1] ?? "",
		stack,
	};
}

/** Test-only reset. */
export function __clearMapperForTests(): void {
	byContainerId.clear();
	stackLabelByContainerId.clear();
	lastRefresh = 0;
}
