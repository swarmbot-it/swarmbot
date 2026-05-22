#!/usr/bin/env node
/**
 * Builds swarmboty:local and swarmagent:local on the host Docker daemon,
 * loads them into every DinD cluster node, then deploys the Swarm stack
 * defined in docker-compose.local.yml via TCP to the DinD manager.
 *
 * Cross-platform: uses temp files instead of shell pipes so it works on
 * Windows PowerShell, macOS, and Linux without changes.
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const NETWORK = "swarm-net";
const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const STACK = "swarmboty";
const COMPOSE_FILE = "docker-compose.local.yml";
const AGENT_DIR = resolve("../swarmagent");

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function managerIp() {
	const ip = run(
		`docker inspect -f "{{index .NetworkSettings.Networks \\"${NETWORK}\\" \\"IPAddress\\"}}" ${MANAGER}`,
		{ capture: true }
	);
	if (!ip) {
		console.error(`Could not resolve ${MANAGER} IP on network ${NETWORK}`);
		process.exit(1);
	}
	return ip;
}

/**
 * Saves an image from the host daemon to a temp tar, streams it into each
 * DinD container via `docker exec -i … docker load` (works on Windows;
 * `docker cp` into DinD /tmp is unreliable there).
 */
function loadImageIntoNode(node, tarPath, image) {
	console.log(`    load  ${image} → ${node}`);
	const tar = readFileSync(tarPath);
	const result = spawnSync("docker", ["exec", "-i", node, "docker", "load"], {
		input: tar,
		stdio: ["pipe", "inherit", "inherit"],
		maxBuffer: Infinity,
	});
	if (result.status !== 0) {
		throw new Error(`docker load into ${node} failed (exit ${result.status})`);
	}
}

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
		loadImageIntoNode(node, tarPath, image);
	}

	try {
		unlinkSync(tarPath);
	} catch {
		/* ignore */
	}
}

// ── Pre-flight checks ─────────────────────────────────────────────────────────

function swarmClusterReady() {
	if (!containerRunning(MANAGER)) {
		return false;
	}
	try {
		run(`docker exec ${MANAGER} docker node ls`, { capture: true });
		return true;
	} catch {
		return false;
	}
}

function ensureSwarmCluster() {
	if (swarmClusterReady()) {
		return;
	}
	console.log("\n>>> DinD Swarm cluster is not available — running swarm:start\n");
	run(`node "${join(SCRIPT_DIR, "swarm-start.mjs")}"`);
	if (!swarmClusterReady()) {
		console.error("\nError: cluster did not become ready after swarm:start.\n");
		process.exit(1);
	}
}

ensureSwarmCluster();

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
const composeInManager = "/tmp/swarmboty-stack.yml";
const composeBody = readFileSync(COMPOSE_FILE, "utf8");

console.log(`\n>>> Deploying stack '${STACK}' to DinD Swarm (manager ${ip})`);
const copyCompose = spawnSync(
	"docker",
	["exec", "-i", MANAGER, "sh", "-c", `cat > ${composeInManager}`],
	{ input: composeBody, stdio: ["pipe", "inherit", "inherit"], encoding: "utf8" }
);
if (copyCompose.status !== 0) {
	throw new Error(`failed to copy ${COMPOSE_FILE} into ${MANAGER}`);
}
run(`docker exec ${MANAGER} docker stack deploy -c ${composeInManager} ${STACK}`);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n=== Stack deployed ===");
console.log(`\n  UI:       http://localhost:888`);
console.log(`  (inside DinD manager: http://${ip}:888 — often unreachable from Windows host)`);
console.log(`  Login:    admin / swarmboty`);
console.log(`\nServices may take 30–60 s to become healthy.`);
console.log(`\n  npm run swarm:status     — node & service list`);
console.log(`  npm run swarm:undeploy   — remove the stack`);
