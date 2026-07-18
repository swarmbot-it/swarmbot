import type { Kysely } from "kysely";
import { createDb, initDb, type Database } from "../db.js";

/**
 * Real Postgres, not SQLite — see db.ts's module doc for why. Defaults to the
 * local dev Postgres container's `swarmbot_test` database; override with
 * SWARMBOT_TEST_DB for CI or a different environment.
 */
const TEST_DB_URL =
	process.env.SWARMBOT_TEST_DB ?? "postgres://swarmbot:swarmbot@swarmbot-rc1-pg-1:5432/swarmbot_test";

let migrated = false;

/**
 * Returns a Kysely instance connected to the shared test database, with
 * every table truncated so each test starts from a clean slate. Test files
 * run serially (see vitest.config.ts `fileParallelism: false`) so this is
 * safe without per-test transactions.
 */
export async function createTestDb(): Promise<Kysely<Database>> {
	const cfg = { dbUrl: TEST_DB_URL, mock: false };
	const db = createDb(cfg);
	if (!migrated) {
		await initDb(cfg, db);
		migrated = true;
	}
	await db.deleteFrom("revokedJti").execute();
	await db.deleteFrom("slt").execute();
	await db.deleteFrom("metricsSnapshots").execute();
	await db.deleteFrom("registries").execute();
	await db.deleteFrom("users").execute();
	await db.deleteFrom("appSecrets").execute();
	await db
		.insertInto("appSecrets")
		.values({ id: crypto.randomUUID(), secret: "test-secret" })
		.execute();
	return db;
}
