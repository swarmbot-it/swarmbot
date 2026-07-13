import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SwarmBotConfig } from "../config.js";

/** Resolve the Docker CLI executable (PATH, env, or common install locations). */
export function resolveDockerCliBin(): string {
	const fromEnv = process.env.SWARMBOT_DOCKER_CLI?.trim();
	if (fromEnv) return fromEnv;

	if (process.platform === "win32") {
		const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
		const localAppData = process.env.LOCALAPPDATA ?? "";
		const candidates = [
			join(programFiles, "Docker", "Docker", "resources", "bin", "docker.exe"),
			join(localAppData, "Programs", "Docker", "Docker", "resources", "bin", "docker.exe"),
		];
		for (const p of candidates) {
			if (existsSync(p)) return p;
		}
	}

	return "docker";
}

/** Environment so the CLI uses the same daemon as dockerode. */
export function dockerCliEnv(cfg: SwarmBotConfig): NodeJS.ProcessEnv {
	const env = { ...process.env };
	const sock = cfg.dockerSock;

	if (sock.startsWith("tcp://") || sock.startsWith("http://") || sock.startsWith("https://")) {
		env.DOCKER_HOST = sock.startsWith("http") ? sock.replace(/^http/, "tcp") : sock;
	} else if (process.platform === "win32" && sock.includes("pipe")) {
		env.DOCKER_HOST = sock;
	} else if (sock && sock !== "/var/run/docker.sock") {
		env.DOCKER_HOST = sock.startsWith("unix://") ? sock : `unix://${sock}`;
	}

	return env;
}
