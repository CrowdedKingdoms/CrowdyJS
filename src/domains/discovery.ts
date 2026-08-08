/**
 * Where each app lives — the call a client makes BEFORE it authenticates.
 *
 * WHY IT COMES FIRST. `ck.<tier>.cp.cks-env.com` is a multivalue DNS record over every
 * datacenter's load balancer, so a cold client's first request lands wherever DNS
 * pointed it — and roughly half the time that is not the datacenter hosting the app.
 * Authenticating there writes the session in the wrong place and then mints the app
 * token across a WAN.
 *
 * A client already knows its app id before it has any credential: it is a build-time
 * constant. So it can ask this, move to the returned origin, and log in locally. That is
 * the whole trick, and it is why this query takes no token.
 *
 * PLURAL. A launcher or in-game switcher resolves every game it might offer in one call
 * and caches the answer, so switching games is instant instead of a round trip at click
 * time. Placement changes rarely and only an operator can change it.
 *
 * An app with no placement comes back with null endpoints, which means "stay on the
 * shared origin" — not "this app is broken".
 */
import type { GraphQLClient } from '../client.js';
import { AppDiscoveryDocument } from '../generated/graphql.js';

export interface AppEndpoint {
  /** The app this entry describes (decimal string). */
  appId: string;
  /** Datacenter code, e.g. `or` / `va`. Null when the app has no placement. */
  datacenterCode: string | null;
  /** HTTPS GraphQL origin for the app's own datacenter, or null if unplaced. */
  gameApiUrl: string | null;
  /** The wss:// form of gameApiUrl. */
  gameApiWsUrl: string | null;
}

export class DiscoveryDomain {
  constructor(private readonly gql: GraphQLClient) {}

  /**
   * Resolve where one or more apps are placed. No authentication required.
   *
   * Call this against the SHARED origin — that is the name every datacenter answers, and
   * the only one a client can rely on before it knows where it belongs.
   */
  async apps(appIds: Array<string | number | bigint>): Promise<AppEndpoint[]> {
    const data = await this.gql.request(AppDiscoveryDocument, {
      appIds: appIds.map((id) => String(id)),
    });
    return data.appDiscovery.map((entry) => ({
      appId: String(entry.appId),
      datacenterCode: entry.datacenterCode ?? null,
      gameApiUrl: entry.gameApiUrl ?? null,
      gameApiWsUrl: entry.gameApiWsUrl ?? null,
    }));
  }

  /**
   * Resolve one app, or null if it has no placement.
   *
   * Convenience over {@link apps}; prefer the plural form when you have more than one,
   * because it is one round trip rather than N.
   */
  async app(appId: string | number | bigint): Promise<AppEndpoint | null> {
    const [entry] = await this.apps([appId]);
    if (!entry || !entry.gameApiUrl) return null;
    return entry;
  }
}
