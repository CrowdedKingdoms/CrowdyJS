import type { GraphQLClient } from '../client.js';

import {
  UserAppStateDocument,
  type UserAppStateQuery,
  type UserAppStateQueryVariables,
  UserAppStatesDocument,
  type UserAppStatesQuery,
  UpdateUserAppStateDocument,
  type UpdateUserAppStateMutation,
  type UpdateUserAppStateMutationVariables,
  DeleteUserAppStateDocument,
  type DeleteUserAppStateMutation,
  type DeleteUserAppStateMutationVariables,
} from '../generated/graphql.js';

/**
 * Per-user, per-app state storage (formerly `userMapState`).
 *
 * Exposed as `client.state`.
 */
export class StateAPI {
  constructor(private gql: GraphQLClient) {}

  async getOne(
    appId: UserAppStateQueryVariables['appId']
  ): Promise<UserAppStateQuery['userAppState']> {
    const data = await this.gql.request(UserAppStateDocument, { appId });
    return data.userAppState;
  }

  async getAll(): Promise<UserAppStatesQuery['userAppStates']> {
    const data = await this.gql.request(UserAppStatesDocument, undefined);
    return data.userAppStates;
  }

  async update(
    input: UpdateUserAppStateMutationVariables['input']
  ): Promise<UpdateUserAppStateMutation['updateUserAppState']> {
    const data = await this.gql.request(UpdateUserAppStateDocument, { input });
    return data.updateUserAppState;
  }

  async delete(
    appId: DeleteUserAppStateMutationVariables['appId']
  ): Promise<DeleteUserAppStateMutation['deleteUserAppState']> {
    const data = await this.gql.request(DeleteUserAppStateDocument, { appId });
    return data.deleteUserAppState;
  }
}
