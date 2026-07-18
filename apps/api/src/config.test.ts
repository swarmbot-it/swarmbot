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
});
