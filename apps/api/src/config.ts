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

export type SwarmbotConfig = {
	dockerSock: string;
	dockerApi: string;
	dockerHttpTimeoutMs: number;
	logLevel: string;
	/** Postgres connection string (e.g. `postgres://user:pass@host:5432/swarmbot`). */
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

const defaults: SwarmbotConfig = {
	dockerSock: "/var/run/docker.sock",
	dockerApi: "1.44",
	dockerHttpTimeoutMs: 5000,
	logLevel: "info",
	dbUrl: "postgres://localhost:5432/swarmbot",
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

export function loadConfig(): SwarmbotConfig {
	const port = envInt("SWARMBOT_PORT") ?? envInt("PORT") ?? defaults.port;
	const mock = envBool("SWARMBOT_MOCK") ?? defaults.mock;
	return {
		dockerSock: envStr("SWARMBOT_DOCKER_SOCK") ?? defaults.dockerSock,
		dockerApi: resolvedDockerApi(defaults.dockerApi),
		dockerHttpTimeoutMs:
			envInt("SWARMBOT_DOCKER_HTTP_TIMEOUT") ?? defaults.dockerHttpTimeoutMs,
		logLevel: envStr("SWARMBOT_LOG_LEVEL") ?? defaults.logLevel,
		dbUrl: envStr("SWARMBOT_DB") ?? defaults.dbUrl,
		// Mock mode imitates the Docker engine, so no agent ever feeds Influx —
		// a configured URL would only turn every stat into a permanent 0. Ignore
		// it and let the deterministic demo placeholders kick in instead.
		influxdbUrl: mock ? undefined : envStr("SWARMBOT_INFLUXDB"),
		influxdbToken: envStr("SWARMBOT_INFLUXDB_TOKEN"),
		agentUrl: envStr("SWARMBOT_AGENT_URL"),
		workDir: envStr("SWARMBOT_WORK_DIR") ?? defaults.workDir,
		instanceName: envStr("SWARMBOT_INSTANCE_NAME"),
		apiTokenExpiryDays: envInt("SWARMBOT_API_TOKEN_EXPIRY_DAYS"),
		port,
		mock,
		allowedOrigins: envStr("SWARMBOT_ALLOWED_ORIGINS")
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		agentSharedSecret: envStr("SWARMAGENT_SHARED_SECRET"),
		orchestrator: envOrchestratorMode("SWARMBOT_ORCHESTRATOR") ?? defaults.orchestrator,
		kubeconfig: envStr("SWARMBOT_KUBECONFIG"),
		k8sNamespace: envStr("SWARMBOT_K8S_NAMESPACE"),
		mockOrchestrator:
			envStr("SWARMBOT_MOCK_ORCHESTRATOR")?.toLowerCase() === "kubernetes"
				? "kubernetes"
				: defaults.mockOrchestrator,
	};
}
