/**
 * Thin structural view of the Kubernetes API used by the adapter.
 *
 * Only the fields we read are declared, so the adapter can be unit-tested
 * with plain objects and the mock backend does not depend on
 * `@kubernetes/client-node` (which is only loaded by `client.ts`).
 */

export type KubeMeta = {
	name?: string;
	namespace?: string;
	uid?: string;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
	creationTimestamp?: string | Date;
	ownerReferences?: Array<{ kind?: string; name?: string; controller?: boolean }>;
};

export type KubeContainer = {
	name?: string;
	image?: string;
	env?: Array<{ name?: string; value?: string }>;
	envFrom?: Array<{ configMapRef?: { name?: string }; secretRef?: { name?: string } }>;
	ports?: Array<{ containerPort?: number; name?: string; protocol?: string }>;
	volumeMounts?: Array<{ name?: string; mountPath?: string; readOnly?: boolean }>;
};

export type KubeVolume = {
	name?: string;
	hostPath?: { path?: string };
	persistentVolumeClaim?: { claimName?: string; readOnly?: boolean };
	configMap?: { name?: string };
	secret?: { secretName?: string };
};

export type KubePodTemplate = {
	metadata?: KubeMeta;
	spec?: { containers?: KubeContainer[]; volumes?: KubeVolume[] };
};

export type KubeWorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet";

export type KubeWorkload = {
	metadata?: KubeMeta;
	spec?: {
		replicas?: number;
		selector?: { matchLabels?: Record<string, string> };
		template?: KubePodTemplate;
	};
	status?: {
		replicas?: number;
		readyReplicas?: number;
		updatedReplicas?: number;
		desiredNumberScheduled?: number;
		numberReady?: number;
	};
};

export type KubeNode = {
	metadata?: KubeMeta;
	spec?: { unschedulable?: boolean };
	status?: {
		addresses?: Array<{ type?: string; address?: string }>;
		conditions?: Array<{ type?: string; status?: string }>;
		nodeInfo?: { kubeletVersion?: string; containerRuntimeVersion?: string };
	};
};

export type KubePod = {
	metadata?: KubeMeta;
	spec?: { nodeName?: string; containers?: KubeContainer[] };
	status?: {
		phase?: string;
		startTime?: string | Date;
		conditions?: Array<{ type?: string; status?: string }>;
	};
};

export type KubeService = {
	metadata?: KubeMeta;
	spec?: {
		type?: string;
		selector?: Record<string, string>;
		ports?: Array<{
			port?: number;
			targetPort?: number | string;
			nodePort?: number;
			protocol?: string;
		}>;
	};
};

export type KubeNamespace = { metadata?: KubeMeta; status?: { phase?: string } };

export type KubePvc = {
	metadata?: KubeMeta;
	spec?: {
		storageClassName?: string;
		resources?: { requests?: Record<string, string> };
	};
	status?: { phase?: string; capacity?: Record<string, string> };
};

export type KubeStamped = { metadata?: KubeMeta; type?: string };

/** Everything the adapter (and the ingest kube-mapper) needs from the apiserver. */
export type KubeApi = {
	contextName(): string | null;
	listNodes(): Promise<KubeNode[]>;
	listNamespaces(): Promise<KubeNamespace[]>;
	/** `namespace` omitted → all namespaces. */
	listPods(namespace?: string): Promise<KubePod[]>;
	listDeployments(namespace?: string): Promise<KubeWorkload[]>;
	listStatefulSets(namespace?: string): Promise<KubeWorkload[]>;
	listDaemonSets(namespace?: string): Promise<KubeWorkload[]>;
	listServices(namespace?: string): Promise<KubeService[]>;
	listPvcs(namespace?: string): Promise<KubePvc[]>;
	listConfigMaps(namespace?: string): Promise<KubeStamped[]>;
	listSecrets(namespace?: string): Promise<KubeStamped[]>;
	podLogs(
		namespace: string,
		pod: string,
		opts?: { tail?: number; container?: string }
	): Promise<string>;
	/** Create-or-update the given manifest objects (used by stack deploy). */
	apply(manifests: Array<Record<string, unknown>>): Promise<void>;
};
