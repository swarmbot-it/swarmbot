#!/usr/bin/env node
// Delete the local k3d dev cluster (and all its data).
import { execSync } from "node:child_process";

const CLUSTER = "swarmbot-dev";

try {
	execSync(`k3d cluster delete ${CLUSTER}`, { stdio: "inherit" });
	console.log(`Deleted k3d cluster '${CLUSTER}'.`);
} catch {
	console.log(`Cluster '${CLUSTER}' not found (nothing to delete).`);
}
