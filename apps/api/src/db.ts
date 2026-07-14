import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { CamelCasePlugin, Kysely, PostgresDialect, SqliteDialect, sql } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { Pool } from "pg";
import SqliteDatabase from "better-sqlite3";
import type { SwarmbotyConfig } from "./config.js";
import type { Database } from "./db/schema.js";
import { SqliteBooleanPlugin } from "./db/sqlite-boolean-plugin.js";
import { logger } from "./logger.js";

export type { Database } from "./db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationFolder = path.join(__dirname, "db", "migrations");

/**
 * Real Postgres in production; an in-memory SQLite database when
 * `SWARMBOTY_MOCK=true` so the app's documented "no Postgres/Docker required"
 * demo mode keeps working with zero external infrastructure. Not used for
 * the test suite — tests run against real Postgres (see test/db-setup.ts) so
 * SQLite/Postgres type-affinity differences never mask a real bug.
 */
export function createDb(cfg: Pick<SwarmbotyConfig, "dbUrl" | "mock">): Kysely<Database> {
	const dialect = cfg.mock
		? new SqliteDialect({ database: new SqliteDatabase(":memory:") })
		: new PostgresDialect({ pool: new Pool({ connectionString: cfg.dbUrl }) });
	const plugins = cfg.mock ? [new CamelCasePlugin(), new SqliteBooleanPlugin()] : [new CamelCasePlugin()];
	return new Kysely<Database>({ dialect, plugins });
}

async function waitForDb(db: Kysely<Database>, maxSec: number): Promise<void> {
	for (let i = 0; i < maxSec; i++) {
		if (i === 0 || i % 10 === 0) {
			logger.info({ service: "Postgres", attempt: i, maxSec }, "Waiting for Postgres…");
		}
		try {
			await sql`select 1`.execute(db);
			logger.info({ service: "Postgres", afterSec: i }, "Postgres connected");
			return;
		} catch {
			/* retry */
		}
		await delay(1000);
	}
	throw new Error(`Postgres connection timeout after ${maxSec}s`);
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider({
			fs: fsPromises,
			path,
			migrationFolder,
		}),
	});
	const { error, results } = await migrator.migrateToLatest();
	for (const r of results ?? []) {
		if (r.status === "Success") {
			logger.info({ migration: r.migrationName }, "Migration applied");
		} else if (r.status === "Error") {
			logger.error({ migration: r.migrationName }, "Migration failed");
		}
	}
	if (error) throw error;
}

/** Ensures exactly one row exists in `app_secrets`, seeding it on first boot. Replaces the old CouchDB "initial" migration. */
async function ensureAppSecret(db: Kysely<Database>): Promise<void> {
	const existing = await db.selectFrom("appSecrets").select("id").executeTakeFirst();
	if (existing) return;
	await db
		.insertInto("appSecrets")
		.values({ id: crypto.randomUUID(), secret: crypto.randomUUID() })
		.execute();
	logger.info("Default token secret created");
}

/** Waits for Postgres, runs pending migrations, and seeds the JWT secret. SQLite (mock mode) skips the wait. */
export async function initDb(
	cfg: Pick<SwarmbotyConfig, "dbUrl" | "mock">,
	db: Kysely<Database>
): Promise<void> {
	if (!cfg.mock) {
		await waitForDb(db, 100);
	}
	await runMigrations(db);
	await ensureAppSecret(db);
}

/** Returns the JWT signing key (also the source key for registry-password encryption). Throws if not yet seeded. */
export async function getAppSecret(db: Kysely<Database>): Promise<string> {
	const row = await db.selectFrom("appSecrets").select("secret").executeTakeFirst();
	if (!row) throw new Error("no app secret found — initDb() must run before serving requests");
	return row.secret;
}
