import type Dockerode from "dockerode";

/**
 * Mock Docker Swarm engine.
 *
 * Returns a Dockerode-shaped object so the rest of the API code stays
 * unchanged. The data is intentionally rich so the admin UI can be
 * demoed end-to-end without a real Swarm cluster.
 */

type MockService = {
	ID: string;
	Spec: {
		Name: string;
		Labels?: Record<string, string>;
		TaskTemplate: { ContainerSpec: { Image: string } };
		Mode: { Replicated?: { Replicas: number }; Global?: object };
		EndpointSpec?: {
			Ports?: Array<{
				TargetPort: number;
				PublishedPort: number;
				Protocol?: string;
			}>;
		};
	};
};

type MockNode = {
	ID: string;
	Description: { Hostname: string; Engine?: { EngineVersion?: string } };
	Status: { Addr?: string; State?: string };
	Spec: { Role: string; Availability: string };
	ManagerStatus?: { Leader?: boolean; Reachability?: string };
};

type MockTask = {
	ID: string;
	ServiceID: string;
	NodeID: string;
	Status: {
		State: string;
		Timestamp: string;
		ContainerStatus?: { ContainerID?: string };
	};
	DesiredState: string;
	Slot: number;
};

type MockNetwork = {
	Id: string;
	Name: string;
	Driver: string;
	Scope: string;
	Attachable?: boolean;
	Internal?: boolean;
	Ingress?: boolean;
	Labels?: Record<string, string>;
	IPAM?: { Config?: Array<{ Subnet?: string; Gateway?: string }> };
};

type MockVolume = {
	Name: string;
	Driver: string;
	Mountpoint?: string;
	Labels?: Record<string, string>;
	UsageData?: { Size?: number };
};

type Stamped = {
	ID: string;
	CreatedAt: string;
	UpdatedAt: string;
	Spec: { Name: string; Labels?: Record<string, string> };
};

const ISO = (s: string) => new Date(s).toISOString();

const SERVICES: MockService[] = [
	svc("svc_frontend_nginx", "frontend_nginx", "nginx:1.27-alpine", 3, "frontend", [
		{ target: 8080, published: 80 },
		{ target: 8443, published: 443 },
	]),
	svc("svc_frontend_app", "frontend_app", "ghcr.io/swarmboty/web:2.14.0", 4, "frontend", [
		{ target: 3000, published: 3000 },
	]),
	svc("svc_traefik", "api-gateway_traefik", "traefik:v3.0", 2, "api-gateway", [
		{ target: 80, published: 80 },
		{ target: 443, published: 443 },
	]),
	svc("svc_auth", "api-gateway_auth", "ghcr.io/swarmboty/auth:1.8.3", 2, "auth", [
		{ target: 8000, published: 8000 },
	]),
	svc("svc_postgres", "databases_postgres", "postgres:16.3-alpine", 1, "databases", [
		{ target: 5432, published: 5432 },
	]),
	svc(
		"svc_postgres_replica",
		"databases_postgres-replica",
		"postgres:16.3-alpine",
		2,
		"databases",
		[]
	),
	svc("svc_redis", "databases_redis", "redis:7.2-alpine", 3, "databases", [
		{ target: 6379, published: 6379 },
	]),
	svc("svc_rabbit", "messaging_rabbitmq", "rabbitmq:3.13-management", 3, "messaging", [
		{ target: 5672, published: 5672 },
		{ target: 15672, published: 15672 },
	]),
	svc("svc_prom", "monitoring_prometheus", "prom/prometheus:v2.52.0", 1, "monitoring", [
		{ target: 9090, published: 9090 },
	]),
	svc("svc_grafana", "monitoring_grafana", "grafana/grafana:11.0.0", 1, "monitoring", [
		{ target: 3000, published: 3001 },
	]),
	svc("svc_node_exp", "monitoring_node-exp", "prom/node-exporter:v1.8.1", 8, "monitoring", [
		{ target: 9100, published: 9100 },
	]),
	svc("svc_alertmgr", "monitoring_alertmgr", "prom/alertmanager:v0.27.0", 1, "monitoring", [
		{ target: 9093, published: 9093 },
	]),
	svc("svc_loki", "logging_loki", "grafana/loki:3.0.0", 1, "logging", [
		{ target: 3100, published: 3100 },
	]),
	svc("svc_promtail", "logging_promtail", "grafana/promtail:3.0.0", 8, "logging", []),
	svc("svc_es", "search_elasticsearch", "elasticsearch:8.13.4", 3, "search", [
		{ target: 9200, published: 9200 },
	]),
	svc(
		"svc_clickhouse",
		"analytics_clickhouse",
		"clickhouse/clickhouse-server:24.4",
		2,
		"analytics",
		[{ target: 8123, published: 8123 }]
	),
	svc("svc_billing", "billing_worker", "ghcr.io/swarmboty/billing:1.2.0", 3, "billing", []),
	svc(
		"svc_transcoder",
		"media-proc_ffmpeg",
		"ghcr.io/swarmboty/transcoder:0.9.1",
		2,
		"media-proc",
		[]
	),
	svc("svc_varnish", "edge-cdn_varnish", "varnish:7.5", 4, "edge-cdn", [
		{ target: 80, published: 6081 },
	]),
];

function svc(
	id: string,
	name: string,
	image: string,
	replicas: number,
	stack: string,
	ports: Array<{ target: number; published: number; protocol?: string }>
): MockService {
	return {
		ID: id,
		Spec: {
			Name: name,
			Labels: { "com.docker.stack.namespace": stack },
			TaskTemplate: { ContainerSpec: { Image: image } },
			Mode: { Replicated: { Replicas: replicas } },
			EndpointSpec: ports.length
				? {
						Ports: ports.map((p) => ({
							TargetPort: p.target,
							PublishedPort: p.published,
							Protocol: p.protocol ?? "tcp",
						})),
					}
				: undefined,
		},
	};
}

const NODES: MockNode[] = [
	node("n_mgr_1", "swarm-mgr-01", "10.0.4.11", "manager", "active", true),
	node("n_mgr_2", "swarm-mgr-02", "10.0.4.12", "manager", "active", false),
	node("n_mgr_3", "swarm-mgr-03", "10.0.4.13", "manager", "active", false),
	node("n_wk_1", "swarm-wk-01", "10.0.4.21", "worker", "active"),
	node("n_wk_2", "swarm-wk-02", "10.0.4.22", "worker", "active"),
	node("n_wk_3", "swarm-wk-03", "10.0.4.23", "worker", "active"),
	node("n_wk_4", "swarm-wk-04", "10.0.4.24", "worker", "active"),
	node("n_wk_5", "swarm-wk-05", "10.0.4.25", "worker", "drain"),
];

function node(
	id: string,
	hostname: string,
	ip: string,
	role: "manager" | "worker",
	availability: "active" | "drain" | "pause",
	leader = false
): MockNode {
	return {
		ID: id,
		Description: {
			Hostname: hostname,
			Engine: { EngineVersion: "26.1.3" },
		},
		Status: { Addr: ip, State: "ready" },
		Spec: { Role: role, Availability: availability },
		ManagerStatus:
			role === "manager" ? { Leader: leader, Reachability: "reachable" } : undefined,
	};
}

function buildTasks(): MockTask[] {
	const tasks: MockTask[] = [];
	const usableNodes = NODES.filter((n) => n.Spec.Availability !== "drain");
	let counter = 0;
	for (const s of SERVICES) {
		const replicas = s.Spec.Mode.Replicated?.Replicas ?? 1;
		for (let i = 0; i < replicas; i++) {
			counter++;
			const n = usableNodes[(counter + i) % usableNodes.length]!;
			tasks.push({
				ID: `${s.Spec.Name}.${i + 1}.${(counter * 7919 + i).toString(36).slice(-8)}`,
				ServiceID: s.ID,
				NodeID: n.ID,
				DesiredState: "running",
				Slot: i + 1,
				Status: {
					State: "running",
					Timestamp: new Date(Date.now() - (counter % 8) * 3600_000).toISOString(),
					ContainerStatus: { ContainerID: `c_${s.ID}_${i + 1}` },
				},
			});
		}
	}
	return tasks;
}
const TASKS = buildTasks();

const NETWORKS: MockNetwork[] = [
	net("net_ingress", "ingress", "overlay", "swarm", "10.0.0.0/24", "10.0.0.1", { ingress: true }),
	net("net_gw", "docker_gwbridge", "bridge", "local", "172.18.0.0/16", "172.18.0.1"),
	net("net_fe_def", "frontend_default", "overlay", "swarm", "10.0.1.0/24", "10.0.1.1", {
		attachable: true,
		stack: "frontend",
	}),
	net("net_fe_pub", "frontend_public", "overlay", "swarm", "10.0.2.0/24", "10.0.2.1", {
		stack: "frontend",
	}),
	net("net_api_int", "api_internal", "overlay", "swarm", "10.0.3.0/24", "10.0.3.1", {
		internal: true,
		stack: "api-gateway",
	}),
	net("net_db", "databases_data", "overlay", "swarm", "10.0.5.0/24", "10.0.5.1", {
		stack: "databases",
	}),
	net("net_mon", "monitoring_net", "overlay", "swarm", "10.0.6.0/24", "10.0.6.1", {
		stack: "monitoring",
	}),
	net("net_log", "logging_net", "overlay", "swarm", "10.0.7.0/24", "10.0.7.1", { stack: "logging" }),
	net("net_msg", "messaging_bus", "overlay", "swarm", "10.0.8.0/24", "10.0.8.1", {
		stack: "messaging",
	}),
	net("net_auth", "auth_net", "overlay", "swarm", "10.0.9.0/24", "10.0.9.1", { stack: "auth" }),
	net("net_ana", "analytics_net", "overlay", "swarm", "10.0.10.0/24", "10.0.10.1", {
		stack: "analytics",
	}),
];

function net(
	id: string,
	name: string,
	driver: string,
	scope: string,
	subnet: string,
	gateway: string,
	flags: { attachable?: boolean; internal?: boolean; ingress?: boolean; stack?: string } = {}
): MockNetwork {
	return {
		Id: id,
		Name: name,
		Driver: driver,
		Scope: scope,
		Attachable: flags.attachable ?? false,
		Internal: flags.internal ?? false,
		Ingress: flags.ingress ?? false,
		Labels: flags.stack ? { "com.docker.stack.namespace": flags.stack } : undefined,
		IPAM: { Config: [{ Subnet: subnet, Gateway: gateway }] },
	};
}

const VOLUMES: MockVolume[] = [
	vol("postgres-primary-data", "local", 182 * 1e9, "databases"),
	vol("postgres-replica-1-data", "local", 178 * 1e9, "databases"),
	vol("postgres-replica-2-data", "local", 178 * 1e9, "databases"),
	vol("redis-data", "local", 12 * 1e9, "databases"),
	vol("rabbitmq-data", "local", 4 * 1e9, "messaging"),
	vol("rabbitmq-mnesia", "local", 1 * 1e9, "messaging"),
	vol("loki-storage", "s3", 640 * 1e9, "logging"),
	vol("loki-chunks", "local", 84 * 1e9, "logging"),
	vol("prometheus-data", "local", 92 * 1e9, "monitoring"),
	vol("grafana-data", "local", 2 * 1e9, "monitoring"),
	vol("elasticsearch-1", "local", 146 * 1e9, "search"),
	vol("elasticsearch-2", "local", 146 * 1e9, "search"),
	vol("elasticsearch-3", "local", 146 * 1e9, "search"),
	vol("clickhouse-shard-1", "local", 412 * 1e9, "analytics"),
	vol("clickhouse-shard-2", "local", 408 * 1e9, "analytics"),
	vol("media-uploads", "nfs", 1.2 * 1e12, "media-proc"),
	vol("media-cache", "local", 64 * 1e9, "media-proc"),
];

function vol(name: string, driver: string, size: number, stack?: string): MockVolume {
	return {
		Name: name,
		Driver: driver,
		Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
		Labels: stack ? { "com.docker.stack.namespace": stack } : undefined,
		UsageData: { Size: size },
	};
}

const SECRETS: Stamped[] = [
	stamped("sec_pg_pwd", "postgres_password", "2025-09-12T10:00:00Z", "2025-11-04T08:32:00Z", "databases"),
	stamped(
		"sec_pg_repl",
		"postgres_replication_token",
		"2025-09-12T10:00:00Z",
		"2025-09-12T10:00:00Z",
		"databases"
	),
	stamped("sec_jwt", "jwt_signing_key", "2025-04-22T09:12:00Z", "2026-02-18T16:04:00Z", "auth"),
	stamped("sec_stripe", "stripe_secret_key", "2025-07-30T11:24:00Z", "2026-01-15T13:42:00Z", "billing"),
	stamped("sec_smtp", "smtp_password", "2025-06-11T15:00:00Z", "2025-12-02T09:15:00Z"),
	stamped("sec_gh", "github_deploy_token", "2025-10-08T08:08:00Z", "2026-03-22T11:11:00Z"),
	stamped(
		"sec_grafana",
		"grafana_admin_password",
		"2025-04-22T09:12:00Z",
		"2025-04-22T09:12:00Z",
		"monitoring"
	),
	stamped("sec_redis_acl", "redis_acl_users", "2025-11-29T17:00:00Z", "2026-02-04T13:00:00Z", "databases"),
	stamped("sec_rmq_def", "rabbitmq_definitions", "2025-08-15T07:30:00Z", "2026-04-10T18:00:00Z", "messaging"),
	stamped("sec_tls_crt", "tls_wildcard_cert", "2025-10-01T00:00:00Z", "2026-04-01T00:00:00Z", "api-gateway"),
	stamped("sec_tls_key", "tls_wildcard_key", "2025-10-01T00:00:00Z", "2026-04-01T00:00:00Z", "api-gateway"),
];

const CONFIGS: Stamped[] = [
	stamped("cfg_nginx", "nginx_default_conf", "2025-03-04T08:00:00Z", "2026-02-12T16:30:00Z", "frontend"),
	stamped("cfg_traefik_s", "traefik_static_yaml", "2025-03-04T08:00:00Z", "2026-03-08T13:11:00Z", "api-gateway"),
	stamped(
		"cfg_traefik_d",
		"traefik_dynamic_yaml",
		"2025-03-04T08:00:00Z",
		"2026-04-22T10:00:00Z",
		"api-gateway"
	),
	stamped("cfg_prom", "prometheus_yml", "2025-04-22T09:00:00Z", "2026-04-30T18:42:00Z", "monitoring"),
	stamped("cfg_alert", "alertmanager_yml", "2025-04-22T09:00:00Z", "2026-03-19T11:08:00Z", "monitoring"),
	stamped("cfg_loki", "loki_config_yml", "2025-05-10T11:30:00Z", "2026-02-28T14:00:00Z", "logging"),
	stamped("cfg_promtail", "promtail_config_yml", "2025-05-10T11:30:00Z", "2025-12-14T07:00:00Z", "logging"),
	stamped(
		"cfg_grafana_ds",
		"grafana_datasources",
		"2025-04-22T09:00:00Z",
		"2026-04-30T18:42:00Z",
		"monitoring"
	),
	stamped("cfg_redis", "redis_conf", "2025-06-01T10:00:00Z", "2025-11-21T14:00:00Z", "databases"),
	stamped("cfg_pg_hba", "postgres_pg_hba", "2025-09-12T10:00:00Z", "2026-01-04T08:00:00Z", "databases"),
];

function stamped(id: string, name: string, created: string, updated: string, stack?: string): Stamped {
	return {
		ID: id,
		CreatedAt: ISO(created),
		UpdatedAt: ISO(updated),
		Spec: { Name: name, Labels: stack ? { "com.docker.stack.namespace": stack } : undefined },
	};
}

const LOG_SAMPLE =
	"2026-05-16T08:00:01.123Z stdout starting nginx...\n" +
	"2026-05-16T08:00:01.420Z stdout listening on 0.0.0.0:80\n" +
	"2026-05-16T08:00:14.901Z stdout 200 GET / 1.2ms\n" +
	"2026-05-16T08:00:23.502Z stdout 200 GET /favicon.ico 0.8ms\n" +
	"2026-05-16T08:00:42.118Z stdout 200 GET / 1.1ms\n";

export function createMockDocker(): Dockerode {
	const mock = {
		version: async () => ({ ApiVersion: "1.45" }),
		listServices: async () => SERVICES,
		listNodes: async () => NODES,
		listTasks: async (_opts?: unknown) => TASKS,
		listNetworks: async () => NETWORKS,
		listVolumes: async () => ({ Volumes: VOLUMES, Warnings: null }),
		listSecrets: async () => SECRETS,
		listConfigs: async () => CONFIGS,
		getContainer: (_id: string) => ({
			logs: async (_opts?: unknown) => Buffer.from(LOG_SAMPLE, "utf8"),
		}),
	};
	return mock as unknown as Dockerode;
}
