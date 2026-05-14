import type { GraphQLContext } from "./context.js";
import { requireUser } from "./guards.js";
import { getSecret, userByUsername, updateDoc } from "../couch.js";
import { generateJwt } from "../auth/jwt.js";
import { verifyPassword, derivePassword, isLegacySha256 } from "../auth/password.js";
import { revokeJti } from "../auth/blacklist.js";
import { mapNodeSummary, mapServiceSummary } from "../docker/engine.js";
import { influxQuery } from "../influx.js";
import { pubsub, SWARM_TOPIC } from "./pubsub.js";
import type Dockerode from "dockerode";
import { randomUUID } from "crypto";

export const resolvers = {
  Query: {
    health: () => "ok",
    version: async (_: unknown, __: unknown, ctx: GraphQLContext) => ({
      name: "swarmbot",
      version: process.env.SWARMBOT_VERSION ?? "0.1.0",
      dockerApi: ctx.cfg.dockerApi,
      instanceName: ctx.cfg.instanceName ?? null,
      influxdb: Boolean(ctx.cfg.influxdbUrl),
    }),
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const u = await userByUsername(ctx.couchDb, ctx.user!.usr.username);
      if (!u) return null;
      return {
        username: String(u.username),
        email: u.email !== undefined ? String(u.email) : null,
        role: String(u.role ?? "user"),
      };
    },
    services: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const list = await ctx.docker.listServices();
      return list.map((s: Dockerode.Service) => mapServiceSummary(s));
    },
    service: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireUser(ctx);
      const list = await ctx.docker.listServices();
      const s = list.find((x: Dockerode.Service) => x.ID === id);
      if (!s) return null;
      return mapServiceSummary(s);
    },
    nodes: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const list = await ctx.docker.listNodes();
      return list.map((n: Dockerode.Node) => mapNodeSummary(n));
    },
    statsSeries: async (
      _: unknown,
      args: { measurement: string; field: string; tags?: string | null },
      ctx: GraphQLContext
    ) => {
      requireUser(ctx);
      if (!ctx.cfg.influxdbUrl) return null;
      const tagClause = args.tags ? ` WHERE ${args.tags}` : "";
      const q = `SELECT mean("${args.field}") FROM "${args.measurement}"${tagClause} GROUP BY time(1m) fill(null) ORDER BY time DESC LIMIT 120`;
      try {
        const data = await influxQuery(ctx.cfg, q);
        return JSON.stringify(data);
      } catch {
        return null;
      }
    },
  },
  Mutation: {
    login: async (
      _: unknown,
      { username, password }: { username: string; password: string },
      ctx: GraphQLContext
    ) => {
      const u = await userByUsername(ctx.couchDb, username);
      if (!u || typeof u.password !== "string") {
        throw new Error("Invalid credentials");
      }
      const ok = verifyPassword(password, u.password);
      if (!ok) {
        throw new Error("Invalid credentials");
      }
      if (isLegacySha256(password, u.password)) {
        await updateDoc(ctx.couchDb, u, { password: derivePassword(password) });
      }
      const secretDoc = await getSecret(ctx.couchDb);
      const secret = String(secretDoc?.secret ?? "");
      if (!secret) throw new Error("Server misconfigured");
      const token = generateJwt(secret, u);
      return { token };
    },
    logout: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) return true;
      if (ctx.user.iss === "swarmbot") {
        revokeJti(ctx.user.jti);
      }
      return true;
    },
    apiTokenGenerate: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const u = await userByUsername(ctx.couchDb, ctx.user!.usr.username);
      if (!u) {
        throw new Error("User not found");
      }
      const jti = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const exp =
        ctx.cfg.apiTokenExpiryDays && ctx.cfg.apiTokenExpiryDays > 0
          ? now + ctx.cfg.apiTokenExpiryDays * 86400
          : null;
      const secretDoc = await getSecret(ctx.couchDb);
      const secret = String(secretDoc?.secret ?? "");
      if (!secret) throw new Error("Server misconfigured");
      const token = generateJwt(secret, u, { iss: "swarmbot-api", jti, exp });
      const expiresAt = exp ? new Date(exp * 1000).toISOString() : null;
      await updateDoc(ctx.couchDb, u, {
        "api-token": { jti, mask: token.slice(-5), ...(expiresAt ? { expiresAt } : {}) },
      });
      return { token, expiresAt };
    },
    apiTokenRemove: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireUser(ctx);
      const u = await userByUsername(ctx.couchDb, ctx.user!.usr.username);
      if (u) {
        await updateDoc(ctx.couchDb, u, { "api-token": null });
      }
      return true;
    },
  },
  Subscription: {
    swarmEvent: {
      subscribe: () => pubsub.asyncIterator([SWARM_TOPIC]),
    },
  },
};
