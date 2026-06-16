import type { GraphQLClient } from '../client.js';
import {
  MyCheckoutsDocument,
  CheckoutsDocument,
  CreateCheckoutDocument,
  type MyCheckoutsQuery,
  type CheckoutsQuery,
  type CreateCheckoutMutation,
  type CreateCheckoutInput,
  type CheckoutFilterInput,
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
}
