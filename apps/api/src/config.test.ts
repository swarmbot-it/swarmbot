import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, setNegotiatedDockerApi } from "./config.js";

const KEYS = [
	"SW4RM_BOT_PORT",
	"PORT",
	"SW4RM_BOT_DOCKER_SOCK",
	"SW4RM_BOT_DOCKER_API",
	"SW4RM_BOT_DB",
	"SW4RM_BOT_INFLUXDB",
	"SW4RM_BOT_WORK_DIR",
	"SW4RM_BOT_INSTANCE_NAME",
	"SW4RM_BOT_API_TOKEN_EXPIRY_DAYS",
	"SW4RM_BOT_MOCK",
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
		expect(cfg.dbUrl).toBe("http://localhost:5984");
		expect(cfg.dockerSock).toBe("/var/run/docker.sock");
		expect(cfg.mock).toBe(false);
	});

	it("reads SW4RM_BOT_* env vars", () => {
		process.env.SW4RM_BOT_PORT = "9090";
		process.env.SW4RM_BOT_DB = "http://couch:5984";
		process.env.SW4RM_BOT_INSTANCE_NAME = "demo";
		process.env.SW4RM_BOT_MOCK = "true";
		const cfg = loadConfig();
		expect(cfg.port).toBe(9090);
		expect(cfg.dbUrl).toBe("http://couch:5984");
		expect(cfg.instanceName).toBe("demo");
		expect(cfg.mock).toBe(true);
	});

	it("treats invalid SW4RM_BOT_MOCK as default false", () => {
		process.env.SW4RM_BOT_MOCK = "maybe";
		expect(loadConfig().mock).toBe(false);
	});
});
