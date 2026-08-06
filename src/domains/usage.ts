import type { GraphQLClient } from '../client.js';
import {
  AppGraphqlOperationsDocument,
  AppUsageSummaryDocument,
  PlayerPulseDocument,
  type AppGraphqlOperationsQuery,
  type AppUsageSummaryQuery,
  type PlayerPulseQuery,
} from '../generated/graphql.js';

/**
 * Replication + GraphQL usage reporting — exposed as `client.usage` (and
 * grouped under `client.admin`).
 *
 * All operations are read-only observability and require the `view_usage` org
 * permission. `since` args are ISO-8601 `DateTime` strings; byte/message
 * counters are returned as string counters because they can exceed the 32-bit
 * Int range. `BigInt` ids are decimal strings.
 *
 * As of the unified galaxy API the per-environment rollups
 * (environmentSummary/orgByEnvironment/environmentByApp) were retired with
 * dedicated customer environments — usage is org/app-scoped.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class UsageAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * Top GraphQL operations for an app ranked by bytes.
   *
   * @param orgId - Numeric org id.
   * @param appId - Numeric app id.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @param limit - Max operations to return (default 20).
   * @returns The top operations by usage.
   */
  async appGraphqlOperations(
    orgId: string,
    appId: string,
    since: string,
    limit?: number,
  ): Promise<AppGraphqlOperationsQuery['appGraphqlOperations']> {
    const data = await this.api.request(AppGraphqlOperationsDocument, {
      orgId,
      appId,
      since,
      limit,
    });
    return data.appGraphqlOperations;
  }

  /**
   * Byte totals plus top GraphQL operations for one app over a window.
   *
   * @param orgId - Numeric org id.
   * @param appId - Numeric app id.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @param operationLimit - Max top operations to include (default 20).
   * @returns The {@link AppUsageSummary}.
   */
  async appSummary(
    orgId: string,
    appId: string,
    since: string,
    operationLimit?: number,
  ): Promise<AppUsageSummaryQuery['appUsageSummary']> {
    const data = await this.api.request(AppUsageSummaryDocument, {
      orgId,
      appId,
      since,
      operationLimit,
    });
    return data.appUsageSummary;
  }

  /**
   * Live concurrent-player "pulse" for an org: current and all-time-peak
   * concurrents for the org, the site-wide live total (aggregate only), and the
   * org's percentile within the studio pool. Requires the `view_usage` org
   * permission.
   *
   * @param orgId - Numeric org id.
   * @returns The {@link PlayerPulse} snapshot.
   */
  async playerPulse(
    orgId: string,
  ): Promise<PlayerPulseQuery['playerPulse']> {
    const data = await this.api.request(PlayerPulseDocument, { orgId });
    return data.playerPulse;
  }
}
