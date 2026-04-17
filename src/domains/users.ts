import type { GraphQLClient } from '../client.js';

import {
  MeDocument,
  type MeQuery,
  UserDocument,
  type UserQuery,
  type UserQueryVariables,
  UsersDocument,
  type UsersQuery,
  UsersByGamertagDocument,
  type UsersByGamertagQuery,
  type UsersByGamertagQueryVariables,
  UsersByEmailDocument,
  type UsersByEmailQuery,
  type UsersByEmailQueryVariables,
  UpdateGamertagDocument,
  type UpdateGamertagMutation,
  type UpdateGamertagMutationVariables,
  UpdateUserStateDocument,
  type UpdateUserStateMutation,
  type UpdateUserStateMutationVariables,
} from '../generated/graphql.js';

/**
 * User profile / directory queries and mutations.
 *
 * Exposed as `client.users`. The auth/login family lives on `client.auth`.
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

  async list(): Promise<UsersQuery['users']> {
    const data = await this.gql.request(UsersDocument, undefined);
    return data.users;
  }

  async byGamertag(
    gamertag: UsersByGamertagQueryVariables['gamertag']
  ): Promise<UsersByGamertagQuery['usersByGamertag']> {
    const data = await this.gql.request(UsersByGamertagDocument, { gamertag });
    return data.usersByGamertag;
  }

  async byEmail(
    email: UsersByEmailQueryVariables['email']
  ): Promise<UsersByEmailQuery['usersByEmail']> {
    const data = await this.gql.request(UsersByEmailDocument, { email });
    return data.usersByEmail;
  }

  async updateGamertag(
    input: UpdateGamertagMutationVariables['input']
  ): Promise<UpdateGamertagMutation['updateGamertag']> {
    const data = await this.gql.request(UpdateGamertagDocument, { input });
    return data.updateGamertag;
  }

  async updateProfile(
    input: UpdateGamertagMutationVariables['input']
  ): Promise<UpdateGamertagMutation['updateGamertag']> {
    return this.updateGamertag(input);
  }

  async updateUserState(
    input: UpdateUserStateMutationVariables['input']
  ): Promise<UpdateUserStateMutation['updateUserState']> {
    const data = await this.gql.request(UpdateUserStateDocument, { input });
    return data.updateUserState;
  }
}
