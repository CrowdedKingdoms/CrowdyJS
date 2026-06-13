import { parse } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '../client.js';

/**
 * Public platform discovery returned by {@link PlatformAPI.config}: how SDKs
 * find the shared game-api so they can route apps deployed to the shared
 * environment. All fields are public (no auth required to read them).
 */
export interface PlatformConfig {
  /** Shared game-api HTTP/GraphQL root for shared-environment apps; `null` if unset. */
  sharedGameApiUrl: string | null;
  /** Shared game-api WebSocket root (subscriptions / UDP proxy); `null` if unset. */
  sharedGameApiWsUrl: string | null;
  /** Free shared app slots an org gets before a paid subscription is required. */
  freeAppsPerOrg: number;
}

// Hand-written document so the SDK can discover the shared game-api URL even
// before codegen picks up the new schema (see src/operations/platform/).
const PlatformConfigDocument = parse(/* GraphQL */ `
  query PlatformConfig {
    platformConfig {
      sharedGameApiUrl
      sharedGameApiWsUrl
      freeAppsPerOrg
    }
  }
`) as unknown as TypedDocumentNode<
  { platformConfig: PlatformConfig },
  Record<string, never>
>;

/**
 * Public platform discovery — exposed as `client.platform`.
 *
 * Targets the **management-api** (every call routes to `managementUrl`).
 * **Public**: no authentication required. Lets a client discover the shared
 * game-api URL (for apps published to the shared environment) *before* it has a
 * per-app endpoint, then build a game-api `CrowdyClient` against it.
 *
 * @example
 * ```ts
 * const base = createCrowdyClient({ managementUrl: 'https://api.example.com' });
 * const cfg = await base.platform.config();
 * const gameClient = createCrowdyClient({
 *   managementUrl: 'https://api.example.com',
 *   httpUrl: cfg.sharedGameApiUrl ?? undefined,
 *   wsUrl: cfg.sharedGameApiWsUrl ?? undefined,
 *   tokenStore: base.session.tokenStore,
 * });
 * ```
 */
export class PlatformAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Fetch public platform discovery: the shared game-api URL clients use for
   * shared-environment apps, plus the free shared-app quota. **Public** — no
   * authentication required.
   *
   * @returns A {@link PlatformConfig} (`sharedGameApiUrl`, `sharedGameApiWsUrl`,
   *   and `freeAppsPerOrg`).
   * @throws {CrowdyGraphQLError} on transport/validation failures.
   */
  async config(): Promise<PlatformConfig> {
    const data = await this.management.request(PlatformConfigDocument, {});
    return data.platformConfig;
  }
}
