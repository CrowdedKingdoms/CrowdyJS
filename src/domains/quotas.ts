import type { GraphQLClient } from '../client.js';
import { CrowdyError } from '../errors.js';
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
 * A quota rule for {@link QuotasAPI.set}: {@link SetQuotaInput} scoped to an app
 * or an organization (`tierId` may narrow either). The SDK does not set
 * platform-global rules.
 */
export type ScopedSetQuotaInput = SetQuotaInput &
  ({ appId: string } | { orgId: string });

/**
 * Usage quotas at the org and app scope — exposed as `client.quotas` (and
 * grouped under `client.admin`).
 *
 * Part of the management surface. Reads require the `view_usage` org/app
 * permission; {@link set} / {@link remove} require `manage_quotas` on the
 * rule's org or app. A quota is keyed by a `metric` string; the effective
 * value resolves app → org → platform default.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class QuotasAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * List the quotas configured directly on an organization. Requires the
   * `view_usage` org permission.
   *
   * @param orgId - Numeric org id (`BigInt` as a decimal string).
   * @returns The org's quotas.
   */
  async forOrg(orgId: string): Promise<QuotasForOrgQuery['quotasForOrg']> {
    const data = await this.api.request(QuotasForOrgDocument, { orgId });
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
    const data = await this.api.request(QuotasForAppDocument, { appId });
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
    const data = await this.api.request(EffectiveQuotaDocument, {
      metric,
      orgId: scope.orgId,
      appId: scope.appId,
    });
    return data.effectiveQuota;
  }

  /**
   * Create or update a quota at an org or app scope. Requires `manage_quotas`
   * on that org or app.
   *
   * @param input - {@link ScopedSetQuotaInput}: `appId` or `orgId` (and
   *   optionally `tierId`), `metric`, and `limitValue`.
   * @returns The created/updated quota.
   * @throws {CrowdyError} before any request when the input names neither an
   *   app nor an organization.
   */
  async set(input: ScopedSetQuotaInput): Promise<SetQuotaMutation['setQuota']> {
    if (!input.appId && !input.orgId) {
      throw new CrowdyError({
        message: 'quotas.set needs an appId or an orgId: the SDK sets app and org quotas only',
      });
    }
    const data = await this.api.request(SetQuotaDocument, { input });
    return data.setQuota;
  }

  /**
   * Delete a quota by id. Requires `manage_quotas` on the quota's org or app.
   *
   * @param quotaId - Numeric quota id.
   * @returns `true` on success.
   */
  async remove(quotaId: string): Promise<DeleteQuotaMutation['deleteQuota']> {
    const data = await this.api.request(DeleteQuotaDocument, {
      quotaId,
    });
    return data.deleteQuota;
  }
}
