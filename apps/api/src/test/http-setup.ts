import type { Server } from "http";
import type { AddressInfo } from "net";
import { once } from "node:events";
import { randomUUID } from "crypto";
import type { Kysely } from "kysely";
import { createTestDb } from "./db-setup.js";
import type { Database } from "../db.js";
import { loadConfig, type SwarmbotConfig } from "../config.js";
import { derivePassword } from "../auth/password.js";
import { createHttpServer } from "../server.js";
import { createDocker } from "../docker/engine.js";
import { SwarmOrchestrator } from "../orchestrator/swarm/adapter.js";
import type { Orchestrator } from "../orchestrator/types.js";
import type { GraphQLContext } from "../graphql/context.js";
import { buildContext } from "../graphql/context.js";
import type Dockerode from "dockerode";

export type TestHttp = {
	httpServer: Server;
	baseUrl: string;
	cfg: SwarmbotConfig;
	db: Kysely<Database>;
	docker: Dockerode;
	orchestrator: Orchestrator;
	cleanup: () => Promise<void>;
};

export async function startTestHttp(opts?: Partial<SwarmbotConfig>): Promise<TestHttp> {
	const db = await createTestDb();
	await db
		.insertInto("users")
		.values({
			id: randomUUID(),
			username: "admin",
			password: derivePassword("swarmbot"),
			role: "admin",
			email: "admin@test.local",
			createdAt: new Date().toISOString(),
		})
		.execute();

	const cfg: SwarmbotConfig = {
		...loadConfig(),
		mock: true,
		port: 0,
		influxdbUrl: undefined,
		...opts,
	};

	const docker = createDocker(cfg);
	const orchestrator = new SwarmOrchestrator(cfg, docker);
	const { httpServer, cleanup } = await createHttpServer(cfg, db);
	httpServer.listen(0, "127.0.0.1");
	await once(httpServer, "listening");
	const addr = httpServer.address() as AddressInfo | null;
	if (!addr || typeof addr === "string") {
		throw new Error("test HTTP server failed to bind");
	}
	const baseUrl = `http://127.0.0.1:${addr.port}`;

	return {
		httpServer,
		baseUrl,
		cfg,
		db,
		docker,
		orchestrator,
		cleanup: async () => {
			await cleanup();
			if (httpServer.listening) {
				await new Promise<void>((resolve, reject) => {
					httpServer.close((err) => (err ? reject(err) : resolve()));
				});
			}
		},
	};
}

export function gqlContext(
	req: { headers: Record<string, string | undefined>; swarmUser?: GraphQLContext["user"] },
	test: TestHttp
): GraphQLContext {
	return buildContext(req as Parameters<typeof buildContext>[0], test.cfg, test.db, test.orchestrator, test.docker);
}

export async function gql<T>(
	test: TestHttp,
	query: string,
	variables?: Record<string, unknown>,
	token?: string
): Promise<T> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers.authorization = token;
	const res = await fetch(`${test.baseUrl}/graphql`, {
		method: "POST",
		headers,
		body: JSON.stringify({ query, variables }),
	});
	const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
	if (body.errors?.length) {
		throw new Error(body.errors.map((e) => e.message).join("; "));
	}
	return body.data as T;
}
