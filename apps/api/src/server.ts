import http from "http";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { execute, subscribe } from "graphql";
import type { Kysely } from "kysely";
import type { SwarmbotyConfig } from "./config.js";
import type { Database } from "./db.js";
import { getAppSecret } from "./db.js";
import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import { buildContext, localeFromHeader, type GraphQLContext } from "./graphql/context.js";
import { localizedMessage } from "./i18n/errors.js";
import type { AuthedRequest } from "./http/optional-jwt.js";
import { optionalJwtMiddleware } from "./http/optional-jwt.js";
import { findAuthUser, upgradePasswordHash } from "./store/users.js";
import { decodeBasic, generateJwt, verifyJwt } from "./auth/jwt.js";
import { allowAttempt } from "./auth/rate-limit.js";
import { verifyPassword, derivePassword, isSha256Digest } from "./auth/password.js";
import { revokeJti } from "./auth/blacklist.js";
import { createDocker, setupDockerApi } from "./docker/engine.js";
import { consumeSlt, createSlt } from "./auth/slt.js";
import { publishEvent, subscribeEvents } from "./events/hub.js";
import { startStatsWriter } from "./events/stats-writer.js";

export async function createHttpServer(
	cfg: SwarmbotyConfig,
	db: Kysely<Database>
): Promise<{
	httpServer: http.Server;
	apollo: ApolloServer<GraphQLContext>;
	cleanup: () => Promise<void>;
}> {
	const docker = createDocker(cfg);
	await setupDockerApi(cfg, docker);

	const app = express();
	const httpServer = http.createServer(app);

	const schema = makeExecutableSchema({ typeDefs, resolvers });

	const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });

	const serverCleanup = useServer(
		{
			schema,
			execute,
			subscribe,
			context: async (ctx) => {
				const auth = ctx.connectionParams?.authorization;
				const langHeader = ctx.connectionParams?.["accept-language"];
				const locale = localeFromHeader(
					typeof langHeader === "string" ? langHeader : undefined
				);
				const ip = ctx.extra.request.socket.remoteAddress ?? "unknown";
				const base: GraphQLContext = { cfg, db, docker, user: undefined, locale, ip };
				if (!auth || typeof auth !== "string") {
					return base;
				}
				try {
					const secret = await getAppSecret(db);
					const claims = verifyJwt(secret, auth);
					const u = await findAuthUser(db, claims.usr.username);
					if (u) {
						return { ...base, user: claims };
					}
				} catch {
					/* anonymous subscription */
				}
				return base;
			},
		},
		// ws @types version skew with graphql-ws
		wsServer as never
	);

	const apollo = new ApolloServer<GraphQLContext>({
		schema,
		plugins: [
			ApolloServerPluginDrainHttpServer({ httpServer }),
			{
				async serverWillStart() {
					return {
						async drainServer() {
							await serverCleanup.dispose();
						},
					};
				},
			},
		],
	});
	await apollo.start();

	// Reflecting any Origin with credentials:true (the old behavior) lets any
	// third-party page call this API using a victim's browser session. Restrict
	// to an explicit allowlist; SWARMBOTY_ALLOWED_ORIGINS overrides the dev defaults.
	const DEV_DEFAULT_ORIGINS = [
		"http://localhost:4200",
		"http://localhost:8080",
		"http://localhost:8081",
	];
	const allowedOrigins = cfg.allowedOrigins ?? DEV_DEFAULT_ORIGINS;
	app.use(
		cors({
			origin(origin, callback) {
				// No Origin header (curl, server-to-server, same-origin in some browsers) — allow.
				if (!origin || allowedOrigins.includes(origin)) {
					callback(null, true);
					return;
				}
				callback(new Error("Not allowed by CORS"));
			},
			credentials: true,
		})
	);
	app.use(optionalJwtMiddleware(db));

	app.get("/health", (_req, res) => {
		res.json({ status: "ok" });
	});

	app.get("/version", (_req, res) => {
		res.json({
			name: "swarmboty",
			version: process.env.SWARMBOTY_VERSION ?? "0.1.0",
			docker: { api: cfg.dockerApi },
			initialized: true,
			instanceName: cfg.instanceName ?? null,
		});
	});

	app.post("/login", async (req, res) => {
		const locale = localeFromHeader(req.headers["accept-language"]);
		try {
			const auth = req.headers.authorization;
			if (!auth) {
				res.status(400).json({ error: localizedMessage(locale, "errors.missingToken") });
				return;
			}
			const { username, password } = decodeBasic(auth);
			if (!allowAttempt(`${req.ip}:${username.toLowerCase()}`)) {
				res.status(429).json({ error: localizedMessage(locale, "errors.tooManyAttempts") });
				return;
			}
			const u = await findAuthUser(db, username);
			if (!u || typeof u.password !== "string") {
				res.status(401).json({
					error: localizedMessage(locale, "errors.invalidCredentials"),
				});
				return;
			}
			if (!verifyPassword(password, u.password)) {
				res.status(401).json({
					error: localizedMessage(locale, "errors.invalidCredentials"),
				});
				return;
			}
			if (isSha256Digest(password, u.password)) {
				await upgradePasswordHash(db, username, derivePassword(password));
			}
			const secret = await getAppSecret(db);
			const token = generateJwt(secret, u);
			res.json({ token });
		} catch {
			res.status(400).json({
				error: localizedMessage(locale, "errors.invalidAuthorization"),
			});
		}
	});

	app.post("/logout", async (req: AuthedRequest, res) => {
		const auth = req.headers.authorization;
		if (auth) {
			try {
				const secret = await getAppSecret(db);
				const claims = verifyJwt(secret, auth);
				if (claims.iss === "swarmboty") {
					await revokeJti(db, claims.jti);
				}
			} catch {
				/* ignore */
			}
		}
		res.json({});
	});

	app.get("/slt", async (req: AuthedRequest, res) => {
		const locale = localeFromHeader(req.headers["accept-language"]);
		if (!req.swarmUser) {
			res.status(401).json({ error: localizedMessage(locale, "errors.unauthenticated") });
			return;
		}
		const slt = await createSlt(db, req.swarmUser.usr.username);
		res.json({ slt });
	});

	app.get("/events", async (req, res) => {
		const locale = localeFromHeader(req.headers["accept-language"]);
		const slt = typeof req.query.slt === "string" ? req.query.slt : undefined;
		const user = await consumeSlt(db, slt);
		if (!user) {
			res.status(401).json({ error: localizedMessage(locale, "errors.invalidSlt") });
			return;
		}
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.write(":ok\n\n");
		const unsub = subscribeEvents((ev) => {
			res.write(`data: ${JSON.stringify(ev)}\n\n`);
		});
		req.on("close", () => {
			unsub();
		});
	});

	const writeStats = startStatsWriter(cfg);

	app.post("/events", bodyParser.json({ limit: "2mb" }), (req, res) => {
		const locale = localeFromHeader(req.headers["accept-language"]);
		if (cfg.agentSharedSecret && req.headers["x-agent-token"] !== cfg.agentSharedSecret) {
			res.status(401).json({ error: localizedMessage(locale, "errors.unauthenticated") });
			return;
		}
		if (!req.body) {
			res.status(400).json({ error: localizedMessage(locale, "errors.noDataSent") });
			return;
		}
		const event = req.body as Record<string, unknown>;
		publishEvent(event);
		writeStats(event);
		res.status(202).json({ accepted: true });
	});

	app.get("/api/services/:id/logs", async (req: AuthedRequest, res) => {
		const locale = localeFromHeader(req.headers["accept-language"]);
		if (!req.swarmUser) {
			res.status(401).json({ error: localizedMessage(locale, "errors.unauthenticated") });
			return;
		}
		const serviceId = req.params.id;
		try {
			const tasks = await docker.listTasks({
				filters: { service: [serviceId], "desired-state": ["running"] },
			});
			const task = tasks[0];
			const containerId = task?.Status?.ContainerStatus?.ContainerID;
			if (!containerId) {
				res.status(404).json({ error: localizedMessage(locale, "errors.noRunningTask") });
				return;
			}
			const c = docker.getContainer(containerId);
			const logStream = await c.logs({
				stdout: true,
				stderr: true,
				tail: 500,
				timestamps: true,
				follow: false,
			});
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.send(Buffer.from(logStream).toString("utf8"));
		} catch (e) {
			res.status(500).json({ error: String(e) });
		}
	});

	const staticDir = path.join(process.cwd(), "public");
	app.use(express.static(staticDir));

	app.use(
		"/graphql",
		bodyParser.json(),
		expressMiddleware(apollo, {
			context: async ({ req }: { req: AuthedRequest }): Promise<GraphQLContext> =>
				buildContext(req, cfg, db, docker),
		})
	);

	app.get("/*splat", (req, res, next) => {
		if (req.path.startsWith("/graphql")) {
			next();
			return;
		}
		res.sendFile(path.join(staticDir, "index.html"), (err) => {
			if (err) {
				res.status(404).send("Not found");
			}
		});
	});

	return {
		httpServer,
		apollo,
		cleanup: async () => {
			await apollo.stop();
		},
	};
}
