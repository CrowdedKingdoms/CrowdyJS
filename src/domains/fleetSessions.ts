import type { GraphQLClient } from '../client.js';
import {
  CloseFleetSessionDocument,
  OpenFleetSessionDocument,
  RefreshFleetSessionDocument,
  type CloseFleetSessionInput,
  type FleetSessionFieldsFragment,
  type RefreshFleetSessionInput,
} from '../generated/graphql.js';
import { assertOrganizationServer } from '../server-only.js';

/**
 * A fleet session as the Application API answers it (`openFleetSession` and
 * `refreshFleetSession`): the session's `token` (64 characters, the key the game server signs
 * the session's realtime messages with), its `gameTokenId`, the `appId`, `expiresAt` (24 hours
 * after it was opened or last refreshed), `maxPlayers` (how many players it may carry at once)
 * and the realtime `server` to connect to (`ip4`, `ip6`, `clientPort`).
 *
 * **Keep the token on the server.** It signs for every player the session carries. It never
 * goes into a browser page or a game client, and the Application API does not accept it as a
 * bearer.
 */
export type FleetSessionAnswer = FleetSessionFieldsFragment;

/**
 * Fleet sessions for an organization's own game servers, exposed as `client.fleetSessions`
 * (and `client.admin.fleetSessions`). Application API v2.89.0.
 *
 * A fleet session is one realtime session a game server opens for itself, in which it
 * carries the players who are on it. A player still signs in once, when they join the game
 * (`mintManagedPlayerToken`). A player who moves to another of the organization's servers is
 * carried by that server, with no call to the Application API. These three calls open a
 * session, keep it and end it; `FleetSession` from `@crowdedkingdoms/crowdyjs/fleet` is the
 * realtime session itself.
 *
 * **These calls take the organization's org token, on a server the organization runs.** Build
 * a client for the server and give it the org token (`cko_…`, scope `fleet:session`) with
 * `client.setToken(orgToken)`, without a `tokenStore`. An org token and a fleet token never go
 * into a browser page or a game client: the API refuses a request that carries an `Origin`
 * header, and these methods refuse to run in a page before any request is made.
 *
 * **The org token that opened a session is the one that keeps it and ends it.** Another org
 * token of the same organization gets `NOT_FOUND` from {@link refresh} and `false` from
 * {@link close}. Revoking an org token ends every fleet session and every hub connection it
 * opened. A session that is neither refreshed nor closed ends at its `expiresAt`, 24 hours
 * after it was opened or last refreshed.
 *
 * Refusals arrive as `CrowdyGraphQLError`; branch on `extensions.code` with the readers:
 *
 * | Code | Meaning | Reader |
 * |---|---|---|
 * | `ORG_TOKEN_REQUIRED` | The bearer is not an org token, or the request came from a browser | `orgTokenRequiredOf` |
 * | `FLEET_SESSION_LIMIT` | `open`: the organization holds as many sessions as it may (512 unless an operator set another) | `fleetSessionLimitOf` |
 * | `NOT_FOUND` | `refresh`: the session expired, was closed, or was opened with another org token | `fleetSessionNotFoundOf` |
 * | `PLATFORM_BUSY` | The platform could not start the call in time; wait `retryAfterMs`, then call again | `platformBusyOf` |
 * | `ORG_LEGAL_ACCEPTANCE_REQUIRED` | An admin has not accepted the current Org-Managed Players Addendum | `orgLegalAcceptanceRequiredOf` |
 * | `FORBIDDEN` | Fleet sessions are not switched on for the organization, the org token lacks the scope, or the app is not in its app list | `error.code` |
 * | `FEATURE_DISABLED` | The tier does not serve org-managed players | `error.code` |
 */
export class FleetSessionsAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Open a fleet session in one of the organization's apps (`openFleetSession`), when the
   * game server starts. Open one session for each game server. The answer carries the
   * session's token, its `gameTokenId`, when it expires (24 hours away), how many players it
   * may carry at once and the realtime server to connect to; give it to `FleetSession`.
   */
  async open(appId: string): Promise<FleetSessionAnswer> {
    assertOrganizationServer('fleetSessions.open');
    const data = await this.graphql.request(OpenFleetSessionDocument, { input: { appId } });
    return data.openFleetSession;
  }

  /**
   * Keep a fleet session (`refreshFleetSession`): the same token and `gameTokenId`, with
   * `expiresAt` moved to 24 hours from now. Call it with the org token that opened the
   * session, before `expiresAt`. `FleetSession.refreshDue()` says when, and
   * `FleetSession.refreshInput()` builds this input.
   *
   * Name the realtime server the session is connected to (`currentServer`, the `ip4` and
   * `clientPort` it was given) and the session stays there while that server still serves the
   * app. Leave it out, or name one that no longer serves, and the answer's `server` is another
   * one to connect to: do that after a realtime server told the session to move.
   *
   * @throws {CrowdyGraphQLError} `NOT_FOUND` for a session that expired, was closed, or was
   *   opened with another org token (`fleetSessionNotFoundOf`): open a new one.
   */
  async refresh(input: RefreshFleetSessionInput): Promise<FleetSessionAnswer> {
    assertOrganizationServer('fleetSessions.refresh');
    const data = await this.graphql.request(RefreshFleetSessionDocument, { input });
    return data.refreshFleetSession;
  }

  /**
   * End a fleet session now (`closeFleetSession`), when its game server stops. The players it
   * carries are released (their actors leave, as when a player's own session ends) and it no
   * longer counts toward the organization's sessions. Call it with the org token that opened
   * the session. Resolves `true` when a session was ended, and `false` when there was none by
   * that id for this org token: already closed, or opened with another org token.
   */
  async close(input: CloseFleetSessionInput): Promise<boolean> {
    assertOrganizationServer('fleetSessions.close');
    const data = await this.graphql.request(CloseFleetSessionDocument, { input });
    return data.closeFleetSession;
  }
}
