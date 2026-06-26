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
 * Every method requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`) and that the caller is
 * entitled to the target app, or it throws {@link CrowdyGraphQLError}
 * (`UNAUTHENTICATED` / `FORBIDDEN`).
 */
export class ActorsAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Fetch a single persisted actor by its 32-character actor id.
   *
   * @param uuid - The actor's 32-ASCII-character id.
   * @returns The {@link Actor}, or `null` if no actor with that id exists.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` if the caller
   *   isn't entitled to the actor's app.
   */
  async get(uuid: ActorQueryVariables['uuid']): Promise<ActorQuery['actor']> {
    const data = await this.gql.request(ActorDocument, { uuid });
    return data.actor;
  }

  /**
   * List persisted actors, optionally narrowed by an {@link ActorFilterInput}
   * (e.g. by app, owning user, or avatar). Omit the filter to use its defaults.
   *
   * @param filter - Optional filter; fields are ANDed together.
   * @returns The matching actors.
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
   *   `totalCount`).
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
   * @returns The actors that were found (missing ids are simply omitted).
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
   * @throws {CrowdyGraphQLError} if the actor doesn't exist or the caller lacks
   *   access.
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
   * @throws {CrowdyGraphQLError} `IDEMPOTENCY_CONFLICT`, `FORBIDDEN`, or
   *   `UNAUTHENTICATED`.
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
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async updateState(
    uuid: UpdateActorStateMutationVariables['uuid'],
    input: UpdateActorStateMutationVariables['input']
  ): Promise<UpdateActorStateMutation['updateActorState']> {
    const data = await this.gql.request(UpdateActorStateDocument, { uuid, input });
    return data.updateActorState;
  }
}
