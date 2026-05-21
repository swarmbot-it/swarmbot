#!/usr/bin/env node
import { execSync } from "child_process";

const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const ALL = [MANAGER, ...WORKERS];

function run(cmd) {
	return execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim();
}

function containerStatus(name) {
	try {
		return run(`docker inspect -f "{{.State.Status}}" ${name}`);
	} catch {
		return null;
	}
}

function swarmReady(container) {
	try {
		run(`docker exec ${container} docker info`);
		return true;
	} catch {
		return false;
	}
}

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function col(text, color) { return `${color}${text}${RESET}`; }

console.log(`\n${BOLD}=== SwarmBoty test cluster status ===${RESET}\n`);

// — Container state —
console.log(`${BOLD}Containers${RESET}`);
let anyRunning = false;
for (const name of ALL) {
	const status = containerStatus(name);
	if (!status) {
		console.log(`  ${col("✗", RED)} ${name.padEnd(22)} ${col("not found", RED)}`);
	} else {
		const icon = status === "running" ? col("●", GREEN) : col("●", YELLOW);
		const label = status === "running" ? col(status, GREEN) : col(status, YELLOW);
		console.log(`  ${icon} ${name.padEnd(22)} ${label}`);
		if (status === "running") anyRunning = true;
	}
}

if (!anyRunning) {
	console.log(`\n${DIM}Cluster is not running. Use 'npm run swarm:start' to start it.${RESET}\n`);
	process.exit(0);
}

// — Swarm node list —
const managerStatus = containerStatus(MANAGER);
if (managerStatus === "running" && swarmReady(MANAGER)) {
	console.log(`\n${BOLD}Swarm nodes${RESET}`);
	try {
		const nodes = run(`docker exec ${MANAGER} docker node ls`);
		const lines = nodes.split("\n");
		for (const line of lines) {
			const isLeader = line.includes("Leader");
			const isActive = line.includes("Active");
			const prefix = line.startsWith("ID") ? DIM : isLeader ? CYAN : "";
			console.log(`  ${prefix}${line}${RESET}`);
		}
	} catch {
		console.log(`  ${col("Could not retrieve node list", YELLOW)}`);
	}

	// — Running services —
	try {
		const services = run(`docker exec ${MANAGER} docker service ls`);
		const svcLines = services.split("\n");
		if (svcLines.length > 1) {
			console.log(`\n${BOLD}Services${RESET}`);
			for (const line of svcLines) {
				const prefix = line.startsWith("ID") ? DIM : "";
				console.log(`  ${prefix}${line}${RESET}`);
			}
		} else {
			console.log(`\n${DIM}No services deployed.${RESET}`);
		}
	} catch { /* no services */ }

	// — Stacks —
	try {
		const stacks = run(`docker exec ${MANAGER} docker stack ls`);
		const stackLines = stacks.split("\n");
		if (stackLines.length > 1) {
			console.log(`\n${BOLD}Stacks${RESET}`);
			for (const line of stackLines) {
				const prefix = line.startsWith("NAME") ? DIM : "";
				console.log(`  ${prefix}${line}${RESET}`);
			}
		}
	} catch { /* no stacks */ }
} else {
	console.log(`\n${col("Manager container is not ready or Swarm daemon is not running.", YELLOW)}`);
}

console.log();
