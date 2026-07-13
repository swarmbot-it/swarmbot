#!/usr/bin/env node
/** Tear down the local k3d dev cluster created by k3d-start. */
import { execSync } from "child_process";

const CLUSTER = "swarmbot";

try {
	execSync(`k3d cluster delete ${CLUSTER}`, { stdio: "inherit" });
	console.log(`Cluster '${CLUSTER}' deleted.`);
} catch {
	console.error(
		`Could not delete cluster '${CLUSTER}' (is k3d installed and the cluster present?).`
	);
	process.exit(1);
}
