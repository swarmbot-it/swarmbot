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
import type { SwarmbotConfig } from "./config.js";
import type { Database } from "./db.js";
import { getAppSecret } from "./db.js";
import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import { buildContext, localeFromHeader, type GraphQLContext } from "./graphql/context.js";
import { localizedMessage } from "./i18n/errors.js";
import type { AuthedRequest } from "./http/optional-jwt.js";
import { optionalJwtMiddleware } from "./http/optional-jwt.js";
import { findAuthUser, upgradePasswordHash, upsertOidcUser } from "./store/users.js";
import { decodeBasic, generateJwt, verifyJwt } from "./auth/jwt.js";
import { allowAttempt } from "./auth/rate-limit.js";
import { verifyPassword, derivePassword, isSha256Digest } from "./auth/password.js";
import { revokeJti } from "./auth/blacklist.js";
import { createDocker } from "./docker/engine.js";
import { createOrchestrator } from "./orchestrator/factory.js";
import { NoRunningTaskError, SwarmOrchestrator } from "./orchestrator/swarm/adapter.js";
import { logger } from "./logger.js";
import { consumeSlt, createSlt } from "./auth/slt.js";
import {
	oidcConfig,
	authorizationUrl,
	exchangeAndVerify,
	roleForGroups,
	saveFlow,
	consumeFlow,
	newVerifier,
	challenge,
	randomOpaque,
} from "./auth/oidc.js";
import { publishEvent, subscribeEvents } from "./events/hub.js";
import { startStatsWriter } from "./events/stats-writer.js";

export async function createHttpServer(
	cfg: SwarmbotConfig,
	db: Kysely<Database>
): Promise<{
	httpServer: http.Server;
	apollo: ApolloServer<GraphQLContext>;
	cleanup: () => Promise<void>;
}> {
	const { orchestrator, detection } = await createOrchestrator(cfg);
	logger.info({ orchestrator: orchestrator.kind, reason: detection.reason }, "Orchestrator selected");
	// Raw Dockerode handle for Swarm-only mutations; on Kubernetes it is never
	// used (every such mutation is guarded by an orchestrator-kind check).
	const docker =
		orchestrator instanceof SwarmOrchestrator ? orchestrator.docker : createDocker(cfg);

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
				const base: GraphQLContext = {
					cfg,
					db,
					orchestrator,
					docker,
					user: undefined,
					locale,
					ip,
				};
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
	// to an explicit allowlist; SWARMBOT_ALLOWED_ORIGINS overrides the dev defaults.
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
			name: "swarmbot",
			version: process.env.SWARMBOT_VERSION ?? "0.1.0",
			docker: { api: cfg.dockerApi },
			orchestrator: orchestrator.kind,
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
				if (claims.iss === "swarmbot") {
					await revokeJti(db, claims.jti);
				}
			} catch {
				/* ignore */
			}
		}
		res.json({});
	});

	// --- OIDC (Dex) login for the internal console -------------------------
	// The app is a confidential OIDC client: /login redirects to Dex, /callback
	// verifies the ID token, maps the identity to a user, and issues a native
	// session JWT (same as password login). Enabled only when SWARMBOT_OIDC_* is set.
	app.get("/api/auth/oidc/login", async (req, res) => {
		const oidc = oidcConfig(cfg);
		if (!oidc) {
			res.status(404).json({ error: "oidc_not_configured" });
			return;
		}
		const state = randomOpaque();
		const nonce = randomOpaque();
		const verifier = newVerifier();
		const redirectTo =
			typeof req.query.redirect === "string" && req.query.redirect.startsWith("/app")
				? req.query.redirect
				: "/app/dashboard";
		await saveFlow(db, { state, nonce, codeVerifier: verifier, redirectTo });
		const url = await authorizationUrl(oidc, { state, nonce, codeChallenge: challenge(verifier) });
		res.redirect(url);
	});

	app.get("/api/auth/oidc/callback", async (req, res) => {
		const oidc = oidcConfig(cfg);
		if (!oidc) {
			res.status(404).send("oidc_not_configured");
			return;
		}
		try {
			const code = typeof req.query.code === "string" ? req.query.code : undefined;
			const state = typeof req.query.state === "string" ? req.query.state : undefined;
			if (!code) throw new Error("missing code");
			const flow = await consumeFlow(db, state);
			if (!flow) throw new Error("invalid or expired state");
			const identity = await exchangeAndVerify(oidc, code, flow.codeVerifier, flow.nonce);
			const role = roleForGroups(oidc, identity.groups);
			const u = await upsertOidcUser(db, {
				sub: identity.sub,
				provider: "dex",
				username: identity.username,
				email: identity.email,
				name: identity.name,
				role,
			});
			const secret = await getAppSecret(db);
			const token = generateJwt(secret, { username: u.username, email: u.email, role: u.role });
			const raw = token.replace(/^Bearer\s+/i, "");
			const dest = flow.redirectTo ?? "/app/dashboard";
			// Hand the session token to the SPA via URL fragment (never sent to the server / logs).
			res.redirect(`/app/oidc#token=${encodeURIComponent(raw)}&to=${encodeURIComponent(dest)}`);
		} catch (e) {
			logger.warn({ err: String(e) }, "OIDC callback failed");
			res.redirect("/login?error=oidc");
		}
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
		const serviceId = String(req.params.id);
		try {
			const logs = await orchestrator.serviceLogs(serviceId, { tail: 500 });
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.send(logs);
		} catch (e) {
			if (e instanceof NoRunningTaskError || /no running pod/i.test(String(e))) {
				res.status(404).json({ error: localizedMessage(locale, "errors.noRunningTask") });
				return;
			}
			res.status(500).json({ error: String(e) });
		}
	});

	// staticDir/index.html and staticDir/docs.html are the marketing landing
	// page and docs, served at the domain root. The real dashboard (Angular
	// build output) lives under staticDir/app and is served at /app.
	// Public: lets the SPA login page decide whether to auto-redirect to OIDC.
	// autoLogin is true on console hosts with OIDC configured — the login page
	// then goes straight to the provider instead of showing the password form.
	app.get("/api/auth/config", (req, res) => {
		const oidc = Boolean(oidcConfig(cfg));
		const host = (req.headers.host ?? "").split(":")[0]!.toLowerCase();
		res.json({ oidc, autoLogin: oidc && cfg.consoleHosts.includes(host) });
	});

	// Public: the SPA fetches this before bootstrap to register the PrimeNG
	// (PrimeUI) license key, so the component library runs without the "invalid
	// license" banner. The key is client-visible by design — PrimeUI verifies
	// offline, so it ships in the browser bundle regardless.
	app.get("/api/ui-config", (_req, res) => {
		res.json({ primengLicense: cfg.primengLicense ?? "" });
	});

	// On the internal console host(s) (SWARMBOT_CONSOLE_HOSTS, e.g. swarmbot.infra),
	// "/" skips the marketing landing and goes straight to the Dex login. Public
	// hosts (swarmbot.it) fall through to the static landing below.
	app.get("/", (req, res, next) => {
		const host = (req.headers.host ?? "").split(":")[0]!.toLowerCase();
		if (oidcConfig(cfg) && cfg.consoleHosts.includes(host)) {
			res.redirect("/api/auth/oidc/login");
			return;
		}
		next();
	});

	const staticDir = path.join(process.cwd(), "public");
	app.use(express.static(staticDir));
	// The Angular build's own assets (fonts, i18n) are referenced by root-absolute
	// paths (e.g. /assets/i18n/en.json) baked into its compiled output, so alias
	// them at the domain root too rather than only under /app/assets.
	app.use("/assets", express.static(path.join(staticDir, "app", "assets")));

	app.get("/docs", (_req, res) => {
		res.sendFile(path.join(staticDir, "docs.html"), (err) => {
			if (err) {
				res.status(404).send("Not found");
			}
		});
	});

	app.use(
		"/graphql",
		bodyParser.json(),
		expressMiddleware(apollo, {
			context: async ({ req }: { req: AuthedRequest }): Promise<GraphQLContext> =>
				buildContext(req, cfg, db, orchestrator, docker),
		})
	);

	app.get("/app/*splat", (_req, res) => {
		res.sendFile(path.join(staticDir, "app", "index.html"), (err) => {
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
