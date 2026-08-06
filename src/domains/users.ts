import type { GraphQLClient } from '../client.js';
import {
  MeDocument,
  UpdateGamertagDocument,
  DeleteMyAccountDocument,
  UserDocument,
  UsersPaginatedDocument,
  UsersConnectionDocument,
  SetSuperAdminDocument,
  SetOperatorDocument,
  SetEarlyAccessOverrideDocument,
  UpdateUserTypeDocument,
  ForceLogoutUserDocument,
  UpdateUserStateDocument,
  FreePlayWindowDocument,
  type MeQuery,
  type UpdateGamertagInput,
  type UpdateGamertagMutation,
  type UserQuery,
  type UsersPaginatedQuery,
  type UsersPaginatedQueryVariables,
  type UsersConnectionQuery,
  type UsersConnectionQueryVariables,
  type SetSuperAdminMutation,
  type SetOperatorMutation,
  type SetEarlyAccessOverrideMutation,
  type UpdateUserTypeMutation,
  type ForceLogoutUserMutation,
  type UpdateUserStateMutation,
  type UpdateUserStateInput,
  type FreePlayWindowQuery,
} from '../generated/graphql.js';

/**
 * User identity & account management — exposed as `client.users`.
 *
 * Part of the management surface. After
 * the database split the users table is management-owned, so game-api no longer
 * exposes these identity mutations — calling them against a game-api endpoint
 * throws {@link CrowdyGraphQLError} with `FORBIDDEN`, directing you to the
 * management API. Only the read/identity surface a game client realistically
 * needs lives here; super-admin / operator screens use the management UI
 * directly rather than the SDK.
 *
 * Every method needs a valid session (a bearer token set by
 * `client.auth.login()` / `register()` or `client.setToken()`); without one the
 * server returns `UNAUTHENTICATED` — except {@link me}, which resolves to
 * `null`. `BigInt` ids such as `userId` and `orgId` are decimal strings.
 */
export class UsersAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Validate the current bearer token and return the authenticated user record.
   * Handy for restoring a session on SDK init.
   *
   * @returns The {@link User}, or `null` if the token is missing, expired, or
   *   revoked (an invalid token resolves to `null` rather than throwing).
   * @throws {CrowdyGraphQLError} on transport/validation failures.
   */
  async me(): Promise<MeQuery['me']> {
    const data = await this.graphql.request(MeDocument);
    return data.me;
  }

  /**
   * Set the authenticated user's gamertag and disambiguation (and append a
   * gamertag-history row). Only ever updates the caller. Requires a valid
   * session.
   *
   * @param input - {@link UpdateGamertagInput}: the new `gamertag` (max 64
   *   characters) and `disambiguation` (max 128 characters); the pair must be
   *   unique across the platform.
   * @returns The updated {@link User} (its `userId`, `gamertag`,
   *   `disambiguation`, and `userType`).
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` if the gamertag +
   *   disambiguation pair is already taken, `UNAUTHENTICATED` without a session,
   *   or `FORBIDDEN` when called against game-api (call the management API).
   */
  async updateGamertag(
    input: UpdateGamertagInput,
  ): Promise<UpdateGamertagMutation['updateGamertag']> {
    const data = await this.graphql.request(UpdateGamertagDocument, { input });
    return data.updateGamertag;
  }

  /**
   * **Destructive, self-service** soft-delete of the caller's **own** account:
   * anonymizes PII and revokes all sessions. Wallet, voxel, and donation history
   * stay intact via foreign keys. Acts only on the caller (no target argument).
   * Requires a valid session.
   *
   * @returns `true` on success.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session, or
   *   `FORBIDDEN` when called against game-api (call the management API).
   */
  async deleteMyAccount(): Promise<boolean> {
    const data = await this.graphql.request(DeleteMyAccountDocument);
    return data.deleteMyAccount;
  }

  /**
   * Report whether a free-play window is currently active and when the next one
   * starts. **Public** — no session required.
   *
   * @returns The {@link FreePlayWindowInfo}.
   */
  async freePlayWindow(): Promise<FreePlayWindowQuery['freePlayWindowInfo']> {
    const data = await this.graphql.request(FreePlayWindowDocument);
    return data.freePlayWindowInfo;
  }

  /**
   * Look up any user by id. **Super-admin only** (regular callers can only read
   * their own profile via {@link me}).
   *
   * @param id - Numeric user id (`BigInt` as a decimal string).
   * @returns The {@link User}, or `null` if no such user.
   */
  async get(id: string): Promise<UserQuery['user']> {
    const data = await this.graphql.request(UserDocument, { id });
    return data.user;
  }

  /**
   * Search/list users with offset pagination. **Super-admin only.**
   *
   * @param opts - Optional `query` (prefix match over email/gamertag/id) and
   *   `limit` / `offset`.
   * @returns A page of users.
   * @remarks Prefer {@link listConnection} (Relay cursor pagination) for large
   *   result sets; the offset args here are deprecated server-side.
   */
  async paginated(
    opts: {
      query?: UsersPaginatedQueryVariables['query'];
      limit?: UsersPaginatedQueryVariables['limit'];
      offset?: UsersPaginatedQueryVariables['offset'];
    } = {},
  ): Promise<UsersPaginatedQuery['usersPaginated']> {
    const data = await this.graphql.request(UsersPaginatedDocument, opts);
    return data.usersPaginated;
  }

  /**
   * Relay-style cursor pagination over users — the preferred alternative to
   * {@link paginated}. **Super-admin only.** Page with `first` plus the previous
   * page's `pageInfo.endCursor` as `after`. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - Optional `first`, `after`, and `query`.
   * @returns A {@link UsersConnection}.
   */
  async listConnection(
    args: UsersConnectionQueryVariables = {},
  ): Promise<UsersConnectionQuery['usersConnection']> {
    const data = await this.graphql.request(UsersConnectionDocument, args);
    return data.usersConnection;
  }

  /**
   * Grant or revoke the platform `is_super_admin` flag on a user. **Super-admin
   * only.**
   *
   * @param userId - Target user id.
   * @param value - `true` to grant, `false` to revoke.
   * @returns The updated user's `userId` + `isSuperAdmin`.
   */
  async setSuperAdmin(
    userId: string,
    value: boolean,
  ): Promise<SetSuperAdminMutation['setSuperAdmin']> {
    const data = await this.graphql.request(SetSuperAdminDocument, {
      userId,
      value,
    });
    return data.setSuperAdmin;
  }

  /**
   * Grant or revoke the platform `is_operator` flag (control-plane access) on a
   * user. **Super-admin only.**
   *
   * @param userId - Target user id.
   * @param value - `true` to grant, `false` to revoke.
   * @returns The updated user's `userId` + `isOperator`.
   */
  async setOperator(
    userId: string,
    value: boolean,
  ): Promise<SetOperatorMutation['setOperator']> {
    const data = await this.graphql.request(SetOperatorDocument, {
      userId,
      value,
    });
    return data.setOperator;
  }

  /**
   * Force an early-access override on a user (bypasses the early-access gate).
   * **Super-admin only.**
   *
   * @param userId - Target user id.
   * @param value - `true` to grant the override, `false` to clear it.
   * @returns The updated user's `userId` + `grantEarlyAccessOverride`.
   */
  async setEarlyAccessOverride(
    userId: string,
    value: boolean,
  ): Promise<SetEarlyAccessOverrideMutation['setEarlyAccessOverride']> {
    const data = await this.graphql.request(SetEarlyAccessOverrideDocument, {
      userId,
      value,
    });
    return data.setEarlyAccessOverride;
  }

  /**
   * Set a user's `user_type`. **Super-admin only.**
   *
   * @param userId - Target user id.
   * @param value - The new user type string.
   * @returns The updated user's `userId` + `userType`.
   */
  async updateType(
    userId: string,
    value: string,
  ): Promise<UpdateUserTypeMutation['updateUserType']> {
    const data = await this.graphql.request(UpdateUserTypeDocument, {
      userId,
      value,
    });
    return data.updateUserType;
  }

  /**
   * Revoke all of a user's sessions (force logout everywhere). **Super-admin
   * only.**
   *
   * @param userId - Target user id.
   * @returns `true` on success.
   */
  async forceLogout(
    userId: string,
  ): Promise<ForceLogoutUserMutation['forceLogoutUser']> {
    const data = await this.graphql.request(ForceLogoutUserDocument, {
      userId,
    });
    return data.forceLogoutUser;
  }

  /**
   * Replace a user's top-level state blob. **Super-admin only.**
   *
   * @param input - {@link UpdateUserStateInput} (`userId` + base64 `state`).
   * @returns The updated user's `userId` + `state`.
   */
  async updateState(
    input: UpdateUserStateInput,
  ): Promise<UpdateUserStateMutation['updateUserState']> {
    const data = await this.graphql.request(UpdateUserStateDocument, { input });
    return data.updateUserState;
  }
}
