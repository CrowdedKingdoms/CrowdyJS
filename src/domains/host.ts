import type { GraphQLClient } from '../client.js';
import {
  GameHostDocument,
  ActorHeartbeatDocument,
  type GameHostQuery,
  type ActorHeartbeatMutation,
} from '../generated/graphql.js';

/**
 * Game-host election + actor liveness heartbeat — exposed as `client.host`.
 *
 * Targets the **game-api**. The elected host is deterministic across all
 * game-api replicas (the user whose earliest still-connected actor was created
 * first wins). {@link heartbeat} refreshes the caller's actor freshness (keeping
 * them host-eligible) and returns the freshly-elected host in one round-trip —
 * call it on an interval shorter than the server's freshness window. Both
 * require a valid session; `appId` is a `BigInt` decimal string.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session.
 */
export class HostAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Return the single elected host user for an app, or `null` when no actors
   * exist.
   *
   * @param appId - The app to elect the host for.
   * @returns The elected {@link GameHost}, or `null`.
   */
  async get(appId: string): Promise<GameHostQuery['gameHost']> {
    const data = await this.graphql.request(GameHostDocument, { appId });
    return data.gameHost;
  }

  /**
   * Refresh the caller's actor freshness in an app and return the freshly
   * elected host. Returns `null` when no fresh actors exist for the app.
   *
   * @param appId - The app whose actors to keep fresh (and elect the host for).
   * @returns The freshly elected {@link GameHost}, or `null`.
   */
  async heartbeat(appId: string): Promise<ActorHeartbeatMutation['actorHeartbeat']> {
    const data = await this.graphql.request(ActorHeartbeatDocument, { appId });
    return data.actorHeartbeat;
  }
}
