/**
 * GraphQL schema definitions for the swarmbot.it admin API.
 *
 * Coverage:
 *   - Cluster overview (counts + per-resource breakdown).
 *   - Docker Swarm resources: stacks, services, tasks, nodes, networks,
 *     volumes, secrets, configs.
 *   - swarmbot.it registries and application users (CouchDB-backed).
 *   - Telemetry series (InfluxDB-backed): per-cluster and per-node history.
 */
export const typeDefs = `#graphql
  scalar JSON

  type Query {
    health: String!
    version: VersionInfo!
    me: User

    overview: ClusterOverview!

    stacks: [StackSummary!]!
    services: [ServiceSummary!]!
    service(id: ID!): ServiceDetail
    tasks: [TaskInfo!]!
    task(id: ID!): TaskInfo
    taskStats(id: ID!, range: String): StackMetrics!

    nodes: [NodeSummary!]!
    networks: [NetworkInfo!]!
    volumes: [VolumeInfo!]!

    secrets: [SecretInfo!]!
    configs: [ConfigInfo!]!
    registries: [Registry!]!

    users: [UserAccount!]!

    metricsSeries(input: MetricsSeriesInput!): MetricsSeries!
    statsSeries(measurement: String!, field: String!, tags: String): String
    recentActivity(limit: Int): [ActivityItem!]!
    stackStats(name: String!, range: String): StackMetrics!
  }

  type Mutation {
    login(username: String!, password: String!): LoginResult!
    logout: Boolean!
    apiTokenGenerate: ApiTokenResult!
    apiTokenRemove: Boolean!

    createStack(input: StackInput!): StackSummary!
    removeStack(name: String!): Boolean!
    redeployStack(name: String!): Boolean!
    rollbackStack(name: String!): Boolean!
    deactivateStack(name: String!): Boolean!
    reactivateStack(name: String!): Boolean!

    createService(input: ServiceInput!): ServiceSummary!
    removeService(id: ID!): Boolean!
    redeployService(id: ID!): Boolean!
    rollbackService(id: ID!): Boolean!
    scaleService(id: ID!, replicas: Int!): Boolean!

    createNetwork(input: NetworkInput!): NetworkInfo!
    removeNetwork(id: ID!): Boolean!

    createVolume(input: VolumeInput!): VolumeInfo!
    removeVolume(name: String!): Boolean!

    createSecret(input: SecretInput!): SecretInfo!
    removeSecret(id: ID!): Boolean!

    createConfig(input: ConfigInput!): ConfigInfo!
    removeConfig(id: ID!): Boolean!

    createRegistry(input: RegistryInput!): Registry!
    removeRegistry(id: ID!): Boolean!
    setDefaultRegistry(id: ID!): Registry!

    setNodeAvailability(id: ID!, availability: String!): NodeSummary!

    createUser(input: UserInput!): UserAccount!
    removeUser(id: ID!): Boolean!

    updateProfile(input: UpdateProfileInput!): UserAccount!
    changePassword(input: ChangePasswordInput!): Boolean!
  }

  type Subscription {
    swarmEvent: SwarmEventPayload!
  }

  type SwarmEventPayload {
    type: String
    message: String
  }

  type VersionInfo {
    name: String!
    version: String!
    dockerApi: String!
    instanceName: String
    influxdb: Boolean!
  }

  type User {
    username: String!
    email: String
    name: String
    phone: String
    role: String!
    created: String
    lastLogin: String
    apiTokenMask: String
    apiTokenExpiresAt: String
  }

  type ClusterOverview {
    nodes: Int!
    managers: Int!
    managersReachable: Int!
    workers: Int!
    stacks: Int!
    stacksDelta: String
    services: Int!
    servicesDelta: String
    tasks: Int!
    tasksRunning: Int!
    tasksDelta: String
    networks: Int!
    volumes: Int!
    secrets: Int!
    configs: Int!
    registries: Int!
    users: Int!
    cpu: Int!
    mem: Int!
    disk: Int!
    cpuCores: Int!
    cpuUsed: Int!
    memTotal: String!
    memUsed: String!
    diskTotal: String!
    diskUsed: String!
  }

  type StackSummary {
    name: ID!
    services: Int!
    networks: Int!
    volumes: Int!
    configs: Int!
    secrets: Int!
    status: String!
  }

  type ServiceSummary {
    id: ID!
    name: String!
    image: String
    replicasRunning: Int!
    replicasTotal: Int!
    ports: [String!]!
    status: String!
    stack: String
  }

  type ServiceDetail {
    id: ID!
    name: String!
    image: String
    replicasRunning: Int!
    replicasTotal: Int!
    ports: [String!]!
    status: String!
    stack: String
    mode: String
    created: String
    updated: String
    env: [String!]!
    labels: [LabelPair!]!
    networks: [String!]!
    mounts: [MountInfo!]!
    secrets: [String!]!
    configs: [String!]!
  }

  type LabelPair {
    k: String!
    v: String!
  }

  type MountInfo {
    type: String!
    source: String
    target: String!
    readOnly: Boolean!
  }

  type TaskInfo {
    id: ID!
    name: String!
    image: String!
    node: String!
    cpu: Int!
    mem: Int!
    updated: String!
    status: String!
    cpuSeries: [Float!]!
    memSeries: [Float!]!
    serviceName: String
    nodeHostname: String
    desiredState: String
    message: String
  }

  type NodeSummary {
    id: ID!
    hostname: String!
    role: String!
    availability: String
    ip: String
    dockerVersion: String
    tags: [String!]!
    cpu: Int!
    mem: Int!
    disk: Int!
  }

  type NetworkInfo {
    id: ID!
    name: String!
    driver: String!
    subnet: String
    gateway: String
    scope: String!
    attachable: Boolean!
    internal: Boolean!
    ingress: Boolean!
    stack: String
  }

  type VolumeInfo {
    name: ID!
    driver: String!
    size: String!
    mountpoint: String
    stack: String
  }

  type SecretInfo {
    id: ID!
    name: String!
    created: String!
    updated: String!
    stack: String
  }

  type ConfigInfo {
    id: ID!
    name: String!
    created: String!
    updated: String!
    stack: String
    content: String
  }

  type Registry {
    id: ID!
    name: String!
    url: String!
    type: String!
    user: String!
    default: Boolean!
  }

  type UserAccount {
    id: ID!
    username: String!
    name: String!
    email: String!
    phone: String
    role: String!
    created: String!
    lastLogin: String
  }

  type LoginResult {
    token: String!
  }

  type ApiTokenResult {
    token: String!
    expiresAt: String
  }

  input MetricsSeriesInput {
    range: String!
    resolution: String
    nodeId: ID
  }

  type MetricsSeries {
    labels: [String!]!
    cpu: [Float!]!
    mem: [Float!]!
    disk: [Float!]!
  }

  input StackInput {
    name: String!
    composeYaml: String!
  }

  input ServiceInput {
    name: String!
    image: String!
    registry: String!
    replicas: Int!
    ports: [String!]
    stack: String
  }

  input NetworkInput {
    name: String!
    driver: String!
    subnet: String
    gateway: String
    attachable: Boolean
    internal: Boolean
    ingress: Boolean
    labels: [KeyValueInput!]
  }

  input VolumeInput {
    name: String!
    driver: String!
    labels: [KeyValueInput!]
  }

  input SecretInput {
    name: String!
    content: String!
  }

  input ConfigInput {
    name: String!
    content: String!
  }

  input RegistryInput {
    name: String!
    url: String!
    type: String!
    user: String
    password: String
    default: Boolean
  }

  input UserInput {
    username: String!
    password: String!
    name: String
    email: String!
    phone: String
    role: String!
  }

  input KeyValueInput {
    k: String!
    v: String!
  }

  input UpdateProfileInput {
    name: String!
    email: String!
    phone: String
  }

  input ChangePasswordInput {
    current: String!
    next: String!
  }

  type ActivityItem {
    time: String!
    summary: String!
  }

  type StackMetrics {
    labels: [String!]!
    cpu: [Float!]!
    mem: [Float!]!
  }
`;
