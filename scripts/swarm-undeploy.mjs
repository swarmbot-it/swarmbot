#!/usr/bin/env node
import { execSync } from "child_process";

const MANAGER = "swarm-manager";
const STACK = "swarmboty";

function run(cmd, opts = {}) {
	return execSync(cmd, {
		stdio: opts.capture ? "pipe" : "inherit",
		encoding: "utf8",
		env: opts.env ?? process.env,
	}).trim();
}

function containerRunning(name) {
	try {
		return run(`docker inspect -f "{{.State.Status}}" ${name}`, { capture: true }) === "running";
	} catch {
		return false;
	}
}

if (!containerRunning(MANAGER)) {
	console.error(`Error: ${MANAGER} is not running.`);
	process.exit(1);
}

const ip = run(
	`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" ${MANAGER}`,
	{ capture: true }
);

console.log(`>>> Removing stack '${STACK}' from DinD Swarm`);
run(`docker stack rm ${STACK}`, { env: { ...process.env, DOCKER_HOST: `tcp://${ip}:2375` } });
console.log(`\nStack '${STACK}' removed.`);
console.log(`Run 'npm run swarm:stop' to shut down the cluster entirely.`);
