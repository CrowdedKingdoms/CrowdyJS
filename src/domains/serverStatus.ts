import type { GraphQLClient } from '../client.js';

import {
  ServerWithLeastClientsDocument,
  type ServerWithLeastClientsQuery,
  GraphqlServersDocument,
  type GraphqlServersQuery,
  ActiveGraphQlServersDocument,
  type ActiveGraphQlServersQuery,
  VersionInfoDocument,
  type VersionInfoQuery,
} from '../generated/graphql.js';

/**
 * Server status / version info queries.
 *
 * Exposed as `client.serverStatus`.
 *
 * NOTE: there is no separate "buddy server" query in the schema -- the
 * least-loaded UDP game server is selected automatically when a session
 * is opened. `serverWithLeastClients` returns a hint of which UDP server
 * a new session would land on.
 */
export class ServerStatusAPI {
  constructor(private gql: GraphQLClient) {}

  async serverWithLeastClients(): Promise<ServerWithLeastClientsQuery['serverWithLeastClients']> {
    const data = await this.gql.request(ServerWithLeastClientsDocument, undefined);
    return data.serverWithLeastClients;
  }

  async listAll(): Promise<GraphqlServersQuery['graphqlServers']> {
    const data = await this.gql.request(GraphqlServersDocument, undefined);
    return data.graphqlServers;
  }

  async listActiveGraphqlServers(): Promise<ActiveGraphQlServersQuery['activeGraphQLServers']> {
    const data = await this.gql.request(ActiveGraphQlServersDocument, undefined);
    return data.activeGraphQLServers;
  }

  async versionInfo(): Promise<VersionInfoQuery['versionInfo']> {
    const data = await this.gql.request(VersionInfoDocument, undefined);
    return data.versionInfo;
  }
}
