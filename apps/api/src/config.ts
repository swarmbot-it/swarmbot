/** Swarmboty environment-driven configuration. */

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
	dbUrl: string;
	influxdbUrl: string | undefined;
	influxdbToken: string | undefined;
	influxOrg: string | undefined;
	influxBucket: string | undefined;
	agentUrl: string | undefined;
	workDir: string;
	instanceName: string | undefined;
	apiTokenExpiryDays: number | undefined;
	port: number;
	mock: boolean;
};

const defaults: SwarmbotyConfig = {
	dockerSock: "/var/run/docker.sock",
	dockerApi: "1.44",
	dockerHttpTimeoutMs: 5000,
	logLevel: "info",
	dbUrl: "http://localhost:5984",
	influxdbUrl: undefined,
	influxdbToken: undefined,
	influxOrg: undefined,
	influxBucket: undefined,
	agentUrl: undefined,
	workDir: "/tmp",
	instanceName: undefined,
	apiTokenExpiryDays: undefined,
	port: 8080,
	mock: false,
};

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
		influxOrg: envStr("SWARMBOTY_INFLUXDB_ORG"),
		influxBucket: envStr("SWARMBOTY_INFLUXDB_BUCKET"),
		agentUrl: envStr("SWARMBOTY_AGENT_URL"),
		workDir: envStr("SWARMBOTY_WORK_DIR") ?? defaults.workDir,
		instanceName: envStr("SWARMBOTY_INSTANCE_NAME"),
		apiTokenExpiryDays: envInt("SWARMBOTY_API_TOKEN_EXPIRY_DAYS"),
		port,
		mock: envBool("SWARMBOTY_MOCK") ?? defaults.mock,
	};
}
