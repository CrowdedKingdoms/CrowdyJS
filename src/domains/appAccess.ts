import type { GraphQLClient } from '../client.js';

import {
  AppAccessTiersDocument,
  type AppAccessTiersQuery,
  type AppAccessTiersQueryVariables,
  MyAppAccessDocument,
  type MyAppAccessQuery,
  type MyAppAccessQueryVariables,
  AppUserAccessByAppDocument,
  type AppUserAccessByAppQuery,
  type AppUserAccessByAppQueryVariables,
  CreateAccessTierDocument,
  type CreateAccessTierMutation,
  type CreateAccessTierMutationVariables,
  UpdateAccessTierDocument,
  type UpdateAccessTierMutation,
  type UpdateAccessTierMutationVariables,
  ArchiveAccessTierDocument,
  type ArchiveAccessTierMutationVariables,
  GrantAppAccessDocument,
  type GrantAppAccessMutation,
  type GrantAppAccessMutationVariables,
  RevokeAppAccessDocument,
  type RevokeAppAccessMutation,
  type RevokeAppAccessMutationVariables,
} from '../generated/graphql.js';

/**
 * App access tiers + per-user app access management. Exposed as
 * `client.appAccess`.
 */
export class AppAccessAPI {
  constructor(private gql: GraphQLClient) {}

  async listTiers(
    appId: AppAccessTiersQueryVariables['appId'],
  ): Promise<AppAccessTiersQuery['appAccessTiers']> {
    const data = await this.gql.request(AppAccessTiersDocument, { appId });
    return data.appAccessTiers;
  }

  async myAccess(
    appId: MyAppAccessQueryVariables['appId'],
  ): Promise<MyAppAccessQuery['myAppAccess']> {
    const data = await this.gql.request(MyAppAccessDocument, { appId });
    return data.myAppAccess;
  }

  async listAccess(
    args: AppUserAccessByAppQueryVariables,
  ): Promise<AppUserAccessByAppQuery['appUserAccessByApp']> {
    const data = await this.gql.request(AppUserAccessByAppDocument, args);
    return data.appUserAccessByApp;
  }

  async createTier(
    input: CreateAccessTierMutationVariables['input'],
  ): Promise<CreateAccessTierMutation['createAccessTier']> {
    const data = await this.gql.request(CreateAccessTierDocument, { input });
    return data.createAccessTier;
  }

  async updateTier(
    args: UpdateAccessTierMutationVariables,
  ): Promise<UpdateAccessTierMutation['updateAccessTier']> {
    const data = await this.gql.request(UpdateAccessTierDocument, args);
    return data.updateAccessTier;
  }

  async archiveTier(
    tierId: ArchiveAccessTierMutationVariables['tierId'],
  ): Promise<{ tierId: any; status: string; updatedAt: any }> {
    const data = await this.gql.request(ArchiveAccessTierDocument, { tierId });
    return data.archiveAccessTier;
  }

  async grant(
    input: GrantAppAccessMutationVariables['input'],
  ): Promise<GrantAppAccessMutation['grantAppAccess']> {
    const data = await this.gql.request(GrantAppAccessDocument, { input });
    return data.grantAppAccess;
  }

  async revoke(
    args: RevokeAppAccessMutationVariables,
  ): Promise<RevokeAppAccessMutation['revokeAppAccess']> {
    const data = await this.gql.request(RevokeAppAccessDocument, args);
    return data.revokeAppAccess;
  }
}
