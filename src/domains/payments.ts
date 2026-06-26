import type { GraphQLClient } from '../client.js';
import {
  MyCheckoutsDocument,
  MyCheckoutsConnectionDocument,
  CheckoutsDocument,
  CheckoutsConnectionDocument,
  CreateCheckoutDocument,
  CapturePaypalCheckoutDocument,
  PaymentEventsDocument,
  PaymentEventsConnectionDocument,
  type MyCheckoutsQuery,
  type MyCheckoutsConnectionQuery,
  type MyCheckoutsConnectionQueryVariables,
  type CheckoutsQuery,
  type CheckoutsConnectionQuery,
  type CheckoutsConnectionQueryVariables,
  type CreateCheckoutMutation,
  type CreateCheckoutInput,
  type CheckoutFilterInput,
  type CapturePaypalCheckoutMutation,
  type PaymentEventsQuery,
  type PaymentEventsQueryVariables,
  type PaymentEventsConnectionQuery,
  type PaymentEventsConnectionQueryVariables,
} from '../generated/graphql.js';

/**
 * Payment checkouts (wallet top-ups, plan purchases) — exposed as
 * `client.payments` (and grouped under `client.admin`).
 *
 * Targets the **management-api**. {@link create} and {@link mine} require an
 * authenticated caller and act on their own checkouts; {@link all} is
 * super-admin only. Amounts are minor currency units (`*Cents`).
 *
 * Note: {@link create} starts a real payment-provider checkout (Stripe /
 * PayPal). In tests use sandbox provider keys only — never trigger real
 * charges.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` per the notes
 *   above.
 */
export class PaymentsAPI {
  constructor(private readonly management: GraphQLClient) {}

  /**
   * Start a checkout (e.g. an `ORG_WALLET_TOPUP`). Requires authentication.
   *
   * @param input - {@link CreateCheckoutInput}: purpose, amount, provider, and
   *   return URLs.
   * @returns The created checkout including the provider redirect/approval URL.
   */
  async create(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutMutation['createCheckout']> {
    const data = await this.management.request(CreateCheckoutDocument, {
      input,
    });
    return data.createCheckout;
  }

  /**
   * List the authenticated caller's own checkouts (newest first).
   *
   * @param opts - Optional `limit` / `offset` (default limit 50).
   * @returns The caller's checkouts.
   */
  async mine(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<MyCheckoutsQuery['myCheckouts']> {
    const data = await this.management.request(MyCheckoutsDocument, {
      limit: opts.limit,
      offset: opts.offset,
    });
    return data.myCheckouts;
  }

  /**
   * List checkouts across all users with an optional filter. **Super-admin
   * only.**
   *
   * @param opts - Optional {@link CheckoutFilterInput} `filter` and `limit` /
   *   `offset`.
   * @returns The matching checkouts.
   */
  async all(
    opts: {
      filter?: CheckoutFilterInput;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<CheckoutsQuery['checkouts']> {
    const data = await this.management.request(CheckoutsDocument, {
      filter: opts.filter,
      limit: opts.limit,
      offset: opts.offset,
    });
    return data.checkouts;
  }

  /**
   * Capture an approved PayPal order, finalizing the checkout it belongs to.
   * Call this after the buyer approves the PayPal order returned by
   * {@link create}. Requires authentication.
   *
   * Pass `idempotencyKey` to make retries safe: replaying with the same key
   * returns the first result instead of re-capturing.
   *
   * @param orderId - The PayPal order id to capture.
   * @param idempotencyKey - Optional key for safe retries.
   * @returns The finalized {@link Checkout}.
   */
  async capturePaypal(
    orderId: string,
    idempotencyKey?: string,
  ): Promise<CapturePaypalCheckoutMutation['capturePaypalCheckout']> {
    const data = await this.management.request(CapturePaypalCheckoutDocument, {
      orderId,
      idempotencyKey,
    });
    return data.capturePaypalCheckout;
  }

  /**
   * Relay-style cursor pagination over the caller's own checkouts — the
   * preferred alternative to {@link mine}. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - Optional `first` and `after`.
   * @returns A checkouts connection.
   */
  async mineConnection(
    args: MyCheckoutsConnectionQueryVariables = {},
  ): Promise<MyCheckoutsConnectionQuery['myCheckoutsConnection']> {
    const data = await this.management.request(
      MyCheckoutsConnectionDocument,
      args,
    );
    return data.myCheckoutsConnection;
  }

  /**
   * Relay-style cursor pagination over all checkouts (with optional filter) —
   * the preferred alternative to {@link all}. **Super-admin only.**
   *
   * @param args - Optional `first`, `after`, and {@link CheckoutFilterInput}.
   * @returns A checkouts connection.
   */
  async allConnection(
    args: CheckoutsConnectionQueryVariables = {},
  ): Promise<CheckoutsConnectionQuery['checkoutsConnection']> {
    const data = await this.management.request(
      CheckoutsConnectionDocument,
      args,
    );
    return data.checkoutsConnection;
  }

  /**
   * List provider webhook events (offset pagination). **Super-admin only** — an
   * audit view of received Stripe/PayPal/SES events.
   *
   * @param opts - Optional `limit` / `offset`.
   * @returns A page of {@link PaymentEventRecord}s.
   * @remarks Prefer {@link eventsConnection} (Relay cursor pagination); the
   *   offset args here are deprecated server-side.
   */
  async events(
    opts: {
      limit?: PaymentEventsQueryVariables['limit'];
      offset?: PaymentEventsQueryVariables['offset'];
    } = {},
  ): Promise<PaymentEventsQuery['paymentEvents']> {
    const data = await this.management.request(PaymentEventsDocument, opts);
    return data.paymentEvents;
  }

  /**
   * Relay-style cursor pagination over provider webhook events. **Super-admin
   * only.** See https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - Optional `first` and `after`.
   * @returns A payment-events connection.
   */
  async eventsConnection(
    args: PaymentEventsConnectionQueryVariables = {},
  ): Promise<PaymentEventsConnectionQuery['paymentEventsConnection']> {
    const data = await this.management.request(
      PaymentEventsConnectionDocument,
      args,
    );
    return data.paymentEventsConnection;
  }
}
