/**
 * Re-discovery for a client that holds only an app-scoped token.
 *
 * {@link createMintRediscover} needs the identity session, so it can only be
 * wired by a caller that has one. A game that was handed an app token and
 * nothing else could not recover at all — which is the common case, since the
 * Overworld portal mints the token and the game receives it.
 *
 * `gameClientBootstrap.discoveryUrl` closes that: it is the environment's shared
 * load balancer, which by definition still answers when a single instance does
 * not, and querying it with the app token the client already holds returns a
 * fresh `gameApiUrl`/`gameApiWsUrl`.
 */

const BOOTSTRAP_QUERY = `query CrowdyJsRediscover($appId: BigInt!) {
  gameClientBootstrap(appId: $appId) { gameApiUrl gameApiWsUrl discoveryUrl }
}`;

export interface BootstrapRediscoverOptions {
  /**
   * The shared load balancer origin, from a previous
   * `gameClientBootstrap.discoveryUrl`. Pointing this at an instance hostname
   * defeats the entire purpose: it would die with the instance it is meant to
   * replace.
   */
  discoveryUrl: string;
  /** Bearer token to authenticate with; usually the app-scoped token. */
  getToken: () => string | null | undefined;
  appId?: string;
  fetchImpl?: typeof fetch;
  logger?: { warn?: (msg: string) => void };
}

function graphqlEndpoint(origin: string): string {
  const trimmed = origin.replace(/\/+$/, '');
  return trimmed.endsWith('/graphql') ? trimmed : `${trimmed}/graphql`;
}

export function createBootstrapRediscover(
  options: BootstrapRediscoverOptions,
): (appId: string | null) => Promise<{
  httpUrl?: string | null;
  wsUrl?: string | null;
} | null> {
  return async (subscribedAppId: string | null) => {
    const appId = options.appId ?? subscribedAppId;
    if (!appId) {
      options.logger?.warn?.(
        'Cannot re-discover: no appId. Pass one to createBootstrapRediscover, ' +
          'or subscribe before the endpoint fails.',
      );
      return null;
    }
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    if (!doFetch) {
      options.logger?.warn?.('Cannot re-discover: no fetch implementation.');
      return null;
    }
    try {
      const token = options.getToken();
      const res = await doFetch(graphqlEndpoint(options.discoveryUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: BOOTSTRAP_QUERY,
          variables: { appId },
        }),
      });
      if (!res.ok) {
        options.logger?.warn?.(
          `Re-discovery via discoveryUrl failed: HTTP ${res.status}`,
        );
        return null;
      }
      const body = (await res.json()) as {
        data?: {
          gameClientBootstrap?: {
            gameApiUrl?: string | null;
            gameApiWsUrl?: string | null;
          } | null;
        };
      };
      const found = body?.data?.gameClientBootstrap;
      if (!found?.gameApiUrl && !found?.gameApiWsUrl) {
        // An older server that does not publish these fields yet. Say so once
        // rather than looping on an endpoint that can never answer.
        options.logger?.warn?.(
          'Re-discovery returned no endpoint; this server may predate ' +
            'gameClientBootstrap.discoveryUrl (ck-api v1.20.0).',
        );
        return null;
      }
      return { httpUrl: found.gameApiUrl, wsUrl: found.gameApiWsUrl };
    } catch (error) {
      // Never fatal: returning null leaves the client on its current endpoint
      // and its normal retry, which beats throwing out of a reconnect path.
      options.logger?.warn?.(
        `Re-discovery via discoveryUrl failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  };
}
