import type nano from "nano";
import { getDoc, insertDoc, findDocs, type CouchDoc } from "../couch.js";

type SnapshotCounts = { stacks: number; services: number; tasks: number };

type SnapshotDoc = CouchDoc &
	SnapshotCounts & {
		type: "metrics_snapshot";
		recordedAt: string;
	};

function todayKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Upserts today's resource counts once per day so week-over-week deltas can
 * be computed later. Cheap no-op after the first call each day.
 */
export async function recordDailySnapshot(
	d: nano.DocumentScope<CouchDoc>,
	counts: SnapshotCounts
): Promise<void> {
	const id = `metrics_snapshot:${todayKey()}`;
	const existing = await getDoc(d, id);
	if (existing) return;
	await insertDoc(d, {
		_id: id,
		type: "metrics_snapshot",
		recordedAt: new Date().toISOString(),
		...counts,
	});
}

function signedDelta(n: number): string | null {
	if (n === 0) return null;
	return n > 0 ? `+${n}` : `${n}`;
}

export type WeeklyDeltas = {
	stacksDelta: string | null;
	servicesDelta: string | null;
	tasksDelta: string | null;
};

/**
 * Compares current counts to the snapshot closest to 7 days old (accepting
 * a 6-8 day window). Returns null deltas until that much history exists —
 * no fabricated numbers for a freshly bootstrapped instance.
 */
export async function weekOverWeekDeltas(
	d: nano.DocumentScope<CouchDoc>,
	current: SnapshotCounts
): Promise<WeeklyDeltas> {
	const docs = (await findDocs(d, "metrics_snapshot", {})) as SnapshotDoc[];
	const now = Date.now();
	const weekMs = 7 * 24 * 60 * 60 * 1000;
	const candidates = docs
		.map((doc) => ({ doc, ageMs: now - new Date(doc.recordedAt).getTime() }))
		.filter((c) => c.ageMs >= 6 * 86_400_000 && c.ageMs <= 8 * 86_400_000)
		.sort((a, b) => Math.abs(a.ageMs - weekMs) - Math.abs(b.ageMs - weekMs));
	const baseline = candidates[0]?.doc;
	if (!baseline) {
		return { stacksDelta: null, servicesDelta: null, tasksDelta: null };
	}
	return {
		stacksDelta: signedDelta(current.stacks - baseline.stacks),
		servicesDelta: signedDelta(current.services - baseline.services),
		tasksDelta: signedDelta(current.tasks - baseline.tasks),
	};
}
