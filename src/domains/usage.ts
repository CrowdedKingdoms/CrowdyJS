import type { GraphQLClient } from '../client.js';
import {
  EnvironmentUsageSummaryDocument,
  OrgUsageByEnvironmentDocument,
  EnvironmentUsageByAppDocument,
  AppGraphqlOperationsDocument,
  AppUsageSummaryDocument,
  PlayerPulseDocument,
  type EnvironmentUsageSummaryQuery,
  type OrgUsageByEnvironmentQuery,
  type EnvironmentUsageByAppQuery,
  type AppGraphqlOperationsQuery,
  type AppUsageSummaryQuery,
  type PlayerPulseQuery,
} from '../generated/graphql.js';

/**
 * Replication + GraphQL usage reporting — exposed as `client.usage` (and
 * grouped under `client.admin`).
 *
 * Targets the **management-api**. All operations are read-only observability and
 * require the `view_usage` org permission. `since` args are ISO-8601 `DateTime`
 * strings; byte/message counters are returned as string counters because they
 * can exceed the 32-bit Int range. `BigInt` ids are decimal strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class UsageAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Per-minute replication + GraphQL usage time series for one environment,
   * with rate peaks and live Buddy rates.
   *
   * @param orgId - Numeric org id.
   * @param environmentSlug - Environment slug to report on.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @returns The {@link EnvironmentUsageSummary}.
   */
  async environmentSummary(
    orgId: string,
    environmentSlug: string,
    since: string,
  ): Promise<EnvironmentUsageSummaryQuery['environmentUsageSummary']> {
    const data = await this.management.request(
      EnvironmentUsageSummaryDocument,
      { orgId, environmentSlug, since },
    );
    return data.environmentUsageSummary;
  }

  /**
   * Aggregate byte totals per environment across an org for a window.
   *
   * @param orgId - Numeric org id.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @returns One rollup row per environment.
   */
  async orgByEnvironment(
    orgId: string,
    since: string,
  ): Promise<OrgUsageByEnvironmentQuery['orgUsageByEnvironment']> {
    const data = await this.management.request(OrgUsageByEnvironmentDocument, {
      orgId,
      since,
    });
    return data.orgUsageByEnvironment;
  }

  /**
   * Aggregate byte totals per app for the apps linked to an environment.
   *
   * @param orgId - Numeric org id.
   * @param environmentSlug - Environment slug whose apps to roll up.
   * @param since - Start of the window (ISO-8601 DateTime) up to now.
   * @returns One rollup row per app.
   */
  async environmentByApp(
    orgId: string,
    environmentSlug: string,
    since: string,
  ): Promise<EnvironmentUsageByAppQuery['environmentUsageByApp']> {
    const data = await this.management.request(EnvironmentUsageByAppDocument, {
      orgId,
      environmentSlug,
      since,
    });
    return data.environmentUsageByApp;
  }

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
    const data = await this.management.request(AppGraphqlOperationsDocument, {
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
    const data = await this.management.request(AppUsageSummaryDocument, {
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
    const data = await this.management.request(PlayerPulseDocument, { orgId });
    return data.playerPulse;
  }
}
