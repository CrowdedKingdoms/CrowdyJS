/**
 * Platform discovery sub-client. Targets `cks-management-api`. Lets a client
 * find the shared game-api URL (for apps published to the shared environment)
 * BEFORE it has a per-app endpoint, then build a game-api `CrowdyClient`
 * against it.
 *
 * Typical pattern:
 *
 *   const base = createCrowdyClient({ managementUrl: 'https://api.example.com' });
 *   const cfg = await base.platform.config();
 *   const gameClient = createCrowdyClient({
 *     managementUrl: 'https://api.example.com',
 *     httpUrl: cfg.sharedGameApiUrl ?? undefined,
 *     wsUrl: cfg.sharedGameApiWsUrl ?? undefined,
 *     tokenStore: base.session.tokenStore,
 *   });
 */

import { parse } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '../client.js';

export interface PlatformConfig {
  /** Shared game-api HTTP/GraphQL root for shared-environment apps. */
  sharedGameApiUrl: string | null;
  /** Shared game-api WebSocket root (subscriptions / UDP proxy). */
  sharedGameApiWsUrl: string | null;
  /** Free shared app slots an org gets before a paid subscription. */
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

export class PlatformAPI {
  constructor(private readonly management: GraphQLClient) {}

  /** Fetch public platform discovery (shared game-api URL, free app quota). */
  async config(): Promise<PlatformConfig> {
    const data = await this.management.request(PlatformConfigDocument, {});
    return data.platformConfig;
  }
}
