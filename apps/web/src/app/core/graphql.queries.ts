import { gql } from "apollo-angular";

/**
 * Centralised GraphQL operations used by the swarmbot.it admin UI.
 * Keeping them in one file makes it easy to keep selection sets aligned
 * with the schema and to share fragments between pages.
 */

/** Runtime build identity, negotiated Docker Engine API version and orchestrator. */
export const QUERY_VERSION = gql`
	query Version {
		version {
			version
			dockerApi
			instanceName
			orchestrator
		}
	}
`;

/** Cluster overview counts and resource utilization for the dashboard. */
export const QUERY_OVERVIEW = gql`
	query Overview {
		overview {
			nodes
			managersTotal
			managersReady
			workers
			stacks
			stacksDelta
			services
			servicesDelta
			tasks
			tasksRunning
			tasksDelta
			networks
			volumes
			secrets
			configs
			registries
			users
			cpu
			mem
			disk
			cpuCores
			cpuUsed
			memTotal
			memUsed
			diskTotal
			diskUsed
		}
	}
`;

/** List deployed stacks with related object counts and status. */
export const QUERY_STACKS = gql`
	query Stacks {
		stacks {
			name
			services
			networks
			volumes
			configs
			secrets
			status
		}
	}
`;

/** List Swarm services with replicas, image, ports, and stack. */
export const QUERY_SERVICES = gql`
	query Services {
		services {
			id
			name
			image
			replicasRunning
			replicasTotal
			ports
			status
			stack
		}
	}
`;

/** Full detail for a single service, including env vars, mounts, and attached networks/secrets/configs. */
export const QUERY_SERVICE_DETAIL = gql`
	query ServiceDetail($id: ID!) {
		service(id: $id) {
			id
			name
			image
			replicasRunning
			replicasTotal
			ports
			status
			stack
			mode
			created
			updated
			env
			labels {
				k
				v
			}
			networks
			mounts {
				type
				source
				target
				readOnly
			}
			secrets
			configs
		}
	}
`;

/** List tasks with node placement, resource usage, and sparkline series. */
export const QUERY_TASKS = gql`
	query Tasks {
		tasks {
			id
			name
			image
			node
			cpu
			mem
			updated
			status
			cpuSeries
			memSeries
			serviceName
			nodeHostname
			desiredState
		}
	}
`;

/** List cluster nodes with role, addressing, and utilization. */
export const QUERY_NODES = gql`
	query Nodes {
		nodes {
			id
			hostname
			role
			availability
			ip
			dockerVersion
			tags
			cpu
			mem
			disk
			cpuHistory
			memHistory
			diskHistory
		}
	}
`;

/** Drain (evict) or reactivate scheduling on a node. */
export const MUTATION_SET_NODE_AVAILABILITY = gql`
	mutation SetNodeAvailability($id: ID!, $availability: String!) {
		setNodeAvailability(id: $id, availability: $availability) {
			id
			availability
			tags
		}
	}
`;

/** List overlay networks with driver, subnet, and scope flags. */
export const QUERY_NETWORKS = gql`
	query Networks {
		networks {
			id
			name
			driver
			subnet
			gateway
			scope
			attachable
			internal
			ingress
			stack
		}
	}
`;

/** List persistent volumes with driver and reported size. */
export const QUERY_VOLUMES = gql`
	query Volumes {
		volumes {
			name
			driver
			size
			mountpoint
			stack
		}
	}
`;

/** List Swarm secrets (metadata only; payloads are not returned). */
export const QUERY_SECRETS = gql`
	query Secrets {
		secrets {
			id
			name
			created
			updated
			stack
		}
	}
`;

/** List Swarm configs (metadata only; content is not returned). */
export const QUERY_CONFIGS = gql`
	query Configs {
		configs {
			id
			name
			created
			updated
			stack
		}
	}
`;

/** Fetch decoded config file content on demand (kept out of the list query for size). */
export const QUERY_CONFIG_CONTENT = gql`
	query ConfigContent {
		configs {
			id
			content
		}
	}
`;

/** Everything needed to render a single stack's detail page in one round trip. */
export const QUERY_STACK_RESOURCES = gql`
	query StackResources {
		services {
			id
			name
			image
			replicasRunning
			replicasTotal
			ports
			status
			stack
		}
		networks {
			id
			name
			driver
			subnet
			gateway
			stack
		}
		volumes {
			name
			driver
			mountpoint
			stack
		}
		secrets {
			id
			name
			updated
			stack
		}
		configs {
			id
			name
			updated
			stack
		}
		tasks {
			id
			name
			serviceName
			nodeHostname
			status
			desiredState
		}
	}
`;

/** List configured image registries and default-pull flags. */
export const QUERY_REGISTRIES = gql`
	query Registries {
		registries {
			id
			name
			url
			type
			user
			default
		}
	}
`;

/** List application users who can sign in to swarmbot.it. */
export const QUERY_USERS = gql`
	query AppUsers {
		users {
			id
			username
			name
			email
			phone
			role
			created
			lastLogin
		}
	}
`;

/** Time-series CPU, memory, and disk samples for dashboard charts. */
export const QUERY_METRICS_SERIES = gql`
	query MetricsSeries($input: MetricsSeriesInput!) {
		metricsSeries(input: $input) {
			labels
			cpu
			mem
			disk
		}
	}
`;

/** Per-stack CPU/memory history for the Load page. */
export const QUERY_STACK_STATS = gql`
	query StackStats($name: String!, $range: String) {
		stackStats(name: $name, range: $range) {
			labels
			cpu
			mem
		}
	}
`;

/** Full detail for a single task, including its status message and node placement. */
export const QUERY_TASK_DETAIL = gql`
	query TaskDetail($id: ID!) {
		task(id: $id) {
			id
			name
			image
			node
			nodeHostname
			serviceName
			status
			desiredState
			message
			updated
		}
	}
`;

/** Per-task CPU/memory history from InfluxDB. */
export const QUERY_TASK_STATS = gql`
	query TaskStats($id: ID!, $range: String) {
		taskStats(id: $id, range: $range) {
			labels
			cpu
			mem
		}
	}
`;

/** Exchange username and password for a JWT session token. */
export const MUTATION_LOGIN = gql`
	mutation Login($username: String!, $password: String!) {
		login(username: $username, password: $password) {
			token
		}
	}
`;

/** Create an application user account. */
export const MUTATION_CREATE_USER = gql`
	mutation CreateUser($input: UserInput!) {
		createUser(input: $input) {
			id
			username
			name
			email
			role
		}
	}
`;

/** Register a container image registry connection. */
export const MUTATION_CREATE_REGISTRY = gql`
	mutation CreateRegistry($input: RegistryInput!) {
		createRegistry(input: $input) {
			id
			name
			url
			type
			user
			default
		}
	}
`;

/** Remove a container image registry connection. */
export const MUTATION_REMOVE_REGISTRY = gql`
	mutation RemoveRegistry($id: ID!) {
		removeRegistry(id: $id)
	}
`;

/** Mark a registry as the default used for image pulls. */
export const MUTATION_SET_DEFAULT_REGISTRY = gql`
	mutation SetDefaultRegistry($id: ID!) {
		setDefaultRegistry(id: $id) {
			id
			default
		}
	}
`;

/** Create a Swarm config object. */
export const MUTATION_CREATE_CONFIG = gql`
	mutation CreateConfig($input: ConfigInput!) {
		createConfig(input: $input) {
			id
			name
			created
			updated
		}
	}
`;

/** Create a Swarm secret. */
export const MUTATION_CREATE_SECRET = gql`
	mutation CreateSecret($input: SecretInput!) {
		createSecret(input: $input) {
			id
			name
			created
			updated
		}
	}
`;

/** Provision a new volume. */
export const MUTATION_CREATE_VOLUME = gql`
	mutation CreateVolume($input: VolumeInput!) {
		createVolume(input: $input) {
			name
			driver
			size
		}
	}
`;

/** Create an overlay or bridge network. */
export const MUTATION_CREATE_NETWORK = gql`
	mutation CreateNetwork($input: NetworkInput!) {
		createNetwork(input: $input) {
			id
			name
			driver
			subnet
			gateway
		}
	}
`;

/** Deploy a new Swarm service. */
export const MUTATION_CREATE_SERVICE = gql`
	mutation CreateService($input: ServiceInput!) {
		createService(input: $input) {
			id
			name
			image
			replicasRunning
			replicasTotal
			status
		}
	}
`;

/** Remove a Swarm service. */
export const MUTATION_REMOVE_SERVICE = gql`
	mutation RemoveService($id: ID!) {
		removeService(id: $id)
	}
`;

/** Force-update a service so Swarm reschedules all its tasks. */
export const MUTATION_REDEPLOY_SERVICE = gql`
	mutation RedeployService($id: ID!) {
		redeployService(id: $id)
	}
`;

/** Revert a service to its previous spec version. */
export const MUTATION_ROLLBACK_SERVICE = gql`
	mutation RollbackService($id: ID!) {
		rollbackService(id: $id)
	}
`;

/** Scale a service to a new replica count. */
export const MUTATION_SCALE_SERVICE = gql`
	mutation ScaleService($id: ID!, $replicas: Int!) {
		scaleService(id: $id, replicas: $replicas)
	}
`;

/** Deploy a stack from a Compose specification. */
export const MUTATION_CREATE_STACK = gql`
	mutation CreateStack($input: StackInput!) {
		createStack(input: $input) {
			name
			status
		}
	}
`;

/** Remove a stack: its services, networks, secrets and configs (volumes are kept). */
export const MUTATION_REMOVE_STACK = gql`
	mutation RemoveStack($name: String!) {
		removeStack(name: $name)
	}
`;

/** Force-update every service in a stack so Swarm reschedules all tasks. */
export const MUTATION_REDEPLOY_STACK = gql`
	mutation RedeployStack($name: String!) {
		redeployStack(name: $name)
	}
`;

/** Revert every service in a stack to its previous spec version. */
export const MUTATION_ROLLBACK_STACK = gql`
	mutation RollbackStack($name: String!) {
		rollbackStack(name: $name)
	}
`;

/** Scale every service in a stack to 0 replicas. */
export const MUTATION_DEACTIVATE_STACK = gql`
	mutation DeactivateStack($name: String!) {
		deactivateStack(name: $name)
	}
`;

/** Scale every service in a stack back to 1 replica. */
export const MUTATION_REACTIVATE_STACK = gql`
	mutation ReactivateStack($name: String!) {
		reactivateStack(name: $name)
	}
`;

/** Fetch full profile for the authenticated user. */
export const QUERY_PROFILE_ME = gql`
	query ProfileMe {
		me {
			username
			name
			email
			phone
			role
			created
			lastLogin
		}
	}
`;

/** Update the authenticated user's editable profile fields. */
export const MUTATION_UPDATE_PROFILE = gql`
	mutation UpdateProfile($input: UpdateProfileInput!) {
		updateProfile(input: $input) {
			username
			name
			email
			phone
			role
			created
			lastLogin
		}
	}
`;

/** Change the authenticated user's password. */
export const MUTATION_CHANGE_PASSWORD = gql`
	mutation ChangePassword($input: ChangePasswordInput!) {
		changePassword(input: $input)
	}
`;
