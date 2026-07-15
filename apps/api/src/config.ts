/** swarmbot.it environment-driven configuration. */

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

export type SwarmbotyConfig = {
	dockerSock: string;
	dockerApi: string;
	dockerHttpTimeoutMs: number;
	logLevel: string;
	/** Postgres connection string (e.g. `postgres://user:pass@host:5432/swarmboty`). */
	dbUrl: string;
	influxdbUrl: string | undefined;
	influxdbToken: string | undefined;
	agentUrl: string | undefined;
	workDir: string;
	instanceName: string | undefined;
	apiTokenExpiryDays: number | undefined;
	port: number;
	mock: boolean;
	/** Allowed CORS origins. Undefined -> the dev-safe default list in server.ts. */
	allowedOrigins: string[] | undefined;
	/** Shared secret required from swarmagent as X-Agent-Token on POST /events. Unset = no auth enforced (opt-in). */
	agentSharedSecret: string | undefined;
	/** Backend selection: explicit swarm/kubernetes, or auto-detection (default). */
	orchestrator: "swarm" | "kubernetes" | "auto";
	/** Explicit kubeconfig path for kubernetes mode (KUBECONFIG is honoured too). */
	kubeconfig: string | undefined;
	/** Restrict kubernetes views to a single namespace (default: all). */
	k8sNamespace: string | undefined;
	/** Which backend mock mode imitates: swarm (default) or kubernetes. */
	mockOrchestrator: "swarm" | "kubernetes";
};

const defaults: SwarmbotyConfig = {
	dockerSock: "/var/run/docker.sock",
	dockerApi: "1.44",
	dockerHttpTimeoutMs: 5000,
	logLevel: "info",
	dbUrl: "postgres://localhost:5432/swarmboty",
	influxdbUrl: undefined,
	influxdbToken: undefined,
	agentUrl: undefined,
	workDir: "/tmp",
	instanceName: undefined,
	apiTokenExpiryDays: undefined,
	port: 8080,
	mock: false,
	allowedOrigins: undefined,
	agentSharedSecret: undefined,
	orchestrator: "auto",
	kubeconfig: undefined,
	k8sNamespace: undefined,
	mockOrchestrator: "swarm",
};

function envOrchestratorMode(key: string): "swarm" | "kubernetes" | "auto" | undefined {
	const v = envStr(key)?.toLowerCase();
	if (v === "swarm" || v === "kubernetes" || v === "auto") return v;
	return undefined;
}

let dynamicDockerApi: string | undefined;

export function setNegotiatedDockerApi(version: string): void {
	dynamicDockerApi = version;
}

export function resolvedDockerApi(fallback: string): string {
	return dynamicDockerApi ?? envStr("SWARMBOTY_DOCKER_API") ?? fallback;
}

function envBool(key: string): boolean | undefined {
	const v = envStr(key);
	if (v === undefined) return undefined;
	const lower = v.toLowerCase();
	if (["1", "true", "yes", "on"].includes(lower)) return true;
	if (["0", "false", "no", "off"].includes(lower)) return false;
	return undefined;
}

export function loadConfig(): SwarmbotyConfig {
	const port = envInt("SWARMBOTY_PORT") ?? envInt("PORT") ?? defaults.port;
	return {
		dockerSock: envStr("SWARMBOTY_DOCKER_SOCK") ?? defaults.dockerSock,
		dockerApi: resolvedDockerApi(defaults.dockerApi),
		dockerHttpTimeoutMs:
			envInt("SWARMBOTY_DOCKER_HTTP_TIMEOUT") ?? defaults.dockerHttpTimeoutMs,
		logLevel: envStr("SWARMBOTY_LOG_LEVEL") ?? defaults.logLevel,
		dbUrl: envStr("SWARMBOTY_DB") ?? defaults.dbUrl,
		influxdbUrl: envStr("SWARMBOTY_INFLUXDB"),
		influxdbToken: envStr("SWARMBOTY_INFLUXDB_TOKEN"),
		agentUrl: envStr("SWARMBOTY_AGENT_URL"),
		workDir: envStr("SWARMBOTY_WORK_DIR") ?? defaults.workDir,
		instanceName: envStr("SWARMBOTY_INSTANCE_NAME"),
		apiTokenExpiryDays: envInt("SWARMBOTY_API_TOKEN_EXPIRY_DAYS"),
		port,
		mock: envBool("SWARMBOTY_MOCK") ?? defaults.mock,
		allowedOrigins: envStr("SWARMBOTY_ALLOWED_ORIGINS")
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		agentSharedSecret: envStr("SWARMAGENT_SHARED_SECRET"),
		orchestrator: envOrchestratorMode("SWARMBOTY_ORCHESTRATOR") ?? defaults.orchestrator,
		kubeconfig: envStr("SWARMBOTY_KUBECONFIG"),
		k8sNamespace: envStr("SWARMBOTY_K8S_NAMESPACE"),
		mockOrchestrator:
			envStr("SWARMBOTY_MOCK_ORCHESTRATOR")?.toLowerCase() === "kubernetes"
				? "kubernetes"
				: defaults.mockOrchestrator,
	};
}
