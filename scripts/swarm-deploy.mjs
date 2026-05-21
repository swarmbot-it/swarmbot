#!/usr/bin/env node
/**
 * Builds swarmboty:local and swarmagent:local on the host Docker daemon,
 * loads them into every DinD cluster node, then deploys the Swarm stack
 * defined in docker-compose.local.yml via TCP to the DinD manager.
 *
 * Cross-platform: uses temp files instead of shell pipes so it works on
 * Windows PowerShell, macOS, and Linux without changes.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const STACK = "swarmboty";
const COMPOSE_FILE = "docker-compose.local.yml";
const AGENT_DIR = resolve("../swarmagent");

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function managerIp() {
	return run(
		`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" ${MANAGER}`,
		{ capture: true }
	);
}

/**
 * Saves an image from the host daemon to a temp tar, copies it into every
 * listed DinD container, and loads it there. Temp files are cleaned up.
 */
function loadImageIntoNodes(image, nodes) {
	const slug = image.replace(/[/:]/g, "-");
	const tarPath = join(tmpdir(), `${slug}.tar`);

	console.log(`    save  ${image} → ${tarPath}`);
	run(`docker save -o "${tarPath}" ${image}`);

	for (const node of nodes) {
		if (!containerRunning(node)) {
			console.log(`    skip  ${node} (not running)`);
			continue;
		}
		console.log(`    load  ${image} → ${node}`);
		run(`docker cp "${tarPath}" ${node}:/tmp/_swarm_load.tar`);
		run(`docker exec ${node} docker load -i /tmp/_swarm_load.tar`);
		run(`docker exec ${node} rm -f /tmp/_swarm_load.tar`);
	}

	// Remove temp file (best-effort)
	try { run(`docker run --rm -v "${tarPath}":"${tarPath}" alpine rm -f "${tarPath}"`, { capture: true }); } catch { /* ignore */ }
}

// ── Pre-flight checks ─────────────────────────────────────────────────────────

if (!containerRunning(MANAGER)) {
	console.error(`\nError: ${MANAGER} is not running.`);
	console.error("       Run 'npm run swarm:start' first.\n");
	process.exit(1);
}

const activeWorkers = WORKERS.filter(containerRunning);
const allNodes = [MANAGER, ...activeWorkers];
console.log(`\nCluster nodes: ${allNodes.join(", ")}`);

// ── Build images ──────────────────────────────────────────────────────────────

console.log("\n>>> Building swarmboty:local");
run(`docker build -t swarmboty:local .`);

const hasAgent = existsSync(join(AGENT_DIR, "Dockerfile"));
if (hasAgent) {
	console.log("\n>>> Building swarmagent:local");
	run(`docker build -t swarmagent:local "${AGENT_DIR}"`);
} else {
	console.warn(`\nWarning: swarmagent not found at ${AGENT_DIR} — agent service will be skipped.`);
}

// ── Load images into DinD nodes ───────────────────────────────────────────────

console.log("\n>>> Loading images into DinD nodes");

// app/db/influxdb are pinned to manager — only manager needs swarmboty:local
loadImageIntoNodes("swarmboty:local", [MANAGER]);

// agent runs in global mode — all active nodes need swarmagent:local
if (hasAgent) {
	loadImageIntoNodes("swarmagent:local", allNodes);
}

// ── Deploy stack ──────────────────────────────────────────────────────────────

const ip = managerIp();
const swarmEnv = { ...process.env, DOCKER_HOST: `tcp://${ip}:2375` };

console.log(`\n>>> Deploying stack '${STACK}' to DinD Swarm (manager ${ip})`);
run(`docker stack deploy -c ${COMPOSE_FILE} ${STACK}`, { env: swarmEnv });

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n=== Stack deployed ===");
console.log(`\n  UI:       http://${ip}:888`);
console.log(`  Login:    admin / swarmboty`);
console.log(`\nServices may take 30–60 s to become healthy.`);
console.log(`\n  npm run swarm:status     — node & service list`);
console.log(`  npm run swarm:undeploy   — remove the stack`);
