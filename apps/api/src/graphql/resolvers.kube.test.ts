import { describe, it, expect } from "vitest";
import { resolvers } from "./resolvers.js";
import { startTestHttp, gqlContext, type TestHttp } from "../test/http-setup.js";
import { generateJwt, verifyJwt } from "../auth/jwt.js";
import { getSecret } from "../couch.js";
import type { GraphQLContext } from "./context.js";

async function kubeTest(): Promise<{ test: TestHttp; ctx: GraphQLContext }> {
	const test = await startTestHttp({ mockOrchestrator: "kubernetes" });
	const secretDoc = await getSecret(test.couchDb);
	const token = generateJwt(String(secretDoc?.secret), {
		type: "user",
		username: "admin",
		password: "x",
		role: "admin",
	});
	const claims = verifyJwt(String(secretDoc?.secret), token);
	return { test, ctx: gqlContext({ headers: {}, swarmUser: claims }, test) };
}

describe.sequential("resolvers in mock-kubernetes mode", () => {
	it("version exposes the kubernetes orchestrator", async () => {
		const { test, ctx } = await kubeTest();
		const v = await resolvers.Query.version(null, null, ctx);
		expect(v.orchestrator).toBe("kubernetes");
		await test.cleanup();
	});

	it("GET /version exposes the orchestrator", async () => {
		const { test } = await kubeTest();
		const res = await fetch(`${test.baseUrl}/version`);
		const body = (await res.json()) as { orchestrator?: string };
		expect(body.orchestrator).toBe("kubernetes");
		await test.cleanup();
	});

	it("overview counts kube resources and reports health", async () => {
		const { test, ctx } = await kubeTest();
		const o = await resolvers.Query.overview(null, null, ctx);
		expect(o.nodes).toBeGreaterThanOrEqual(4);
		expect(o.managers).toBeGreaterThanOrEqual(1);
		expect(o.services).toBeGreaterThan(0);
		expect(o.tasks).toBeGreaterThan(0);
		expect(o.stacks).toBeGreaterThan(0);
		expect(o.networks).toBe(0);
		expect(o.clusterStatus).toBe("healthy");
		await test.cleanup();
	});

	it("stacks lists namespaces", async () => {
		const { test, ctx } = await kubeTest();
		const stacks = await resolvers.Query.stacks(null, null, ctx);
		expect(stacks.map((s) => s.name)).toContain("frontend");
		await test.cleanup();
	});

	it("tasks carry pod names and node hostnames", async () => {
		const { test, ctx } = await kubeTest();
		const tasks = await resolvers.Query.tasks(null, null, ctx);
		expect(tasks.length).toBeGreaterThan(0);
		const postgres = tasks.find((t) => t.name === "postgres-0");
		expect(postgres).toBeDefined();
		expect(postgres!.stack).toBe("databases");
		expect(postgres!.node).toMatch(/^k3s-/);
		await test.cleanup();
	});

	it("createStack rejects compose YAML with NOT_SUPPORTED_IN_ORCHESTRATOR", async () => {
		const { test, ctx } = await kubeTest();
		await expect(
			resolvers.Mutation.createStack(
				null,
				{
					input: {
						name: "demo",
						composeYaml: "services:\n  web:\n    image: nginx\n",
					},
				},
				ctx
			)
		).rejects.toMatchObject({
			extensions: { code: "NOT_SUPPORTED_IN_ORCHESTRATOR" },
		});
		await test.cleanup();
	});

	it("createStack rejects garbage with INVALID_MANIFEST", async () => {
		const { test, ctx } = await kubeTest();
		await expect(
			resolvers.Mutation.createStack(
				null,
				{ input: { name: "demo", composeYaml: "not: a manifest" } },
				ctx
			)
		).rejects.toMatchObject({ extensions: { code: "INVALID_MANIFEST" } });
		await test.cleanup();
	});

	it("createStack accepts kubernetes manifests", async () => {
		const { test, ctx } = await kubeTest();
		const result = await resolvers.Mutation.createStack(
			null,
			{
				input: {
					name: "demo",
					composeYaml:
						"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n",
				},
			},
			ctx
		);
		expect(result.name).toBe("demo");
		expect(result.services).toBe(1);
		expect(result.configs).toBe(1);
		await test.cleanup();
	});

	it("service logs endpoint streams pod logs", async () => {
		const { test, ctx } = await kubeTest();
		const services = await resolvers.Query.services(null, null, ctx);
		const nginx = services.find((s) => s.name === "nginx")!;
		const logs = await test.orchestrator.serviceLogs(nginx.id);
		expect(logs).toContain("nginx");
		await test.cleanup();
	});
});
