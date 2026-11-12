import type { GraphQLClient } from '../client.js';

import {
  GetChunkDocument,
  type GetChunkQuery,
  type GetChunkQueryVariables,
  GetChunkLodsDocument,
  type GetChunkLodsQuery,
  type GetChunkLodsQueryVariables,
  GetChunksByDistanceDocument,
  type GetChunksByDistanceQuery,
  type GetChunksByDistanceQueryVariables,
  GetVoxelListDocument,
  type GetVoxelListQuery,
  type GetVoxelListQueryVariables,
  UpdateChunkDocument,
  type UpdateChunkMutation,
  type UpdateChunkMutationVariables,
  UpdateChunkStateDocument,
  type UpdateChunkStateMutation,
  type UpdateChunkStateMutationVariables,
  UpdateChunkLodsDocument,
  type UpdateChunkLodsMutation,
  type UpdateChunkLodsMutationVariables,
} from '../generated/graphql.js';

/**
 * Chunk-level reads and writes for an app's voxel world on the **game-api**.
 * Exposed as `client.chunks`.
 *
 * A "chunk" is a persisted 16×16×16-voxel cube (4096 voxels) of an app's world.
 * It holds the packed voxel-type grid (`voxels`), sparse per-voxel state
 * overrides (`voxelStates`), an optional opaque chunk-level state blob
 * (`chunkState`), and level-of-detail meshes (`lods`). Use this API for
 * authoritative world persistence and bulk region loads; for high-frequency,
 * per-voxel realtime edits prefer the UDP path
 * (`client.udp.sendVoxelUpdate(...)`), which is far cheaper per update.
 *
 * Coordinate & encoding conventions used throughout:
 * - **Chunk coordinates** (`coordinates.x/y/z`) are int64 **decimal strings**;
 *   `+1` on an axis is one chunk (16 voxels) further along it.
 * - **Voxel positions** (`location` / `voxelCoord`) are signed 16-bit ints,
 *   `0-15` per axis for in-bounds voxels.
 * - Binary blobs — the dense `voxels` grid (exactly 4096 bytes once decoded),
 *   per-voxel `state`, `chunkState`, and LOD `data` — are **base64-encoded**.
 * - `appId` is a `BigInt` sent and received as a decimal string.
 *
 * Every method requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`); an app-scoped token may only
 * touch its own app, otherwise {@link CrowdyGraphQLError} is thrown
 * (`UNAUTHENTICATED` / `FORBIDDEN`). The two privileged writes
 * ({@link ChunksAPI.updateState}, {@link ChunksAPI.updateLods}) additionally
 * require the `manage_apps` permission on the owning org
 * (`SCOPE_MISSING` / `FORBIDDEN`).
 */
export class ChunksAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Fetch a single chunk — its base64 voxel grid, per-voxel states, chunk-level
   * state and LODs — by app id and chunk coordinates. Read-only. Use the input's
   * LOD options (`requestedLodLevels` / `includeAllLods`) to limit which LODs
   * come back.
   *
   * @param input - {@link GetChunkInput}: `appId` (decimal string), chunk
   *   `coordinates` (int64 decimal strings), and optional LOD filtering.
   * @returns The {@link Chunk}, or `null` if no chunk exists at those
   *   coordinates. Binary fields (`voxels`, `chunkState`, per-voxel/LOD `data`)
   *   are base64-encoded.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED`, or `FORBIDDEN` if an
   *   app-scoped token is used against a different app.
   */
  async get(
    input: GetChunkQueryVariables['input']
  ): Promise<GetChunkQuery['getChunk']> {
    const data = await this.gql.request(GetChunkDocument, { input });
    return data.getChunk;
  }

  /**
   * Fetch only the requested level-of-detail (LOD) meshes for one chunk —
   * cheaper than {@link ChunksAPI.get} when you only need LODs. Read-only.
   *
   * @param input - {@link GetChunkLodsInput}: `appId`, chunk `coordinates`, and
   *   `lodLevels` (the LOD levels to return; each `>= 0`, where `0` is finest).
   * @returns A {@link ChunkLodsResponse} (chunk identity plus the matching
   *   `lods`, each carrying base64 `data`), or `null` if the chunk does not
   *   exist.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN`.
   */
  async getLods(
    input: GetChunkLodsQueryVariables['input']
  ): Promise<GetChunkLodsQuery['getChunkLods']> {
    const data = await this.gql.request(GetChunkLodsDocument, { input });
    return data.getChunkLods;
  }

  /**
   * Return the stored chunks of a region, paginated: a cube (`centerCoordinate`
   * ± `maxDistance` chunks on each axis, nearest first) or a box between two
   * corners (`lowChunk` and `highChunk`, inclusive, either order, at most 4,913
   * chunks, ordered by x, y, z), one or the other. A box streams in only the
   * slab a step uncovers. Pages are stable: each chunk is on exactly one. Use
   * this for bulk region loads; use {@link ChunksAPI.get} for a single chunk.
   * Read-only.
   *
   * @param input - {@link GetChunksByDistanceInput}: `appId`, the region,
   *   optional `limit` (max chunks, default 1000) / `skip` (default 0), and an
   *   optional `since`: only chunks whose stored row was written at or after it
   *   (`updateChunk`, `updateChunkState`, `updateChunkLods`; voxel edits do not
   *   move it, see {@link VoxelsAPI.listByDistance}). Box, `since` and stable
   *   pages need ck-api v2.67.0.
   * @returns A {@link ChunksByDistanceResponse}: the matching `chunks` and the
   *   `limit`/`skip` applied.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. `maxDistance` outside
   *   `1-8`, a box over 4,913 chunks, or a cube and a box together),
   *   `UNAUTHENTICATED`, or `FORBIDDEN`.
   */
  async byDistance(
    input: GetChunksByDistanceQueryVariables['input']
  ): Promise<GetChunksByDistanceQuery['getChunksByDistance']> {
    const data = await this.gql.request(GetChunksByDistanceDocument, { input });
    return data.getChunksByDistance;
  }

  /**
   * List the recorded voxel edits (the `voxel_updates` log) of a single chunk,
   * ordered by position and at most 65,536 of them, in a chunk-shaped envelope:
   * the first page of {@link VoxelsAPI.list}, which pages past that (ck-api
   * v2.67.0; before it the list was newest first and unbounded). Use
   * {@link ChunksAPI.get} instead when you want the packed voxel grid rather
   * than the individual edit log. Read-only.
   *
   * @param input - {@link GetVoxelListInput}: `appId` and chunk `coordinates`.
   * @returns A {@link ChunkVoxelResponse}: the chunk address plus its
   *   {@link Voxel} edits (each `state` blob base64-encoded).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN`.
   */
  async voxelList(
    input: GetVoxelListQueryVariables['input']
  ): Promise<GetVoxelListQuery['getVoxelList']> {
    const data = await this.gql.request(GetVoxelListDocument, { input });
    return data.getVoxelList;
  }

  /**
   * Create or replace a chunk's dense voxel grid and/or per-voxel states for the
   * given app and coordinates, recording each provided voxel state as an
   * individual voxel update and asynchronously uploading the chunk to the CDN.
   * **Writes world state.** Leaves `chunkState` and LODs untouched.
   *
   * @param input - {@link ChunkUpdateInput}: `appId`, `coordinates`, an optional
   *   base64 `voxels` grid (the decoded buffer must be exactly 4096 bytes — one
   *   voxel-type byte `0-255` per voxel, indexed `x + y*16 + z*256`), and
   *   optional `voxelStates` overrides.
   * @returns The updated {@link Chunk}.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. a `voxels` buffer that
   *   isn't 4096 bytes), `UNAUTHENTICATED`, or `FORBIDDEN` if an app-scoped token
   *   targets another app.
   */
  async update(
    input: UpdateChunkMutationVariables['input']
  ): Promise<UpdateChunkMutation['updateChunk']> {
    const data = await this.gql.request(UpdateChunkDocument, { input });
    return data.updateChunk;
  }

  /**
   * Upsert **only** the opaque base64 chunk-level state blob for a chunk,
   * preserving its voxels, per-voxel states and LODs. **Writes world state.**
   * Privileged: requires the `manage_apps` permission on the org that owns
   * `input.appId` (super admins bypass).
   *
   * @param input - {@link UpdateChunkStateInput}: `appId`, `coordinates`, and the
   *   base64-encoded `chunkState` blob (omit/null to store none).
   * @returns The updated {@link Chunk}, or `null` if it could not be written.
   * @throws {CrowdyGraphQLError} `SCOPE_MISSING` / `FORBIDDEN` (missing
   *   `manage_apps`), or `UNAUTHENTICATED`.
   */
  async updateState(
    input: UpdateChunkStateMutationVariables['input']
  ): Promise<UpdateChunkStateMutation['updateChunkState']> {
    const data = await this.gql.request(UpdateChunkStateDocument, { input });
    return data.updateChunkState;
  }

  /**
   * Replace the entire level-of-detail (LOD) set for a chunk, preserving its
   * voxels, per-voxel states, chunk state and owner. **Writes world state.**
   * Privileged: requires the `manage_apps` permission on the org that owns
   * `input.appId` (super admins bypass).
   *
   * @param input - {@link UpdateChunkLodsInput}: `appId`, `coordinates`, and the
   *   full `lods` set (each entry a `level` `>= 0` plus base64 `data`); this
   *   REPLACES any existing LODs.
   * @returns The updated {@link Chunk}, or `null` if it could not be written.
   * @throws {CrowdyGraphQLError} `SCOPE_MISSING` / `FORBIDDEN` (missing
   *   `manage_apps`), or `UNAUTHENTICATED`.
   */
  async updateLods(
    input: UpdateChunkLodsMutationVariables['input']
  ): Promise<UpdateChunkLodsMutation['updateChunkLods']> {
    const data = await this.gql.request(UpdateChunkLodsDocument, { input });
    return data.updateChunkLods;
  }
}
