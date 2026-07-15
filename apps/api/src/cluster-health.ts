export type ClusterStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type ClusterHealth = {
	status: ClusterStatus;
	managersReady: number;
	managersTotal: number;
};

type SwarmNode = {
	Spec?: { Role?: string; Availability?: string };
	Status?: { State?: string };
	ManagerStatus?: { Reachability?: string };
};

/** Swarm Raft quorum: floor(n/2) + 1 managers must be ready and reachable. */
export function quorumSize(managerCount: number): number {
	if (managerCount <= 0) return 0;
	return Math.floor(managerCount / 2) + 1;
}

function isManagerReady(node: SwarmNode): boolean {
	if (node.Spec?.Role !== "manager") return false;
	if (node.Spec?.Availability === "drain") return false;
	if (node.Status?.State !== "ready") return false;
	const reach = node.ManagerStatus?.Reachability;
	if (reach && reach !== "reachable") return false;
	return true;
}

function isNodeReady(node: SwarmNode): boolean {
	if (node.Spec?.Availability === "drain") return false;
	return node.Status?.State === "ready";
}

/**
 * Derives sidebar cluster status from Docker Swarm node list.
 */
export function evaluateClusterHealth(nodes: SwarmNode[]): ClusterHealth {
	const managers = nodes.filter((n) => n.Spec?.Role === "manager");
	const managersTotal = managers.length;
	const managersReady = managers.filter(isManagerReady).length;
	const needed = quorumSize(managersTotal);

	if (managersTotal === 0) {
		return { status: "unknown", managersReady: 0, managersTotal: 0 };
	}

	if (managersReady < needed) {
		return { status: "unhealthy", managersReady, managersTotal };
	}

	const allReady = nodes.length > 0 && nodes.every(isNodeReady);
	if (allReady) {
		return { status: "healthy", managersReady, managersTotal };
	}

	return { status: "degraded", managersReady, managersTotal };
}
