#!/usr/bin/env node
/**
 * Local k3s (k3d) dev cluster — the Kubernetes counterpart of swarm-start.
 * Requires the k3d CLI (https://k3d.io) and Docker.
 *
 * App NodePort 30880 (see examples/k8s/30-sw4rmbot.yaml) is mapped to
 * host port 8888.
 */
import { execSync } from "child_process";

const CLUSTER = "sw4rmbot";
const AGENTS = 2;
const APP_HOST_PORT = 8888;
const APP_NODE_PORT = 30880;

function run(cmd, opts = {}) {
	const out = execSync(cmd, {
		stdio: opts.capture ? "pipe" : "inherit",
		encoding: opts.capture ? "utf8" : undefined,
	});
	return opts.capture && typeof out === "string" ? out.trim() : undefined;
}

function k3dInstalled() {
	try {
		run("k3d version", { capture: true });
		return true;
	} catch {
		return false;
	}
}

function clusterExists() {
	try {
		const list = run("k3d cluster list -o json", { capture: true }) ?? "[]";
		return JSON.parse(list).some((c) => c.name === CLUSTER);
	} catch {
		return false;
	}
}

if (!k3dInstalled()) {
	console.error(
		"k3d CLI not found. Install it from https://k3d.io (e.g. 'winget install k3d' / 'brew install k3d') and retry."
	);
	process.exit(1);
}

if (clusterExists()) {
	console.log(`>>> Cluster '${CLUSTER}' already exists — starting it`);
	run(`k3d cluster start ${CLUSTER}`);
} else {
	console.log(`>>> Creating k3d cluster '${CLUSTER}' (1 server + ${AGENTS} agents)`);
	run(
		`k3d cluster create ${CLUSTER} --agents ${AGENTS} ` +
			`-p "${APP_HOST_PORT}:${APP_NODE_PORT}@server:0" --wait`
	);
}

console.log(">>> Nodes:");
run(`kubectl --context k3d-${CLUSTER} get nodes -o wide`);

console.log(`\n=== k3s is ready ===`);
console.log(`kubectl context: k3d-${CLUSTER}`);
console.log(
	`\nDeploy the stack with 'npm run k3d:deploy', then open http://localhost:${APP_HOST_PORT} (login: admin / swarmboty).`
);
console.log(
	"To run the API locally against this cluster instead: set SW4RM_BOT_ORCHESTRATOR=kubernetes (or rely on auto-detection via KUBECONFIG)."
);
console.log("Run 'npm run k3d:stop' to tear down.");
