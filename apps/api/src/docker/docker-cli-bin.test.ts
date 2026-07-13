import { describe, it, expect, afterEach } from "vitest";
import { dockerCliEnv, resolveDockerCliBin } from "./docker-cli-bin.js";
import type { SwarmBotConfig } from "../config.js";

describe("resolveDockerCliBin", () => {
	const prev = process.env.SWARMBOT_DOCKER_CLI;

	afterEach(() => {
		if (prev === undefined) delete process.env.SWARMBOT_DOCKER_CLI;
		else process.env.SWARMBOT_DOCKER_CLI = prev;
	});

	it("prefers SWARMBOT_DOCKER_CLI", () => {
		process.env.SWARMBOT_DOCKER_CLI = "/custom/docker";
		expect(resolveDockerCliBin()).toBe("/custom/docker");
	});
});

describe("dockerCliEnv", () => {
	it("sets DOCKER_HOST for tcp socket config", () => {
		const cfg = {
			dockerSock: "tcp://127.0.0.1:2375",
		} as SwarmBotConfig;
		const env = dockerCliEnv(cfg);
		expect(env.DOCKER_HOST).toBe("tcp://127.0.0.1:2375");
	});
});
