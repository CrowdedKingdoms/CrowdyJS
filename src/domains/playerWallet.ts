import type { GraphQLClient } from '../client.js';
import {
  PlayerWalletBalanceDocument,
  PlayerWalletTransactionsDocument,
  PlayerUsageChargesDocument,
  PlayerSpendCapsDocument,
  SetPlayerSpendCapDocument,
  PlayerAutoBillingDocument,
  SetPlayerAutoBillingDocument,
  BeginPlayerCardSetupDocument,
  type BeginPlayerCardSetupMutation,
  PlayerRuntimeStatesDocument,
  PlayerWasmPoliciesDocument,
  SetPlayerWasmPolicyDocument,
  DeletePlayerWasmPolicyDocument,
  PlayerRateMarkupDocument,
  SetPlayerRateMarkupDocument,
  AppPlayerUsageDocument,
  AppPlayerMarkupAccruedDocument,
  type PlayerWalletBalanceQuery,
  type PlayerWalletTransactionsQuery,
  type PlayerWalletTransactionsQueryVariables,
  type PlayerUsageChargesQuery,
  type PlayerUsageChargesQueryVariables,
  type PlayerSpendCapsQuery,
  type SetPlayerSpendCapMutation,
  type SetPlayerSpendCapMutationVariables,
  type PlayerAutoBillingQuery,
  type SetPlayerAutoBillingMutation,
  type SetPlayerAutoBillingMutationVariables,
  type PlayerRuntimeStatesQuery,
  type PlayerWasmPoliciesQuery,
  type PlayerWasmPoliciesQueryVariables,
  type SetPlayerWasmPolicyMutation,
  type SetPlayerWasmPolicyMutationVariables,
  type DeletePlayerWasmPolicyMutation,
  type DeletePlayerWasmPolicyMutationVariables,
  type PlayerRateMarkupQuery,
  type PlayerRateMarkupQueryVariables,
  type SetPlayerRateMarkupMutation,
  type SetPlayerRateMarkupMutationVariables,
  type AppPlayerUsageQuery,
  type AppPlayerUsageQueryVariables,
  type AppPlayerMarkupAccruedQuery,
  type AppPlayerMarkupAccruedQueryVariables,
} from '../generated/graphql.js';

/**
 * The player wallet and player-billing surface (player compute P2, DN-5) —
 * exposed as `client.playerWallet` and routed to the Management API.
 *
 * Every viewer-scoped call operates on the CALLER's own wallet: balance,
 * ledger, hourly usage charges (platform vs studio-markup split), self-set
 * spend caps, auto-recharge config, and per-app gate states. Fund the wallet
 * via `client.payments.createCheckout` with purpose `PLAYER_WALLET_TOPUP`.
 *
 * The studio-scoped calls (policies, markup, per-player usage, accrued
 * markup) require the corresponding org permissions (`manage_compute`,
 * `manage_billing`, `view_compute_diagnostics`, `view_billing`).
 */
export class PlayerWalletAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /** The caller's wallet, created empty on first access (never null). */
  async balance(): Promise<PlayerWalletBalanceQuery['playerWalletBalance']> {
    const data = await this.graphql.request(PlayerWalletBalanceDocument, {});
    return data.playerWalletBalance;
  }

  /** The caller's wallet ledger, newest first. */
  async transactions(
    variables: PlayerWalletTransactionsQueryVariables = {},
  ): Promise<PlayerWalletTransactionsQuery['playerWalletTransactions']> {
    const data = await this.graphql.request(
      PlayerWalletTransactionsDocument,
      variables,
    );
    return data.playerWalletTransactions;
  }

  /**
   * The caller's posted hourly usage charges; each splits platformCents vs
   * markupCents with a per-metric snapshot ("what is this grid costing me").
   */
  async charges(
    variables: PlayerUsageChargesQueryVariables = {},
  ): Promise<PlayerUsageChargesQuery['playerUsageCharges']> {
    const data = await this.graphql.request(
      PlayerUsageChargesDocument,
      variables,
    );
    return data.playerUsageCharges;
  }

  /** The caller's self-set spend caps with running counters. */
  async spendCaps(): Promise<PlayerSpendCapsQuery['playerSpendCaps']> {
    const data = await this.graphql.request(PlayerSpendCapsDocument, {});
    return data.playerSpendCaps;
  }

  /** Set (or clear with null limits) a global or per-app self spend cap. */
  async setSpendCap(
    variables: SetPlayerSpendCapMutationVariables,
  ): Promise<SetPlayerSpendCapMutation['setPlayerSpendCap']> {
    const data = await this.graphql.request(
      SetPlayerSpendCapDocument,
      variables,
    );
    return data.setPlayerSpendCap;
  }

  /** The caller's auto-recharge settings. */
  async autoBilling(): Promise<PlayerAutoBillingQuery['playerAutoBilling']> {
    const data = await this.graphql.request(PlayerAutoBillingDocument, {});
    return data.playerAutoBilling;
  }

  /** Configure auto-recharge (requires a vaulted payment method to enable). */
  async setAutoBilling(
    variables: SetPlayerAutoBillingMutationVariables,
  ): Promise<SetPlayerAutoBillingMutation['setPlayerAutoBilling']> {
    const data = await this.graphql.request(
      SetPlayerAutoBillingDocument,
      variables,
    );
    return data.setPlayerAutoBilling;
  }

  /**
   * Begin vaulting a card on the caller's player wallet (P4b): returns the
   * Stripe SetupIntent client secret + publishable key the browser confirms.
   * On success the card is saved for wallet auto-recharge and rent auto-renew.
   */
  async beginCardSetup(): Promise<
    BeginPlayerCardSetupMutation['beginPlayerCardSetup']
  > {
    const data = await this.graphql.request(BeginPlayerCardSetupDocument, {});
    return data.beginPlayerCardSetup;
  }

  /** The caller's per-app gate states (absence means active). */
  async runtimeStates(): Promise<
    PlayerRuntimeStatesQuery['playerRuntimeStates']
  > {
    const data = await this.graphql.request(PlayerRuntimeStatesDocument, {});
    return data.playerRuntimeStates;
  }

  /** Studio: list an app's player policy rows (`view_compute_diagnostics`). */
  async policies(
    variables: PlayerWasmPoliciesQueryVariables,
  ): Promise<PlayerWasmPoliciesQuery['playerWasmPolicies']> {
    const data = await this.graphql.request(
      PlayerWasmPoliciesDocument,
      variables,
    );
    return data.playerWasmPolicies;
  }

  /** Studio: upsert a player policy row (`manage_compute`). */
  async setPolicy(
    variables: SetPlayerWasmPolicyMutationVariables,
  ): Promise<SetPlayerWasmPolicyMutation['setPlayerWasmPolicy']> {
    const data = await this.graphql.request(
      SetPlayerWasmPolicyDocument,
      variables,
    );
    return data.setPlayerWasmPolicy;
  }

  /** Studio: delete a player policy row (`manage_compute`). */
  async deletePolicy(
    variables: DeletePlayerWasmPolicyMutationVariables,
  ): Promise<DeletePlayerWasmPolicyMutation['deletePlayerWasmPolicy']> {
    const data = await this.graphql.request(
      DeletePlayerWasmPolicyDocument,
      variables,
    );
    return data.deletePlayerWasmPolicy;
  }

  /** Studio: read the app's player rate-card markup in bps (`view_billing`). */
  async rateMarkup(
    variables: PlayerRateMarkupQueryVariables,
  ): Promise<PlayerRateMarkupQuery['playerRateMarkup']> {
    const data = await this.graphql.request(
      PlayerRateMarkupDocument,
      variables,
    );
    return data.playerRateMarkup;
  }

  /** Studio: set the app's player rate-card markup in bps (`manage_billing`). */
  async setRateMarkup(
    variables: SetPlayerRateMarkupMutationVariables,
  ): Promise<SetPlayerRateMarkupMutation['setPlayerRateMarkup']> {
    const data = await this.graphql.request(
      SetPlayerRateMarkupDocument,
      variables,
    );
    return data.setPlayerRateMarkup;
  }

  /** Studio: per-player usage aggregate (`view_compute_diagnostics`). */
  async appPlayerUsage(
    variables: AppPlayerUsageQueryVariables,
  ): Promise<AppPlayerUsageQuery['appPlayerUsage']> {
    const data = await this.graphql.request(AppPlayerUsageDocument, variables);
    return data.appPlayerUsage;
  }

  /** Studio: total accrued markup income in cents (`view_billing`). */
  async appMarkupAccrued(
    variables: AppPlayerMarkupAccruedQueryVariables,
  ): Promise<AppPlayerMarkupAccruedQuery['appPlayerMarkupAccrued']> {
    const data = await this.graphql.request(
      AppPlayerMarkupAccruedDocument,
      variables,
    );
    return data.appPlayerMarkupAccrued;
  }
}
