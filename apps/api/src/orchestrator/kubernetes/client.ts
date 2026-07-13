/**
 * Real KubeApi backed by `@kubernetes/client-node`.
 *
 * Loaded lazily (dynamic import in the factory) so tests and Swarm-only
 * deployments never pull the Kubernetes client into memory.
 */
import {
	AppsV1Api,
	CoreV1Api,
	KubeConfig,
	KubernetesObjectApi,
	type KubernetesObject,
} from "@kubernetes/client-node";
import type { SwarmBotConfig } from "../../config.js";
import type { KubeApi } from "./kube-api.js";

/** Accept both client-node 1.x (`res.items`) and 0.x (`res.body.items`) shapes. */
function items<T>(res: unknown): T[] {
	const r = res as { items?: T[]; body?: { items?: T[] } };
	return r?.items ?? r?.body?.items ?? [];
}

function isConflict(e: unknown): boolean {
	const err = e as { code?: number; statusCode?: number; response?: { statusCode?: number } };
	const status = err?.code ?? err?.statusCode ?? err?.response?.statusCode;
	return status === 409;
}

export function loadKubeConfig(cfg: SwarmBotConfig): KubeConfig {
	const kc = new KubeConfig();
	const inCluster =
		Boolean(process.env.KUBERNETES_SERVICE_HOST) && !cfg.kubeconfig && !process.env.KUBECONFIG;
	if (inCluster) {
		kc.loadFromCluster();
	} else if (cfg.kubeconfig) {
		kc.loadFromFile(cfg.kubeconfig);
	} else {
		// Honours KUBECONFIG, falls back to in-cluster / ~/.kube/config.
		kc.loadFromDefault();
	}
	return kc;
}

export function createKubeClient(cfg: SwarmBotConfig): KubeApi {
	const kc = loadKubeConfig(cfg);
	const core = kc.makeApiClient(CoreV1Api);
	const apps = kc.makeApiClient(AppsV1Api);

	return {
		contextName: () => kc.getCurrentContext() || null,

		listNodes: async () => items(await core.listNode()),
		listNamespaces: async () => items(await core.listNamespace()),
		listPods: async (namespace) =>
			items(
				namespace
					? await core.listNamespacedPod({ namespace })
					: await core.listPodForAllNamespaces()
			),
		listDeployments: async (namespace) =>
			items(
				namespace
					? await apps.listNamespacedDeployment({ namespace })
					: await apps.listDeploymentForAllNamespaces()
			),
		listStatefulSets: async (namespace) =>
			items(
				namespace
					? await apps.listNamespacedStatefulSet({ namespace })
					: await apps.listStatefulSetForAllNamespaces()
			),
		listDaemonSets: async (namespace) =>
			items(
				namespace
					? await apps.listNamespacedDaemonSet({ namespace })
					: await apps.listDaemonSetForAllNamespaces()
			),
		listServices: async (namespace) =>
			items(
				namespace
					? await core.listNamespacedService({ namespace })
					: await core.listServiceForAllNamespaces()
			),
		listPvcs: async (namespace) =>
			items(
				namespace
					? await core.listNamespacedPersistentVolumeClaim({ namespace })
					: await core.listPersistentVolumeClaimForAllNamespaces()
			),
		listConfigMaps: async (namespace) =>
			items(
				namespace
					? await core.listNamespacedConfigMap({ namespace })
					: await core.listConfigMapForAllNamespaces()
			),
		listSecrets: async (namespace) =>
			items(
				namespace
					? await core.listNamespacedSecret({ namespace })
					: await core.listSecretForAllNamespaces()
			),

		podLogs: async (namespace, pod, opts) => {
			const log = await core.readNamespacedPodLog({
				name: pod,
				namespace,
				container: opts?.container,
				tailLines: opts?.tail ?? 500,
				timestamps: true,
			});
			return typeof log === "string" ? log : String((log as { body?: string })?.body ?? "");
		},

		apply: async (manifests) => {
			const client = KubernetesObjectApi.makeApiClient(kc);
			for (const m of manifests) {
				const spec = m as KubernetesObject;
				try {
					await client.create(spec);
				} catch (e) {
					if (!isConflict(e)) throw e;
					await client.patch(spec);
				}
			}
		},
	};
}
