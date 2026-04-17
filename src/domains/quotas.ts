import type { GraphQLClient } from '../client.js';

import {
  QuotasForOrgDocument,
  type QuotasForOrgQuery,
  type QuotasForOrgQueryVariables,
  QuotasForAppDocument,
  type QuotasForAppQuery,
  type QuotasForAppQueryVariables,
  SetQuotaDocument,
  type SetQuotaMutation,
  type SetQuotaMutationVariables,
  DeleteQuotaDocument,
  type DeleteQuotaMutationVariables,
} from '../generated/graphql.js';

/**
 * Service quota management.
 *
 * Exposed as `client.quotas`.
 */
export class QuotasAPI {
  constructor(private gql: GraphQLClient) {}

  async byOrg(
    orgId: QuotasForOrgQueryVariables['orgId']
  ): Promise<QuotasForOrgQuery['quotasForOrg']> {
    const data = await this.gql.request(QuotasForOrgDocument, { orgId });
    return data.quotasForOrg;
  }

  async byApp(
    appId: QuotasForAppQueryVariables['appId']
  ): Promise<QuotasForAppQuery['quotasForApp']> {
    const data = await this.gql.request(QuotasForAppDocument, { appId });
    return data.quotasForApp;
  }

  async set(
    input: SetQuotaMutationVariables['input']
  ): Promise<SetQuotaMutation['setQuota']> {
    const data = await this.gql.request(SetQuotaDocument, { input });
    return data.setQuota;
  }

  async delete(quotaId: DeleteQuotaMutationVariables['quotaId']): Promise<boolean> {
    const data = await this.gql.request(DeleteQuotaDocument, { quotaId });
    return data.deleteQuota;
  }
}
