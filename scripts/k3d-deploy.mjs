#!/usr/bin/env node
/** Apply the examples/k8s manifests (app + CouchDB + InfluxDB + agent DaemonSet). */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const CLUSTER = "sw4rmbot";
const here = path.dirname(fileURLToPath(import.meta.url));
const manifests = path.join(here, "..", "examples", "k8s");

try {
	execSync(`kubectl --context k3d-${CLUSTER} apply -f "${manifests}"`, {
		stdio: "inherit",
	});
	console.log("\nDeployed. Watch pods with:");
	console.log(`  kubectl --context k3d-${CLUSTER} -n sw4rmbot get pods -w`);
	console.log("Then open http://localhost:8888 (login: admin / swarmboty).");
} catch {
	process.exit(1);
}
