import type { GraphQLClient } from '../client.js';

import {
  WalletBalanceDocument,
  type WalletBalanceQuery,
  type WalletBalanceQueryVariables,
  WalletTransactionsDocument,
  type WalletTransactionsQuery,
  type WalletTransactionsQueryVariables,
  AppBudgetDocument,
  type AppBudgetQuery,
  type AppBudgetQueryVariables,
  SetAppBudgetDocument,
  type SetAppBudgetMutation,
  type SetAppBudgetMutationVariables,
} from '../generated/graphql.js';

/**
 * Billing & wallet operations: balances, transactions, app budgets.
 *
 * Exposed as `client.billing`.
 */
export class BillingAPI {
  constructor(private gql: GraphQLClient) {}

  async balance(
    orgId: WalletBalanceQueryVariables['orgId']
  ): Promise<WalletBalanceQuery['walletBalance']> {
    const data = await this.gql.request(WalletBalanceDocument, { orgId });
    return data.walletBalance;
  }

  async transactions(
    args: WalletTransactionsQueryVariables
  ): Promise<WalletTransactionsQuery['walletTransactions']> {
    const data = await this.gql.request(WalletTransactionsDocument, args);
    return data.walletTransactions;
  }

  async appBudget(
    orgId: AppBudgetQueryVariables['orgId'],
    appId: AppBudgetQueryVariables['appId']
  ): Promise<AppBudgetQuery['appBudget']> {
    const data = await this.gql.request(AppBudgetDocument, { orgId, appId });
    return data.appBudget;
  }

  async setAppBudget(
    args: SetAppBudgetMutationVariables
  ): Promise<SetAppBudgetMutation['setAppBudget']> {
    const data = await this.gql.request(SetAppBudgetDocument, args);
    return data.setAppBudget;
  }
}
