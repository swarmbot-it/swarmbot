#!/usr/bin/env node
import { execSync } from "child_process";

const NETWORK = "swarm-net";
const CONTAINERS = ["swarm-manager", "swarm-worker-1", "swarm-worker-2"];

function run(cmd, capture = false) {
	return execSync(cmd, { stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
}

console.log(">>> Stopping and removing Swarm containers");
for (const c of CONTAINERS) {
	try {
		run(`docker inspect ${c}`, true);
		run(`docker rm -f ${c}`);
		console.log(`    removed: ${c}`);
	} catch {
		console.log(`    not found (skipping): ${c}`);
	}
}

console.log(`>>> Removing network: ${NETWORK}`);
try {
	run(`docker network rm ${NETWORK}`);
	console.log(`    removed: ${NETWORK}`);
} catch {
	console.log(`    not found (skipping): ${NETWORK}`);
}

console.log("\n=== Swarm torn down ===");
