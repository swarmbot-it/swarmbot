import { loadConfig, resolvedDockerApi } from "./config.js";
import { createCouch } from "./couch.js";
import { initCouch, initInflux } from "./database.js";
import { createHttpServer } from "./server.js";
import { bootstrapAdminIfEmpty, initUsersFromConfig } from "./users/bootstrap.js";
import { seedDefaultRegistries } from "./store/registries.js";
import { seedDemoUsers } from "./store/users.js";

async function main(): Promise<void> {
	const cfg0 = loadConfig();
	console.log(
		`Starting sw4rm.bot (mock=${cfg0.mock}, db=${cfg0.dbUrl}, port=${cfg0.port})`
	);
	const couchServer = createCouch(cfg0);
	const couchDb = await initCouch(cfg0, couchServer);
	await initUsersFromConfig(couchDb);
	await bootstrapAdminIfEmpty(couchDb, { mock: cfg0.mock });
	await seedDefaultRegistries(couchDb);
	if (cfg0.mock) {
		await seedDemoUsers(couchDb);
	}
	await initInflux(cfg0);
	const cfg = { ...cfg0, dockerApi: resolvedDockerApi(cfg0.dockerApi) };
	const { httpServer, cleanup } = await createHttpServer(cfg, couchDb);
	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject);
		httpServer.listen(cfg.port, () => {
			httpServer.off("error", reject);
			console.log(`sw4rm.bot listening on http://0.0.0.0:${cfg.port}`);
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
	console.error(e);
	process.exit(1);
});
