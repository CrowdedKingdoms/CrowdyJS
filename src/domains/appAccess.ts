import type { GraphQLClient } from '../client.js';

import {
  AppAccessTiersDocument,
  type AppAccessTiersQuery,
  type AppAccessTiersQueryVariables,
  MyAppAccessDocument,
  type MyAppAccessQuery,
  type MyAppAccessQueryVariables,
  CreateAccessTierDocument,
  type CreateAccessTierMutation,
  type CreateAccessTierMutationVariables,
  GrantAppAccessDocument,
  type GrantAppAccessMutation,
  type GrantAppAccessMutationVariables,
  RevokeAppAccessDocument,
  type RevokeAppAccessMutation,
  type RevokeAppAccessMutationVariables,
} from '../generated/graphql.js';

/**
 * App access tier and per-user app access management.
 *
 * Exposed as `client.appAccess`.
 */
export class AppAccessAPI {
  constructor(private gql: GraphQLClient) {}

  async listTiers(
    appId: AppAccessTiersQueryVariables['appId']
  ): Promise<AppAccessTiersQuery['appAccessTiers']> {
    const data = await this.gql.request(AppAccessTiersDocument, { appId });
    return data.appAccessTiers;
  }

  async myAccess(
    appId: MyAppAccessQueryVariables['appId']
  ): Promise<MyAppAccessQuery['myAppAccess']> {
    const data = await this.gql.request(MyAppAccessDocument, { appId });
    return data.myAppAccess;
  }

  async createTier(
    input: CreateAccessTierMutationVariables['input']
  ): Promise<CreateAccessTierMutation['createAccessTier']> {
    const data = await this.gql.request(CreateAccessTierDocument, { input });
    return data.createAccessTier;
  }

  async grant(
    input: GrantAppAccessMutationVariables['input']
  ): Promise<GrantAppAccessMutation['grantAppAccess']> {
    const data = await this.gql.request(GrantAppAccessDocument, { input });
    return data.grantAppAccess;
  }

  async revoke(
    appId: RevokeAppAccessMutationVariables['appId'],
    userId: RevokeAppAccessMutationVariables['userId']
  ): Promise<RevokeAppAccessMutation['revokeAppAccess']> {
    const data = await this.gql.request(RevokeAppAccessDocument, { appId, userId });
    return data.revokeAppAccess;
  }
}
