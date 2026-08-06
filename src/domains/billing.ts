import type { GraphQLClient } from '../client.js';
import {
  WalletBalanceDocument,
  WalletTransactionsDocument,
  WalletTransactionsConnectionDocument,
  AppBudgetDocument,
  AppBudgetsDocument,
  SetAppBudgetDocument,
  type WalletBalanceQuery,
  type WalletTransactionsQuery,
  type WalletTransactionsConnectionQuery,
  type WalletTransactionsConnectionQueryVariables,
  type AppBudgetQuery,
  type AppBudgetsQuery,
  type SetAppBudgetMutation,
} from '../generated/graphql.js';

/**
 * Org wallet + per-app budgets — exposed as `client.billing` (and grouped under
 * `client.admin`).
 *
 * Part of the management surface. Reads require the `view_billing` org/app
 * permission; {@link setAppBudget} requires `manage_billing`. Monetary values
 * are minor currency units (`*Cents`) and serialized as `BigInt` decimal
 * strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above.
 */
export class BillingAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * Return an organization's wallet balance. Requires the `view_billing` org
   * permission.
   *
   * @param orgId - Numeric org id (`BigInt` as a decimal string).
   * @returns The wallet balance (cents as a decimal string).
   */
  async walletBalance(
    orgId: string,
  ): Promise<WalletBalanceQuery['walletBalance']> {
    const data = await this.api.request(WalletBalanceDocument, { orgId });
    return data.walletBalance;
  }

  /**
   * List an organization's wallet transactions (newest first). Requires the
   * `view_billing` org permission.
   *
   * @param orgId - Numeric org id.
   * @param opts - Optional `limit` / `offset` (default limit 50).
   * @returns The wallet transactions.
   */
  async walletTransactions(
    orgId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<WalletTransactionsQuery['walletTransactions']> {
    const data = await this.api.request(WalletTransactionsDocument, {
      orgId,
      limit: opts.limit,
      offset: opts.offset,
    });
    return data.walletTransactions;
  }

  /**
   * Return the spend budget for one app. Requires the `view_billing` app
   * permission.
   *
   * @param orgId - Numeric org id that owns the app.
   * @param appId - Numeric app id.
   * @returns The app budget, or `null` if unset.
   */
  async appBudget(
    orgId: string,
    appId: string,
  ): Promise<AppBudgetQuery['appBudget']> {
    const data = await this.api.request(AppBudgetDocument, {
      orgId,
      appId,
    });
    return data.appBudget;
  }

  /**
   * List the spend budgets for every app under an org. Requires the
   * `view_billing` org permission.
   *
   * @param orgId - Numeric org id.
   * @returns The app budgets.
   */
  async appBudgets(orgId: string): Promise<AppBudgetsQuery['appBudgets']> {
    const data = await this.api.request(AppBudgetsDocument, { orgId });
    return data.appBudgets;
  }

  /**
   * Set (or clear) an app's monthly spend cap. Requires the `manage_billing`
   * app permission.
   *
   * @param orgId - Numeric org id.
   * @param appId - Numeric app id.
   * @param monthlyLimitCents - Monthly cap in minor currency units (decimal
   *   string); `"0"` disables the cap.
   * @returns The updated app budget.
   */
  async setAppBudget(
    orgId: string,
    appId: string,
    monthlyLimitCents: string,
  ): Promise<SetAppBudgetMutation['setAppBudget']> {
    const data = await this.api.request(SetAppBudgetDocument, {
      orgId,
      appId,
      monthlyLimitCents,
    });
    return data.setAppBudget;
  }

  /**
   * Relay-style cursor pagination over an org's wallet transactions — the
   * preferred alternative to {@link walletTransactions}. Requires the
   * `view_billing` org permission. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - `orgId` plus optional `first` and `after`.
   * @returns A wallet-transactions connection.
   */
  async walletTransactionsConnection(
    args: WalletTransactionsConnectionQueryVariables,
  ): Promise<
    WalletTransactionsConnectionQuery['walletTransactionsConnection']
  > {
    const data = await this.api.request(
      WalletTransactionsConnectionDocument,
      args,
    );
    return data.walletTransactionsConnection;
  }

  // NOTE (unified galaxy API): the per-environment capacity billing-tier
  // catalogs (buddyTiers/graphqlTiers/postgresTiers) were retired with
  // dedicated customer environments.
}
