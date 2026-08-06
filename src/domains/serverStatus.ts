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
  GameClientBootstrapDocument,
  type GameClientBootstrapQuery,
  type GameClientBootstrapQueryVariables,
} from '../generated/graphql.js';

/**
 * Server discovery, version, and client-bootstrap queries on the **game-api**.
 * Exposed as `client.serverStatus`.
 *
 * This is the **client bootstrap path**: call {@link ServerStatusAPI.gameClientBootstrap}
 * once after login to get everything a play session needs (identity, version
 * floors, UDP status, realtime protocol details, and spatial limits) in a single
 * round-trip, and use {@link ServerStatusAPI.versionInfo} for standalone version
 * discovery / update gating. The remaining queries expose UDP/GraphQL server
 * fleet info for discovery and routing.
 *
 * NOTE: there is no separate "buddy server" query in the schema — the
 * least-loaded UDP game server is selected automatically when a session is
 * opened. {@link ServerStatusAPI.serverWithLeastClients} returns a hint of which
 * UDP server a new session would land on.
 *
 * Auth varies per method: {@link ServerStatusAPI.gameClientBootstrap} and
 * {@link ServerStatusAPI.serverWithLeastClients} require a Bearer game token (set
 * via `client.auth.login()` or `client.setToken()`), while
 * {@link ServerStatusAPI.listAll}, {@link ServerStatusAPI.listActiveGraphqlServers}
 * and {@link ServerStatusAPI.versionInfo} need no authentication. `appId` is a
 * `BigInt` sent as a decimal string.
 */
export class ServerStatusAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Pick a low-load UDP game server for a **native (direct-UDP)** client to
   * connect to: returns a random server from the least-loaded ~20% (by client
   * count) of `ReadyForClients` servers to spread load. As a side effect it
   * authorizes the token's P2P session with the chosen Buddy so the native
   * client's spatial datagrams are accepted; connect the client to the returned
   * `ip4` + `clientPort`. Browser clients should instead use the UDP proxy
   * (`client.udp` / `udpNotifications`) and do not need this.
   *
   * @returns A {@link ServerStatus} describing the selected UDP server.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if no valid game token is
   *   present.
   */
  async serverWithLeastClients(): Promise<ServerWithLeastClientsQuery['serverWithLeastClients']> {
    const data = await this.gql.request(ServerWithLeastClientsDocument, undefined);
    return data.serverWithLeastClients;
  }

  /**
   * List every registered GraphQL API server, regardless of health/state — for service discovery. To
   * route clients, prefer {@link ServerStatusAPI.listActiveGraphqlServers}
   * (healthy only). No authentication required.
   *
   * @returns Every registered {@link GraphQLServer}.
   */
  async listAll(): Promise<GraphqlServersQuery['graphqlServers']> {
    const data = await this.gql.request(GraphqlServersDocument, undefined);
    return data.graphqlServers;
  }

  /**
   * List only healthy GraphQL API servers (`status = ReadyForClients`) for client
   * routing/discovery. No authentication required.
   *
   * @returns The healthy {@link GraphQLServer}s.
   */
  async listActiveGraphqlServers(): Promise<ActiveGraphQlServersQuery['activeGraphQLServers']> {
    const data = await this.gql.request(ActiveGraphQlServersDocument, undefined);
    return data.activeGraphQLServers;
  }

  /**
   * Get the current server version and the minimum client version the server
   * accepts. No authentication required — compare your build against
   * `minimumClientVersion` before connecting and prompt an update if it is too
   * old.
   *
   * @returns A {@link ServerVersionInfo} (`serverVersion` + `minimumClientVersion`,
   *   each a major/minor/patch/build {@link VersionInfo}).
   */
  async versionInfo(): Promise<VersionInfoQuery['versionInfo']> {
    const data = await this.gql.request(VersionInfoDocument, undefined);
    return data.versionInfo;
  }

  /**
   * Single startup payload for browser game clients: the authenticated user,
   * server/min-client version requirements, current UDP proxy status, realtime
   * protocol details (subprotocol + subscription name), and the spatial send
   * limits/constants. Read-only — does **not** open a UDP proxy session. Call this
   * once after login to initialize a play session instead of issuing several
   * separate queries.
   *
   * @param appId - The app (game) the client is initializing for (`BigInt` as a
   *   decimal string). Scopes the returned UDP status and mirrors the app's
   *   entitlements; reuse the same `appId` when subscribing and on every spatial
   *   send.
   * @returns A {@link GameClientBootstrap}: `me`, `versionInfo`,
   *   `udpProxyConnectionStatus`, `realtimeProtocol`, `subscriptionName`, and the
   *   spatial limits `maxReplicationDistance` (max `distance` fan-out, in chunk
   *   units), `maxDecayRate`, and `sequenceNumberModulo` (256).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a valid game token, or
   *   `FORBIDDEN` if not entitled to the app.
   */
  async gameClientBootstrap(
    appId: GameClientBootstrapQueryVariables['appId'],
  ): Promise<GameClientBootstrapQuery['gameClientBootstrap']> {
    const data = await this.gql.request(GameClientBootstrapDocument, { appId });
    return data.gameClientBootstrap;
  }
}
