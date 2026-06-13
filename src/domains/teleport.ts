import type { GraphQLClient } from '../client.js';

import {
  TeleportRequestDocument,
  type TeleportRequestMutation,
  type TeleportRequestMutationVariables,
} from '../generated/graphql.js';

/**
 * Teleport authorization checks on the **game-api**. Exposed as
 * `client.teleport`.
 *
 * This domain only *authorizes* a teleport — it does **not** move the actor. A
 * successful response means the caller is allowed to teleport the actor to the
 * destination; the UDP runtime performs the actual movement. `appId` is a
 * `BigInt` decimal string and the actor `uuid` is exactly **32 ASCII
 * characters** (the UDP-wire actor id), **not** a hyphenated RFC-4122 UUID.
 *
 * Requires an authenticated session (a Bearer game token set via
 * `client.auth.login()` or `client.setToken()`) plus the app-level `teleport`
 * runtime permission. A missing/invalid token throws {@link CrowdyGraphQLError}
 * (`UNAUTHENTICATED`); authorization outcomes are otherwise reported in-band on
 * the response (`success` / `errorCode`) rather than thrown.
 */
export class TeleportAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Check whether the authenticated user may teleport an actor to a destination
   * within an app. Authorization only — it does **not** move the actor (the UDP
   * runtime does that).
   *
   * @param input - {@link TeleportRequestInput}: `appId` (decimal string, must be
   *   `> 0`), the destination `chunkAddress` (int64 decimal strings; the reserved
   *   sentinel `(-6, -6, -6)` is rejected) and `voxelAddress` (signed 16-bit
   *   ints), and the actor `uuid` (exactly 32 ASCII characters).
   * @returns A {@link TeleportResponse}: `success` plus an `errorCode`
   *   ({@link UdpErrorCode}) — `NO_ERROR` when allowed, `INVALID_APP_ID` for a
   *   non-positive `appId`, or `UNAUTHORIZED` for the sentinel destination or a
   *   missing `teleport` permission.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if no valid game token is
   *   present. Authorization failures are reported via `success: false` +
   *   `errorCode`, not thrown.
   */
  async request(
    input: TeleportRequestMutationVariables['input']
  ): Promise<TeleportRequestMutation['teleportRequest']> {
    const data = await this.gql.request(TeleportRequestDocument, { input });
    return data.teleportRequest;
  }
}
