import type { GraphQLClient } from '../client.js';
import {
  MyCheckoutsDocument,
  MyCheckoutsConnectionDocument,
  CreateCheckoutDocument,
  CapturePaypalCheckoutDocument,
  type MyCheckoutsQuery,
  type MyCheckoutsConnectionQuery,
  type MyCheckoutsConnectionQueryVariables,
  type CreateCheckoutMutation,
  type CreateCheckoutInput,
  type CapturePaypalCheckoutMutation,
} from '../generated/graphql.js';

/**
 * Payment checkouts (wallet top-ups, plan purchases) — exposed as
 * `client.payments` (and grouped under `client.admin`).
 *
 * Part of the management surface. Every method requires an authenticated
 * caller and acts on the caller's own checkouts. Amounts are minor currency
 * units (`*Cents`).
 *
 * Note: {@link create} starts a real payment-provider checkout (Stripe /
 * PayPal). In tests use sandbox provider keys only — never trigger real
 * charges.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session.
 */
export class PaymentsAPI {
  constructor(private readonly api: GraphQLClient) {}

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
    const data = await this.api.request(CreateCheckoutDocument, {
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
    const data = await this.api.request(MyCheckoutsDocument, {
      limit: opts.limit,
      offset: opts.offset,
    });
    return data.myCheckouts;
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
    const data = await this.api.request(CapturePaypalCheckoutDocument, {
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
    const data = await this.api.request(
      MyCheckoutsConnectionDocument,
      args,
    );
    return data.myCheckoutsConnection;
  }
}
