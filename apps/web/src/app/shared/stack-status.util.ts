export type TaskLike = { status: string; desiredState?: string | null };

/**
 * Docker keeps terminated tasks around as history, so status is judged only
 * from tasks Swarm still wants running (desiredState === RUNNING). Returns
 * one of the uppercase tokens sb-status already maps to a color + label.
 */
export function deriveStackStatus(tasks: TaskLike[]): string {
	const active = tasks.filter((t) => (t.desiredState ?? "RUNNING") === "RUNNING");
	if (active.length === 0) return "STOPPED";
	if (active.some((t) => ["FAILED", "REJECTED"].includes(t.status))) return "FAILED";
	if (active.some((t) => ["PENDING", "ASSIGNED", "PREPARING", "STARTING", "NEW", "READY"].includes(t.status)))
		return "UPDATING";
	if (active.every((t) => t.status === "RUNNING")) return "RUNNING";
	return "STOPPED";
}
