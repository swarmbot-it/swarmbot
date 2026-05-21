#!/usr/bin/env node
import { execSync } from "child_process";

const NETWORK = "swarm-net";
const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const IMAGE = "docker:27-dind";

function run(cmd, opts = {}) {
	return execSync(cmd, { stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8" });
}

function containerExists(name) {
	try {
		run(`docker inspect ${name}`, { capture: true });
		return true;
	} catch {
		return false;
	}
}

function waitForDocker(container, retries = 20) {
	for (let i = 0; i < retries; i++) {
		try {
			run(`docker exec ${container} docker info`, { capture: true });
			console.log(`    ${container}: ready`);
			return;
		} catch {
			if (i < retries - 1) {
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
			}
		}
	}
	console.error(`    ${container}: timed out waiting for Docker daemon`);
	process.exit(1);
}

console.log(`>>> Creating bridge network: ${NETWORK}`);
try { run(`docker network create --driver bridge ${NETWORK}`, { capture: true }); } catch { /* already exists */ }

console.log(`>>> Starting manager container: ${MANAGER}`);
run(`docker run -d --name ${MANAGER} --hostname ${MANAGER} --network ${NETWORK} --privileged -e DOCKER_TLS_CERTDIR="" ${IMAGE}`);

for (const worker of WORKERS) {
	console.log(`>>> Starting worker container: ${worker}`);
	run(`docker run -d --name ${worker} --hostname ${worker} --network ${NETWORK} --privileged -e DOCKER_TLS_CERTDIR="" ${IMAGE}`);
}

console.log(">>> Waiting for Docker daemons to be ready...");
waitForDocker(MANAGER);
for (const worker of WORKERS) waitForDocker(worker);

console.log(">>> Initializing Swarm on manager");
run(`docker exec ${MANAGER} docker swarm init --advertise-addr ${MANAGER}`);

console.log(">>> Retrieving join token");
const token = run(`docker exec ${MANAGER} docker swarm join-token worker -q`, { capture: true }).trim();
const managerIp = run(
	`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" ${MANAGER}`,
	{ capture: true }
).trim();

console.log(">>> Joining workers to Swarm");
for (const worker of WORKERS) {
	run(`docker exec ${worker} docker swarm join --token ${token} ${managerIp}:2377`);
}

console.log("\n=== Swarm is ready ===");
run(`docker exec ${MANAGER} docker node ls`);
console.log(`\nManager: ${MANAGER}`);
console.log(`Workers: ${WORKERS.join(", ")}`);
console.log("Run 'npm run swarm:stop' to tear down.");
