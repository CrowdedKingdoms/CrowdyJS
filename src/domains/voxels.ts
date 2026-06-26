import type { GraphQLClient } from '../client.js';

import {
  ListVoxelsDocument,
  type ListVoxelsQuery,
  type ListVoxelsQueryVariables,
  ListVoxelUpdatesByDistanceDocument,
  type ListVoxelUpdatesByDistanceQuery,
  type ListVoxelUpdatesByDistanceQueryVariables,
  UpdateVoxelDocument,
  type UpdateVoxelMutation,
  type UpdateVoxelMutationVariables,
  VoxelUpdateHistoryDocument,
  type VoxelUpdateHistoryQuery,
  type VoxelUpdateHistoryQueryVariables,
  VoxelUpdateHistoryConnectionDocument,
  type VoxelUpdateHistoryConnectionQuery,
  type VoxelUpdateHistoryConnectionQueryVariables,
  RollbackVoxelUpdatesDocument,
  type RollbackVoxelUpdatesMutation,
  type RollbackVoxelUpdatesMutationVariables,
} from '../generated/graphql.js';

/**
 * Voxel-edit queries and mutations for an app's world on the **game-api**: list,
 * distance scans, history, rollback, and single-voxel writes. Exposed as
 * `client.voxels`.
 *
 * A "voxel edit" is one row of the `voxel_updates` log (a {@link Voxel}): the
 * app / chunk / local position that changed, the new voxel type, an optional
 * base64 state blob, and who/when. A background maintenance job later folds these
 * edits into the chunk's packed grid (see {@link ChunksAPI}). For high-frequency
 * realtime edits prefer the UDP path (`client.udp.sendVoxelUpdate(...)`); use
 * this API for authoritative reads, audit history, and administrative rollback.
 *
 * Coordinate & encoding conventions:
 * - **Chunk coordinates** are int64 **decimal strings**; **voxel positions**
 *   (`location`) are signed 16-bit ints, `0-15` per axis for in-bounds voxels.
 * - `appId` / `userId` are `BigInt` sent and received as decimal strings.
 * - Voxel `state` blobs are **base64-encoded** binary.
 *
 * Every method requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`); an app-scoped token may only
 * touch its own app, otherwise {@link CrowdyGraphQLError} is thrown
 * (`UNAUTHENTICATED` / `FORBIDDEN`). {@link VoxelsAPI.update} additionally
 * requires the `update_voxel_data` runtime permission and
 * {@link VoxelsAPI.rollback} the `manage_apps` permission
 * (`SCOPE_MISSING` / `FORBIDDEN`).
 */
export class VoxelsAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * List recorded voxel edits for a single chunk, newest first (optionally only
   * those at/after a timestamp). Read-only.
   *
   * @param input - {@link ListVoxelsInput}: `appId`, chunk `coordinates`, and an
   *   optional inclusive `since` lower time bound (only edits with
   *   `createdAt >= since`).
   * @returns The matching {@link Voxel} edits, newest first (each `state` blob
   *   base64-encoded).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN`.
   */
  async list(
    input: ListVoxelsQueryVariables['input']
  ): Promise<ListVoxelsQuery['listVoxels']> {
    const data = await this.gql.request(ListVoxelsDocument, { input });
    return data.listVoxels;
  }

  /**
   * List recorded voxel edits for all chunks within a cubic (Chebyshev) radius of
   * a center chunk, grouped per chunk and ordered by increasing distance,
   * paginated over chunks. Read-only.
   *
   * @param input - {@link ListVoxelUpdatesByDistanceInput}: `appId`,
   *   `centerCoordinate`, `maxDistance` (in chunk units, integer `1-8`), optional
   *   `limit` (max **chunks**, not voxels — default 1000) / `skip` (default 0),
   *   and an optional `since` lower time bound.
   * @returns A {@link VoxelUpdatesByDistanceResponse}: per-chunk groups of voxel
   *   edits ordered by increasing distance from `centerCoordinate`, plus an echo
   *   of the applied `limit`/`skip`.
   * @throws {CrowdyGraphQLError} `BAD_USER_INPUT` (e.g. `maxDistance` outside
   *   `1-8`), `UNAUTHENTICATED`, or `FORBIDDEN`.
   */
  async listByDistance(
    input: ListVoxelUpdatesByDistanceQueryVariables['input']
  ): Promise<ListVoxelUpdatesByDistanceQuery['listVoxelUpdatesByDistance']> {
    const data = await this.gql.request(ListVoxelUpdatesByDistanceDocument, { input });
    return data.listVoxelUpdatesByDistance;
  }

  /**
   * Record (upsert) a single voxel edit in the `voxel_updates` log for one chunk.
   * **Writes world state**; a background job later folds the edit into the
   * chunk's packed grid. Requires voxel-edit permission for the target region:
   * active app access plus the `update_voxel_data` runtime permission (and, where
   * grids cover the chunk, `update_voxel_data` on a covering grid).
   *
   * @param input - {@link UpdateVoxelInput}: `appId`, chunk `coordinates`, the
   *   local voxel `location` (`0-15` per axis), the `voxelType` to write
   *   (`0-255`), and an optional base64 `state` blob.
   * @returns The resulting {@link Voxel}.
   * @throws {CrowdyGraphQLError} `SCOPE_MISSING` / `FORBIDDEN` (missing
   *   `update_voxel_data`), `BAD_USER_INPUT`, or `UNAUTHENTICATED`.
   */
  async update(
    input: UpdateVoxelMutationVariables['input']
  ): Promise<UpdateVoxelMutation['updateVoxel']> {
    const data = await this.gql.request(UpdateVoxelDocument, { input });
    return data.updateVoxel;
  }

  /**
   * Read entries from the immutable voxel edit history (`voxel_updates_history`)
   * for an app, newest first, optionally filtered by user id and a changed-at
   * time window. Read-only.
   *
   * @param args - Query variables:
   *   - `appId` — app whose history to read (`BigInt` decimal string).
   *   - `userId` — optional filter: only edits made by this user (decimal string).
   *   - `from` / `to` — optional inclusive changed-at time window (ISO-8601).
   *   - `limit` — **deprecated** max entries (default 500, range `1-50000`).
   *   - `offset` — **deprecated** entries to skip (default 0, range `0-1000000`).
   * @returns The matching {@link VoxelUpdateHistoryEvent} entries, newest first.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN`.
   * @remarks The `limit`/`offset` arguments use deprecated offset pagination.
   *   For large histories prefer the Relay-style `voxelUpdateHistoryConnection(first:,
   *   after:)` query (available on the schema via `client.graphql`) — page with
   *   `first` plus the previous page's `after` cursor. See
   *   https://docs.crowdedkingdoms.com/overview/pagination.
   */
  async history(
    args: VoxelUpdateHistoryQueryVariables
  ): Promise<VoxelUpdateHistoryQuery['voxelUpdateHistory']> {
    const data = await this.gql.request(VoxelUpdateHistoryDocument, args);
    return data.voxelUpdateHistory;
  }

  /**
   * Relay-style cursor pagination over the immutable voxel edit history — the
   * preferred alternative to {@link history} for large histories. Page with
   * `first` plus the previous page's `pageInfo.endCursor` as `after`; the
   * `appId` is required and `userId`/`from`/`to` filters are optional. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param args - `appId` plus optional `userId`/`from`/`to` filters and
   *   `first`/`after` cursor paging.
   * @returns A {@link VoxelUpdateHistoryConnection} (`edges { cursor node }`,
   *   `pageInfo`, `totalCount`).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN`.
   */
  async historyConnection(
    args: VoxelUpdateHistoryConnectionQueryVariables
  ): Promise<VoxelUpdateHistoryConnectionQuery['voxelUpdateHistoryConnection']> {
    const data = await this.gql.request(
      VoxelUpdateHistoryConnectionDocument,
      args,
    );
    return data.voxelUpdateHistoryConnection;
  }

  /**
   * Revert every voxel edit made by `userId` in `appId` between `from` and `to`,
   * returning one result per affected voxel. **Defaults to a dry run**
   * (`dryRun: true`) that only PREVIEWS the planned reversions without writing;
   * pass `dryRun: false` to actually apply them (**destructive** — mutates world
   * state). Privileged: requires the `manage_apps` permission on the org that
   * owns `appId` (super admins bypass). Requires game-api ≥ v0.10.3.
   *
   * Pass `idempotencyKey` to make retries safe: replaying with the same key and
   * identical input returns the first result instead of re-applying, while the
   * same key with **different** input throws {@link CrowdyGraphQLError} with
   * `code === 'IDEMPOTENCY_CONFLICT'`. Keys expire server-side after 24h. Unlike
   * {@link ActorsAPI.delete}, the key is a **field on the input object**
   * ({@link RollbackVoxelUpdatesInput}), not a separate argument.
   *
   * @param input - {@link RollbackVoxelUpdatesInput}: `appId`, `userId` (decimal
   *   strings), the inclusive `from`/`to` window, `dryRun` (default `true`), and
   *   an optional `idempotencyKey`.
   * @returns One {@link RollbackVoxelEventResult} per affected voxel; each
   *   `applied` flag is `true` only when actually written (always `false` in a
   *   dry run).
   * @throws {CrowdyGraphQLError} `IDEMPOTENCY_CONFLICT`, `SCOPE_MISSING` /
   *   `FORBIDDEN` (missing `manage_apps`), `BAD_USER_INPUT`, or
   *   `UNAUTHENTICATED`.
   */
  async rollback(
    input: RollbackVoxelUpdatesMutationVariables['input']
  ): Promise<RollbackVoxelUpdatesMutation['rollbackVoxelUpdates']> {
    const data = await this.gql.request(RollbackVoxelUpdatesDocument, { input });
    return data.rollbackVoxelUpdates;
  }
}
