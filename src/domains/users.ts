import type { GraphQLClient } from '../client.js';
import {
  MeDocument,
  UpdateGamertagDocument,
  DeleteMyAccountDocument,
  UserDocument,
  UpdateUserStateDocument,
  FreePlayWindowDocument,
  PlayerProfileDocument,
  PlayerProfilesDocument,
  type PlayerProfileQuery,
  type PlayerProfilesQuery,
  type MeQuery,
  type UpdateGamertagInput,
  type UpdateGamertagMutation,
  type UserQuery,
  type UpdateUserStateMutation,
  type UpdateUserStateInput,
  type FreePlayWindowQuery,
} from '../generated/graphql.js';

/** Most ids {@link UsersAPI.playerProfiles} takes in one call. */
export const PLAYER_PROFILES_MAX = 100;

/**
 * User identity & account management — exposed as `client.users`.
 *
 * Part of the management surface. After
 * the database split the users table is management-owned, so game-api no longer
 * exposes these identity mutations — calling them against a game-api endpoint
 * throws {@link CrowdyGraphQLError} with `FORBIDDEN`, directing you to the
 * management API. Only the read/identity surface a game client realistically
 * needs lives here; platform administration (super-admin and operator fields)
 * is not in the SDK: call the API directly from your own tooling.
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
   * Look up a user by id. Requires a valid session. The private fields
   * (`email`, `state`, `isConfirmed`, the early-access grants, `orgId`,
   * `externalId`, `userType`, `isSuperAdmin`) come back `null` for anyone but
   * yourself; for another player's nametag use {@link playerProfile}.
   *
   * @param id - Numeric user id (`BigInt` as a decimal string).
   * @returns The {@link User}, or `null` if no such user.
   */
  async get(id: string): Promise<UserQuery['user']> {
    const data = await this.graphql.request(UserDocument, { id });
    return data.user;
  }

  /**
   * A player's public profile (`userId`, `gamertag`, `disambiguation`), for
   * nametags and friends lists. Needs a game token; carries nothing private.
   *
   * @param userId - Numeric user id (`BigInt` as a decimal string).
   * @returns The profile, or `null` when there is no such user.
   */
  async playerProfile(
    userId: string,
  ): Promise<PlayerProfileQuery['playerProfile']> {
    const data = await this.graphql.request(PlayerProfileDocument, { userId });
    return data.playerProfile;
  }

  /**
   * Public profiles for up to 100 players in one call (duplicates are read
   * once; unknown ids are left out).
   *
   * @param userIds - Numeric user ids (`BigInt` decimal strings), at most 100.
   * @throws {RangeError} for more than 100 ids; nothing is sent.
   */
  async playerProfiles(
    userIds: string[],
  ): Promise<PlayerProfilesQuery['playerProfiles']> {
    if (userIds.length > PLAYER_PROFILES_MAX) {
      throw new RangeError(
        `playerProfiles takes at most ${PLAYER_PROFILES_MAX} ids: ${userIds.length}`,
      );
    }
    if (userIds.length === 0) return [];
    const data = await this.graphql.request(PlayerProfilesDocument, { userIds });
    return data.playerProfiles;
  }

  /**
   * Replace the caller's own top-level state blob (base64; `null` clears it).
   * Only ever writes the caller. Requires a valid session.
   *
   * @param input - {@link UpdateUserStateInput}: the base64 `state`.
   * @returns The updated user's `userId` + `state`.
   */
  async updateState(
    input: UpdateUserStateInput,
  ): Promise<UpdateUserStateMutation['updateUserState']> {
    const data = await this.graphql.request(UpdateUserStateDocument, { input });
    return data.updateUserState;
  }
}
