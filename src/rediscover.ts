import type { AppTokenResponse } from './domains/portal';

/** The minimum of a portal client this helper needs. */
export interface MintCapablePortal {
  mintAppToken(appId: string): Promise<AppTokenResponse>;
}

/**
 * Build a `realtime.rediscover` that asks the load balancer for another
 * instance by re-minting the app token.
 *
 * Under direct connect `mintAppToken` returns ONE api instance's own hostname,
 * so gameplay bypasses the shared load balancer. The cost is that the client is
 * pinned: if that instance goes away, retrying its hostname can never recover,
 * and the symptom is a realtime session that connects and then carries nothing.
 *
 * Re-minting is the fix because it goes back through the load balancer, which
 * picks a healthy instance. It must be wired from the IDENTITY client, because
 * minting needs the session token and a game client holds an app-scoped one.
 *
 * If you only have an app token, prefer `realtime.discoveryUrl`. Two sources publish it:
 * `gameClientBootstrap` has since ck-api v1.20.0, and `mintAppToken` /
 * `exchangePortalCode` / `refreshAppToken` do since the datacenter rebuild — which
 * matters because a client that entered by portal holds a token and may never call
 * bootstrap. In both cases it is the SHARED origin, resolving to every datacenter, and
 * never the per-datacenter endpoint the app is actually served from,
 * and the client builds re-discovery from it with no callback at all. This
 * helper remains the right choice when you already hold an identity client,
 * since it re-mints rather than reusing a token that may be near expiry.
 *
 * ```ts
 * const gameClient = new CrowdyClient({
 *   httpUrl, wsUrl, managementUrl,
 *   realtime: {
 *     binaryTransport: true,
 *     rediscover: createMintRediscover(identityClient.portal),
 *   },
 * });
 * ```
 *
 * A failure here is deliberately not fatal: returning null leaves the client on
 * its current endpoint and its normal retry, which is strictly better than
 * throwing out of a reconnect path.
 */
export function createMintRediscover(
  portal: MintCapablePortal,
  options: { appId?: string; logger?: { warn?: (msg: string) => void } } = {},
): (appId: string | null) => Promise<{
  httpUrl?: string | null;
  wsUrl?: string | null;
} | null> {
  return async (subscribedAppId: string | null) => {
    const appId = options.appId ?? subscribedAppId;
    if (!appId) {
      options.logger?.warn?.(
        'Cannot re-discover: no appId. Pass one to createMintRediscover, or ' +
          'subscribe before the endpoint fails.',
      );
      return null;
    }
    try {
      const minted = await portal.mintAppToken(appId);
      return { httpUrl: minted.gameApiUrl, wsUrl: minted.gameApiWsUrl };
    } catch (error) {
      options.logger?.warn?.(
        `Re-discovery via mintAppToken failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  };
}
