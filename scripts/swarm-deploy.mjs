#!/usr/bin/env node
/**
 * Builds swarmboty:local and swarmagent:local on the host Docker daemon,
 * loads them into every DinD cluster node, then deploys the Swarm stack
 * defined in examples/docker-compose.local.yml via TCP to the DinD manager.
 *
 * Cross-platform: uses temp files instead of shell pipes so it works on
 * Windows PowerShell, macOS, and Linux without changes.
 */
import { createHash } from "crypto";
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(SCRIPT_DIR, "..", ".cache");
const AGENT_HASH_FILE = join(CACHE_DIR, "swarmagent-source.hash");

// ── Config ────────────────────────────────────────────────────────────────────

const NETWORK = "swarm-net";
const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const STACK = "swarmboty";
const ROOT_DIR = join(SCRIPT_DIR, "..");
const COMPOSE_FILE = join(ROOT_DIR, "examples", "docker-compose.local.yml");
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

/** SHA-256 of agent sources + Dockerfile — used to skip redundant builds. */
function agentSourceFingerprint(agentDir) {
	const h = createHash("sha256");
	const rootFiles = ["Cargo.toml", "Cargo.lock", "Dockerfile", ".dockerignore"];
	for (const name of rootFiles) {
		const p = join(agentDir, name);
		if (!existsSync(p)) continue;
		h.update(`file:${name}\n`);
		h.update(readFileSync(p));
		h.update("\n");
	}
	const srcDir = join(agentDir, "src");
	if (!existsSync(srcDir)) return h.digest("hex");

	function walk(dir, acc = []) {
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, ent.name);
			if (ent.isDirectory()) walk(p, acc);
			else if (ent.name.endsWith(".rs")) acc.push(p);
		}
		return acc;
	}
	for (const p of walk(srcDir).sort()) {
		const rel = p.slice(agentDir.length + 1).replace(/\\/g, "/");
		h.update(`file:${rel}\n`);
		h.update(readFileSync(p));
		h.update("\n");
	}
	return h.digest("hex");
}

function dockerImageId(ref) {
	try {
		return run(`docker image inspect -f "{{.Id}}" ${ref}`, { capture: true });
	} catch {
		return null;
	}
}

function nodeImageId(node, ref) {
	try {
		return run(`docker exec ${node} docker image inspect -f "{{.Id}}" ${ref}`, { capture: true });
	} catch {
		return null;
	}
}

/** True when every running node already has the same image digest as the host. */
function agentImageLoadedOnNodes(image, nodes) {
	const hostId = dockerImageId(image);
	if (!hostId) return false;
	for (const node of nodes) {
		if (!containerRunning(node)) continue;
		if (nodeImageId(node, image) !== hostId) return false;
	}
	return true;
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
const appVersion = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf8")).version;
run(`docker build -t swarmboty:local --build-arg APP_VERSION=${appVersion} .`);

const hasAgent = existsSync(join(AGENT_DIR, "Dockerfile"));
const forceAgentBuild =
	process.env.SWARM_FORCE_AGENT_BUILD === "1" || process.env.SWARM_FORCE_AGENT_BUILD === "true";
const skipAgentBuild =
	process.env.SWARM_SKIP_AGENT_BUILD === "1" || process.env.SWARM_SKIP_AGENT_BUILD === "true";
const forceAgentLoad =
	process.env.SWARM_FORCE_AGENT_LOAD === "1" || process.env.SWARM_FORCE_AGENT_LOAD === "true";

if (hasAgent) {
	mkdirSync(CACHE_DIR, { recursive: true });
	const fingerprint = agentSourceFingerprint(AGENT_DIR);
	const prevHash = existsSync(AGENT_HASH_FILE) ? readFileSync(AGENT_HASH_FILE, "utf8").trim() : "";
	const imageReady = dockerImageId("swarmagent:local") != null;

	if (skipAgentBuild) {
		if (!imageReady) {
			console.error("\nError: SWARM_SKIP_AGENT_BUILD set but swarmagent:local is missing.");
			process.exit(1);
		}
		console.log("\n>>> swarmagent:local — build skipped (SWARM_SKIP_AGENT_BUILD)");
	} else if (!forceAgentBuild && fingerprint === prevHash && imageReady) {
		console.log("\n>>> swarmagent:local — unchanged, skipping build (use SWARM_FORCE_AGENT_BUILD=1 to rebuild)");
	} else {
		console.log("\n>>> Building swarmagent:local");
		run(`docker build -t swarmagent:local "${AGENT_DIR}"`);
		writeFileSync(AGENT_HASH_FILE, fingerprint, "utf8");
	}
} else {
	console.warn(`\nWarning: swarmagent not found at ${AGENT_DIR} — agent service will be skipped.`);
}

// ── Load images into DinD nodes ───────────────────────────────────────────────

console.log("\n>>> Loading images into DinD nodes");

// app/db/influxdb are pinned to manager — only manager needs swarmboty:local
loadImageIntoNodes("swarmboty:local", [MANAGER]);

// agent runs in global mode — all active nodes need swarmagent:local
if (hasAgent) {
	if (forceAgentLoad || !agentImageLoadedOnNodes("swarmagent:local", allNodes)) {
		loadImageIntoNodes("swarmagent:local", allNodes);
	} else {
		console.log("\n>>> swarmagent:local already on cluster nodes — skipping load (SWARM_FORCE_AGENT_LOAD=1 to reload)");
	}
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
	throw new Error(`failed to copy examples/docker-compose.local.yml into ${MANAGER}`);
}
run(`docker exec ${MANAGER} docker stack deploy -c ${composeInManager} ${STACK}`);

// Same tag (`:local`) — force tasks to pick up freshly loaded images.
console.log("\n>>> Rolling service updates (force)");
run(`docker exec ${MANAGER} docker service update --force ${STACK}_app`);
if (hasAgent) {
	run(`docker exec ${MANAGER} docker service update --force ${STACK}_agent`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n=== Stack deployed ===");
console.log(`\n  UI:       http://localhost:888`);
console.log(`  (inside DinD manager: http://${ip}:888 — often unreachable from Windows host)`);
console.log(`  Login:    admin / swarmboty`);
console.log(`\nServices may take 30–60 s to become healthy.`);
console.log(`\n  npm run swarm:status     — node & service list`);
console.log(`  npm run swarm:undeploy   — remove the stack`);
