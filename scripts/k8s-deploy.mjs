#!/usr/bin/env node
// Build local images, import them into the k3d dev cluster, and apply the
// examples/k8s overlay. Idempotent; creates the cluster if it is missing.
// Requires: k3d, kubectl, docker.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CLUSTER = "swarmbot-dev";
const HOST_PORT = process.env.SWARMBOT_K8S_PORT ?? "8088";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = resolve(ROOT, "swarmagent"); // git submodule

function run(cmd, opts = {}) {
	return execSync(cmd, {
		stdio: opts.capture ? "pipe" : "inherit",
		encoding: "utf8",
		cwd: opts.cwd ?? ROOT,
		env: opts.env ?? process.env,
	});
}
function clusterExists() {
	try {
		return run("k3d cluster list -o json", { capture: true }).includes(`"${CLUSTER}"`);
	} catch {
		return false;
	}
}

// 1. Ensure the cluster exists (delegates to k8s-start for the create flags).
if (!clusterExists()) {
	console.log(`Cluster '${CLUSTER}' not found — creating it...`);
	run("node scripts/k8s-start.mjs");
}
const kubeconfig = run(`k3d kubeconfig write ${CLUSTER}`, { capture: true }).trim();
const env = { ...process.env, KUBECONFIG: kubeconfig };

// 2. Build the app image (and the agent image when the submodule is present).
console.log("Building swarmbot:local ...");
run("docker build -t swarmbot:local .");

const images = ["swarmbot:local"];
if (existsSync(resolve(AGENT_DIR, "Dockerfile"))) {
	console.log("Building swarmagent:local (submodule) ...");
	run("docker build -t swarmagent:local .", { cwd: AGENT_DIR });
	images.push("swarmagent:local");
} else {
	console.warn("swarmagent submodule not checked out — the agent DaemonSet will not start.");
	console.warn("  git submodule update --init --recursive   # then re-run npm run k8s:deploy");
}

// 3. Import the built images into every k3d node (no registry needed).
console.log(`Importing into k3d: ${images.join(", ")}`);
run(`k3d image import ${images.join(" ")} -c ${CLUSTER}`);

// 4. Apply the overlay against the k3d cluster ONLY (isolated kubeconfig).
console.log("Applying examples/k8s ...");
run("kubectl apply -k examples/k8s", { env });

// 5. Wait for the app (and agent, if built) to become ready.
run("kubectl -n swarmbot rollout status deploy/swarmbot --timeout=180s", { env });
if (images.includes("swarmagent:local")) {
	run("kubectl -n swarmbot rollout status ds/swarmagent --timeout=180s", { env });
}

console.log(`\nDeployed. Open http://swarmbot.localhost:${HOST_PORT}  (login: admin / swarmbot)`);
console.log("Status: npm run k8s:status   |   Remove: npm run k8s:undeploy   |   Delete cluster: npm run k8s:stop");
