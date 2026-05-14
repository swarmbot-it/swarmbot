import http from "http";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { execute, subscribe } from "graphql";
import type { SwarmbotConfig } from "./config.js";
import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import { buildContext, type GraphQLContext } from "./graphql/context.js";
import type { AuthedRequest } from "./http/optional-jwt.js";
import { optionalJwtMiddleware } from "./http/optional-jwt.js";
import { userByUsername, updateDoc, getSecret, type CouchDoc } from "./couch.js";
import { decodeBasic, generateJwt, verifyJwt } from "./auth/jwt.js";
import { verifyPassword, derivePassword, isLegacySha256 } from "./auth/password.js";
import { revokeJti } from "./auth/blacklist.js";
import { createDocker, setupDockerApi } from "./docker/engine.js";
import { consumeSlt, createSlt } from "./auth/slt.js";
import { publishEvent, subscribeEvents } from "./events/hub.js";
import type nano from "nano";

export async function createHttpServer(
  cfg: SwarmbotConfig,
  couchDb: nano.DocumentScope<CouchDoc>
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
        const base: GraphQLContext = { cfg, couchDb, docker, user: undefined };
        if (!auth || typeof auth !== "string") {
          return base;
        }
        try {
          const secretDoc = await getSecret(couchDb);
          const secret = String(secretDoc?.secret ?? "");
          const claims = verifyJwt(secret, auth);
          const u = await userByUsername(couchDb, claims.usr.username);
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

  app.use(cors({ origin: true, credentials: true }));
  app.use(optionalJwtMiddleware(couchDb));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/version", (_req, res) => {
    res.json({
      name: "swarmbot",
      version: process.env.SWARMBOT_VERSION ?? "0.1.0",
      docker: { api: cfg.dockerApi },
      initialized: true,
      instanceName: cfg.instanceName ?? null,
    });
  });

  app.post("/login", async (req, res) => {
    try {
      const auth = req.headers.authorization;
      if (!auth) {
        res.status(400).json({ error: "Missing token" });
        return;
      }
      const { username, password } = decodeBasic(auth);
      const u = await userByUsername(couchDb, username);
      if (!u || typeof u.password !== "string") {
        res.status(401).json({ error: "The username or password you entered is incorrect." });
        return;
      }
      if (!verifyPassword(password, u.password)) {
        res.status(401).json({ error: "The username or password you entered is incorrect." });
        return;
      }
      if (isLegacySha256(password, u.password)) {
        await updateDoc(couchDb, u, { password: derivePassword(password) });
      }
      const secretDoc = await getSecret(couchDb);
      const secret = String(secretDoc?.secret ?? "");
      const token = generateJwt(secret, u);
      res.json({ token });
    } catch {
      res.status(400).json({ error: "Invalid authorization" });
    }
  });

  app.post("/logout", async (req: AuthedRequest, res) => {
    const auth = req.headers.authorization;
    if (auth) {
      try {
        const secretDoc = await getSecret(couchDb);
        const secret = String(secretDoc?.secret ?? "");
        const claims = verifyJwt(secret, auth);
        if (claims.iss === "swarmbot") {
          revokeJti(claims.jti);
        }
      } catch {
        /* ignore */
      }
    }
    res.json({});
  });

  app.get("/slt", async (req: AuthedRequest, res) => {
    if (!req.swarmUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const slt = createSlt(req.swarmUser.usr.username);
    res.json({ slt });
  });

  app.get("/events", (req, res) => {
    const slt = typeof req.query.slt === "string" ? req.query.slt : undefined;
    const user = consumeSlt(slt);
    if (!user) {
      res.status(401).json({ error: "Invalid slt" });
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

  app.post("/events", bodyParser.json({ limit: "2mb" }), (req, res) => {
    if (!req.body) {
      res.status(400).json({ error: "No data sent" });
      return;
    }
    publishEvent(req.body as Record<string, unknown>);
    res.status(202).json({ accepted: true });
  });

  app.get("/api/services/:id/logs", async (req: AuthedRequest, res) => {
    if (!req.swarmUser) {
      res.status(401).json({ error: "Unauthorized" });
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
        res.status(404).json({ error: "No running task" });
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
        buildContext(req, cfg, couchDb, docker),
    })
  );

  app.get("*", (req, res, next) => {
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
