import type { GraphQLClient } from '../client.js';

import {
  QuotasForOrgDocument,
  type QuotasForOrgQuery,
  type QuotasForOrgQueryVariables,
  QuotasForAppDocument,
  type QuotasForAppQuery,
  type QuotasForAppQueryVariables,
  EffectiveQuotaDocument,
  type EffectiveQuotaQuery,
  type EffectiveQuotaQueryVariables,
  SetQuotaDocument,
  type SetQuotaMutation,
  type SetQuotaMutationVariables,
  DeleteQuotaDocument,
  type DeleteQuotaMutationVariables,
} from '../generated/graphql.js';

/**
 * Service quota management. Exposed as `client.quotas`.
 */
export class QuotasAPI {
  constructor(private gql: GraphQLClient) {}

  async byOrg(
    orgId: QuotasForOrgQueryVariables['orgId'],
  ): Promise<QuotasForOrgQuery['quotasForOrg']> {
    const data = await this.gql.request(QuotasForOrgDocument, { orgId });
    return data.quotasForOrg;
  }

  async byApp(
    appId: QuotasForAppQueryVariables['appId'],
  ): Promise<QuotasForAppQuery['quotasForApp']> {
    const data = await this.gql.request(QuotasForAppDocument, { appId });
    return data.quotasForApp;
  }

  /**
   * Returns the most-specific quota that applies to (orgId, appId, tierId,
   * metric). Walks tier -> app -> org -> free_tier_defaults. Returns null
   * when nothing matches.
   */
  async effective(
    args: EffectiveQuotaQueryVariables,
  ): Promise<EffectiveQuotaQuery['effectiveQuota']> {
    const data = await this.gql.request(EffectiveQuotaDocument, args);
    return data.effectiveQuota;
  }

  async set(
    input: SetQuotaMutationVariables['input'],
  ): Promise<SetQuotaMutation['setQuota']> {
    const data = await this.gql.request(SetQuotaDocument, { input });
    return data.setQuota;
  }

  async delete(
    quotaId: DeleteQuotaMutationVariables['quotaId'],
  ): Promise<boolean> {
    const data = await this.gql.request(DeleteQuotaDocument, { quotaId });
    return data.deleteQuota;
  }
}
