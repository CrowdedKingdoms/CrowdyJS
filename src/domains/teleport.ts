import type { GraphQLClient } from '../client.js';

import {
  TeleportRequestDocument,
  type TeleportRequestMutation,
  type TeleportRequestMutationVariables,
} from '../generated/graphql.js';

/**
 * Teleport API.
 *
 * Exposed as `client.teleport`.
 */
export class TeleportAPI {
  constructor(private gql: GraphQLClient) {}

  async request(
    input: TeleportRequestMutationVariables['input']
  ): Promise<TeleportRequestMutation['teleportRequest']> {
    const data = await this.gql.request(TeleportRequestDocument, { input });
    return data.teleportRequest;
  }
}
