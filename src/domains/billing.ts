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
  AppBudgetsDocument,
  type AppBudgetsQuery,
  type AppBudgetsQueryVariables,
  SetAppBudgetDocument,
  type SetAppBudgetMutation,
  type SetAppBudgetMutationVariables,
} from '../generated/graphql.js';

/**
 * Billing & wallet operations: balances, transactions, app budgets. Exposed
 * as `client.billing`. Wallet top-up flows go through `client.payments`
 * (CheckoutPurpose=ORG_WALLET_TOPUP).
 */
export class BillingAPI {
  constructor(private gql: GraphQLClient) {}

  async balance(
    orgId: WalletBalanceQueryVariables['orgId'],
  ): Promise<WalletBalanceQuery['walletBalance']> {
    const data = await this.gql.request(WalletBalanceDocument, { orgId });
    return data.walletBalance;
  }

  async transactions(
    args: WalletTransactionsQueryVariables,
  ): Promise<WalletTransactionsQuery['walletTransactions']> {
    const data = await this.gql.request(WalletTransactionsDocument, args);
    return data.walletTransactions;
  }

  async appBudget(
    args: AppBudgetQueryVariables,
  ): Promise<AppBudgetQuery['appBudget']> {
    const data = await this.gql.request(AppBudgetDocument, args);
    return data.appBudget;
  }

  async appBudgets(
    orgId: AppBudgetsQueryVariables['orgId'],
  ): Promise<AppBudgetsQuery['appBudgets']> {
    const data = await this.gql.request(AppBudgetsDocument, { orgId });
    return data.appBudgets;
  }

  async setAppBudget(
    args: SetAppBudgetMutationVariables,
  ): Promise<SetAppBudgetMutation['setAppBudget']> {
    const data = await this.gql.request(SetAppBudgetDocument, args);
    return data.setAppBudget;
  }
}
