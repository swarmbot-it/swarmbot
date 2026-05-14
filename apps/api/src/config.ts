/** Swarmpit-compatible env (SWARMBOT_ prefix). */

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
  dbUrl: string;
  influxdbUrl: string | undefined;
  agentUrl: string | undefined;
  workDir: string;
  instanceName: string | undefined;
  apiTokenExpiryDays: number | undefined;
  port: number;
};

const defaults: SwarmbotConfig = {
  dockerSock: "/var/run/docker.sock",
  dockerApi: "1.44",
  dockerHttpTimeoutMs: 5000,
  logLevel: "info",
  dbUrl: "http://localhost:5984",
  influxdbUrl: undefined,
  agentUrl: undefined,
  workDir: "/tmp",
  instanceName: undefined,
  apiTokenExpiryDays: undefined,
  port: 8080,
};

let dynamicDockerApi: string | undefined;

export function setNegotiatedDockerApi(version: string): void {
  dynamicDockerApi = version;
}

export function resolvedDockerApi(fallback: string): string {
  return (
    dynamicDockerApi ??
    envStr("SWARMPIT_DOCKER_API") ??
    envStr("SWARMBOT_DOCKER_API") ??
    fallback
  );
}

export function loadConfig(): SwarmbotConfig {
  const port = envInt("SWARMBOT_PORT") ?? envInt("PORT") ?? defaults.port;
  return {
    dockerSock: envStr("SWARMPIT_DOCKER_SOCK") ?? envStr("SWARMBOT_DOCKER_SOCK") ?? defaults.dockerSock,
    dockerApi: resolvedDockerApi(defaults.dockerApi),
    dockerHttpTimeoutMs:
      envInt("SWARMPIT_DOCKER_HTTP_TIMEOUT") ??
      envInt("SWARMBOT_DOCKER_HTTP_TIMEOUT") ??
      defaults.dockerHttpTimeoutMs,
    logLevel:
      envStr("SWARMPIT_LOG_LEVEL") ?? envStr("SWARMBOT_LOG_LEVEL") ?? defaults.logLevel,
    dbUrl: envStr("SWARMPIT_DB") ?? envStr("SWARMBOT_DB") ?? defaults.dbUrl,
    influxdbUrl: envStr("SWARMPIT_INFLUXDB") ?? envStr("SWARMBOT_INFLUXDB"),
    agentUrl: envStr("SWARMPIT_AGENT_URL") ?? envStr("SWARMBOT_AGENT_URL"),
    workDir: envStr("SWARMPIT_WORKDIR") ?? envStr("SWARMBOT_WORK_DIR") ?? defaults.workDir,
    instanceName:
      envStr("SWARMPIT_INSTANCE_NAME") ?? envStr("SWARMBOT_INSTANCE_NAME"),
    apiTokenExpiryDays:
      envInt("SWARMPIT_API_TOKEN_EXPIRY_DAYS") ??
      envInt("SWARMBOT_API_TOKEN_EXPIRY_DAYS"),
    port,
  };
}
