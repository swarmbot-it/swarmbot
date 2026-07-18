#!/usr/bin/env node
// Create a local k3d cluster for Swarmbot dev (idempotent).
// Requires: k3d (https://k3d.io) and kubectl.
import { execSync } from "node:child_process";

const CLUSTER = "swarmbot-dev";
const HOST_PORT = process.env.SWARMBOT_K8S_PORT ?? "8088";
const AGENTS = process.env.SWARMBOT_K8S_AGENTS ?? "1";

function run(cmd, capture = false) {
	return execSync(cmd, { stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
}
function ensure(bin, versionCmd) {
	try {
		run(versionCmd, true);
	} catch {
		console.error(`${bin} not found — install it first (k3d: https://k3d.io).`);
		process.exit(1);
	}
}
function clusterExists() {
	try {
		return run("k3d cluster list -o json", true).includes(`"${CLUSTER}"`);
	} catch {
		return false;
	}
}

ensure("k3d", "k3d version");
ensure("kubectl", "kubectl version --client");

if (clusterExists()) {
	console.log(`k3d cluster '${CLUSTER}' already exists.`);
} else {
	console.log(`Creating k3d cluster '${CLUSTER}' (Traefik exposed on http://localhost:${HOST_PORT})...`);
	run(`k3d cluster create ${CLUSTER} --agents ${AGENTS} -p "${HOST_PORT}:80@loadbalancer" --wait`);
}

// Write the cluster kubeconfig so the deploy/status scripts target ONLY k3d.
run(`k3d kubeconfig write ${CLUSTER}`, true);
console.log(`\nCluster ready. Next: npm run k8s:deploy`);
