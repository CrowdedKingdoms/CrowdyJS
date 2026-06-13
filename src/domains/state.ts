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
 * Per-user, per-app state storage on the **game-api** (formerly `userMapState`).
 * Exposed as `client.state`.
 *
 * Each row is the authenticated user's own opaque state blob scoped to one app
 * (keyed by `appId` + `userId`) — a convenient place to persist small
 * per-player, per-game data. The `state` blob is **base64-encoded** binary
 * (null when cleared) and `appId` is a `BigInt` sent and received as a decimal
 * string.
 *
 * Every method requires an authenticated session (a Bearer game token set via
 * `client.auth.login()` or `client.setToken()`) and only ever reads or writes
 * the **caller's own** state, otherwise {@link CrowdyGraphQLError} is thrown
 * (`UNAUTHENTICATED`).
 */
export class StateAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Read the authenticated user's per-app state for `appId`.
   *
   * @param appId - App (game) id the state is scoped to (`BigInt` as a decimal
   *   string).
   * @returns The {@link UserAppState} (its `state` blob base64-encoded), or
   *   `null` when no row exists.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`.
   */
  async getOne(
    appId: UserAppStateQueryVariables['appId']
  ): Promise<UserAppStateQuery['userAppState']> {
    const data = await this.gql.request(UserAppStateDocument, { appId });
    return data.userAppState;
  }

  /**
   * List all of the authenticated user's per-app state rows, ordered
   * newest-updated first. Takes no arguments.
   *
   * @returns The caller's {@link UserAppState} rows (each `state` blob
   *   base64-encoded).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`.
   */
  async getAll(): Promise<UserAppStatesQuery['userAppStates']> {
    const data = await this.gql.request(UserAppStatesDocument, undefined);
    return data.userAppStates;
  }

  /**
   * Create or replace (upsert) the authenticated user's per-app state for
   * `input.appId`, keyed by `appId` + `userId`. Always writes the caller's own
   * state.
   *
   * @param input - {@link CreateUserAppStateInput}: the target `appId` (decimal
   *   string) and the new `state` blob (base64-encoded binary; omit/null to clear
   *   it).
   * @returns The upserted {@link UserAppState}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` or `UNAUTHENTICATED`.
   */
  async update(
    input: UpdateUserAppStateMutationVariables['input']
  ): Promise<UpdateUserAppStateMutation['updateUserAppState']> {
    const data = await this.gql.request(UpdateUserAppStateDocument, { input });
    return data.updateUserAppState;
  }

  /**
   * **Destructive:** delete the authenticated user's per-app state row for
   * `appId` and return the deleted row. Acts only on the caller's own state.
   *
   * @param appId - App (game) id whose state row to delete (`BigInt` as a decimal
   *   string).
   * @returns The deleted {@link UserAppState}.
   * @throws {CrowdyGraphQLError} when no state row exists for `appId`
   *   (not-found), or `UNAUTHENTICATED`.
   */
  async delete(
    appId: DeleteUserAppStateMutationVariables['appId']
  ): Promise<DeleteUserAppStateMutation['deleteUserAppState']> {
    const data = await this.gql.request(DeleteUserAppStateDocument, { appId });
    return data.deleteUserAppState;
  }
}
