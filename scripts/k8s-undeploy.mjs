#!/usr/bin/env node
// Remove the Swarmbot stack from the local k3d cluster (cluster stays up).
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CLUSTER = "swarmbot-dev";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let kubeconfig;
try {
	kubeconfig = execSync(`k3d kubeconfig write ${CLUSTER}`, { encoding: "utf8" }).trim();
} catch {
	console.error(`k3d cluster '${CLUSTER}' not found.`);
	process.exit(1);
}
const env = { ...process.env, KUBECONFIG: kubeconfig };

execSync("kubectl delete -k examples/k8s --ignore-not-found", {
	stdio: "inherit",
	env,
	cwd: ROOT,
});
console.log("Stack removed. Cluster still running — 'npm run k8s:stop' to delete it.");
