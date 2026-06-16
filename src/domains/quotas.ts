import type { GraphQLClient } from '../client.js';
import {
  QuotasForOrgDocument,
  QuotasForAppDocument,
  EffectiveQuotaDocument,
  SetQuotaDocument,
  DeleteQuotaDocument,
  type QuotasForOrgQuery,
  type QuotasForAppQuery,
  type EffectiveQuotaQuery,
  type SetQuotaMutation,
  type DeleteQuotaMutation,
  type SetQuotaInput,
} from '../generated/graphql.js';

/**
 * Usage quotas at the org and app scope — exposed as `client.quotas` (and
 * grouped under `client.admin`).
 *
 * Targets the **management-api**. Reads require the `view_usage` org/app
 * permission; {@link set} / {@link remove} require `manage_quotas` (global
 * quotas are super-admin only). A quota is keyed by a `metric` string; the
 * effective value resolves app → org → platform default.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class QuotasAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * List the quotas configured directly on an organization. Requires the
   * `view_usage` org permission.
   *
   * @param orgId - Numeric org id (`BigInt` as a decimal string).
   * @returns The org's quotas.
   */
  async forOrg(orgId: string): Promise<QuotasForOrgQuery['quotasForOrg']> {
    const data = await this.management.request(QuotasForOrgDocument, { orgId });
    return data.quotasForOrg;
  }

  /**
   * List the quotas configured directly on an app. Requires the `view_usage`
   * app permission.
   *
   * @param appId - Numeric app id.
   * @returns The app's quotas.
   */
  async forApp(appId: string): Promise<QuotasForAppQuery['quotasForApp']> {
    const data = await this.management.request(QuotasForAppDocument, { appId });
    return data.quotasForApp;
  }

  /**
   * Resolve the effective value of a metric for an org and/or app (app overrides
   * org overrides platform default). Requires `view_usage` on the scope.
   *
   * @param metric - The quota metric key (e.g. `"replication_messages"`).
   * @param scope - Optional `orgId` and/or `appId` to resolve against.
   * @returns The effective quota for the metric.
   */
  async effective(
    metric: string,
    scope: { orgId?: string; appId?: string } = {},
  ): Promise<EffectiveQuotaQuery['effectiveQuota']> {
    const data = await this.management.request(EffectiveQuotaDocument, {
      metric,
      orgId: scope.orgId,
      appId: scope.appId,
    });
    return data.effectiveQuota;
  }

  /**
   * Create or update a quota at an org or app scope. Requires `manage_quotas`
   * (super-admin for platform-global quotas).
   *
   * @param input - {@link SetQuotaInput}: scope ids, `metric`, and `limit`.
   * @returns The created/updated quota.
   */
  async set(input: SetQuotaInput): Promise<SetQuotaMutation['setQuota']> {
    const data = await this.management.request(SetQuotaDocument, { input });
    return data.setQuota;
  }

  /**
   * Delete a quota by id. Requires `manage_quotas` on the owning scope.
   *
   * @param quotaId - Numeric quota id.
   * @returns `true` on success.
   */
  async remove(quotaId: string): Promise<DeleteQuotaMutation['deleteQuota']> {
    const data = await this.management.request(DeleteQuotaDocument, {
      quotaId,
    });
    return data.deleteQuota;
  }
}
