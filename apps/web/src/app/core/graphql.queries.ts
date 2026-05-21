import { gql } from "apollo-angular";

/**
 * Centralised GraphQL operations used by the SwarmBoty admin UI.
 * Keeping them in one file makes it easy to keep selection sets aligned
 * with the schema and to share fragments between pages.
 */

/** Cluster overview counts and resource utilization for the dashboard. */
export const QUERY_OVERVIEW = gql`
	query Overview {
		overview {
			nodes
			managers
			workers
			stacks
			services
			tasks
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

/** List application users who can sign in to SwarmBoty. */
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

/** Deploy a stack from a Compose specification. */
export const MUTATION_CREATE_STACK = gql`
	mutation CreateStack($input: StackInput!) {
		createStack(input: $input) {
			name
			status
		}
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
