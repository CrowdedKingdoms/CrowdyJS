/**
 * Type definitions for Crowded Kingdoms SDK
 */

// BigInt is represented as string in GraphQL
/**
 * A GraphQL `BigInt` scalar as carried by the SDK: the **decimal-string**
 * representation of a 64-bit integer (e.g. `"1"`, `"9223372036854775807"`).
 * Ids and coordinates that can exceed JavaScript's safe-integer range use this
 * so they are never lossy; parse with the native `BigInt()` when you need to do
 * arithmetic.
 */
export type BigInt = string;

// Chunk coordinates
/**
 * Address of a chunk in the world grid as returned by the API. A chunk is a
 * 16×16×16 voxel cube; each axis is a signed int64 carried as a {@link BigInt}
 * decimal string.
 */
export interface ChunkCoordinates {
  /** Chunk X coordinate (signed int64 as a decimal string). */
  x: BigInt;
  /** Chunk Y coordinate (signed int64 as a decimal string). */
  y: BigInt;
  /** Chunk Z coordinate (signed int64 as a decimal string). */
  z: BigInt;
}

/**
 * Chunk address supplied as input, with each axis as a plain JavaScript
 * `number`. Values must fall within signed int64 range — use
 * {@link validateChunkCoordinates} to check before sending.
 */
export interface ChunkCoordinatesInput {
  /** Chunk X coordinate. */
  x: number;
  /** Chunk Y coordinate. */
  y: number;
  /** Chunk Z coordinate. */
  z: number;
}

// Voxel coordinates
/**
 * Position of a single voxel **within** its chunk (a 16×16×16 cube). Each axis
 * is a plain `number`; on the wire voxel coordinates are int16 (−32768…32767).
 */
export interface VoxelCoordinates {
  /** Voxel X coordinate within the chunk. */
  x: number;
  /** Voxel Y coordinate within the chunk. */
  y: number;
  /** Voxel Z coordinate within the chunk. */
  z: number;
}

/**
 * Voxel position supplied as input on a voxel update. Each axis must be in the
 * int16 range (−32768…32767).
 */
export interface VoxelCoordinatesInput {
  /** Voxel X coordinate within the chunk (int16). */
  x: number;
  /** Voxel Y coordinate within the chunk (int16). */
  y: number;
  /** Voxel Z coordinate within the chunk (int16). */
  z: number;
}

// Error codes - re-exported from the codegen-derived enum so the SDK has
// exactly one canonical UdpErrorCode shape. The hand-written enum that
// used to live here drifted from the schema (`AppNotFound` etc.); see
// generated/graphql.ts for the source of truth.
/**
 * Reason codes returned by the UDP game servers and surfaced on
 * {@link GenericErrorResponse}'s `errorCode` (re-exported from the codegen enum
 * so the SDK has exactly one canonical shape). `NoError` means success; every
 * other value is a failure. The numeric value is the byte sent on the wire;
 * the SDK exposes the name. Note that a failed message does **not** always
 * produce an error — some auth failures are dropped silently.
 *
 * Each member and the server condition it represents:
 * - `NoError` — no error (the byte `0`); the message was accepted.
 * - `UnknownError` — unspecified server error (the byte `1`); retry, and report
 *   it if it persists.
 * - `AppNotFound` — no app matches the supplied appId.
 * - `AppNotLoaded` — the app exists but isn't currently loaded/active on this
 *   server.
 * - `InvalidAppId` — the appId was missing, zero, or otherwise not valid.
 * - `ChunkNotFound` — no chunk exists at the referenced coordinates.
 * - `InvalidRequest` — the message was malformed or failed validation; check the
 *   byte layout.
 * - `InvalidStateData` — the state/payload bytes were invalid for this message
 *   type.
 * - `NameTooLong` — a supplied name exceeded the maximum length.
 * - `UserNotAuthenticated` — this client has no authenticated session on the
 *   server; complete the UDP token handshake (or open the UDP proxy) before
 *   sending spatial messages.
 * - `Unauthorized` — the caller lacks the runtime/grid permission for this
 *   action. Grid permissions can load asynchronously, so the first message into
 *   a newly entered region may transiently return this — retry shortly.
 * - `UserNotAppAdmin` — the action requires app-admin privileges (the
 *   `manage_apps` permission).
 * - `InvalidToken` — the game token was rejected (expired, malformed, or
 *   revoked); re-authenticate against the Management API for a fresh token.
 * - `InvalidTokenLength` — the supplied token was not a valid length.
 * - `GameTokenWrongSize` — the game token isn't the expected length; send the
 *   exact token returned by login (don't trim or re-encode it).
 * - `GridAlreadyExists` — a grid already exists at these coordinates.
 * - `GridOverlapsExisting` — the requested grid overlaps an existing grid.
 * - `GridOutsideAssignment` — the target coordinates fall outside any grid
 *   assigned to the caller.
 * - `InvalidGridCoordinates` — the grid coordinates were invalid.
 * - `NoMatchingGridAssignment` — no grid assignment covers the referenced
 *   coordinates.
 * - `BadPassword` — the password did not match (login validation).
 * - `EmailNotFound` — no account matches the supplied email (login validation).
 * - `EmailAlreadyExists` — registration failed because the email is already in
 *   use.
 * - `EmailInvalid` — email failed format validation.
 * - `EmailTooLong` / `EmailTooShort` — email failed maximum-/minimum-length
 *   validation.
 * - `PasswordTooLong` / `PasswordTooShort` — password failed maximum-/minimum-
 *   length validation.
 * - `GamertagAlreadyExists` — the requested gamertag is already taken.
 */
export { UdpErrorCode } from './generated/graphql.js';
import type { UdpErrorCode } from './generated/graphql.js';

// User types
/**
 * A Crowded Kingdoms user/account record. Returned by the auth/profile reads
 * (e.g. `client.users.me`). Several fields are optional because the server
 * omits them when they are unset or the caller isn't authorized to see them.
 */
export interface User {
  /** Unique user id and primary key ({@link BigInt} decimal string). */
  userId: BigInt;
  /** Account email; omitted for anonymized/soft-deleted accounts. */
  email?: string;
  /**
   * Public display name; omitted when unset or anonymized. Unique in
   * combination with {@link disambiguation}.
   */
  gamertag?: string;
  /**
   * Discriminator paired with {@link gamertag} to form a unique handle;
   * omitted when unset.
   */
  disambiguation?: string;
  /** User-level state blob, base64-encoded binary; omitted when cleared. */
  state?: string;
  /** Whether the account email has been confirmed. */
  isConfirmed: boolean;
  /** Account creation timestamp (ISO-8601 string). */
  createdAt: string;
  /**
   * Whether the user qualifies for early access through normal eligibility
   * (the free-play window/rollout).
   */
  grantEarlyAccess: boolean;
  /**
   * Admin override that forces early access on/off regardless of normal
   * eligibility.
   */
  grantEarlyAccessOverride: boolean;
  /**
   * Organization the user belongs to ({@link BigInt} decimal string); omitted
   * when the user isn't in an org.
   */
  orgId?: BigInt;
  /** External identity-provider id for federated accounts; omitted otherwise. */
  externalId?: string;
  /** Account type, e.g. `"direct"` or `"deleted"`. */
  userType: string;
}

/**
 * Result of a successful login/registration. Carries the session token to send
 * on subsequent requests plus the authenticated {@link User}.
 */
export interface AuthResponse {
  /**
   * Opaque session token. Send it on subsequent requests as the
   * `Authorization: Bearer <token>` header (the SDK does this for you once it's
   * stored).
   */
  token: string;
  /** Identifier of the underlying session (game_token) row. */
  gameTokenId: string;
  /** The authenticated user. */
  user: User;
}

// UDP Proxy Connection Status
/**
 * Status of the per-session UDP proxy connection between the game-api and a UDP
 * game server. Returned by `udpProxyConnectionStatus` / `connectUdpProxy`.
 */
export interface UdpProxyConnectionStatus {
  /** Whether the user is currently connected to a UDP game server via the proxy. */
  connected: boolean;
  /** IPv6 address of the UDP game server; present only when {@link connected}. */
  serverIp6?: string;
  /**
   * Client port of the UDP game server (what native clients connect to
   * directly); present only when {@link connected}.
   */
  serverClientPort?: number;
  /**
   * Timestamp of the last message received from the UDP server (present only
   * when {@link connected}); useful for detecting connection health.
   */
  lastMessageTime?: string;
}

// Actor Update Request
/**
 * Input for sending an actor (player/NPC) update to the UDP game server,
 * replicated to nearby clients in the target chunk.
 */
export interface ActorUpdateRequestInput {
  /** Id of the app the actor belongs to. */
  appId: number;
  /** Chunk the actor is located in (a 16×16×16 voxel cube). */
  chunk: ChunkCoordinatesInput;
  /** The actor's 32-ASCII-character id (see {@link generateCrowdyUuid}). */
  uuid: string;
  /**
   * Actor state data, base64-encoded. May be an empty string for
   * registration-only updates that carry no state payload.
   */
  state: string;
  /**
   * Chunk replication distance, `0`–`8` (clamped). Higher reaches more
   * surrounding chunks. Defaults server-side to `8` for actor updates.
   */
  distance?: number;
  /**
   * Decay algorithm controlling how replication weakens with distance:
   * `0` none, `1` exponential, `2` linear 50%, `3` linear 25%, `4` linear 10%,
   * `5` linear 5%. Defaults server-side to `1` (exponential) for actor updates.
   */
  decayRate?: number;
  /**
   * Client-assigned correlation id for this datagram: a uint8 (`0`–`255`) that
   * wraps modulo 256. **Correlation only** — not an idempotency key. Echoed on
   * the matching response and on any `GenericErrorResponse` for this send.
   */
  sequenceNumber?: number;
}

// Voxel Update Request
/**
 * Input for setting/changing a single voxel and replicating the change to
 * nearby clients.
 */
export interface VoxelUpdateRequestInput {
  /** Id of the app the voxel belongs to. */
  appId: number;
  /** Chunk containing the voxel (a 16×16×16 voxel cube). */
  chunk: ChunkCoordinatesInput;
  /** A 32-ASCII-character id for this voxel update. */
  uuid: string;
  /** The voxel's coordinates within the chunk (int16 per axis). */
  voxel: VoxelCoordinatesInput;
  /** The new voxel type id, which determines its appearance/properties. */
  voxelType: number;
  /** Voxel state data, base64-encoded. */
  voxelState: string;
  /** Chunk replication distance, `0`–`8` (clamped). Defaults to `8`. */
  distance?: number;
  /**
   * Decay algorithm (`0` none, `1` exponential, `2`–`5` linear 50/25/10/5%).
   * Defaults server-side to `0` (none) for voxel updates.
   */
  decayRate?: number;
  /**
   * Client-assigned correlation id (uint8 `0`–`255`, wraps modulo 256).
   * **Correlation only** — not an idempotency key. Echoed on the matching
   * response and on any `GenericErrorResponse` for this send.
   */
  sequenceNumber?: number;
}

// Client Audio Packet
/**
 * Input for sending a voice/audio packet, broadcast to nearby players.
 */
export interface ClientAudioPacketInput {
  /** Id of the app the audio is sent from. */
  appId: number;
  /** Chunk the audio source is located in. */
  chunk: ChunkCoordinatesInput;
  /** The audio source's 32-ASCII-character id (typically the player's). */
  uuid: string;
  /** Compressed audio data, base64-encoded. */
  audioData: string;
  /** Chunk replication distance, `0`–`8` (clamped). Defaults to `1` for audio. */
  distance?: number;
  /**
   * Decay algorithm (`0` none, `1` exponential, `2`–`5` linear 50/25/10/5%).
   * Defaults server-side to `0` (none) for audio packets.
   */
  decayRate?: number;
  /**
   * Client-assigned correlation id (uint8 `0`–`255`, wraps modulo 256).
   * **Correlation only** — not an idempotency key. Echoed on any
   * `GenericErrorResponse` for this send.
   */
  sequenceNumber?: number;
}

// Client Text Packet
/**
 * Input for sending a text/chat message, broadcast to nearby players.
 */
export interface ClientTextPacketInput {
  /** Id of the app the message is sent from. */
  appId: number;
  /** Chunk the text source is located in. */
  chunk: ChunkCoordinatesInput;
  /** The text source's 32-ASCII-character id (typically the player's). */
  uuid: string;
  /** The text message content, UTF-8 encoded; displayed to nearby players. */
  text: string;
  /** Chunk replication distance, `0`–`8` (clamped). Defaults to `8` for text. */
  distance?: number;
  /**
   * Decay algorithm (`0` none, `1` exponential, `2`–`5` linear 50/25/10/5%).
   * Defaults server-side to `0` (none) for text packets.
   */
  decayRate?: number;
  /**
   * Client-assigned correlation id (uint8 `0`–`255`, wraps modulo 256).
   * **Correlation only** — not an idempotency key. Echoed on any
   * `GenericErrorResponse` for this send.
   */
  sequenceNumber?: number;
}

// Client Event Notification
/**
 * Input for sending a custom client event — a client/mod-defined gameplay
 * signal replicated to nearby players. The `eventType` and `state` format are
 * defined by your application.
 */
export interface ClientEventNotificationInput {
  /** Id of the app where the event occurs. */
  appId: number;
  /** Chunk the event is located in. */
  chunk: ChunkCoordinatesInput;
  /** A 32-ASCII-character id for the object controlling this event. */
  uuid: string;
  /**
   * Client-defined event type id (uint16, `0`–`65535`) that determines how the
   * event is processed.
   */
  eventType: number;
  /** Event state data, base64-encoded; its format is defined by {@link eventType}. */
  state: string;
  /** Chunk replication distance, `0`–`8` (clamped). Defaults to `8` for events. */
  distance?: number;
  /**
   * Decay algorithm (`0` none, `1` exponential, `2`–`5` linear 50/25/10/5%).
   * Defaults server-side to `0` (none) for events.
   */
  decayRate?: number;
  /**
   * Client-assigned correlation id (uint8 `0`–`255`, wraps modulo 256).
   * **Correlation only** — not an idempotency key. Echoed on any
   * `GenericErrorResponse` for this send.
   */
  sequenceNumber?: number;
}

// Notification Types (from GraphQL union)
//
// All spatial types share a uniform header:
//   appId, chunkX/Y/Z, distance, decayRate, uuid, sequenceNumber, epochMillis
// Only GenericErrorResponse has a minimal 3-field format.

/**
 * Fan-out notification that another actor's position/state changed within your
 * area of interest. Delivered on the `udpNotifications` subscription.
 */
export interface ActorUpdateNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ActorUpdateNotification';
  /** Id of the app the actor is in ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the actor that was updated. */
  uuid: string;
  /**
   * Actor state data, base64-encoded. Decode it (e.g. with
   * {@link decodeBase64}) to read position, rotation, velocity, animation
   * flags, etc.
   */
  state: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Server acknowledgement echoing one of **your own** actor updates — the
 * correlation target for `sendActorUpdateAndWait`. Has no `state` payload.
 */
export interface ActorUpdateResponse {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ActorUpdateResponse';
  /** Id of the app where the update was processed ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the actor's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the actor that was updated. */
  uuid: string;
  /**
   * The `sequenceNumber` echoed from the originating `sendActorUpdate`
   * (uint8 `0`–`255`, wrapping modulo 256). Use it to correlate this response
   * with that send. Correlation only — not an idempotency key.
   */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Fan-out notification that a voxel changed within range (another client's
 * voxel edit). Delivered on the `udpNotifications` subscription.
 */
export interface VoxelUpdateNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'VoxelUpdateNotification';
  /** Id of the app the voxel is in ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id for this voxel update. */
  uuid: string;
  /** X coordinate of the voxel within its chunk (int16). */
  voxelX: number;
  /** Y coordinate of the voxel within its chunk (int16). */
  voxelY: number;
  /** Z coordinate of the voxel within its chunk (int16). */
  voxelZ: number;
  /** The voxel type id that was set. */
  voxelType: number;
  /** Voxel state data, base64-encoded. */
  voxelState: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Server acknowledgement echoing one of **your own** voxel updates — the
 * correlation target for `sendVoxelUpdateAndWait`. Has no voxel payload.
 */
export interface VoxelUpdateResponse {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'VoxelUpdateResponse';
  /** Id of the app where the update was processed ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the voxel's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id for this voxel update. */
  uuid: string;
  /**
   * The `sequenceNumber` echoed from the originating `sendVoxelUpdate`
   * (uint8 `0`–`255`, wrapping modulo 256). Use it to correlate this response
   * with that send. Correlation only — not an idempotency key.
   */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Fan-out notification carrying a nearby client's voice/audio packet.
 * Delivered on the `udpNotifications` subscription.
 */
export interface ClientAudioNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ClientAudioNotification';
  /** Id of the app the audio is from ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the audio source's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the audio source's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the audio source's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the audio source (typically the player). */
  uuid: string;
  /** Compressed audio data, base64-encoded (decode with {@link decodeBase64}). */
  audioData: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Fan-out notification carrying a nearby client's text/chat message.
 * Delivered on the `udpNotifications` subscription.
 */
export interface ClientTextNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ClientTextNotification';
  /** Id of the app the message is from ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the text source's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the text source's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the text source's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the text source (typically the player). */
  uuid: string;
  /** The text message content, UTF-8 encoded; display it to the user. */
  text: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Fan-out notification carrying a nearby client's custom event (a
 * client/mod-defined gameplay signal). Delivered on the `udpNotifications`
 * subscription.
 */
export interface ClientEventNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ClientEventNotification';
  /** Id of the app where the event occurs ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the object controlling this event. */
  uuid: string;
  /** The client-defined event type id (uint16) that determines processing. */
  eventType: number;
  /** Event state data, base64-encoded; format is defined by {@link eventType}. */
  state: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Notification carrying a server-originated spatial event broadcast to a region
 * (e.g. world or NPC events). Same shape as {@link ClientEventNotification} but
 * emitted by the server. Delivered on the `udpNotifications` subscription.
 */
export interface ServerEventNotification {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'ServerEventNotification';
  /** Id of the app where the event occurs ({@link BigInt} decimal string). */
  appId: BigInt;
  /** X coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkX: BigInt;
  /** Y coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkY: BigInt;
  /** Z coordinate of the event's chunk ({@link BigInt} int64 decimal string). */
  chunkZ: BigInt;
  /** Chunk replication distance (`0`–`8`) from the original message. */
  distance: number;
  /** Decay algorithm (`0`–`5`) from the original message. */
  decayRate: number;
  /** The 32-ASCII-character id of the object controlling this event. */
  uuid: string;
  /** The event type id (uint16) that determines processing. */
  eventType: number;
  /** Event state data, base64-encoded; format is defined by {@link eventType}. */
  state: string;
  /** The sender's sequence number for this message (`0`–`255`). */
  sequenceNumber: number;
  /** Server-generated timestamp in epoch milliseconds ({@link BigInt} string). */
  epochMillis: BigInt;
}

/**
 * Asynchronous error for a previously sent datagram (e.g. a `send*` request).
 * Delivered as a member of the {@link UdpNotification} union on the
 * subscription — **not** as a GraphQL error on the mutation. Match it to the
 * originating send via {@link sequenceNumber} and read {@link errorCode} for
 * the reason. Note: not every failure produces one — some auth failures are
 * dropped silently (see {@link UdpErrorCode}).
 */
export interface GenericErrorResponse {
  /** Discriminator for the {@link UdpNotification} union. */
  __typename: 'GenericErrorResponse';
  /**
   * Echoes the `sequenceNumber` of the request that failed (uint8 `0`–`255`,
   * wrapping modulo 256) so you can correlate this error with the `send*` that
   * produced it. Correlation only — not an idempotency key.
   */
  sequenceNumber: number;
  /** Code indicating the reason for the failure. See {@link UdpErrorCode}. */
  errorCode: UdpErrorCode;
}

// Union type for all notifications
/**
 * Discriminated union of every realtime payload a consumer can receive on the
 * subscription. Narrow it by switching on the `__typename` field. (The realtime
 * client uses the equivalent codegen-derived {@link SpatialNotification}
 * /`UdpNotification` shapes; these hand-written interfaces mirror them.)
 */
export type UdpNotification =
  | ActorUpdateNotification
  | ActorUpdateResponse
  | VoxelUpdateNotification
  | VoxelUpdateResponse
  | ClientAudioNotification
  | ClientTextNotification
  | ClientEventNotification
  | ServerEventNotification
  | GenericErrorResponse;

// Client Configuration
/**
 * Minimal endpoint/timeout configuration shape (HTTP + WebSocket endpoints and
 * a request timeout). The full client options used by the package entry point
 * live on `CrowdyClient`'s own config.
 */
export interface CrowdyClientConfig {
  /** GraphQL HTTP endpoint URL. */
  graphqlEndpoint?: string;
  /** GraphQL WebSocket endpoint URL for the subscription stream. */
  wsEndpoint?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
}

// Handler types
/** Callback for an {@link ActorUpdateNotification} (another actor moved/changed). */
export type ActorUpdateHandler = (notification: ActorUpdateNotification) => void;
/** Callback for an {@link ActorUpdateResponse} (echo of your own actor update). */
export type ActorUpdateResponseHandler = (response: ActorUpdateResponse) => void;
/** Callback for a {@link VoxelUpdateNotification} (a nearby voxel changed). */
export type VoxelUpdateHandler = (notification: VoxelUpdateNotification) => void;
/** Callback for a {@link VoxelUpdateResponse} (echo of your own voxel update). */
export type VoxelUpdateResponseHandler = (response: VoxelUpdateResponse) => void;
/** Callback for a {@link ClientAudioNotification} (nearby voice/audio packet). */
export type ClientAudioHandler = (notification: ClientAudioNotification) => void;
/** Callback for a {@link ClientTextNotification} (nearby text/chat message). */
export type ClientTextHandler = (notification: ClientTextNotification) => void;
/** Callback for a {@link ClientEventNotification} (nearby custom client event). */
export type ClientEventHandler = (notification: ClientEventNotification) => void;
/** Callback for a {@link ServerEventNotification} (server-originated spatial event). */
export type ServerEventHandler = (notification: ServerEventNotification) => void;
/** Callback for a {@link GenericErrorResponse} (async error for a prior send). */
export type GenericErrorHandler = (response: GenericErrorResponse) => void;

// Unsubscribe function
/**
 * Function returned by subscribe-style helpers; call it (no arguments) to
 * remove the listener/subscription it represents.
 */
export type UnsubscribeFn = () => void;

