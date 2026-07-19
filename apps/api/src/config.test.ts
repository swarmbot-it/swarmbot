import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, setNegotiatedDockerApi } from "./config.js";

const KEYS = [
	"SWARMBOT_PORT",
	"PORT",
	"SWARMBOT_DOCKER_SOCK",
	"SWARMBOT_DOCKER_API",
	"SWARMBOT_DB",
	"SWARMBOT_INFLUXDB",
	"SWARMBOT_WORK_DIR",
	"SWARMBOT_INSTANCE_NAME",
	"SWARMBOT_API_TOKEN_EXPIRY_DAYS",
	"SWARMBOT_MOCK",
	"SWARMBOT_ALLOWED_ORIGINS",
	"SWARMBOT_OIDC_ISSUER",
	"SWARMBOT_OIDC_CLIENT_ID",
	"SWARMBOT_OIDC_CLIENT_SECRET",
	"SWARMBOT_OIDC_REDIRECT_URI",
	"SWARMBOT_OIDC_SCOPES",
	"SWARMBOT_OIDC_ADMIN_GROUPS",
	"SWARMBOT_OIDC_EDITOR_GROUPS",
	"SWARMBOT_CONSOLE_HOSTS",
	"SWARMBOT_PRIMENG_LICENSE",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = {};
	for (const k of KEYS) {
		saved[k] = process.env[k];
		delete process.env[k];
	}
	setNegotiatedDockerApi("");
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k]!;
	}
});

describe("loadConfig", () => {
	it("returns sensible defaults", () => {
		const cfg = loadConfig();
		expect(cfg.port).toBe(8080);
		expect(cfg.dbUrl).toBe("postgres://localhost:5432/swarmbot");
		expect(cfg.dockerSock).toBe("/var/run/docker.sock");
		expect(cfg.mock).toBe(false);
	});

	it("reads SWARMBOT_* env vars", () => {
		process.env.SWARMBOT_PORT = "9090";
		process.env.SWARMBOT_DB = "postgres://db:5432/swarmbot";
		process.env.SWARMBOT_INSTANCE_NAME = "demo";
		process.env.SWARMBOT_MOCK = "true";
		const cfg = loadConfig();
		expect(cfg.port).toBe(9090);
		expect(cfg.dbUrl).toBe("postgres://db:5432/swarmbot");
		expect(cfg.instanceName).toBe("demo");
		expect(cfg.mock).toBe(true);
	});

	it("treats invalid SWARMBOT_MOCK as default false", () => {
		process.env.SWARMBOT_MOCK = "maybe";
		expect(loadConfig().mock).toBe(false);
	});

	it("parses OIDC settings, splitting comma-separated group lists", () => {
		process.env.SWARMBOT_OIDC_ISSUER = "https://dex.example";
		process.env.SWARMBOT_OIDC_CLIENT_ID = "swarmbot";
		process.env.SWARMBOT_OIDC_CLIENT_SECRET = "s3cret";
		process.env.SWARMBOT_OIDC_REDIRECT_URI = "https://swarmbot.example/api/auth/oidc/callback";
		process.env.SWARMBOT_OIDC_ADMIN_GROUPS = "org:admins, org:ops";
		process.env.SWARMBOT_OIDC_EDITOR_GROUPS = "org:devs";
		const cfg = loadConfig();
		expect(cfg.oidcIssuer).toBe("https://dex.example");
		expect(cfg.oidcClientId).toBe("swarmbot");
		expect(cfg.oidcClientSecret).toBe("s3cret");
		expect(cfg.oidcRedirectUri).toBe("https://swarmbot.example/api/auth/oidc/callback");
		expect(cfg.oidcAdminGroups).toEqual(["org:admins", "org:ops"]);
		expect(cfg.oidcEditorGroups).toEqual(["org:devs"]);
		// Default scope stays when SWARMBOT_OIDC_SCOPES is unset.
		expect(cfg.oidcScopes).toBe("openid profile email groups");
	});

	it("defaults OIDC/console/license to empty/undefined", () => {
		const cfg = loadConfig();
		expect(cfg.oidcIssuer).toBeUndefined();
		expect(cfg.oidcAdminGroups).toEqual([]);
		expect(cfg.consoleHosts).toEqual([]);
		expect(cfg.primengLicense).toBeUndefined();
		expect(cfg.allowedOrigins).toBeUndefined();
	});

	it("parses console hosts, allowed origins and the PrimeNG license", () => {
		process.env.SWARMBOT_CONSOLE_HOSTS = "swarmbot.infra, swarmbot.local";
		process.env.SWARMBOT_ALLOWED_ORIGINS = "https://swarmbot.infra,https://swarmbot.it";
		process.env.SWARMBOT_PRIMENG_LICENSE = "LIC-123";
		const cfg = loadConfig();
		expect(cfg.consoleHosts).toEqual(["swarmbot.infra", "swarmbot.local"]);
		expect(cfg.allowedOrigins).toEqual(["https://swarmbot.infra", "https://swarmbot.it"]);
		expect(cfg.primengLicense).toBe("LIC-123");
	});
});
