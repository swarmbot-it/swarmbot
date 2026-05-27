#!/usr/bin/env node
import { execSync } from "child_process";

const NETWORK = "swarm-net";
const MANAGER = "swarm-manager";
const WORKERS = ["swarm-worker-1", "swarm-worker-2"];
const IMAGE = "docker:27-dind";
/** Swarm stack publishes app on 888 inside DinD (see examples/docker-compose.local.yml). */
const APP_PUBLISHED_PORT = 888;

function run(cmd, opts = {}) {
	const out = execSync(cmd, {
		stdio: opts.capture ? "pipe" : "inherit",
		encoding: opts.capture ? "utf8" : undefined,
	});
	return opts.capture && typeof out === "string" ? out.trim() : undefined;
}

function containerExists(name) {
	try {
		run(`docker inspect ${name}`, { capture: true });
		return true;
	} catch {
		return false;
	}
}

function containerRunning(name) {
	try {
		return run(`docker inspect -f "{{.State.Status}}" ${name}`, { capture: true }) === "running";
	} catch {
		return false;
	}
}

function swarmNodeActive(container) {
	try {
		return (
			run(`docker exec ${container} docker info --format '{{.Swarm.LocalNodeState}}'`, {
				capture: true,
			}) === "active"
		);
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

function startNode(name, { publishAppPort = false } = {}) {
	if (containerRunning(name)) {
		console.log(`    ${name}: already running`);
		return;
	}
	if (containerExists(name)) {
		console.log(`>>> Starting existing container: ${name}`);
		run(`docker start ${name}`);
		return;
	}
	const portFlag = publishAppPort ? `-p ${APP_PUBLISHED_PORT}:${APP_PUBLISHED_PORT}` : "";
	console.log(`>>> Creating container: ${name}`);
	run(
		`docker run -d --name ${name} --hostname ${name} --network ${NETWORK} --privileged ${portFlag} -e DOCKER_TLS_CERTDIR="" ${IMAGE}`
			.replace(/\s+/g, " ")
			.trim()
	);
}

console.log(`>>> Ensuring bridge network: ${NETWORK}`);
try {
	run(`docker network create --driver bridge ${NETWORK}`, { capture: true });
} catch {
	/* already exists */
}

startNode(MANAGER, { publishAppPort: true });
for (const worker of WORKERS) {
	startNode(worker);
}

console.log(">>> Waiting for Docker daemons to be ready...");
waitForDocker(MANAGER);
for (const worker of WORKERS) waitForDocker(worker);

const managerIp = run(
	`docker inspect -f "{{index .NetworkSettings.Networks \\"${NETWORK}\\" \\"IPAddress\\"}}" ${MANAGER}`,
	{ capture: true }
);
if (!managerIp) {
	console.error(`Could not resolve ${MANAGER} IP on network ${NETWORK}`);
	process.exit(1);
}

if (swarmNodeActive(MANAGER)) {
	console.log(">>> Swarm already initialized on manager");
} else {
	console.log(">>> Initializing Swarm on manager");
	run(`docker exec ${MANAGER} docker swarm init --advertise-addr ${managerIp}`);
}

console.log(">>> Ensuring workers joined Swarm");
const token = run(`docker exec ${MANAGER} docker swarm join-token worker -q`, { capture: true });
for (const worker of WORKERS) {
	if (swarmNodeActive(worker)) {
		console.log(`    ${worker}: already in swarm`);
		continue;
	}
	run(`docker exec ${worker} docker swarm join --token ${token} ${managerIp}:2377`);
}

console.log("\n=== Swarm is ready ===");
run(`docker exec ${MANAGER} docker node ls`);
console.log(`\nManager: ${MANAGER}`);
console.log(`Workers: ${WORKERS.join(", ")}`);
console.log(
	`\nAfter 'npm run swarm:deploy', open http://localhost:${APP_PUBLISHED_PORT} (login: admin / swarmboty).`
);
console.log(
	`Port ${APP_PUBLISHED_PORT} is forwarded from the host into the manager DinD container.`
);
console.log("Run 'npm run swarm:stop' to tear down.");
