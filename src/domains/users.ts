import type { GraphQLClient } from '../client.js';

import {
  MeDocument,
  type MeQuery,
  UserDocument,
  type UserQuery,
  type UserQueryVariables,
  UsersPaginatedDocument,
  type UsersPaginatedQuery,
  type UsersPaginatedQueryVariables,
  UpdateGamertagDocument,
  type UpdateGamertagMutation,
  type UpdateGamertagMutationVariables,
  UpdateUserStateDocument,
  type UpdateUserStateMutation,
  type UpdateUserStateMutationVariables,
  SetSuperAdminDocument,
  type SetSuperAdminMutation,
  type SetSuperAdminMutationVariables,
  SetEarlyAccessOverrideDocument,
  type SetEarlyAccessOverrideMutation,
  type SetEarlyAccessOverrideMutationVariables,
  UpdateUserTypeDocument,
  type UpdateUserTypeMutation,
  type UpdateUserTypeMutationVariables,
  ForceLogoutUserDocument,
  type ForceLogoutUserMutationVariables,
  DeleteMyAccountDocument,
} from '../generated/graphql.js';

/**
 * User profile / directory queries and mutations. Exposed as `client.users`.
 *
 * The legacy `list` / `byGamertag` / `byEmail` triple has been collapsed
 * into a single super-admin-gated `searchPaginated` (server-side
 * `usersPaginated`).
 */
export class UsersAPI {
  constructor(private gql: GraphQLClient) {}

  async me(): Promise<MeQuery['me']> {
    const data = await this.gql.request(MeDocument, undefined);
    return data.me;
  }

  async byId(id: UserQueryVariables['id']): Promise<UserQuery['user']> {
    const data = await this.gql.request(UserDocument, { id });
    return data.user;
  }

  async searchPaginated(
    args: UsersPaginatedQueryVariables = {},
  ): Promise<UsersPaginatedQuery['usersPaginated']> {
    const data = await this.gql.request(UsersPaginatedDocument, args);
    return data.usersPaginated;
  }

  async updateGamertag(
    input: UpdateGamertagMutationVariables['input'],
  ): Promise<UpdateGamertagMutation['updateGamertag']> {
    const data = await this.gql.request(UpdateGamertagDocument, { input });
    return data.updateGamertag;
  }

  async updateUserState(
    input: UpdateUserStateMutationVariables['input'],
  ): Promise<UpdateUserStateMutation['updateUserState']> {
    const data = await this.gql.request(UpdateUserStateDocument, { input });
    return data.updateUserState;
  }

  async setSuperAdmin(
    args: SetSuperAdminMutationVariables,
  ): Promise<SetSuperAdminMutation['setSuperAdmin']> {
    const data = await this.gql.request(SetSuperAdminDocument, args);
    return data.setSuperAdmin;
  }

  async setEarlyAccessOverride(
    args: SetEarlyAccessOverrideMutationVariables,
  ): Promise<SetEarlyAccessOverrideMutation['setEarlyAccessOverride']> {
    const data = await this.gql.request(SetEarlyAccessOverrideDocument, args);
    return data.setEarlyAccessOverride;
  }

  async updateUserType(
    args: UpdateUserTypeMutationVariables,
  ): Promise<UpdateUserTypeMutation['updateUserType']> {
    const data = await this.gql.request(UpdateUserTypeDocument, args);
    return data.updateUserType;
  }

  async forceLogoutUser(
    userId: ForceLogoutUserMutationVariables['userId'],
  ): Promise<boolean> {
    const data = await this.gql.request(ForceLogoutUserDocument, { userId });
    return data.forceLogoutUser;
  }

  async deleteMyAccount(): Promise<boolean> {
    const data = await this.gql.request(DeleteMyAccountDocument, undefined);
    return data.deleteMyAccount;
  }
}
