/** swarmbot environment-driven configuration. */

function envStr(key: string): string | undefined {
	const v = process.env[key];
	return v === undefined || v === "" ? undefined : v;
}

function envInt(key: string): number | undefined {
	const v = envStr(key);
	if (v === undefined) return undefined;
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? n : undefined;
}

/** Backend selection: explicit, or `auto` (in-cluster/kubeconfig → k8s, else Docker socket). */
export type OrchestratorMode = "auto" | "swarm" | "kubernetes";

export type SwarmBotConfig = {
	dockerSock: string;
	dockerApi: string;
	dockerHttpTimeoutMs: number;
	logLevel: string;
	dbUrl: string;
	influxdbUrl: string | undefined;
	influxdbToken: string | undefined;
	influxOrg: string | undefined;
	influxBucket: string | undefined;
	workDir: string;
	instanceName: string | undefined;
	apiTokenExpiryDays: number | undefined;
	port: number;
	mock: boolean;
	orchestrator: OrchestratorMode;
	/** Explicit kubeconfig path (SWARMBOT_KUBECONFIG); KUBECONFIG is honoured too. */
	kubeconfig: string | undefined;
	/** Restrict Kubernetes views to one namespace; default: all namespaces. */
	k8sNamespace: string | undefined;
	/** Which orchestrator the mock mode should imitate. */
	mockOrchestrator: "swarm" | "kubernetes";
};

const defaults: SwarmBotConfig = {
	dockerSock: "/var/run/docker.sock",
	dockerApi: "1.44",
	dockerHttpTimeoutMs: 5000,
	logLevel: "info",
	dbUrl: "http://localhost:5984",
	influxdbUrl: undefined,
	influxdbToken: undefined,
	influxOrg: undefined,
	influxBucket: undefined,
	workDir: "/tmp",
	instanceName: undefined,
	apiTokenExpiryDays: undefined,
	port: 8080,
	mock: false,
	orchestrator: "auto",
	kubeconfig: undefined,
	k8sNamespace: undefined,
	mockOrchestrator: "swarm",
};

function envOrchestratorMode(key: string): OrchestratorMode | undefined {
	const v = envStr(key)?.toLowerCase();
	if (v === "swarm" || v === "kubernetes" || v === "auto") return v;
	if (v !== undefined) {
		console.warn(`${key}=${v} is not one of swarm|kubernetes|auto; falling back to auto`);
	}
	return undefined;
}

let dynamicDockerApi: string | undefined;

export function setNegotiatedDockerApi(version: string): void {
	dynamicDockerApi = version;
}

export function resolvedDockerApi(fallback: string): string {
	return dynamicDockerApi ?? envStr("SWARMBOT_DOCKER_API") ?? fallback;
}

function envBool(key: string): boolean | undefined {
	const v = envStr(key);
	if (v === undefined) return undefined;
	const lower = v.toLowerCase();
	if (["1", "true", "yes", "on"].includes(lower)) return true;
	if (["0", "false", "no", "off"].includes(lower)) return false;
	return undefined;
}

export function loadConfig(): SwarmBotConfig {
	const port = envInt("SWARMBOT_PORT") ?? envInt("PORT") ?? defaults.port;
	return {
		dockerSock: envStr("SWARMBOT_DOCKER_SOCK") ?? defaults.dockerSock,
		dockerApi: resolvedDockerApi(defaults.dockerApi),
		dockerHttpTimeoutMs:
			envInt("SWARMBOT_DOCKER_HTTP_TIMEOUT") ?? defaults.dockerHttpTimeoutMs,
		logLevel: envStr("SWARMBOT_LOG_LEVEL") ?? defaults.logLevel,
		dbUrl: envStr("SWARMBOT_DB") ?? defaults.dbUrl,
		influxdbUrl: envStr("SWARMBOT_INFLUXDB"),
		influxdbToken: envStr("SWARMBOT_INFLUXDB_TOKEN"),
		influxOrg: envStr("SWARMBOT_INFLUXDB_ORG"),
		influxBucket: envStr("SWARMBOT_INFLUXDB_BUCKET"),
		workDir: envStr("SWARMBOT_WORK_DIR") ?? defaults.workDir,
		instanceName: envStr("SWARMBOT_INSTANCE_NAME"),
		apiTokenExpiryDays: envInt("SWARMBOT_API_TOKEN_EXPIRY_DAYS"),
		port,
		mock: envBool("SWARMBOT_MOCK") ?? defaults.mock,
		orchestrator: envOrchestratorMode("SWARMBOT_ORCHESTRATOR") ?? defaults.orchestrator,
		kubeconfig: envStr("SWARMBOT_KUBECONFIG"),
		k8sNamespace: envStr("SWARMBOT_K8S_NAMESPACE"),
		mockOrchestrator:
			envStr("SWARMBOT_MOCK_ORCHESTRATOR")?.toLowerCase() === "kubernetes"
				? "kubernetes"
				: defaults.mockOrchestrator,
	};
}
