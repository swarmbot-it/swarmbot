import { describe, it, expect, afterEach } from "vitest";
import { dockerCliEnv, resolveDockerCliBin } from "./docker-cli-bin.js";
import type { Sw4rmBotConfig } from "../config.js";

describe("resolveDockerCliBin", () => {
	const prev = process.env.SW4RM_BOT_DOCKER_CLI;

	afterEach(() => {
		if (prev === undefined) delete process.env.SW4RM_BOT_DOCKER_CLI;
		else process.env.SW4RM_BOT_DOCKER_CLI = prev;
	});

	it("prefers SW4RM_BOT_DOCKER_CLI", () => {
		process.env.SW4RM_BOT_DOCKER_CLI = "/custom/docker";
		expect(resolveDockerCliBin()).toBe("/custom/docker");
	});
});

describe("dockerCliEnv", () => {
	it("sets DOCKER_HOST for tcp socket config", () => {
		const cfg = {
			dockerSock: "tcp://127.0.0.1:2375",
		} as Sw4rmBotConfig;
		const env = dockerCliEnv(cfg);
		expect(env.DOCKER_HOST).toBe("tcp://127.0.0.1:2375");
	});
});
