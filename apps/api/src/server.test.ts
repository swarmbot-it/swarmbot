import { describe, it, expect, afterEach } from "vitest";
import { startTestHttp, gql } from "./test/http-setup.js";
import { generateJwt } from "./auth/jwt.js";
import { getAppSecret } from "./db.js";
import { createSlt } from "./auth/slt.js";

describe.sequential("HTTP server", () => {
	let test: Awaited<ReturnType<typeof startTestHttp>> | undefined;

	afterEach(async () => {
		await test?.cleanup();
		test = undefined;
	});

	it("GET /health", async () => {
		test = await startTestHttp();
		const res = await fetch(`${test.baseUrl}/health`);
		expect(res.ok).toBe(true);
		expect(await res.json()).toEqual({ status: "ok" });
	});

	it("GET /version", async () => {
		test = await startTestHttp();
		const res = await fetch(`${test.baseUrl}/version`);
		const body = (await res.json()) as { name: string; initialized: boolean };
		expect(body.name).toBe("swarmbot");
		expect(body.initialized).toBe(true);
	});

	it("POST /login with basic auth", async () => {
		test = await startTestHttp();
		const creds = Buffer.from("admin:swarmbot", "utf8").toString("base64");
		const res = await fetch(`${test.baseUrl}/login`, {
			method: "POST",
			headers: { authorization: `Basic ${creds}` },
		});
		expect(res.ok).toBe(true);
		const body = (await res.json()) as { token: string };
		expect(body.token.startsWith("Bearer ")).toBe(true);
	});

	it("POST /login rejects bad password", async () => {
		test = await startTestHttp();
		const creds = Buffer.from("admin:wrong", "utf8").toString("base64");
		const res = await fetch(`${test.baseUrl}/login`, {
			method: "POST",
			headers: { authorization: `Basic ${creds}`, "accept-language": "en" },
		});
		expect(res.status).toBe(401);
	});

	it("GET /slt requires auth", async () => {
		test = await startTestHttp();
		const res = await fetch(`${test.baseUrl}/slt`);
		expect(res.status).toBe(401);
	});

	it("GET /events streams with valid slt", async () => {
		test = await startTestHttp();
		const slt = await createSlt(test.db, "admin");
		const res = await fetch(`${test.baseUrl}/events?slt=${encodeURIComponent(slt)}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const reader = res.body!.getReader();
		const chunk = await reader.read();
		expect(new TextDecoder().decode(chunk.value)).toContain(":ok");
		await reader.cancel();
	});

	it("POST /events accepts payload", async () => {
		test = await startTestHttp();
		const res = await fetch(`${test.baseUrl}/events`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type: "test", ok: true }),
		});
		expect(res.status).toBe(202);
	});

	it("GraphQL login mutation", async () => {
		test = await startTestHttp();
		const data = await gql<{ login: { token: string } }>(
			test,
			`mutation($username: String!, $password: String!) {
        login(username: $username, password: $password) { token }
      }`,
			{ username: "admin", password: "swarmbot" }
		);
		expect(data.login.token).toMatch(/^Bearer /);
	});

	it("GraphQL overview requires auth", async () => {
		test = await startTestHttp();
		await expect(gql(test, `query { overview { nodes } }`)).rejects.toThrow(/unauthorized/i);
	});

	it("GraphQL overview with token", async () => {
		test = await startTestHttp();
		const secret = await getAppSecret(test.db);
		const token = generateJwt(secret, {
			username: "admin",
			role: "admin",
		});
		const data = await gql<{ overview: { nodes: number; services: number } }>(
			test,
			`query { overview { nodes services } }`,
			undefined,
			token
		);
		expect(data.overview.nodes).toBeGreaterThan(0);
		expect(data.overview.services).toBeGreaterThanOrEqual(0);
	});
});

describe.sequential("public config endpoints", () => {
	let test: Awaited<ReturnType<typeof startTestHttp>> | undefined;

	afterEach(async () => {
		await test?.cleanup();
		test = undefined;
	});

	it("GET /api/auth/config reports OIDC disabled when unconfigured", async () => {
		test = await startTestHttp();
		const res = await fetch(`${test.baseUrl}/api/auth/config`);
		expect(await res.json()).toEqual({
			oidc: false,
			autoLogin: false,
			providerLabel: null,
			demo: false,
		});
	});

	it("GET /api/auth/config auto-logs-in on a configured console host", async () => {
		test = await startTestHttp({
			oidcIssuer: "https://idp.example",
			oidcClientId: "swarmbot",
			oidcClientSecret: "s3cret",
			oidcRedirectUri: "https://swarmbot.example/api/auth/oidc/callback",
			// The test server listens on 127.0.0.1, so that is the request host —
			// mark it a console host to exercise autoLogin.
			consoleHosts: ["127.0.0.1"],
		});
		const res = await fetch(`${test.baseUrl}/api/auth/config`);
		expect(await res.json()).toEqual({
			oidc: true,
			autoLogin: true,
			providerLabel: null,
			demo: false,
		});
	});

	it("GET /api/auth/config reports the configured OIDC provider label", async () => {
		test = await startTestHttp({
			oidcIssuer: "https://idp.example",
			oidcClientId: "swarmbot",
			oidcClientSecret: "s3cret",
			oidcRedirectUri: "https://swarmbot.example/api/auth/oidc/callback",
			oidcProviderLabel: "Acme SSO",
		});
		const res = await fetch(`${test.baseUrl}/api/auth/config`);
		expect(await res.json()).toEqual({
			oidc: true,
			autoLogin: false,
			providerLabel: "Acme SSO",
			demo: false,
		});
	});

	it("sends demo visitors straight to the console instead of the landing page", async () => {
		test = await startTestHttp({ demo: true });
		const res = await fetch(`${test.baseUrl}/`, { redirect: "manual" });
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/");
	});

	it("serves the landing page at / when demo mode is off", async () => {
		test = await startTestHttp({ demo: false });
		const res = await fetch(`${test.baseUrl}/`, { redirect: "manual" });
		expect(res.status).not.toBe(302);
	});

	it("GET /api/auth/config advertises demo mode so the SPA can badge it", async () => {
		test = await startTestHttp({ demo: true });
		const res = await fetch(`${test.baseUrl}/api/auth/config`);
		expect(await res.json()).toEqual({
			oidc: false,
			autoLogin: false,
			providerLabel: null,
			demo: true,
		});
	});
});

describe.sequential("demo read-only mode", () => {
	let test: Awaited<ReturnType<typeof startTestHttp>> | undefined;

	/** The bootstrap admin, via the same mutation the console uses. */
	async function login(t: Awaited<ReturnType<typeof startTestHttp>>): Promise<string> {
		const data = await gql<{ login: { token: string } }>(
			t,
			`mutation($username: String!, $password: String!) {
        login(username: $username, password: $password) { token }
      }`,
			{ username: "admin", password: "swarmbot" }
		);
		return data.login.token;
	}

	afterEach(async () => {
		await test?.cleanup();
		test = undefined;
	});

	it("rejects mutations and leaves queries working", async () => {
		test = await startTestHttp({ demo: true });

		// login must still work, or nobody could reach the demo screens at all
		const token = await login(test);
		expect(token).toBeTruthy();

		// a read is unaffected
		const version = await gql<{ version: { name: string } }>(
			test,
			"{ version { name } }",
			undefined,
			token
		);
		expect(version.version.name).toBeTruthy();

		// a write is refused before any resolver runs
		const res = await fetch(`${test.baseUrl}/graphql`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: token },
			body: JSON.stringify({
				query: 'mutation { removeUser(id: "1") }',
			}),
		});
		// 403, not 500: the server is fine, the request is refused. Apollo defaults
		// plugin-thrown errors to 500, so this pins the explicit http status.
		expect(res.status).toBe(403);
		const body = (await res.json()) as {
			errors?: Array<{ message: string; extensions?: { code?: string } }>;
		};
		expect(body.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
		expect(body.errors?.[0]?.message).toMatch(/read-only demo/i);
	});

	it("allows every mutation when demo mode is off", async () => {
		test = await startTestHttp({ demo: false });
		const token = await login(test);
		const res = await fetch(`${test.baseUrl}/graphql`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: token },
			body: JSON.stringify({ query: 'mutation { removeUser(id: "nope") }' }),
		});
		const body = (await res.json()) as {
			errors?: Array<{ extensions?: { code?: string } }>;
		};
		// It may still fail for other reasons, but never with the demo guard.
		expect(body.errors?.[0]?.extensions?.code).not.toBe("FORBIDDEN");
	});
});
