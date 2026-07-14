import { describe, it, expect } from "vitest";
import { resolvers } from "./resolvers.js";
import { startTestHttp, gqlContext } from "../test/http-setup.js";
import { generateJwt } from "../auth/jwt.js";
import { getAppSecret } from "../db.js";

describe.sequential("resolvers.Query", () => {
	it("health returns ok", () => {
		expect(resolvers.Query.health()).toBe("ok");
	});

	it("version reflects config", async () => {
		const test = await startTestHttp({ instanceName: "test-cluster" });
		const ctx = gqlContext({ headers: {} }, test);
		const v = await resolvers.Query.version(null, null, ctx);
		expect(v.instanceName).toBe("test-cluster");
		await test.cleanup();
	});

	it("me returns profile for authenticated user", async () => {
		const test = await startTestHttp();
		const secret = await getAppSecret(test.db);
		const token = generateJwt(secret, {
			username: "admin",
			role: "admin",
			email: "admin@test.local",
		});
		const { verifyJwt } = await import("../auth/jwt.js");
		const claims = verifyJwt(secret, token);
		const ctx = gqlContext({ headers: {}, swarmUser: claims }, test);
		const me = await resolvers.Query.me(null, null, ctx);
		expect(me?.username).toBe("admin");
		await test.cleanup();
	});

	it("metricsSeries returns mock data without influx", async () => {
		const test = await startTestHttp();
		const secret = await getAppSecret(test.db);
		const token = generateJwt(secret, { username: "admin", role: "admin" });
		const { verifyJwt } = await import("../auth/jwt.js");
		const claims = verifyJwt(secret, token);
		const ctx = gqlContext({ headers: {}, swarmUser: claims }, test);
		const series = await resolvers.Query.metricsSeries(
			null,
			{ input: { range: "1h", resolution: "medium" } },
			ctx
		);
		expect(series.labels.length).toBeGreaterThan(0);
		expect(series.cpu.length).toBe(series.labels.length);
		await test.cleanup();
	});
});

describe.sequential("resolvers.Mutation", () => {
	it("createService returns pending service", async () => {
		const test = await startTestHttp();
		const secret = await getAppSecret(test.db);
		const token = generateJwt(secret, { username: "admin", role: "admin" });
		const { verifyJwt } = await import("../auth/jwt.js");
		const claims = verifyJwt(secret, token);
		const ctx = gqlContext({ headers: {}, swarmUser: claims }, test);
		const svc = await resolvers.Mutation.createService(
			null,
			{
				input: {
					name: "web",
					image: "nginx:latest",
					registry: "dockerhub",
					replicas: 2,
				},
			},
			ctx
		);
		expect(svc.name).toBe("web");
		expect(svc.replicasTotal).toBe(2);
		await test.cleanup();
	});
});
