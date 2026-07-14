import { setTimeout as delay } from "timers/promises";
import type { SwarmbotyConfig } from "./config.js";
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
