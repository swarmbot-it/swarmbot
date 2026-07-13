import type { Server } from "http";
import type { AddressInfo } from "net";
import { once } from "node:events";
import { createMockCouch } from "../couch.mock.js";
import { createSecret, insertDoc } from "../couch.js";
import { loadConfig, type Sw4rmBotConfig } from "../config.js";
import { derivePassword } from "../auth/password.js";
import { createHttpServer } from "../server.js";
import type { GraphQLContext } from "../graphql/context.js";
import { buildContext } from "../graphql/context.js";
import type { Orchestrator } from "../orchestrator/types.js";
import type nano from "nano";
import type { CouchDoc } from "../couch.js";

export type TestHttp = {
	httpServer: Server;
	baseUrl: string;
	cfg: Sw4rmBotConfig;
	couchDb: nano.DocumentScope<CouchDoc>;
	orchestrator: Orchestrator;
	cleanup: () => Promise<void>;
};

export async function startTestHttp(opts?: Partial<Sw4rmBotConfig>): Promise<TestHttp> {
	const { db } = createMockCouch();
	await createSecret(db, "test-secret");
	await insertDoc(db, {
		type: "user",
		username: "admin",
		password: derivePassword("swarmboty"),
		role: "admin",
		email: "admin@test.local",
	});

	const cfg: Sw4rmBotConfig = {
		...loadConfig(),
		mock: true,
		port: 0,
		influxdbUrl: undefined,
		...opts,
	};

	const { httpServer, cleanup, orchestrator } = await createHttpServer(cfg, db);
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
		couchDb: db,
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
	return buildContext(
		req as Parameters<typeof buildContext>[0],
		test.cfg,
		test.couchDb,
		test.orchestrator
	);
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
