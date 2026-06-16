import type { GraphQLClient } from '../client.js';
import {
  UserAvatarsDocument,
  AvatarByIdDocument,
  MyAvatarsDocument,
  AvatarAppStateDocument,
  AvatarAppStatesDocument,
  CreateAvatarDocument,
  UpdateAvatarDocument,
  DeleteAvatarDocument,
  UpdateAvatarStateDocument,
  UpdateAvatarAppStateDocument,
  type UserAvatarsQuery,
  type AvatarByIdQuery,
  type MyAvatarsQuery,
  type AvatarAppStateQuery,
  type AvatarAppStatesQuery,
  type CreateAvatarMutation,
  type UpdateAvatarMutation,
  type DeleteAvatarMutation,
  type UpdateAvatarStateMutation,
  type UpdateAvatarAppStateMutation,
  type CreateAvatarInput,
  type UpdateAvatarInput,
  type UpdateAvatarStateInput,
  type UpdateAvatarAppStateInput,
} from '../generated/graphql.js';

/**
 * Avatars + per-app avatar state — exposed as `client.avatars`.
 *
 * Targets the **game-api**. Avatars are durable player identities (distinct
 * from realtime actors). Reads are owner-aware: non-owners receive
 * `privateState` stripped to `null`. Create/update/delete and state writes are
 * owner-exclusive (throw on a non-owner). All require a valid session; state
 * blobs are base64-encoded binary; `BigInt` ids are decimal strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` without a session; an
 *   authorization error when writing an avatar you do not own.
 */
export class AvatarsAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * List a user's avatars (owner-aware: `privateState` stripped for non-owners).
   *
   * @param userId - Owner user id.
   * @returns The user's avatars.
   */
  async listForUser(userId: string): Promise<UserAvatarsQuery['userAvatars']> {
    const data = await this.graphql.request(UserAvatarsDocument, { userId });
    return data.userAvatars;
  }

  /**
   * Fetch one avatar by id (owner-aware). Throws if it does not exist.
   *
   * @param id - Avatar id.
   * @returns The avatar.
   */
  async get(id: string): Promise<AvatarByIdQuery['avatar']> {
    const data = await this.graphql.request(AvatarByIdDocument, { id });
    return data.avatar;
  }

  /**
   * List the authenticated caller's own avatars (full state included).
   *
   * @returns The caller's avatars.
   */
  async mine(): Promise<MyAvatarsQuery['myAvatars']> {
    const data = await this.graphql.request(MyAvatarsDocument, {});
    return data.myAvatars;
  }

  /**
   * Read one avatar's per-app state (public read). Returns `null` when unset.
   *
   * @param appId - App id the state is scoped to.
   * @param avatarId - Avatar id whose per-app state to read.
   * @returns The per-app state, or `null`.
   */
  async appState(
    appId: string,
    avatarId: string,
  ): Promise<AvatarAppStateQuery['avatarAppState']> {
    const data = await this.graphql.request(AvatarAppStateDocument, {
      appId,
      avatarId,
    });
    return data.avatarAppState;
  }

  /**
   * Batch-read per-app state for many avatars under one app (public read).
   *
   * @param appId - App id the states are scoped to.
   * @param avatarIds - Avatar ids to fetch.
   * @returns The per-app states (avatars with no row are omitted).
   */
  async appStates(
    appId: string,
    avatarIds: string[],
  ): Promise<AvatarAppStatesQuery['avatarAppStates']> {
    const data = await this.graphql.request(AvatarAppStatesDocument, {
      appId,
      avatarIds,
    });
    return data.avatarAppStates;
  }

  /**
   * Create a new avatar owned by the caller.
   *
   * @param input - {@link CreateAvatarInput} (optional `name`).
   * @returns The created avatar.
   */
  async create(
    input: CreateAvatarInput,
  ): Promise<CreateAvatarMutation['createAvatar']> {
    const data = await this.graphql.request(CreateAvatarDocument, { input });
    return data.createAvatar;
  }

  /**
   * Update an avatar's mutable fields (owner-exclusive).
   *
   * @param id - Avatar id.
   * @param input - {@link UpdateAvatarInput} fields to change.
   * @returns The updated avatar.
   */
  async update(
    id: string,
    input: UpdateAvatarInput,
  ): Promise<UpdateAvatarMutation['updateAvatar']> {
    const data = await this.graphql.request(UpdateAvatarDocument, { id, input });
    return data.updateAvatar;
  }

  /**
   * Permanently delete an avatar (owner-exclusive). Returns the deleted row.
   *
   * @param id - Avatar id.
   * @param idempotencyKey - Optional idempotency key for safe retries.
   * @returns The now-deleted avatar.
   */
  async delete(
    id: string,
    idempotencyKey?: string,
  ): Promise<DeleteAvatarMutation['deleteAvatar']> {
    const data = await this.graphql.request(DeleteAvatarDocument, {
      id,
      idempotencyKey,
    });
    return data.deleteAvatar;
  }

  /**
   * Replace an avatar's public/private state blobs (owner-exclusive).
   *
   * @param id - Avatar id.
   * @param input - {@link UpdateAvatarStateInput} (base64 blobs).
   * @returns The updated avatar.
   */
  async updateState(
    id: string,
    input: UpdateAvatarStateInput,
  ): Promise<UpdateAvatarStateMutation['updateAvatarState']> {
    const data = await this.graphql.request(UpdateAvatarStateDocument, {
      id,
      input,
    });
    return data.updateAvatarState;
  }

  /**
   * Create/replace an avatar's per-app state (owner-exclusive write, public
   * read).
   *
   * @param input - {@link UpdateAvatarAppStateInput} (appId, avatarId, state).
   * @returns The upserted per-app state.
   */
  async updateAppState(
    input: UpdateAvatarAppStateInput,
  ): Promise<UpdateAvatarAppStateMutation['updateAvatarAppState']> {
    const data = await this.graphql.request(UpdateAvatarAppStateDocument, {
      input,
    });
    return data.updateAvatarAppState;
  }
}
