export const typeDefs = `#graphql
  type Query {
    health: String!
    version: VersionInfo!
    me: User
    services: [ServiceSummary!]!
    service(id: ID!): ServiceDetail
    nodes: [NodeSummary!]!
    statsSeries(measurement: String!, field: String!, tags: String): String
  }

  type Mutation {
    login(username: String!, password: String!): LoginResult!
    logout: Boolean!
    apiTokenGenerate: ApiTokenResult!
    apiTokenRemove: Boolean!
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
    role: String!
  }

  type ServiceSummary {
    id: ID!
    name: String!
    image: String
    replicas: Int
  }

  type ServiceDetail {
    id: ID!
    name: String!
    image: String
    replicas: Int
  }

  type LoginResult {
    token: String!
  }

  type ApiTokenResult {
    token: String!
    expiresAt: String
  }
`;
