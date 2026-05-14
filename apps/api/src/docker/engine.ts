import Dockerode from "dockerode";
import type { SwarmbotConfig } from "../config.js";
import { setNegotiatedDockerApi } from "../config.js";

export type DockerCtx = {
  docker: Dockerode;
  cfg: SwarmbotConfig;
};

export function createDocker(cfg: SwarmbotConfig): Dockerode {
  const socketPath = cfg.dockerSock;
  if (socketPath.startsWith("http://") || socketPath.startsWith("https://")) {
    const u = new URL(socketPath);
    const protocol: "http" | "https" = u.protocol === "https:" ? "https" : "http";
    const port = u.port ? parseInt(u.port, 10) : protocol === "https" ? 443 : 80;
    return new Dockerode({ host: u.hostname, port, protocol });
  }
  return new Dockerode({ socketPath });
}

export function negotiateApiVersion(daemonMax: string | undefined, ourMax = "1.44"): string {
  const parse = (s: string | undefined) => (s ? parseFloat(s) : undefined);
  const om = parse(ourMax) ?? 1.44;
  const dm = parse(daemonMax) ?? om;
  const chosen = Math.min(om, dm);
  return chosen.toFixed(2);
}

export async function setupDockerApi(_cfg: SwarmbotConfig, docker: Dockerode): Promise<void> {
  const envOverride = process.env.SWARMPIT_DOCKER_API ?? process.env.SWARMBOT_DOCKER_API;
  if (envOverride) {
    setNegotiatedDockerApi(envOverride);
    return;
  }
  try {
    const info = await docker.version();
    const apiVersion = (info as { ApiVersion?: string }).ApiVersion;
    const v = negotiateApiVersion(apiVersion);
    setNegotiatedDockerApi(v);
  } catch {
    /* keep default */
  }
}

type ServiceLike = {
  ID?: string;
  Spec?: {
    Name?: string;
    TaskTemplate?: { ContainerSpec?: { Image?: string } };
    Mode?: { Replicated?: { Replicas?: number } };
  };
};

type NodeLike = {
  ID?: string;
  id?: string;
  Description?: { Hostname?: string };
  Spec?: { Role?: string; Availability?: string };
};

/** Map Docker service list item to a small GraphQL-friendly shape */
export function mapServiceSummary(s: Dockerode.Service): {
  id: string;
  name: string;
  image?: string;
  replicas?: number;
} {
  const sl = s as unknown as ServiceLike;
  const id = sl.ID ?? "";
  const spec = sl.Spec;
  const name = spec?.Name ?? "";
  const image = spec?.TaskTemplate?.ContainerSpec?.Image;
  const mode = spec?.Mode;
  let replicas: number | undefined;
  if (mode?.Replicated?.Replicas !== undefined) {
    replicas = mode.Replicated.Replicas;
  }
  return { id, name, image, replicas };
}

export function mapNodeSummary(n: Dockerode.Node): {
  id: string;
  hostname: string;
  role: string;
  availability?: string;
} {
  const nl = n as unknown as NodeLike;
  const id = nl.ID ?? nl.id ?? "";
  const desc = nl.Description?.Hostname ?? id;
  const role = nl.Spec?.Role ?? "unknown";
  const availability = nl.Spec?.Availability;
  return { id, hostname: desc, role, availability };
}
