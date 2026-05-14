import { setTimeout as delay } from "timers/promises";
import { randomUUID } from "crypto";
import type nano from "nano";
import type { SwarmbotConfig } from "./config.js";
import * as couch from "./couch.js";
import {
  createSecret,
  db,
  recordMigration,
  migrationsDone,
  findDocs,
  updateDoc,
} from "./couch.js";
import { influxPing, createDatabase } from "./influx.js";

async function waitFor(
  name: string,
  maxSec: number,
  fn: () => Promise<boolean>
): Promise<void> {
  for (let i = 0; i < maxSec; i++) {
    try {
      if (await fn()) {
        console.log(`${name} connected after ${i}s`);
        return;
      }
    } catch {
      /* retry */
    }
    await delay(1000);
  }
  throw new Error(`${name} connection timeout`);
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
  _cfg: SwarmbotConfig,
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

  if (!(await couch.databaseExists(server))) {
    await couch.createDatabase(server);
    console.log("Swarmbot DB created");
  } else {
    console.log("Swarmbot DB already exists");
  }

  const d = db(server);
  let done = await migrationsDone(d);

  await runMigration(d, done, "initial", async () => {
    const sec = await couch.getSecret(d);
    if (!sec?.secret) {
      await createSecret(d, randomUUID());
      console.log("Default token secret created");
    }
  });
  done = await migrationsDone(d);

  await runMigration(d, done, "single-node-setup", async () => {
    await couch.snsUsers(server);
    await couch.snsReplicator(server);
    await couch.snsGlobalChanges(server);
    console.log("Single node setup finished");
  });
  done = await migrationsDone(d);

  await runMigration(d, done, "change-reg-types", async () => {
    const dockerusers = await findDocs(d, "dockeruser", {});
    for (const doc of dockerusers) {
      await updateDoc(d, doc, { type: "dockerhub" });
    }
    const registries = await findDocs(d, "registry", {});
    for (const doc of registries) {
      await updateDoc(d, doc, { type: "v2" });
    }
    console.log("Change reg types finished");
  });

  return d;
}

export async function initInflux(cfg: SwarmbotConfig): Promise<void> {
  if (!cfg.influxdbUrl) {
    console.log("InfluxDB not configured, stats disabled");
    return;
  }
  try {
    await waitFor("InfluxDB", 100, () => influxPing(cfg.influxdbUrl!));
    await createDatabase(cfg);
    console.log("InfluxDB database ready (minimal init)");
  } catch (e) {
    console.warn("InfluxDB init failed, stats disabled:", e);
  }
}
