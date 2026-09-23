import type { GraphQLClient } from '../client.js';

import {
  ActorDocument,
  type ActorQuery,
  type ActorQueryVariables,
  ActorsDocument,
  type ActorsQuery,
  type ActorsQueryVariables,
  ActorsConnectionDocument,
  type ActorsConnectionQuery,
  type ActorsConnectionQueryVariables,
  BatchLookupActorsDocument,
  type BatchLookupActorsQuery,
  type BatchLookupActorsQueryVariables,
  CreateActorDocument,
  type CreateActorMutation,
  type CreateActorMutationVariables,
  UpdateActorDocument,
  type UpdateActorMutation,
  type UpdateActorMutationVariables,
  DeleteActorDocument,
  type DeleteActorMutation,
  type DeleteActorMutationVariables,
  UpdateActorStateDocument,
  type UpdateActorStateMutation,
  type UpdateActorStateMutationVariables,
} from '../generated/graphql.js';

/**
 * Persisted-actor (player / NPC) CRUD and filtering on the **game-api**.
 * Exposed as `client.actors`.
 *
 * An "actor" here is the durable, server-stored record of a participant
 * (identity, owning app, optional avatar, last-known chunk, and a state blob) —
 * not the high-frequency spatial replication stream. For real-time position
 * and state fan-out use the UDP path instead (`client.udp.sendActorUpdate(...)`
 * or the ergonomic `client.world(appId).actor()` helper), which is unchanged
 * and far cheaper per update.
 *
 * Actor ids are exactly **32 ASCII characters** (the UDP-wire actor id), **not**
 * a hyphenated RFC-4122 UUID. Use {@link generateCrowdyUuid} to mint one.
 * `BigInt` values (`appId`, `avatarId`, `userId`) are sent and received as
 * decimal strings.
 *
 * Actors are **game-plane** objects: every method wants an **app token for the
 * actor's app** (minted with `client.portal.mintAppToken()` and set via
 * `client.setToken()`), and the by-id methods ({@link get}, {@link update},
 * {@link updateState}, {@link delete}) answer `NOT_FOUND` — the same as a
 * missing id — for a session token or another app's token. {@link list} /
 * {@link listConnection} are the caller's own actors and, under an app token,
 * only the ones in that app. No token at all throws {@link CrowdyGraphQLError}
 * `UNAUTHENTICATED`.
 */
export class ActorsAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Fetch a single persisted actor by its 32-character actor id.
   *
   * @param uuid - The actor's 32-ASCII-character id.
   * @returns The {@link Actor}. The owner sees `privateState`; anyone else in
   *   the app gets a public copy with `privateState` `null`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the caller has no token;
   *   `NOT_FOUND` if the uuid does not exist in the caller's app (a session
   *   token or another app's token gets the same answer).
   */
  async get(uuid: ActorQueryVariables['uuid']): Promise<ActorQuery['actor']> {
    const data = await this.gql.request(ActorDocument, { uuid });
    return data.actor;
  }

  /**
   * List the **caller's own** persisted actors, optionally narrowed by an
   * {@link ActorFilterInput} (app, avatar, uuid, chunk). Under an app token the
   * list is confined to that token's app whether or not `filter.appId` is
   * given; a `filter.appId` naming another app is refused (`SCOPE_MISSING`).
   * A session token lists the caller's actors across every app.
   *
   * @param filter - Optional filter; fields are ANDed together.
   * @returns The matching actors (full state; they are all the caller's).
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async list(filter?: ActorsQueryVariables['filter']): Promise<ActorsQuery['actors']> {
    const data = await this.gql.request(ActorsDocument, { filter });
    return data.actors;
  }

  /**
   * Relay-style cursor pagination over the caller's actors — the preferred
   * alternative to {@link list} for large result sets. Page with `first` plus
   * the previous page's `pageInfo.endCursor` as `after`; `filter` fields are
   * ANDed together. See https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - Optional `first` (default 50, max 200), `after` cursor, and
   *   {@link ActorFilterInput}.
   * @returns An {@link ActorsConnection} (`edges { cursor node }`, `pageInfo`,
   *   `totalCount`). Same scoping as {@link list}: under an app token, only
   *   that app's actors.
   */
  async listConnection(
    args: ActorsConnectionQueryVariables = {}
  ): Promise<ActorsConnectionQuery['actorsConnection']> {
    const data = await this.gql.request(ActorsConnectionDocument, args);
    return data.actorsConnection;
  }

  /**
   * Resolve many actors in one round-trip by id (and/or the other keys the
   * {@link BatchActorLookupInput} accepts). Prefer this over calling
   * {@link get} in a loop — it avoids N requests and N auth checks.
   *
   * @param input - The batch lookup keys.
   * @returns The actors that were found, public state only (`privateState` is
   *   `null` for every result). Unknown ids **and ids in other apps** are
   *   simply omitted.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the caller has no token;
   *   `NOT_FOUND` for a session token (this is an app-token-only field).
   */
  async batchLookup(
    input: BatchLookupActorsQueryVariables['input']
  ): Promise<BatchLookupActorsQuery['batchLookupActors']> {
    const data = await this.gql.request(BatchLookupActorsDocument, { input });
    return data.batchLookupActors;
  }

  /**
   * Create a persisted actor. `input.uuid` must be a unique 32-ASCII-character
   * id and `input.appId` the owning app; `chunk` is the initial grid position.
   * `avatarId`, `privateState`, and `publicState` are optional (state blobs are
   * base64-encoded binary).
   *
   * @param input - {@link CreateActorInput}.
   * @returns The newly created {@link Actor}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. malformed/duplicate
   *   uuid), `FORBIDDEN` if not entitled to the app, or `UNAUTHENTICATED`.
   */
  async create(
    input: CreateActorMutationVariables['input']
  ): Promise<CreateActorMutation['createActor']> {
    const data = await this.gql.request(CreateActorDocument, { input });
    return data.createActor;
  }

  /**
   * Patch an existing actor. Only the fields present on `input` change; omitted
   * fields are left untouched.
   *
   * @param uuid - The actor's 32-character id.
   * @param input - Fields to change ({@link UpdateActorInput}).
   * @returns The updated {@link Actor}.
   * @throws {CrowdyGraphQLError} `NOT_FOUND` if the uuid does not exist in the
   *   caller's app (a session token or another app's token gets the same
   *   answer); `UNAUTHENTICATED` if the caller is not the actor's owner (the
   *   owner-only rule surfaces as a 401).
   */
  async update(
    uuid: UpdateActorMutationVariables['uuid'],
    input: UpdateActorMutationVariables['input']
  ): Promise<UpdateActorMutation['updateActor']> {
    const data = await this.gql.request(UpdateActorDocument, { uuid, input });
    return data.updateActor;
  }

  /**
   * Delete a persisted actor.
   *
   * Pass an `idempotencyKey` to make retries safe: replaying with the same key
   * returns the first result instead of re-applying, while the same key with a
   * **different** `uuid` throws {@link CrowdyGraphQLError} with
   * `code === 'IDEMPOTENCY_CONFLICT'`. Keys expire server-side after 24h.
   * Requires game-api ≥ v0.10.3.
   *
   * @param uuid - The actor's 32-character id.
   * @param idempotencyKey - Optional client-supplied key for safe retries.
   * @returns The deleted {@link Actor} (its identifying fields).
   * @throws {CrowdyGraphQLError} `IDEMPOTENCY_CONFLICT`; `NOT_FOUND` if the
   *   uuid does not exist in the caller's app (a session token or another
   *   app's token gets the same answer); `UNAUTHENTICATED` with no token or
   *   when the caller is not the owner (the owner-only rule surfaces as a 401).
   */
  async delete(
    uuid: DeleteActorMutationVariables['uuid'],
    idempotencyKey?: DeleteActorMutationVariables['idempotencyKey']
  ): Promise<DeleteActorMutation['deleteActor']> {
    const data = await this.gql.request(DeleteActorDocument, { uuid, idempotencyKey });
    return data.deleteActor;
  }

  /**
   * Replace just an actor's state blob(s) without touching its other fields —
   * a lighter write than {@link update} when only `privateState`/`publicState`
   * change. State is base64-encoded binary.
   *
   * @param uuid - The actor's 32-character id.
   * @param input - {@link UpdateActorStateInput}.
   * @returns The updated {@link Actor}.
   * @throws {CrowdyGraphQLError} `NOT_FOUND` if the uuid does not exist in the
   *   caller's app (a session token or another app's token gets the same
   *   answer); `UNAUTHENTICATED` if the caller is not the owner (the
   *   owner-only rule surfaces as a 401); `BAD_USER_INPUT` for a malformed blob.
   */
  async updateState(
    uuid: UpdateActorStateMutationVariables['uuid'],
    input: UpdateActorStateMutationVariables['input']
  ): Promise<UpdateActorStateMutation['updateActorState']> {
    const data = await this.gql.request(UpdateActorStateDocument, { uuid, input });
    return data.updateActorState;
  }
}
