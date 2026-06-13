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
 * The minimal routing tuple the SDK derives from an `App` row: just enough to
 * decide which game-api endpoint should serve a given app. Returned by
 * {@link AppsAPI.routeFor}.
 */
export interface AppRoute {
  /** Numeric id of the app (`BigInt` as a decimal string). */
  appId: string;
  /**
   * `true` when the app's runtime data lives in a dedicated per-tenant game-api
   * database rather than the shared game-api. Used together with `gameApiUrl` to
   * route gameplay calls.
   */
  splitMode: boolean;
  /**
   * Where the app runs: `'none'` (draft / not deployed), `'shared'` (the shared
   * game-api), or `'dedicated'` (a provisioned per-tenant environment). `null`
   * until the schema/codegen expose it.
   */
  deploymentTarget: string | null;
  /**
   * The game-api base URL to route gameplay to. Set for BOTH dedicated
   * (split-mode) and shared-environment apps. When non-null, build a game-api
   * client against it; when `null`, fall back to the constructor `httpUrl`.
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

/**
 * App discovery & game-api routing — exposed as `client.apps`.
 *
 * Targets the **management-api** (every call routes to `managementUrl`), where
 * the apps catalog lives. After the database split an app may be served by its
 * own per-tenant cks-game-api; the catalog returns each app's `gameApiUrl` so
 * you can build a per-app `CrowdyClient` against the correct endpoint (see
 * {@link routeFor} / {@link AppRoute}).
 *
 * Auth: {@link appBySlug} is **public** (no session; resolves unlisted or draft
 * apps when the exact slugs are known). {@link app}, {@link myApps}, and
 * {@link routeFor} require authentication (any signed-in user) and otherwise
 * throw {@link CrowdyGraphQLError} with `UNAUTHENTICATED`; note {@link app} does
 * not enforce org/app permissions. `BigInt` ids such as `appId` and `orgId` are
 * decimal strings.
 *
 * @example
 * ```ts
 * const base = createCrowdyClient({
 *   managementUrl: 'https://api.example.com',
 *   httpUrl: 'https://legacy-game-api.example.com', // pre-split fallback
 * });
 * await base.auth.login({ email, password });
 *
 * const route = await base.apps.routeFor(appId);
 * if (route.gameApiUrl) {
 *   // route gameplay to the app's resolved game-api endpoint
 *   const perAppClient = createCrowdyClient({
 *     managementUrl: 'https://api.example.com',
 *     httpUrl: route.gameApiUrl,
 *     wsUrl: route.gameApiUrl.replace(/^http/, 'ws'),
 *     tokenStore: base.session.tokenStore,
 *   });
 * }
 * ```
 */
export class AppsAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Fetch a single app by its numeric id. Requires authentication (any signed-in
   * user); does **not** enforce org/app permissions, so it can read apps the
   * caller does not own, of any visibility/status. Prefer {@link appBySlug} for
   * slug-based marketplace lookups.
   *
   * @param appId - Numeric id of the app (`BigInt` as a decimal string).
   * @returns The {@link App}, or `null` if the id does not exist.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the caller is not signed in.
   */
  async app(appId: string): Promise<AppQuery['app']> {
    const data = await this.management.request<AppQuery, AppQueryVariables>(
      AppDocument,
      { appId },
    );
    return data.app;
  }

  /**
   * Look up a single app by its org slug + app slug (the marketplace URL path).
   * **Public**: no authentication required, and not filtered by visibility or
   * status — it can resolve unlisted or draft apps when the exact slugs are
   * known.
   *
   * @param orgSlug - URL slug of the owning organization (e.g. `"acme"` in the
   *   path `/acme/my-game`).
   * @param appSlug - URL slug of the app within the org (e.g. `"my-game"`);
   *   unique per org.
   * @returns The {@link App}, or `null` if no matching app exists.
   * @throws {CrowdyGraphQLError} on transport/validation failures.
   */
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

  /**
   * List the apps the authenticated caller can see in their account: those owned
   * by an org they are an active member of, OR those where they hold an active
   * access grant. Includes apps of any visibility/status (e.g. accessible
   * drafts), ordered newest-first. Requires authentication.
   *
   * @returns The caller's accessible {@link App}s (an empty array if none).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the caller is not signed in.
   */
  async myApps(): Promise<MyAppsQuery['myApps']> {
    const data = await this.management.request<
      MyAppsQuery,
      Record<string, never>
    >(MyAppsDocument, {});
    return data.myApps;
  }

  /**
   * Convenience wrapper over {@link app} that returns just the {@link AppRoute}
   * routing tuple for an app — i.e. which game-api endpoint should serve it. If
   * the app row is missing or the API does not expose the split-mode fields yet,
   * returns a safe default (`{ appId, splitMode: false, deploymentTarget: null,
   * gameApiUrl: null }`) so the caller keeps using the legacy single-endpoint
   * deployment.
   *
   * @param appId - Numeric id of the app (`BigInt` as a decimal string).
   * @returns The {@link AppRoute}; route gameplay to `gameApiUrl` when non-null,
   *   otherwise fall back to the constructor `httpUrl`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` (it calls {@link app} under
   *   the hood).
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
