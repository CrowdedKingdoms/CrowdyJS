import type { GraphQLClient } from '../client.js';

import {
  CreateCheckoutDocument,
  type CreateCheckoutMutation,
  type CreateCheckoutMutationVariables,
  MyCheckoutsDocument,
  type MyCheckoutsQuery,
  type MyCheckoutsQueryVariables,
  CheckoutsDocument,
  type CheckoutsQuery,
  type CheckoutsQueryVariables,
} from '../generated/graphql.js';

/**
 * Provider-agnostic checkout creation + history. Exposed as
 * `client.payments`.
 *
 * Every checkout (Stripe or PayPal) returns an `externalUrl` that the
 * caller redirects the user to. The status only flips to COMPLETED when
 * the matching webhook reaches the API; `myCheckouts()` reflects the
 * current truth.
 */
export class PaymentsAPI {
  constructor(private gql: GraphQLClient) {}

  async createCheckout(
    input: CreateCheckoutMutationVariables['input'],
  ): Promise<CreateCheckoutMutation['createCheckout']> {
    const data = await this.gql.request(CreateCheckoutDocument, { input });
    return data.createCheckout;
  }

  async myCheckouts(
    args: MyCheckoutsQueryVariables = {},
  ): Promise<MyCheckoutsQuery['myCheckouts']> {
    const data = await this.gql.request(MyCheckoutsDocument, args);
    return data.myCheckouts;
  }

  /** Super admin only - cross-tenant payments audit. */
  async checkouts(
    args: CheckoutsQueryVariables = {},
  ): Promise<CheckoutsQuery['checkouts']> {
    const data = await this.gql.request(CheckoutsDocument, args);
    return data.checkouts;
  }
}
