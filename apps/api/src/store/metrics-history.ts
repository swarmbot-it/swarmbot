import type { Kysely } from "kysely";
import type { Database } from "../db.js";

type SnapshotCounts = { stacks: number; services: number; tasks: number };

function todayKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Upserts today's resource counts once per day so week-over-week deltas can
 * be computed later. Cheap no-op after the first call each day.
 */
export async function recordDailySnapshot(db: Kysely<Database>, counts: SnapshotCounts): Promise<void> {
	const day = todayKey();
	const existing = await db.selectFrom("metricsSnapshots").select("day").where("day", "=", day).executeTakeFirst();
	if (existing) return;
	await db
		.insertInto("metricsSnapshots")
		.values({ day, recordedAt: new Date().toISOString(), ...counts })
		.execute();
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
	db: Kysely<Database>,
	current: SnapshotCounts
): Promise<WeeklyDeltas> {
	const rows = await db.selectFrom("metricsSnapshots").selectAll().execute();
	const now = Date.now();
	const weekMs = 7 * 24 * 60 * 60 * 1000;
	const candidates = rows
		.map((row) => ({
			row,
			ageMs: now - new Date(row.recordedAt).getTime(),
		}))
		.filter((c) => c.ageMs >= 6 * 86_400_000 && c.ageMs <= 8 * 86_400_000)
		.sort((a, b) => Math.abs(a.ageMs - weekMs) - Math.abs(b.ageMs - weekMs));
	const baseline = candidates[0]?.row;
	if (!baseline) {
		return { stacksDelta: null, servicesDelta: null, tasksDelta: null };
	}
	return {
		stacksDelta: signedDelta(current.stacks - baseline.stacks),
		servicesDelta: signedDelta(current.services - baseline.services),
		tasksDelta: signedDelta(current.tasks - baseline.tasks),
	};
}
