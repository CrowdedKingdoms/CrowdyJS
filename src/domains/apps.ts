/**
 * Apps sub-client. Targets `cks-management-api` (where the apps catalog
 * lives). After the DB split each app may be served by its own per-tenant
 * cks-game-api; the marketplace returns `gameApiUrl` for those rows so the
 * caller can build a per-app `CrowdyClient` against the correct endpoint.
 *
 * Typical pattern:
 *
 *   const baseClient = createCrowdyClient({
 *     managementUrl: 'https://api.example.com',
 *     httpUrl: 'https://legacy-game-api.example.com', // pre-split fallback
 *   });
 *   await baseClient.auth.login({ email, password });
 *
 *   const route = await baseClient.apps.routeFor(appId);
 *   if (route.gameApiUrl) {
 *     // Set for both dedicated (split-mode) AND shared-environment apps.
 *     const perAppClient = createCrowdyClient({
 *       managementUrl: 'https://api.example.com',
 *       httpUrl: route.gameApiUrl,
 *       wsUrl: route.gameApiUrl.replace(/^http/, 'ws'),
 *       tokenStore: baseClient.session.tokenStore,
 *     });
 *     // drive gameplay through perAppClient
 *   }
 */

import type { GraphQLClient } from '../client.js';
import {
  AppDocument,
  AppBySlugDocument,
  MyAppsDocument,
  type AppQuery,
  type AppQueryVariables,
  type AppBySlugQuery,
  type AppBySlugQueryVariables,
  type MyAppsQuery,
} from '../generated/graphql.js';

/**
 * Subset of an `App` row that the SDK exposes for routing decisions. The
 * fields are typed loosely as `unknown` because the generated types lag
 * behind the `splitMode` / `gameApiUrl` selection until codegen runs.
 */
export interface AppRoute {
  appId: string;
  splitMode: boolean;
  /**
   * 'none' (draft), 'shared' (the shared game-api), or 'dedicated' (a
   * per-tenant environment). Populated once the schema/codegen expose it.
   */
  deploymentTarget: string | null;
  /**
   * The game-api URL to route gameplay to. Set for BOTH dedicated (split-mode)
   * and shared-environment apps. When non-null, build a game-api client
   * against it; when null, fall back to the constructor `httpUrl`.
   */
  gameApiUrl: string | null;
}

function appRouteFromAppRow(row: unknown): AppRoute | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.appId !== 'string') return null;
  return {
    appId: r.appId,
    splitMode: typeof r.splitMode === 'boolean' ? r.splitMode : false,
    deploymentTarget:
      typeof r.deploymentTarget === 'string' ? r.deploymentTarget : null,
    gameApiUrl:
      typeof r.gameApiUrl === 'string' && r.gameApiUrl ? r.gameApiUrl : null,
  };
}

export class AppsAPI {
  constructor(private readonly management: GraphQLClient) {}

  /** Fetch a single app by id. */
  async app(appId: string): Promise<AppQuery['app']> {
    const data = await this.management.request<AppQuery, AppQueryVariables>(
      AppDocument,
      { appId },
    );
    return data.app;
  }

  /** Fetch by org slug + app slug (marketplace links). */
  async appBySlug(
    orgSlug: string,
    appSlug: string,
  ): Promise<AppBySlugQuery['appBySlug']> {
    const data = await this.management.request<
      AppBySlugQuery,
      AppBySlugQueryVariables
    >(AppBySlugDocument, { orgSlug, appSlug });
    return data.appBySlug;
  }

  /** Apps the caller can play (org membership OR active access). */
  async myApps(): Promise<MyAppsQuery['myApps']> {
    const data = await this.management.request<
      MyAppsQuery,
      Record<string, never>
    >(MyAppsDocument, {});
    return data.myApps;
  }

  /**
   * Convenience: returns just the routing tuple for a given app. If the
   * app row is missing or the API does not expose split-mode fields yet,
   * returns `{ appId, splitMode: false, gameApiUrl: null }` so the caller
   * keeps using the legacy single-endpoint deployment.
   */
  async routeFor(appId: string): Promise<AppRoute> {
    const row = await this.app(appId);
    return (
      appRouteFromAppRow(row) ?? {
        appId,
        splitMode: false,
        deploymentTarget: null,
        gameApiUrl: null,
      }
    );
  }
}
