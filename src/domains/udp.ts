import type { GraphQLClient } from '../client.js';
import type {
  SubscriptionManager,
  UdpNotificationHandlers,
} from '../subscriptions.js';

import {
  ConnectUdpProxyDocument,
  type ConnectUdpProxyMutation,
  DisconnectUdpProxyDocument,
  UdpProxyConnectionStatusDocument,
  type UdpProxyConnectionStatusQuery,
  SendActorUpdateDocument,
  type SendActorUpdateMutationVariables,
  SendVoxelUpdateDocument,
  type SendVoxelUpdateMutationVariables,
  SendAudioPacketDocument,
  type SendAudioPacketMutationVariables,
  SendTextPacketDocument,
  type SendTextPacketMutationVariables,
  SendClientEventDocument,
  type SendClientEventMutationVariables,
  SendSingleActorMessageDocument,
  type SendSingleActorMessageMutationVariables,
  SendChannelMessageDocument,
  type SendChannelMessageMutationVariables,
} from '../generated/graphql.js';
import type { SpatialNotification } from '../realtime.js';
import { SequenceAllocator } from '../utils.js';

/**
 * UDP proxy access for browser-style clients that can't open raw UDP sockets.
 * Exposed as `client.udp`; for game loops prefer the ergonomic, app-scoped
 * facade `client.world(appId)`, which passes `appId` for you and tracks the
 * current chunk so you don't repeat it on every send.
 *
 * All send mutations go over the **game-api** GraphQL HTTP endpoint and are
 * forwarded to the assigned game server by the API's UDP proxy module;
 * notifications come back over a single shared `graphql-transport-ws`
 * WebSocket (same game-api endpoint) managed by `SubscriptionManager` — the
 * first subscriber opens it and the last to unsubscribe closes it. Every call
 * requires an authenticated session carrying a **bearer game token** (minted
 * by the management-api, set via `client.auth.login()` or `client.setToken()`);
 * a UDP proxy session is opened lazily on the first send or subscribe if you
 * didn't call {@link connect} first.
 *
 * Each packet type comes in two shapes:
 * - Plain `send*` — fire-and-forget. Resolves to a `boolean` ack that the proxy
 *   *accepted the datagram for sending*; it does **not** confirm the world
 *   applied it or that it was delivered.
 * - `send*AndWait` — allocates a `sequenceNumber`, then resolves with the
 *   server's matching echo (a {@link SpatialNotification}) correlated by that
 *   sequence, or rejects on timeout. Only actor and voxel updates are echoed
 *   back to the sender (`ActorUpdateResponse` / `VoxelUpdateResponse`); audio,
 *   text, and event sends are not.
 *
 * Spatial caveats: a `sequenceNumber` is a uint8 (0-255) used for
 * **correlation only** — not an idempotency key, and the server does not dedupe
 * replays. The **first** spatial message to a brand-new chunk may be dropped
 * server-side while grid permissions load, so clients should re-send (the
 * two-client tests register twice for this reason). To receive any
 * `...AndWait` echo or notification you must have an active {@link subscribe}.
 */
export class UdpAPI {
  private readonly sequences = new SequenceAllocator();

  constructor(
    private gql: GraphQLClient,
    private subs: SubscriptionManager,
  ) {}

  /**
   * Open (or re-fetch) the UDP proxy session for this game token. Idempotent:
   * if a session is already open it returns the existing status; on first open
   * it binds a socket and selects the game server with the fewest clients.
   * Calling this is optional — any `send*` mutation or {@link subscribe} opens a
   * session lazily — but use it to pre-warm the socket or surface auth/
   * connectivity problems eagerly. To force a fresh socket, call
   * {@link disconnect} first.
   *
   * @returns The {@link UdpProxyConnectionStatus}: `connected`, plus (when
   *   connected) `serverIp6`, `serverClientPort`, and `lastMessageTime`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` if the request carries no
   *   valid bearer game token.
   */
  async connect(): Promise<ConnectUdpProxyMutation['connectUdpProxy']> {
    const data = await this.gql.request(ConnectUdpProxyDocument, undefined);
    return data.connectUdpProxy;
  }

  /**
   * Close the UDP proxy session and socket for this game token. Note that
   * unsubscribing from notifications does **not** disconnect — call this (or
   * rely on the server's inactivity timeout) to release the session, e.g. to
   * force a fresh socket on the next {@link connect} or send.
   *
   * @returns `true` once the session has been closed.
   * @throws {CrowdyGraphQLError} on auth failures.
   */
  async disconnect(): Promise<boolean> {
    const data = await this.gql.request(DisconnectUdpProxyDocument, undefined);
    return data.disconnectUdpProxy;
  }

  /**
   * Read the current UDP proxy session status **without** opening one. With no
   * game token it simply reports `connected: false` rather than throwing.
   * Inspect `lastMessageTime` to gauge connection health.
   *
   * @returns The {@link UdpProxyConnectionStatus} (`connected`, plus when
   *   connected `serverIp6`, `serverClientPort`, and `lastMessageTime`).
   */
  async connectionStatus(): Promise<
    UdpProxyConnectionStatusQuery['udpProxyConnectionStatus']
  > {
    const data = await this.gql.request(
      UdpProxyConnectionStatusDocument,
      undefined,
    );
    return data.udpProxyConnectionStatus;
  }

  /**
   * Send an actor (player/NPC) state update for spatial replication to nearby
   * chunks. Fire-and-forget; opens a UDP proxy session automatically if none
   * exists. The applied echo (`ActorUpdateResponse`) and any failure
   * (`GenericErrorResponse`) arrive asynchronously on {@link subscribe},
   * correlated by `sequenceNumber`; use {@link sendActorUpdateAndWait} to await
   * that echo inline.
   *
   * @param input - {@link ActorUpdateRequestInput}:
   *   - `appId` — owning app id (`BigInt` as a decimal string).
   *   - `chunk` — `{ x, y, z }` chunk address; each axis is a signed int64
   *     decimal string. A chunk is a 16x16x16 voxel cube.
   *   - `uuid` — the actor id: exactly 32 ASCII characters (the UDP-wire id),
   *     **not** an RFC-4122 UUID.
   *   - `state` — actor state blob, base64-encoded; may be `''` for a
   *     registration-only update.
   *   - `distance` — replication radius in chunk units, 0-8 (clamped); defaults
   *     to 8 for actor updates.
   *   - `decayRate` — replication decay algorithm: 0 none, 1 exponential,
   *     2 linear 50%, 3 linear 25%, 4 linear 10%, 5 linear 5%; defaults to 1
   *     (exponential) for actor updates.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id; not an
   *     idempotency key.
   * @returns `true` when the datagram was accepted for sending to the game
   *   server — **not** confirmation that the world applied it.
   * @throws {CrowdyGraphQLError} e.g. `UNAUTHENTICATED` without a valid game
   *   token, or `BAD_USER_INPUT` for a malformed packet.
   */
  async sendActorUpdate(
    input: SendActorUpdateMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendActorUpdateDocument, { input });
    return data.sendActorUpdate;
  }

  /**
   * Send an actor update and wait for the server's applied echo. Allocates a
   * `sequenceNumber` when `input.sequenceNumber` is omitted, registers the wait
   * *before* sending, then resolves with the matching `ActorUpdateResponse`.
   * Requires an active {@link subscribe} so the echo can be delivered over the
   * shared WebSocket.
   *
   * @param input - {@link ActorUpdateRequestInput} (see {@link sendActorUpdate}
   *   for field units/encoding). Omit `sequenceNumber` to let the SDK allocate
   *   one.
   * @param options - `timeoutMs`: how long to wait for the echo, in
   *   milliseconds; defaults to the client's realtime `waitTimeoutMs` (5000).
   * @returns The correlated {@link SpatialNotification} (the `ActorUpdateResponse`
   *   echo).
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg exceeds the client's
   *   request timeout.
   * @throws {CrowdyRealtimeError} if no echo arrives within `timeoutMs`
   *   (`code === 'UDP_SEQUENCE_TIMEOUT'`, retryable), or the server returns a
   *   matching `GenericErrorResponse` (its `code` is the server's `errorCode`).
   * @example
   * ```ts
   * const unsubscribe = client.udp.subscribe({}, appId); // echoes need an open WS
   * const echo = await client.udp.sendActorUpdateAndWait({
   *   appId,
   *   chunk: { x: '0', y: '0', z: '0' },
   *   uuid,
   *   state: 'AA==',
   *   distance: 8,
   * });
   * console.log(echo.__typename, echo.sequenceNumber);
   * ```
   */
  async sendActorUpdateAndWait(
    input: SendActorUpdateMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendActorUpdate(request);
    return wait;
  }

  /**
   * Send a single voxel (block) update for spatial replication to nearby
   * chunks. Fire-and-forget; opens a UDP proxy session automatically. The
   * applied echo (`VoxelUpdateResponse`) and failures (`GenericErrorResponse`)
   * arrive asynchronously on {@link subscribe}; use
   * {@link sendVoxelUpdateAndWait} to await the echo inline.
   *
   * @param input - {@link VoxelUpdateRequestInput}:
   *   - `appId` — owning app id (`BigInt` as a decimal string).
   *   - `chunk` — `{ x, y, z }` chunk address (signed int64 decimal strings); a
   *     chunk is a 16x16x16 voxel cube.
   *   - `uuid` — 32-ASCII-character actor/source id (not RFC-4122).
   *   - `voxel` — `{ x, y, z }` voxel coordinates within the chunk; each is an
   *     int16 (-32768 to 32767).
   *   - `voxelType` — the new voxel type id.
   *   - `voxelState` — voxel state blob, base64-encoded.
   *   - `distance` — replication radius in chunk units, 0-8 (clamped); defaults
   *     to 8 for voxel updates.
   *   - `decayRate` — decay algorithm 0-5 (see {@link sendActorUpdate});
   *     defaults to 0 (none) for voxel updates.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   * @returns `true` when accepted for sending — **not** confirmation the world
   *   applied the change.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendVoxelUpdate(
    input: SendVoxelUpdateMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendVoxelUpdateDocument, { input });
    return data.sendVoxelUpdate;
  }

  /**
   * Send a voxel update and wait for the server's applied `VoxelUpdateResponse`
   * echo. Allocates a `sequenceNumber` when omitted and requires an active
   * {@link subscribe}.
   *
   * @param input - {@link VoxelUpdateRequestInput} (see {@link sendVoxelUpdate}
   *   for field units/encoding).
   * @param options - `timeoutMs`: echo wait in milliseconds; defaults to the
   *   client's realtime `waitTimeoutMs` (5000).
   * @returns The correlated {@link SpatialNotification} (`VoxelUpdateResponse`).
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on echo timeout
   *   (`code === 'UDP_SEQUENCE_TIMEOUT'`) or a matching `GenericErrorResponse`
   *   (its `code` is the server's `errorCode`).
   */
  async sendVoxelUpdateAndWait(
    input: SendVoxelUpdateMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendVoxelUpdate(request);
    return wait;
  }

  /**
   * Send a spatial voice/audio packet, fanned out to nearby actors as a
   * `ClientAudioNotification`. Fire-and-forget; opens a UDP proxy session
   * automatically. Voice may be gated by a runtime grid permission
   * (`use_voice_chat`) for the region — if the caller lacks it the game server
   * replies asynchronously with a `GenericErrorResponse` (`errorCode`
   * `UNAUTHORIZED`) on {@link subscribe}. The sender receives no success echo.
   *
   * @param input - {@link ClientAudioPacketInput}:
   *   - `appId` — owning app id (`BigInt` as a decimal string).
   *   - `chunk` — `{ x, y, z }` chunk address (signed int64 decimal strings).
   *   - `uuid` — 32-ASCII-character source id (typically the player; not
   *     RFC-4122).
   *   - `audioData` — compressed audio, base64-encoded.
   *   - `distance` — replication radius in chunk units, 0-8 (clamped); defaults
   *     to 1 for audio packets.
   *   - `decayRate` — decay algorithm 0-5 (see {@link sendActorUpdate});
   *     defaults to 0 (none) for audio packets.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   * @returns `true` when accepted for sending — **not** confirmation of
   *   delivery.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendAudioPacket(
    input: SendAudioPacketMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendAudioPacketDocument, { input });
    return data.sendAudioPacket;
  }

  /**
   * Send a voice/audio packet and wait for a response correlated by
   * `sequenceNumber`. **Note:** the server does not echo audio packets back to
   * the sender (only `GenericErrorResponse` failures are correlated), so on
   * success there is usually nothing to resolve and this rejects on timeout —
   * prefer the fire-and-forget {@link sendAudioPacket} unless you specifically
   * want to surface a send error inline. Requires an active {@link subscribe}.
   *
   * @param input - {@link ClientAudioPacketInput} (see {@link sendAudioPacket}).
   * @param options - `timeoutMs`: wait in milliseconds; defaults to the client's
   *   realtime `waitTimeoutMs` (5000).
   * @returns The correlated {@link SpatialNotification}, if one is delivered.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on timeout (`code === 'UDP_SEQUENCE_TIMEOUT'`)
   *   or a matching `GenericErrorResponse` (its `code` is the server's
   *   `errorCode`, e.g. `UNAUTHORIZED` for a missing voice permission).
   */
  async sendAudioPacketAndWait(
    input: SendAudioPacketMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendAudioPacket(request);
    return wait;
  }

  /**
   * Send a spatial text/chat packet, fanned out to nearby actors as a
   * `ClientTextNotification`. Fire-and-forget; opens a UDP proxy session
   * automatically. The sender receives no success echo; failures arrive
   * asynchronously as `GenericErrorResponse` on {@link subscribe}.
   *
   * @param input - {@link ClientTextPacketInput}:
   *   - `appId` — owning app id (`BigInt` as a decimal string).
   *   - `chunk` — `{ x, y, z }` chunk address (signed int64 decimal strings).
   *   - `uuid` — 32-ASCII-character source id (not RFC-4122).
   *   - `text` — message content, UTF-8 (sent as plain text, not base64).
   *   - `distance` — replication radius in chunk units, 0-8 (clamped); defaults
   *     to 8 for text packets.
   *   - `decayRate` — decay algorithm 0-5 (see {@link sendActorUpdate});
   *     defaults to 0 (none) for text packets.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   * @returns `true` when accepted for sending — **not** confirmation of
   *   delivery.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendTextPacket(
    input: SendTextPacketMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendTextPacketDocument, { input });
    return data.sendTextPacket;
  }

  /**
   * Send a text/chat packet and wait for a response correlated by
   * `sequenceNumber`. **Note:** the server does not echo text packets back to
   * the sender (only `GenericErrorResponse` failures are correlated), so on
   * success there is usually nothing to resolve and this rejects on timeout —
   * prefer the fire-and-forget {@link sendTextPacket} unless you specifically
   * want to surface a send error inline. Requires an active {@link subscribe}.
   *
   * @param input - {@link ClientTextPacketInput} (see {@link sendTextPacket}).
   * @param options - `timeoutMs`: wait in milliseconds; defaults to the client's
   *   realtime `waitTimeoutMs` (5000).
   * @returns The correlated {@link SpatialNotification}, if one is delivered.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on timeout (`code === 'UDP_SEQUENCE_TIMEOUT'`)
   *   or a matching `GenericErrorResponse` (its `code` is the server's
   *   `errorCode`).
   */
  async sendTextPacketAndWait(
    input: SendTextPacketMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendTextPacket(request);
    return wait;
  }

  /**
   * Send a custom, app-defined client event for spatial replication to nearby
   * chunks; nearby actors receive it as a `ClientEventNotification`.
   * Fire-and-forget; opens a UDP proxy session automatically. The sender
   * receives no success echo; failures arrive asynchronously as
   * `GenericErrorResponse` on {@link subscribe}.
   *
   * @param input - {@link ClientEventNotificationInput}:
   *   - `appId` — owning app id (`BigInt` as a decimal string).
   *   - `chunk` — `{ x, y, z }` chunk address (signed int64 decimal strings).
   *   - `uuid` — 32-ASCII-character id of the object controlling the event
   *     (not RFC-4122).
   *   - `eventType` — app-defined event id, a uint16 (0-65535).
   *   - `state` — event state blob, base64-encoded; format defined by the event
   *     type.
   *   - `distance` — replication radius in chunk units, 0-8 (clamped); defaults
   *     to 8 for events.
   *   - `decayRate` — decay algorithm 0-5 (see {@link sendActorUpdate});
   *     defaults to 0 (none) for events.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   * @returns `true` when accepted for sending — **not** confirmation the world
   *   processed it.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendClientEvent(
    input: SendClientEventMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendClientEventDocument, { input });
    return data.sendClientEvent;
  }

  /**
   * Send a client event and wait for a response correlated by `sequenceNumber`.
   * **Note:** the server does not echo events back to the sender (only
   * `GenericErrorResponse` failures are correlated), so on success there is
   * usually nothing to resolve and this rejects on timeout — prefer the
   * fire-and-forget {@link sendClientEvent} unless you specifically want to
   * surface a send error inline. Requires an active {@link subscribe}.
   *
   * @param input - {@link ClientEventNotificationInput} (see
   *   {@link sendClientEvent}).
   * @param options - `timeoutMs`: wait in milliseconds; defaults to the client's
   *   realtime `waitTimeoutMs` (5000).
   * @returns The correlated {@link SpatialNotification}, if one is delivered.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on timeout (`code === 'UDP_SEQUENCE_TIMEOUT'`)
   *   or a matching `GenericErrorResponse` (its `code` is the server's
   *   `errorCode`).
   */
  async sendClientEventAndWait(
    input: SendClientEventMutationVariables['input'],
    options: { timeoutMs?: number } = {},
  ): Promise<SpatialNotification> {
    const request = this.withSequence(input);
    const wait = this.subs.waitForSequence(request.sequenceNumber, options.timeoutMs);
    await this.sendClientEvent(request);
    return wait;
  }

  /**
   * Send a direct actor-to-actor message, delivered only to the actor whose
   * UUID matches `input.targetUuid` (the sender must know that actor's chunk).
   * Fire-and-forget: the sender receives no echo, so there is no
   * `sendSingleActorMessageAndWait` variant. The target receives a
   * `SingleActorMessageNotification` on its `udpNotifications` subscription.
   *
   * @param input - {@link SingleActorMessageInput}:
   *   - `appId` — the destination actor's app id (`BigInt` as a decimal string).
   *   - `chunk` — the **destination** actor's current `{ x, y, z }` chunk
   *     (signed int64 decimal strings); the sender must know it.
   *   - `targetUuid` — the destination actor's id: exactly 32 ASCII characters
   *     (not RFC-4122).
   *   - `payload` — message body, base64-encoded; opaque to the server (embed
   *     the sender identity yourself if needed).
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id (used only to
   *     correlate a `GenericErrorResponse`).
   * @returns `true` when accepted for sending — **not** confirmation of
   *   delivery.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendSingleActorMessage(
    input: SendSingleActorMessageMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendSingleActorMessageDocument, {
      input,
    });
    return data.sendSingleActorMessage;
  }

  /**
   * Publish a message to a channel. Delivered to every active member of the
   * channel (regardless of location) as a `ChannelMessageNotification` on their
   * `udpNotifications` subscription. Requires the channel `send_messages`
   * permission; the server drops the message otherwise. Fire-and-forget: the
   * sender receives no echo.
   *
   * @param input - {@link ChannelMessageInput}:
   *   - `channelId` — the channel id (`groups.group_id`) as a `BigInt` decimal
   *     string.
   *   - `uuid` — the sender's own actor id: exactly 32 ASCII characters (not
   *     RFC-4122).
   *   - `payload` — message body, base64-encoded; opaque to the server, max
   *     1024 bytes.
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   * @returns `true` when accepted for sending — **not** confirmation of
   *   delivery; note that a message dropped for a missing `send_messages`
   *   permission still returns `true`.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendChannelMessage(
    input: SendChannelMessageMutationVariables['input'],
  ): Promise<boolean> {
    const data = await this.gql.request(SendChannelMessageDocument, { input });
    return data.sendChannelMessage;
  }

  /**
   * Subscribe to udpNotifications for a single app. Pass any combination of
   * typename handlers; the returned function detaches all of them. The first
   * subscriber opens the shared WebSocket; the last one to leave closes it.
   *
   * `appId` is required and scopes the subscription to one app: the game-api
   * only delivers that app's spatial notifications and rejects app-agnostic
   * subscriptions (a single game token reused across apps would otherwise
   * cross-deliver). Use a separate client per app (sharing the token store).
   *
   * A missing `appId` is rejected by the game-api with a `RealtimeConnectionEvent`
   * (`code === 'APP_ID_REQUIRED'`) delivered to your `connectionEvent` handler,
   * after which the stream ends. Subscribing without a session token throws
   * synchronously instead.
   *
   * @param handlers - {@link UdpNotificationHandlers}: optional per-typename
   *   callbacks (`actorUpdate`, `voxelUpdate`, `audio`, `text`, `clientEvent`,
   *   `singleActorMessage`, `channelMessage`, `genericError`, `connectionEvent`,
   *   etc.) plus `any` (every notification) and `error` (a
   *   {@link CrowdyRealtimeError}).
   * @param appId - The app to scope delivery to (`BigInt` as a decimal string).
   *   Required.
   * @returns An unsubscribe function that detaches these handlers (and closes
   *   the shared WebSocket if it was the last subscription).
   * @throws {CrowdyRealtimeError} `code === 'AUTH_REQUIRED'` if called with no
   *   session token. Server-side connection problems (e.g. `APP_ID_REQUIRED`,
   *   `UDP_PROXY_CONNECTION_FAILED`) are delivered to the `connectionEvent` /
   *   `error` handlers rather than thrown.
   * @example
   * ```ts
   * const unsubscribe = client.udp.subscribe({
   *   actorUpdate: (n) => console.log('actor', n.uuid, n.sequenceNumber),
   *   genericError: (e) => console.warn('udp error', e.errorCode),
   * }, appId);
   * // later…
   * unsubscribe();
   * ```
   */
  subscribe(handlers: UdpNotificationHandlers, appId: string): () => void {
    return this.subs.subscribe(handlers, appId);
  }

  private withSequence<T extends { sequenceNumber?: number | null }>(
    input: T,
  ): T & { sequenceNumber: number } {
    return {
      ...input,
      sequenceNumber: input.sequenceNumber ?? this.sequences.next(),
    };
  }
}
