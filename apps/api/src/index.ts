import { loadConfig, resolvedDockerApi } from "./config.js";
import { createDb, initDb } from "./db.js";
import { initInflux } from "./database.js";
import { createHttpServer } from "./server.js";
import { bootstrapAdminIfEmpty, initUsersFromConfig } from "./users/bootstrap.js";
import { seedDefaultRegistries } from "./store/registries.js";
import { seedDemoUsers } from "./store/users.js";
import { logger } from "./logger.js";

/** Strips embedded userinfo (`user:pass@`) so connection strings are safe to log. */
function redactCredentials(url: string): string {
	try {
		const u = new URL(url);
		u.username = "";
		u.password = "";
		return u.toString();
	} catch {
		return url;
	}
}

async function main(): Promise<void> {
	const cfg0 = loadConfig();
	logger.info(
		{ mock: cfg0.mock, db: redactCredentials(cfg0.dbUrl), port: cfg0.port },
		"Starting Swarmboty"
	);
	const db = createDb(cfg0);
	await initDb(cfg0, db);
	await initUsersFromConfig(db);
	await bootstrapAdminIfEmpty(db, { mock: cfg0.mock });
	await seedDefaultRegistries(db);
	if (cfg0.mock) {
		await seedDemoUsers(db);
	}
	await initInflux(cfg0);
	const cfg = { ...cfg0, dockerApi: resolvedDockerApi(cfg0.dockerApi) };
	const { httpServer, cleanup } = await createHttpServer(cfg, db);
	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject);
		httpServer.listen(cfg.port, () => {
			httpServer.off("error", reject);
			logger.info({ port: cfg.port }, "Swarmboty listening");
			resolve();
		});
	});
	const shutdown = async () => {
		await cleanup();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((e) => {
	logger.error({ err: e }, "Swarmboty failed to start");
	process.exit(1);
});
