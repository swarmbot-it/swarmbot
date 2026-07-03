import { setTimeout as delay } from "timers/promises";
import { randomUUID } from "crypto";
import type nano from "nano";
import type { SwarmbotyConfig } from "./config.js";
import * as couch from "./couch.js";
import { createSecret, db, recordMigration, migrationsDone } from "./couch.js";
import { influxPing, createDatabase } from "./influx.js";
import { logger } from "./logger.js";

async function waitFor(name: string, maxSec: number, fn: () => Promise<boolean>): Promise<void> {
	for (let i = 0; i < maxSec; i++) {
		if (i === 0 || i % 10 === 0) {
			logger.info({ service: name, attempt: i, maxSec }, `Waiting for ${name}…`);
		}
		try {
			if (await fn()) {
				logger.info({ service: name, afterSec: i }, `${name} connected`);
				return;
			}
		} catch {
			/* retry */
		}
		await delay(1000);
	}
	throw new Error(`${name} connection timeout after ${maxSec}s`);
}

async function runMigration(
	d: nano.DocumentScope<couch.CouchDoc>,
	done: Set<string>,
	name: string,
	fn: () => Promise<void>
): Promise<void> {
	if (done.has(name)) return;
	await fn();
	await recordMigration(d, name, "ok");
	done.add(name);
}

export async function initCouch(
	_cfg: SwarmbotyConfig,
	server: nano.ServerScope
): Promise<nano.DocumentScope<couch.CouchDoc>> {
	await waitFor("CouchDB", 100, async () => {
		try {
			await couch.couchVersion(server);
			return true;
		} catch {
			return false;
		}
	});

	await couch.snsUsers(server);
	await couch.snsReplicator(server);
	await couch.snsGlobalChanges(server);

	if (!(await couch.databaseExists(server))) {
		await couch.createDatabase(server);
		logger.info("Swarmboty DB created");
	} else {
		logger.info("Swarmboty DB already exists");
	}

	const d = db(server);
	let done = await migrationsDone(d);

	await runMigration(d, done, "initial", async () => {
		const sec = await couch.getSecret(d);
		if (!sec?.secret) {
			await createSecret(d, randomUUID());
			logger.info("Default token secret created");
		}
	});
	done = await migrationsDone(d);

	await runMigration(d, done, "single-node-setup", async () => {
		logger.info("Single node setup finished");
	});
	done = await migrationsDone(d);

	// No-op: this used to rename "dockeruser"->"dockerhub" and "registry"->"v2",
	// but "registry" is the current live discriminator used by store/registries.ts
	// (listRegistries/createRegistry/etc. all query type:"registry"). If this ever
	// ran again against real data it would silently make every registry invisible.
	// Kept as a recorded no-op so the migration-done bookkeeping stays consistent
	// across already-migrated and fresh installs.
	await runMigration(d, done, "change-reg-types", async () => {
		logger.info("Change reg types finished (no-op)");
	});

	return d;
}

export async function initInflux(cfg: SwarmbotyConfig): Promise<void> {
	if (!cfg.influxdbUrl) {
		logger.info("InfluxDB not configured, stats disabled");
		return;
	}
	try {
		await waitFor("InfluxDB", 100, () => influxPing(cfg.influxdbUrl!));
		await createDatabase(cfg);
		logger.info("InfluxDB database ready (minimal init)");
	} catch (e) {
		logger.warn({ err: e }, "InfluxDB init failed, stats disabled");
	}
}
