import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, setNegotiatedDockerApi } from "./config.js";

const KEYS = [
	"SWARMBOTY_PORT",
	"PORT",
	"SWARMBOTY_DOCKER_SOCK",
	"SWARMBOTY_DOCKER_API",
	"SWARMBOTY_DB",
	"SWARMBOTY_INFLUXDB",
	"SWARMBOTY_WORK_DIR",
	"SWARMBOTY_INSTANCE_NAME",
	"SWARMBOTY_API_TOKEN_EXPIRY_DAYS",
	"SWARMBOTY_MOCK",
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

	it("reads SWARMBOTY_* env vars", () => {
		process.env.SWARMBOTY_PORT = "9090";
		process.env.SWARMBOTY_DB = "http://couch:5984";
		process.env.SWARMBOTY_INSTANCE_NAME = "demo";
		process.env.SWARMBOTY_MOCK = "true";
		const cfg = loadConfig();
		expect(cfg.port).toBe(9090);
		expect(cfg.dbUrl).toBe("http://couch:5984");
		expect(cfg.instanceName).toBe("demo");
		expect(cfg.mock).toBe(true);
	});

	it("treats invalid SWARMBOTY_MOCK as default false", () => {
		process.env.SWARMBOTY_MOCK = "maybe";
		expect(loadConfig().mock).toBe(false);
	});
});
