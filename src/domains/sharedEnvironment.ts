import type { GraphQLClient } from '../client.js';
import {
  SharedEnvPlansDocument,
  OrgFreeAppQuotaDocument,
  AppSharedSubscriptionDocument,
  AppRuntimeStateDocument,
  OrgAutoBillingDocument,
  OrgPaymentMethodsDocument,
  PublishAppToSharedDocument,
  CancelSharedSubscriptionDocument,
  SetAppSpendCapsDocument,
  SetAppReservedThroughputDocument,
  SetAutoBillingDocument,
  SetupSharedPaymentMethodDocument,
  RemoveSharedPaymentMethodDocument,
  type SharedEnvPlansQuery,
  type OrgFreeAppQuotaQuery,
  type AppSharedSubscriptionQuery,
  type AppRuntimeStateQuery,
  type OrgAutoBillingQuery,
  type OrgPaymentMethodsQuery,
  type PublishAppToSharedMutation,
  type CancelSharedSubscriptionMutation,
  type SetAppSpendCapsMutation,
  type SetAppReservedThroughputMutation,
  type SetAutoBillingMutation,
  type SetupSharedPaymentMethodMutation,
  type RemoveSharedPaymentMethodMutation,
  type PaymentProvider,
} from '../generated/graphql.js';

/**
 * Shared-environment app publishing, runtime gating, spend caps, and
 * auto-billing — exposed as `client.sharedEnvironment` (and grouped under
 * `client.admin`).
 *
 * Part of the management surface. {@link plans} is public; the read operations
 * require org membership; spend-cap / auto-billing / subscription mutations
 * require the `manage_billing` org permission; {@link publishApp} currently
 * requires super-admin (preview). Monetary values are `*Cents` (minor units).
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   per the permission notes above; `IDEMPOTENCY_CONFLICT` on key reuse with
 *   different args.
 */
export class SharedEnvironmentAPI {
  constructor(private readonly api: GraphQLClient) {}

  /**
   * Public catalog of paid shared-environment app-slot plans.
   *
   * @returns The available plans.
   */
  async plans(): Promise<SharedEnvPlansQuery['sharedEnvPlans']> {
    const data = await this.api.request(SharedEnvPlansDocument, {});
    return data.sharedEnvPlans;
  }

  /**
   * An org's free shared-app slot quota and usage. Caller must be an org member.
   *
   * @param orgId - Numeric org id.
   * @returns The {@link FreeAppQuota}.
   */
  async freeAppQuota(
    orgId: string,
  ): Promise<OrgFreeAppQuotaQuery['orgFreeAppQuota']> {
    const data = await this.api.request(OrgFreeAppQuotaDocument, {
      orgId,
    });
    return data.orgFreeAppQuota;
  }

  /**
   * An app's paid shared subscription, or `null` when on the free quota.
   *
   * @param appId - Numeric app id.
   * @returns The {@link AppSharedSubscription} or `null`.
   */
  async appSubscription(
    appId: string,
  ): Promise<AppSharedSubscriptionQuery['appSharedSubscription']> {
    const data = await this.api.request(
      AppSharedSubscriptionDocument,
      { appId },
    );
    return data.appSharedSubscription;
  }

  /**
   * The shared-environment runtime gate + current usage for an app.
   *
   * @param appId - Numeric app id.
   * @returns The {@link AppRuntimeState}.
   */
  async appRuntimeState(
    appId: string,
  ): Promise<AppRuntimeStateQuery['appRuntimeState']> {
    const data = await this.api.request(AppRuntimeStateDocument, {
      appId,
    });
    return data.appRuntimeState;
  }

  /**
   * An org's off-session auto-billing configuration.
   *
   * @param orgId - Numeric org id.
   * @returns The {@link OrgAutoBilling} config.
   */
  async autoBilling(
    orgId: string,
  ): Promise<OrgAutoBillingQuery['orgAutoBilling']> {
    const data = await this.api.request(OrgAutoBillingDocument, {
      orgId,
    });
    return data.orgAutoBilling;
  }

  /**
   * List an org's saved (vaulted) payment methods.
   *
   * @param orgId - Numeric org id.
   * @returns The saved payment methods.
   */
  async paymentMethods(
    orgId: string,
  ): Promise<OrgPaymentMethodsQuery['orgPaymentMethods']> {
    const data = await this.api.request(OrgPaymentMethodsDocument, {
      orgId,
    });
    return data.orgPaymentMethods;
  }

  /**
   * Publish an app to the shared game-api. Free under the org quota (no charge);
   * pass `planId` for a paid subscription (returns a checkout to complete).
   * Currently super-admin only (preview).
   *
   * @param appId - Numeric app id.
   * @param opts - Optional `planId`, `provider`, `successUrl`, `cancelUrl`, and
   *   `idempotencyKey`.
   * @returns The {@link PublishAppResult} (free flag + optional checkout).
   */
  async publishApp(
    appId: string,
    opts: {
      planId?: string;
      provider?: PaymentProvider;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    } = {},
  ): Promise<PublishAppToSharedMutation['publishAppToShared']> {
    const data = await this.api.request(PublishAppToSharedDocument, {
      appId,
      planId: opts.planId,
      provider: opts.provider,
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      idempotencyKey: opts.idempotencyKey,
    });
    return data.publishAppToShared;
  }

  /**
   * Cancel an app's paid shared subscription. Requires `manage_billing`.
   *
   * @param appId - Numeric app id.
   * @param idempotencyKey - Optional idempotency key for safe retries.
   * @returns The updated {@link AppSharedSubscription}.
   */
  async cancelSubscription(
    appId: string,
    idempotencyKey?: string,
  ): Promise<CancelSharedSubscriptionMutation['cancelSharedSubscription']> {
    const data = await this.api.request(
      CancelSharedSubscriptionDocument,
      { appId, idempotencyKey },
    );
    return data.cancelSharedSubscription;
  }

  /**
   * Set per-app hourly/daily spend caps (cents); `null` clears a cap. Requires
   * `manage_billing`. Returns the re-evaluated runtime state.
   *
   * @param appId - Numeric app id.
   * @param caps - `hourlyLimitCents` and/or `dailyLimitCents` (decimal strings).
   * @returns The updated {@link AppRuntimeState}.
   */
  async setSpendCaps(
    appId: string,
    caps: { hourlyLimitCents?: string | null; dailyLimitCents?: string | null } = {},
  ): Promise<SetAppSpendCapsMutation['setAppSpendCaps']> {
    const data = await this.api.request(SetAppSpendCapsDocument, {
      appId,
      hourlyLimitCents: caps.hourlyLimitCents,
      dailyLimitCents: caps.dailyLimitCents,
    });
    return data.setAppSpendCaps;
  }


  /**
   * Reserve realtime (UDP) capacity for a shared app. Requires `manage_billing`
   * on the app's org.
   *
   * **A reservation is a FLOOR, not a ceiling.** It obliges the platform to keep
   * that much capacity provisioned and in service for you — it raises the
   * autoscaling minimum for the fleet your app runs on. It does **not** cap what
   * you may send: traffic above the reserved rate is metered like any other
   * traffic rather than refused.
   *
   * **It buys capacity, not volume.** The monthly reservation fee is charged in
   * addition to metered usage and includes no data allowance of its own. Every
   * byte is metered from the first one whether or not you hold a reservation:
   * reserving 5 MB/s does not make the first 5 MB/s free.
   *
   * **It is not how you lift the free-tier cap.** Unfunded free apps are shaped
   * at roughly 1 MB/s. That shaping is lifted by funding the org wallet or
   * enabling auto-billing ({@link setAutoBilling}), not by reserving — before
   * 2026-09-01 a reservation did double duty as a rate-limit bypass and no longer
   * does.
   *
   * Billed monthly whether or not the capacity is used; upgrades are prorated for
   * the current month, and lowering or clearing a reservation charges nothing.
   *
   * Reservations are sold in two independent dimensions, because a game may need
   * a great deal of one and little of the other: realtime throughput (this
   * method) and GraphQL operations per second. Reserving one does not reserve the
   * other. Read both back from `app.reservedUdpBytesPerSec` and
   * `app.reservedGraphqlOpsPerSec`.
   *
   * @param input - `orgId`, `appId`, and `reservedBytesPerSec` (decimal MB/s:
   *   1_000_000 = 1 MB/s; 0 clears the reservation).
   * @param idempotencyKey - Recommended for retries; replaying the same key with
   *   identical arguments returns the first result instead of charging again.
   * @returns The updated app and the cents debited from the org wallet.
   * @throws {CrowdyGraphQLError} `FORBIDDEN` without `manage_billing`.
   */
  async setReservedThroughput(
    input: {
      orgId: string;
      appId: string;
      reservedBytesPerSec: string;
    },
    idempotencyKey?: string,
  ): Promise<SetAppReservedThroughputMutation['setAppReservedThroughput']> {
    const data = await this.api.request(SetAppReservedThroughputDocument, {
      input,
      idempotencyKey,
    });
    return data.setAppReservedThroughput;
  }

  /**
   * Enable/disable and configure off-session auto-billing for an org. Requires
   * `manage_billing`.
   *
   * @param orgId - Numeric org id.
   * @param config - `enabled` plus optional `limitCents`, `rechargeAmountCents`,
   *   `lowWaterThresholdCents`, and `idempotencyKey`.
   * @returns The updated {@link OrgAutoBilling} config.
   */
  async setAutoBilling(
    orgId: string,
    config: {
      enabled: boolean;
      limitCents?: string | null;
      rechargeAmountCents?: string | null;
      lowWaterThresholdCents?: string | null;
      idempotencyKey?: string;
    },
  ): Promise<SetAutoBillingMutation['setAutoBilling']> {
    const data = await this.api.request(SetAutoBillingDocument, {
      orgId,
      enabled: config.enabled,
      limitCents: config.limitCents,
      rechargeAmountCents: config.rechargeAmountCents,
      lowWaterThresholdCents: config.lowWaterThresholdCents,
      idempotencyKey: config.idempotencyKey,
    });
    return data.setAutoBilling;
  }

  /**
   * Begin vaulting a card for off-session auto-billing (returns a Stripe
   * SetupIntent client secret). No charge here. Requires `manage_billing`.
   *
   * @param orgId - Numeric org id.
   * @param idempotencyKey - Optional idempotency key.
   * @returns The {@link PaymentMethodSetup} handle.
   */
  async setupPaymentMethod(
    orgId: string,
    idempotencyKey?: string,
  ): Promise<SetupSharedPaymentMethodMutation['setupSharedPaymentMethod']> {
    const data = await this.api.request(
      SetupSharedPaymentMethodDocument,
      { orgId, idempotencyKey },
    );
    return data.setupSharedPaymentMethod;
  }

  /**
   * Remove a saved payment method from an org. Requires `manage_billing`.
   *
   * @param orgId - Numeric org id.
   * @param paymentMethodId - Numeric id of the saved method to remove.
   * @param idempotencyKey - Optional idempotency key.
   * @returns `true` on success.
   */
  async removePaymentMethod(
    orgId: string,
    paymentMethodId: string,
    idempotencyKey?: string,
  ): Promise<RemoveSharedPaymentMethodMutation['removeSharedPaymentMethod']> {
    const data = await this.api.request(
      RemoveSharedPaymentMethodDocument,
      { orgId, paymentMethodId, idempotencyKey },
    );
    return data.removeSharedPaymentMethod;
  }
}
