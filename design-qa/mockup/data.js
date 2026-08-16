/* ============================================================
   SwarmBot — mock data
   ============================================================ */

const STATUS_OPTS = {
  RUNNING:    { label: "Running",   variant: "success" },
  HEALTHY:    { label: "Healthy",   variant: "success" },
  STARTING:   { label: "Starting",  variant: "info" },
  UPDATING:   { label: "Updating",  variant: "info" },
  PENDING:    { label: "Pending",   variant: "warning" },
  PAUSED:     { label: "Paused",    variant: "neutral" },
  FAILED:     { label: "Failed",    variant: "danger" },
  REJECTED:   { label: "Rejected",  variant: "danger" },
  COMPLETE:   { label: "Complete",  variant: "info" },
  SHUTDOWN:   { label: "Shutdown",  variant: "neutral" },
};

const NODES = [
  { id: "n1", host: "swarm-mgr-01",  ip: "10.0.4.11", docker: "26.1.3", role: "manager", tags: ["LEADER","MANAGER","READY","ACTIVE"],  cpu: 38, mem: 52, disk: 41 },
  { id: "n2", host: "swarm-mgr-02",  ip: "10.0.4.12", docker: "26.1.3", role: "manager", tags: ["REACHABLE","MANAGER","READY","ACTIVE"], cpu: 22, mem: 47, disk: 38 },
  { id: "n3", host: "swarm-mgr-03",  ip: "10.0.4.13", docker: "26.1.3", role: "manager", tags: ["REACHABLE","MANAGER","READY","ACTIVE"], cpu: 19, mem: 44, disk: 36 },
  { id: "n4", host: "swarm-wk-01",   ip: "10.0.4.21", docker: "26.1.3", role: "worker",  tags: ["WORKER","READY","ACTIVE"], cpu: 68, mem: 71, disk: 54 },
  { id: "n5", host: "swarm-wk-02",   ip: "10.0.4.22", docker: "26.1.3", role: "worker",  tags: ["WORKER","READY","ACTIVE"], cpu: 54, mem: 63, disk: 49 },
  { id: "n6", host: "swarm-wk-03",   ip: "10.0.4.23", docker: "26.1.3", role: "worker",  tags: ["WORKER","READY","ACTIVE"], cpu: 81, mem: 78, disk: 62 },
  { id: "n7", host: "swarm-wk-04",   ip: "10.0.4.24", docker: "26.1.3", role: "worker",  tags: ["WORKER","READY","ACTIVE"], cpu: 47, mem: 58, disk: 51 },
  { id: "n8", host: "swarm-wk-05",   ip: "10.0.4.25", docker: "26.0.2", role: "worker",  tags: ["WORKER","DRAIN"], cpu: 8, mem: 12, disk: 44 },
];

const STACKS = [
  { name: "frontend",      services: 4, networks: 2, volumes: 1, configs: 3, secrets: 2, status: "RUNNING" },
  { name: "api-gateway",   services: 3, networks: 2, volumes: 0, configs: 2, secrets: 4, status: "RUNNING" },
  { name: "monitoring",    services: 5, networks: 1, volumes: 3, configs: 4, secrets: 1, status: "RUNNING" },
  { name: "databases",     services: 4, networks: 1, volumes: 6, configs: 2, secrets: 5, status: "HEALTHY" },
  { name: "messaging",     services: 2, networks: 1, volumes: 2, configs: 1, secrets: 2, status: "RUNNING" },
  { name: "logging",       services: 3, networks: 1, volumes: 4, configs: 2, secrets: 1, status: "UPDATING" },
  { name: "auth",          services: 2, networks: 1, volumes: 1, configs: 1, secrets: 3, status: "RUNNING" },
  { name: "billing",       services: 3, networks: 1, volumes: 1, configs: 2, secrets: 3, status: "STARTING" },
  { name: "analytics",     services: 4, networks: 2, volumes: 2, configs: 2, secrets: 1, status: "RUNNING" },
  { name: "search",        services: 2, networks: 1, volumes: 2, configs: 1, secrets: 1, status: "PENDING" },
  { name: "media-proc",    services: 3, networks: 1, volumes: 3, configs: 1, secrets: 1, status: "FAILED" },
  { name: "edge-cdn",      services: 2, networks: 2, volumes: 0, configs: 3, secrets: 2, status: "RUNNING" },
];

const SERVICES = [
  { name: "frontend_nginx",       image: "nginx:1.27-alpine",                      replicas: [3,3], ports: ["80→8080","443→8443"], status: "RUNNING",  stack: "frontend" },
  { name: "frontend_app",         image: "ghcr.io/swarmbot/web:2.14.0",            replicas: [4,4], ports: ["3000→3000"],          status: "RUNNING",  stack: "frontend" },
  { name: "api-gateway_traefik",  image: "traefik:v3.0",                           replicas: [2,2], ports: ["80→80","443→443"],  status: "RUNNING",  stack: "api-gateway" },
  { name: "api-gateway_auth",     image: "ghcr.io/swarmbot/auth:1.8.3",            replicas: [2,2], ports: ["8000→8000"],          status: "RUNNING",  stack: "auth" },
  { name: "databases_postgres",   image: "postgres:16.3-alpine",                   replicas: [1,1], ports: ["5432→5432"],          status: "HEALTHY",  stack: "databases" },
  { name: "databases_postgres-replica", image: "postgres:16.3-alpine",             replicas: [2,2], ports: ["—"],                 status: "HEALTHY",  stack: "databases" },
  { name: "databases_redis",      image: "redis:7.2-alpine",                       replicas: [3,3], ports: ["6379→6379"],          status: "RUNNING",  stack: "databases" },
  { name: "messaging_rabbitmq",   image: "rabbitmq:3.13-management",               replicas: [3,3], ports: ["5672→5672","15672→15672"], status: "RUNNING", stack: "messaging" },
  { name: "monitoring_prometheus", image: "prom/prometheus:v2.52.0",               replicas: [1,1], ports: ["9090→9090"],          status: "RUNNING",  stack: "monitoring" },
  { name: "monitoring_grafana",   image: "grafana/grafana:11.0.0",                 replicas: [1,1], ports: ["3000→3001"],          status: "RUNNING",  stack: "monitoring" },
  { name: "monitoring_node-exp",  image: "prom/node-exporter:v1.8.1",              replicas: [8,8], ports: ["9100→9100"],          status: "RUNNING",  stack: "monitoring" },
  { name: "monitoring_alertmgr",  image: "prom/alertmanager:v0.27.0",              replicas: [1,1], ports: ["9093→9093"],          status: "RUNNING",  stack: "monitoring" },
  { name: "logging_loki",         image: "grafana/loki:3.0.0",                     replicas: [1,1], ports: ["3100→3100"],          status: "UPDATING", stack: "logging" },
  { name: "logging_promtail",     image: "grafana/promtail:3.0.0",                 replicas: [8,8], ports: ["—"],                 status: "RUNNING",  stack: "logging" },
  { name: "search_elasticsearch", image: "elasticsearch:8.13.4",                   replicas: [3,3], ports: ["9200→9200"],          status: "PENDING",  stack: "search" },
  { name: "analytics_clickhouse", image: "clickhouse/clickhouse-server:24.4",      replicas: [2,2], ports: ["8123→8123"],          status: "RUNNING",  stack: "analytics" },
  { name: "billing_worker",       image: "ghcr.io/swarmbot/billing:1.2.0",         replicas: [1,3], ports: ["—"],                 status: "STARTING", stack: "billing" },
  { name: "media-proc_ffmpeg",    image: "ghcr.io/swarmbot/transcoder:0.9.1",      replicas: [0,2], ports: ["—"],                 status: "FAILED",   stack: "media-proc" },
  { name: "edge-cdn_varnish",     image: "varnish:7.5",                            replicas: [4,4], ports: ["6081→80"],            status: "RUNNING",  stack: "edge-cdn" },
];

function makeTasks() {
  const tasks = [];
  const nodes = NODES.filter(n => !n.tags.includes("DRAIN"));
  let id = 1;
  for (const s of SERVICES) {
    for (let i = 0; i < s.replicas[1]; i++) {
      const node = nodes[(id + i) % nodes.length];
      const running = i < s.replicas[0];
      const stat = running ? s.status : (s.status === "FAILED" ? "FAILED" : "PENDING");
      tasks.push({
        id: `${s.name}.${i+1}.${(id*7919+i*131).toString(36).slice(-8)}`,
        name: `${s.name}.${i+1}`,
        image: s.image,
        node: node.host,
        cpu: running ? 4 + Math.floor(Math.random()*82) : 0,
        mem: running ? 12 + Math.floor(Math.random()*68) : 0,
        updated: ["2 min ago","14 min ago","1 h ago","3 h ago","5 h ago","yesterday","2 days ago","1 week ago"][id % 8],
        status: stat,
      });
      id++;
    }
  }
  return tasks;
}
const TASKS = makeTasks();

const NETWORKS = [
  { name: "ingress",           driver: "overlay", subnet: "10.0.0.0/24",  gateway: "10.0.0.1",  scope: "swarm" },
  { name: "docker_gwbridge",   driver: "bridge",  subnet: "172.18.0.0/16", gateway: "172.18.0.1", scope: "local" },
  { name: "frontend_default",  driver: "overlay", subnet: "10.0.1.0/24",  gateway: "10.0.1.1",  scope: "swarm" },
  { name: "frontend_public",   driver: "overlay", subnet: "10.0.2.0/24",  gateway: "10.0.2.1",  scope: "swarm" },
  { name: "api_internal",      driver: "overlay", subnet: "10.0.3.0/24",  gateway: "10.0.3.1",  scope: "swarm" },
  { name: "databases_data",    driver: "overlay", subnet: "10.0.5.0/24",  gateway: "10.0.5.1",  scope: "swarm" },
  { name: "monitoring_net",    driver: "overlay", subnet: "10.0.6.0/24",  gateway: "10.0.6.1",  scope: "swarm" },
  { name: "logging_net",       driver: "overlay", subnet: "10.0.7.0/24",  gateway: "10.0.7.1",  scope: "swarm" },
  { name: "messaging_bus",     driver: "overlay", subnet: "10.0.8.0/24",  gateway: "10.0.8.1",  scope: "swarm" },
  { name: "auth_net",          driver: "overlay", subnet: "10.0.9.0/24",  gateway: "10.0.9.1",  scope: "swarm" },
  { name: "analytics_net",     driver: "overlay", subnet: "10.0.10.0/24", gateway: "10.0.10.1", scope: "swarm" },
];

const VOLUMES = [
  { name: "postgres-primary-data",  driver: "local",   size: "182 GB" },
  { name: "postgres-replica-1-data", driver: "local",  size: "178 GB" },
  { name: "postgres-replica-2-data", driver: "local",  size: "178 GB" },
  { name: "redis-data",              driver: "local",  size: "12 GB" },
  { name: "rabbitmq-data",           driver: "local",  size: "4 GB" },
  { name: "rabbitmq-mnesia",         driver: "local",  size: "1 GB" },
  { name: "loki-storage",            driver: "s3",     size: "640 GB" },
  { name: "loki-chunks",             driver: "local",  size: "84 GB" },
  { name: "prometheus-data",         driver: "local",  size: "92 GB" },
  { name: "grafana-data",            driver: "local",  size: "2 GB" },
  { name: "elasticsearch-1",         driver: "local",  size: "146 GB" },
  { name: "elasticsearch-2",         driver: "local",  size: "146 GB" },
  { name: "elasticsearch-3",         driver: "local",  size: "146 GB" },
  { name: "clickhouse-shard-1",      driver: "local",  size: "412 GB" },
  { name: "clickhouse-shard-2",      driver: "local",  size: "408 GB" },
  { name: "media-uploads",           driver: "nfs",    size: "1.2 TB" },
  { name: "media-cache",             driver: "local",  size: "64 GB" },
];

const SECRETS = [
  { name: "postgres_password",          created: "2025-09-12", updated: "2025-11-04" },
  { name: "postgres_replication_token", created: "2025-09-12", updated: "2025-09-12" },
  { name: "jwt_signing_key",            created: "2025-04-22", updated: "2026-02-18" },
  { name: "stripe_secret_key",          created: "2025-07-30", updated: "2026-01-15" },
  { name: "smtp_password",              created: "2025-06-11", updated: "2025-12-02" },
  { name: "github_deploy_token",        created: "2025-10-08", updated: "2026-03-22" },
  { name: "grafana_admin_password",     created: "2025-04-22", updated: "2025-04-22" },
  { name: "redis_acl_users",            created: "2025-11-29", updated: "2026-02-04" },
  { name: "rabbitmq_definitions",       created: "2025-08-15", updated: "2026-04-10" },
  { name: "tls_wildcard_cert",          created: "2025-10-01", updated: "2026-04-01" },
  { name: "tls_wildcard_key",           created: "2025-10-01", updated: "2026-04-01" },
];

const CONFIGS = [
  { name: "nginx_default_conf",     created: "2025-03-04", updated: "2026-02-12" },
  { name: "traefik_static_yaml",    created: "2025-03-04", updated: "2026-03-08" },
  { name: "traefik_dynamic_yaml",   created: "2025-03-04", updated: "2026-04-22" },
  { name: "prometheus_yml",         created: "2025-04-22", updated: "2026-04-30" },
  { name: "alertmanager_yml",       created: "2025-04-22", updated: "2026-03-19" },
  { name: "loki_config_yml",        created: "2025-05-10", updated: "2026-02-28" },
  { name: "promtail_config_yml",    created: "2025-05-10", updated: "2025-12-14" },
  { name: "grafana_datasources",    created: "2025-04-22", updated: "2026-04-30" },
  { name: "redis_conf",             created: "2025-06-01", updated: "2025-11-21" },
  { name: "postgres_pg_hba",        created: "2025-09-12", updated: "2026-01-04" },
];

const REGISTRIES = [
  { name: "GitHub Container Registry", url: "ghcr.io/swarmbot",        type: "GHCR",        user: "deploy-bot",   default: true },
  { name: "Docker Hub",                url: "registry-1.docker.io",     type: "Docker Hub", user: "swarmbot-ci",  default: false },
  { name: "AWS ECR (us-east-1)",       url: "1234.dkr.ecr.us-east-1.amazonaws.com", type: "ECR", user: "ecr-token", default: false },
  { name: "Internal Harbor",           url: "harbor.internal.swarmbot.io", type: "Harbor",  user: "harbor-svc",   default: false },
  { name: "Quay.io",                   url: "quay.io/swarmbot",         type: "Quay",        user: "quay-robot",   default: false },
];

const USERS = [
  { name: "Aleksandra Nowak",   email: "a.nowak@swarmbot.io",   phone: "+48 601 234 567", role: "Administrator", created: "2024-11-12", lastLogin: "2 min ago" },
  { name: "Marcin Kowalski",    email: "m.kowalski@swarmbot.io", phone: "+48 602 345 678", role: "Editor",        created: "2025-01-08", lastLogin: "14 min ago" },
  { name: "Julia Wiśniewska",   email: "j.wisniewska@swarmbot.io", phone: "+48 603 456 789", role: "Editor",      created: "2025-02-23", lastLogin: "1 h ago" },
  { name: "Tomasz Lewandowski", email: "t.lewandowski@swarmbot.io", phone: "+48 604 567 890", role: "Read-only", created: "2025-03-14", lastLogin: "3 h ago" },
  { name: "Karolina Wójcik",    email: "k.wojcik@swarmbot.io",  phone: "+48 605 678 901", role: "Administrator", created: "2025-04-02", lastLogin: "5 h ago" },
  { name: "Piotr Kamiński",     email: "p.kaminski@swarmbot.io", phone: "+48 606 789 012", role: "Editor",        created: "2025-05-19", lastLogin: "yesterday" },
  { name: "Magdalena Zielińska", email: "m.zielinska@swarmbot.io", phone: "", role: "Read-only", created: "2025-06-30", lastLogin: "2 days ago" },
  { name: "Bartłomiej Szymański", email: "b.szymanski@swarmbot.io", phone: "+48 608 901 234", role: "Editor",     created: "2025-08-11", lastLogin: "1 week ago" },
  { name: "Aneta Dąbrowska",    email: "a.dabrowska@swarmbot.io", phone: "+48 609 012 345", role: "Read-only",  created: "2025-10-24", lastLogin: "2 weeks ago" },
  { name: "Jakub Mazur",        email: "j.mazur@swarmbot.io",  phone: "", role: "Read-only",   created: "2026-01-15", lastLogin: "never" },
];

/* Time-series generator for the dashboard histogram.
   Deterministic-ish, smooth waves for CPU/Mem/Disk.                */
function genSeries(points, base, ampl, phase = 0, jitter = 4) {
  const out = [];
  let v = base;
  for (let i = 0; i < points; i++) {
    const wave = Math.sin((i / points) * Math.PI * 4 + phase) * ampl;
    const jit = (Math.sin(i * 13.13 + phase * 7) * 0.5 + Math.cos(i * 7.7) * 0.5) * jitter;
    v = Math.max(2, Math.min(98, base + wave + jit));
    out.push(Math.round(v * 10) / 10);
  }
  return out;
}

const TIME_SERIES = {
  "15m": {
    points: 30,
    labels: Array.from({length: 30}, (_, i) => `${30-i}m`),
    cpu:  genSeries(30, 46, 18, 0.3, 5),
    mem:  genSeries(30, 58, 8,  1.2, 3),
    disk: genSeries(30, 47, 2,  2.0, 1),
  },
  "1h": {
    points: 60,
    labels: Array.from({length: 60}, (_, i) => `${60-i}m`),
    cpu:  genSeries(60, 44, 22, 0.6, 6),
    mem:  genSeries(60, 56, 12, 1.5, 4),
    disk: genSeries(60, 46, 4,  2.1, 1),
  },
  "6h": {
    points: 72,
    labels: Array.from({length: 72}, (_, i) => `${(72-i)*5}m`),
    cpu:  genSeries(72, 42, 28, 0.9, 8),
    mem:  genSeries(72, 54, 16, 1.8, 5),
    disk: genSeries(72, 44, 6,  2.2, 1),
  },
  "24h": {
    points: 96,
    labels: Array.from({length: 96}, (_, i) => `${Math.floor((96-i)/4)}h`),
    cpu:  genSeries(96, 40, 32, 1.2, 10),
    mem:  genSeries(96, 52, 20, 2.1, 6),
    disk: genSeries(96, 42, 8,  2.3, 1),
  },
};

/* Per-node histories (used in Nodes tiles) — 32 points */
const NODE_HISTORIES = Object.fromEntries(NODES.map((n, i) => [n.id, {
  cpu:  genSeries(32, n.cpu,  16, i*0.7 + 0.3, 6),
  mem:  genSeries(32, n.mem,  10, i*0.9 + 0.6, 4),
  disk: genSeries(32, n.disk,  3, i*1.1 + 0.9, 1),
}]));

/* Per-task short sparklines */
function genTaskSpark(base) {
  return genSeries(16, base, base * 0.25, Math.random()*6, base * 0.12);
}
const TASK_HISTORIES = Object.fromEntries(TASKS.map(t => [t.id, {
  cpu: genTaskSpark(t.cpu || 8),
  mem: genTaskSpark(t.mem || 14),
}]));

/* Cluster aggregates for dashboard tiles */
const CLUSTER = (() => {
  const active = NODES.filter(n => !n.tags.includes("DRAIN"));
  const avg = (k) => Math.round(active.reduce((a,n)=>a+n[k],0) / active.length);
  return {
    cpu: avg("cpu"),
    mem: avg("mem"),
    disk: avg("disk"),
    cpuCores: 96, cpuUsed: Math.round(96 * avg("cpu") / 100),
    memTotal: "384 GB", memUsed: `${Math.round(384 * avg("mem") / 100)} GB`,
    diskTotal: "12 TB", diskUsed: `${(12 * avg("disk") / 100).toFixed(1)} TB`,
  };
})();

/* Per-stack resource aggregates and histories */
function genStackResources() {
  const stackMap = {};
  for (const s of STACKS) {
    const base = {
      "frontend":   { cpu: 38, mem: 42, disk: 28 },
      "api-gateway":{ cpu: 31, mem: 36, disk: 18 },
      "monitoring": { cpu: 52, mem: 64, disk: 71 },
      "databases":  { cpu: 64, mem: 78, disk: 86 },
      "messaging":  { cpu: 28, mem: 44, disk: 22 },
      "logging":    { cpu: 47, mem: 58, disk: 68 },
      "auth":       { cpu: 22, mem: 31, disk: 12 },
      "billing":    { cpu: 18, mem: 26, disk: 14 },
      "analytics":  { cpu: 71, mem: 82, disk: 78 },
      "search":     { cpu: 12, mem: 18, disk: 8 },
      "media-proc": { cpu: 4,  mem: 6,  disk: 32 },
      "edge-cdn":   { cpu: 24, mem: 28, disk: 16 },
    }[s.name] || { cpu: 30, mem: 40, disk: 30 };
    stackMap[s.name] = {
      ...base,
      history: {
        cpu:  genSeries(48, base.cpu,  Math.max(6, base.cpu * 0.3),  s.name.length, 4),
        mem:  genSeries(48, base.mem,  Math.max(4, base.mem * 0.2),  s.name.length + 1, 3),
        disk: genSeries(48, base.disk, 3, s.name.length + 2, 1),
      },
    };
  }
  return stackMap;
}
const STACK_METRICS = genStackResources();

/* Stack association heuristics — map stack name → arrays of secrets/configs/networks/volumes */
function getStackResources(stackName) {
  const matchByPrefix = (list, fld = "name") => list.filter(x => {
    const n = x[fld].toLowerCase();
    return n.startsWith(stackName.toLowerCase() + "_") ||
           n.startsWith(stackName.toLowerCase() + "-");
  });

  const PRODUCT_MAP = {
    "databases":  ["postgres", "redis"],
    "messaging":  ["rabbitmq"],
    "logging":    ["loki", "promtail"],
    "monitoring": ["prometheus", "grafana", "alertmanager", "node-exporter", "node-exp"],
    "search":     ["elasticsearch"],
    "analytics":  ["clickhouse"],
    "media-proc": ["media", "ffmpeg"],
    "auth":       ["jwt", "auth"],
    "billing":    ["stripe", "billing"],
    "api-gateway":["traefik"],
    "frontend":   ["nginx"],
    "edge-cdn":   ["varnish"],
  };
  const matchByProduct = (list, fld = "name") => {
    const keys = PRODUCT_MAP[stackName] || [];
    return list.filter(x => keys.some(k => x[fld].toLowerCase().includes(k)));
  };

  const services = SERVICES.filter(s => s.stack === stackName);
  const networks = matchByPrefix(NETWORKS);
  // Volumes — combine prefix match and product-keyword match, dedupe
  const volSet = new Map();
  [...matchByPrefix(VOLUMES), ...matchByProduct(VOLUMES)].forEach(v => volSet.set(v.name, v));
  const volumes = Array.from(volSet.values());
  const secSet = new Map();
  [...matchByPrefix(SECRETS), ...matchByProduct(SECRETS)].forEach(v => secSet.set(v.name, v));
  const secrets = Array.from(secSet.values());
  const cfgSet = new Map();
  [...matchByPrefix(CONFIGS), ...matchByProduct(CONFIGS)].forEach(v => cfgSet.set(v.name, v));
  const configs = Array.from(cfgSet.values());

  return { services, networks, volumes, secrets, configs };
}

window.SBData = {
  STATUS_OPTS,
  NODES, STACKS, SERVICES, TASKS, NETWORKS, VOLUMES,
  SECRETS, CONFIGS, REGISTRIES, USERS,
  TIME_SERIES, NODE_HISTORIES, TASK_HISTORIES, CLUSTER,
  STACK_METRICS, getStackResources,
};
