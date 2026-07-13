#!/usr/bin/env node
import { execSync } from "child_process";

const MANAGER = "swarm-manager";
const STACK = "swarmbot";

function run(cmd, opts = {}) {
	const out = execSync(cmd, {
		stdio: opts.capture ? "pipe" : "inherit",
		encoding: opts.capture ? "utf8" : undefined,
		env: opts.env ?? process.env,
	});
	return opts.capture && typeof out === "string" ? out.trim() : undefined;
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

console.log(`>>> Removing stack '${STACK}' from DinD Swarm`);
run(`docker exec ${MANAGER} docker stack rm ${STACK}`);
console.log(`\nStack '${STACK}' removed.`);
console.log(`Run 'npm run swarm:stop' to shut down the cluster entirely.`);
