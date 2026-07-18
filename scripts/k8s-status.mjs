#!/usr/bin/env node
// Show the Swarmbot dev stack running in the local k3d cluster.
import { execSync } from "node:child_process";

const CLUSTER = "swarmbot-dev";

let kubeconfig;
try {
	kubeconfig = execSync(`k3d kubeconfig write ${CLUSTER}`, { encoding: "utf8" }).trim();
} catch {
	console.error(`k3d cluster '${CLUSTER}' not found. Run: npm run k8s:start`);
	process.exit(1);
}
const env = { ...process.env, KUBECONFIG: kubeconfig };

function show(cmd) {
	try {
		process.stdout.write(execSync(cmd, { encoding: "utf8", env }));
	} catch (e) {
		process.stdout.write(e.stdout ?? "");
	}
	process.stdout.write("\n");
}

show("kubectl get nodes -o wide");
show("kubectl -n swarmbot get deploy,statefulset,daemonset,svc,ingress");
show("kubectl -n swarmbot get pods -o wide");
