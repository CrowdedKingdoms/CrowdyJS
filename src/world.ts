import type { UdpAPI } from './domains/udp.js';
import type {
  ActorUpdateRequestInput,
  ChunkCoordinatesInput,
  ClientEventNotificationInput,
  ClientTextPacketInput,
  Scalars,
  VoxelUpdateRequestInput,
} from './generated/graphql.js';
import type { SpatialNotification, UdpNotificationHandlers } from './realtime.js';
import { generateCrowdyUuid, validateChunkCoordinates, validateCrowdyUuid } from './utils.js';

/**
 * Options for {@link WorldClient.actor}. All fields are optional.
 */
export interface ActorOptions {
  /**
   * The actor's id: exactly 32 ASCII characters (the UDP-wire id), **not** a
   * hyphenated RFC-4122 UUID. Omit to mint a fresh one with
   * {@link generateCrowdyUuid}. Validated when the {@link ActorClient} is
   * created.
   */
  uuid?: string;
  /**
   * Default chunk replication radius (in chunk units, 0-8) applied to
   * {@link ActorClient.sendState} when the call doesn't override `distance`.
   */
  defaultDistance?: number;
  /**
   * Default replication decay algorithm (0 none, 1 exponential, 2 linear 50%,
   * 3 linear 25%, 4 linear 10%, 5 linear 5%) applied to
   * {@link ActorClient.sendState} when the call doesn't override `decayRate`.
   */
  defaultDecayRate?: number;
}

/**
 * Ergonomic, **app-scoped** realtime facade returned by `client.world(appId)`.
 * Wraps {@link UdpAPI}, passing `appId` for you on every spatial send and
 * subscription so you never repeat it — the recommended entry point for game
 * loops; the lower-level `client.udp` remains available. Requires the same
 * authenticated bearer game token as `client.udp`.
 */
export class WorldClient {
  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly udp: UdpAPI,
  ) {}

  /**
   * Create an {@link ActorClient} bound to this app. The actor tracks its
   * current chunk after {@link ActorClient.join} (so later sends don't repeat
   * the chunk) and allocates `sequenceNumber`s for its `...AndWait` calls.
   *
   * @param options - {@link ActorOptions}. If `uuid` is omitted a fresh
   *   32-character id is generated; `defaultDistance` / `defaultDecayRate`
   *   become this actor's per-call defaults for {@link ActorClient.sendState}.
   * @returns A new {@link ActorClient}.
   * @throws {CrowdyProtocolError} if a supplied `uuid` is not exactly 32 bytes
   *   when UTF-8 encoded.
   */
  actor(options: ActorOptions = {}): ActorClient {
    return new ActorClient(this.appId, this.udp, {
      uuid: options.uuid ?? generateCrowdyUuid(),
      defaultDistance: options.defaultDistance,
      defaultDecayRate: options.defaultDecayRate,
    });
  }

  /**
   * Open an app-scoped subscription, passing this world's `appId` to
   * {@link UdpAPI.subscribe} for you. The first subscriber opens the shared
   * WebSocket; the last to unsubscribe closes it.
   *
   * @param handlers - {@link UdpNotificationHandlers} (see {@link UdpAPI.subscribe}).
   * @returns An unsubscribe function that detaches these handlers (and closes
   *   the shared WebSocket if it was the last subscription).
   * @throws {CrowdyRealtimeError} `code === 'AUTH_REQUIRED'` if there is no
   *   session token.
   */
  subscribe(handlers: UdpNotificationHandlers): () => void {
    return this.udp.subscribe(handlers, String(this.appId));
  }
}

/**
 * A single actor (player / NPC) in one app's realtime world, created via
 * `client.world(appId).actor(...)`. Holds a stable 32-character {@link uuid}
 * and remembers the actor's current chunk after {@link join}, so the spatial
 * helpers ({@link sendState}, {@link sendVoxelUpdate}, {@link sendText},
 * {@link sendEvent}) don't need the chunk repeated. Those helpers use the UDP
 * `...AndWait` path and resolve with the correlated echo/notification, so they
 * require an active subscription (e.g. {@link WorldClient.subscribe}).
 */
export class ActorClient {
  /**
   * This actor's id: exactly 32 ASCII characters (the UDP-wire id), **not** an
   * RFC-4122 UUID. Set at construction and validated.
   */
  readonly uuid: string;
  private chunk: ChunkCoordinatesInput | null = null;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly udp: UdpAPI,
    private readonly options: Required<Pick<ActorOptions, 'uuid'>> &
      Pick<ActorOptions, 'defaultDistance' | 'defaultDecayRate'>,
  ) {
    validateCrowdyUuid(options.uuid);
    this.uuid = options.uuid;
  }

  /**
   * Enter a chunk: records it as this actor's current chunk and sends an
   * initial actor update to register presence there. Resolves with the server's
   * applied echo — your own `ActorUpdateNotification` (the sender is included in
   * the chunk fan-out), correlated by `sequenceNumber`.
   *
   * The **first** spatial message to a brand-new chunk may be dropped
   * server-side while grid permissions load, so if this rejects with a timeout,
   * simply call `join` again (the two-client tests register twice).
   *
   * @param chunk - The chunk to enter, `{ x, y, z }` with each axis a signed
   *   int64 decimal string. A chunk is a 16x16x16 voxel cube.
   * @param state - Initial actor state blob, base64-encoded. Defaults to `'AA=='`
   *   (a single zero byte), i.e. registration-only.
   * @returns The correlated {@link SpatialNotification} (your own
   *   `ActorUpdateNotification` self-echo).
   * @throws {CrowdyProtocolError} if `chunk` is outside signed int64 range.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} if no echo arrives within the timeout
   *   (`code === 'UDP_SEQUENCE_TIMEOUT'`) or the server returns a matching
   *   `GenericErrorResponse`.
   */
  async join(
    chunk: ChunkCoordinatesInput,
    state = 'AA==',
  ): Promise<SpatialNotification> {
    this.chunk = chunk;
    return this.sendState(state, { chunk });
  }

  /**
   * Send a state update for this actor to its current chunk (set by
   * {@link join}) or to `options.chunk` if provided. Uses the UDP `...AndWait`
   * path and resolves with the applied echo — your own `ActorUpdateNotification`
   * (the sender is included in the chunk fan-out). `appId` and `uuid` are filled
   * in for you.
   *
   * @param state - Actor state blob, base64-encoded (may be `''` for a
   *   registration-only update).
   * @param options - Optional overrides:
   *   - `chunk` — `{ x, y, z }` (signed int64 decimal strings) to send to
   *     instead of the tracked chunk.
   *   - `distance` — replication radius in chunk units, 0-8; defaults to the
   *     actor's `defaultDistance`.
   *   - `decayRate` — decay algorithm 0-5; defaults to the actor's
   *     `defaultDecayRate`.
   * @returns The correlated {@link SpatialNotification} (your own
   *   `ActorUpdateNotification` self-echo).
   * @throws {Error} `'Actor must join a chunk before sending state'` if no chunk
   *   has been joined and none is supplied.
   * @throws {CrowdyProtocolError} if the resolved chunk is outside int64 range.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on echo timeout
   *   (`code === 'UDP_SEQUENCE_TIMEOUT'`) or a matching `GenericErrorResponse`.
   */
  async sendState(
    state: string,
    options: Partial<Pick<ActorUpdateRequestInput, 'chunk' | 'distance' | 'decayRate'>> = {},
  ): Promise<SpatialNotification> {
    const chunk = options.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending state');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendActorUpdateAndWait({
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      state,
      distance: options.distance ?? this.options.defaultDistance,
      decayRate: options.decayRate ?? this.options.defaultDecayRate,
    });
  }

  /**
   * Send a voxel (block) update from this actor to its current chunk (or
   * `input.chunk`). Uses the UDP `...AndWait` path and resolves with the applied
   * echo — your own `VoxelUpdateNotification` (the sender is included in the
   * chunk fan-out). `appId`, `uuid`, and `chunk` are filled in for you.
   *
   * @param input - Voxel fields minus `appId`/`uuid`/`chunk`:
   *   - `voxel` — `{ x, y, z }` voxel coordinates within the chunk, each an
   *     int16 (-32768 to 32767).
   *   - `voxelType` — the new voxel type id.
   *   - `voxelState` — voxel state blob, base64-encoded.
   *   - `distance` — replication radius in chunk units, 0-8; defaults to 8.
   *   - `decayRate` — decay algorithm 0-5; defaults to 0 (none).
   *   - `sequenceNumber` — optional uint8 (0-255) correlation id.
   *   - `chunk` — optional `{ x, y, z }` (signed int64 decimal strings) to
   *     override the tracked chunk.
   * @returns The correlated {@link SpatialNotification} (your own
   *   `VoxelUpdateNotification` self-echo).
   * @throws {Error} `'Actor must join a chunk before sending voxel updates'` if
   *   no chunk has been joined and none is supplied.
   * @throws {CrowdyProtocolError} if the resolved chunk is outside int64 range.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on echo timeout
   *   (`code === 'UDP_SEQUENCE_TIMEOUT'`) or a matching `GenericErrorResponse`.
   */
  async sendVoxelUpdate(
    input: Omit<VoxelUpdateRequestInput, 'appId' | 'uuid' | 'chunk'> & {
      chunk?: ChunkCoordinatesInput;
    },
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending voxel updates');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendVoxelUpdateAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
    });
  }

  /**
   * Send a spatial text/chat packet from this actor to its current chunk (or
   * `input.chunk`), fanned out to nearby actors as a `ClientTextNotification`.
   *
   * Uses the UDP `...AndWait` path, but the server does **not** echo text back
   * to the sender, so on success there is typically no notification to resolve
   * and this will reject with a timeout — use it to surface send errors, or
   * prefer `client.udp.sendTextPacket(...)` for plain fire-and-forget. `appId`,
   * `uuid`, and `chunk` are filled in for you.
   *
   * @param text - Message content, UTF-8 (plain text, not base64).
   * @param input - Optional extra fields: `distance` (chunk units, 0-8, default
   *   8), `decayRate` (0-5, default 0), `sequenceNumber` (uint8), and `chunk` to
   *   override the tracked chunk.
   * @returns The correlated {@link SpatialNotification}, if one is delivered.
   * @throws {Error} `'Actor must join a chunk before sending text'` if no chunk
   *   has been joined and none is supplied.
   * @throws {CrowdyProtocolError} if the resolved chunk is outside int64 range.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on timeout (`code === 'UDP_SEQUENCE_TIMEOUT'`)
   *   or a matching `GenericErrorResponse`.
   */
  async sendText(
    text: string,
    input: Partial<Omit<ClientTextPacketInput, 'appId' | 'uuid' | 'text' | 'chunk'>> & {
      chunk?: ChunkCoordinatesInput;
    } = {},
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending text');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendTextPacketAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      text,
    });
  }

  /**
   * Send a custom, app-defined client event from this actor to its current
   * chunk (or `input.chunk`); nearby actors receive a `ClientEventNotification`.
   *
   * Uses the UDP `...AndWait` path, but the server does **not** echo events back
   * to the sender, so on success there is typically no notification to resolve
   * and this will reject with a timeout — use it to surface send errors, or
   * prefer `client.udp.sendClientEvent(...)` for plain fire-and-forget. `appId`,
   * `uuid`, and `chunk` are filled in for you.
   *
   * @param eventType - App-defined event id, a uint16 (0-65535).
   * @param state - Event state blob, base64-encoded; format defined by the event
   *   type.
   * @param input - Optional extra fields: `distance` (chunk units, 0-8, default
   *   8), `decayRate` (0-5, default 0), `sequenceNumber` (uint8), and `chunk` to
   *   override the tracked chunk.
   * @returns The correlated {@link SpatialNotification}, if one is delivered.
   * @throws {Error} `'Actor must join a chunk before sending events'` if no
   *   chunk has been joined and none is supplied.
   * @throws {CrowdyProtocolError} if the resolved chunk is outside int64 range.
   * @throws {CrowdyGraphQLError} if the underlying send is rejected.
   * @throws {CrowdyTimeoutError} if the HTTP send leg times out.
   * @throws {CrowdyRealtimeError} on timeout (`code === 'UDP_SEQUENCE_TIMEOUT'`)
   *   or a matching `GenericErrorResponse`.
   */
  async sendEvent(
    eventType: number,
    state: string,
    input: Partial<Omit<ClientEventNotificationInput, 'appId' | 'uuid' | 'eventType' | 'state' | 'chunk'>> & {
      chunk?: ChunkCoordinatesInput;
    } = {},
  ): Promise<SpatialNotification> {
    const chunk = input.chunk ?? this.chunk;
    if (!chunk) {
      throw new Error('Actor must join a chunk before sending events');
    }
    validateChunkCoordinates(chunk);
    return this.udp.sendClientEventAndWait({
      ...input,
      appId: this.appId,
      chunk,
      uuid: this.uuid,
      eventType,
      state,
    });
  }

  /**
   * Send a direct message to a single other actor, identified by its UUID and
   * the chunk it currently occupies (the sender must know the target's chunk).
   * Only that one actor receives it. Fire-and-forget: there is no echo to the
   * sender, so this resolves to the send acknowledgement, not a notification.
   *
   * @param targetUuid - The destination actor's id: exactly 32 ASCII characters
   *   (not RFC-4122).
   * @param payload - Message body, base64-encoded; opaque to the server.
   * @param targetChunk - The destination actor's current `{ x, y, z }` chunk
   *   (each axis a signed int64 decimal string).
   * @param options - `sequenceNumber`: optional uint8 (0-255) correlation id
   *   (used only to correlate a `GenericErrorResponse`).
   * @returns `true` when the datagram was accepted for sending — **not**
   *   confirmation of delivery.
   * @throws {CrowdyProtocolError} if `targetUuid` is not exactly 32 bytes, or
   *   `targetChunk` is outside signed int64 range.
   * @throws {CrowdyGraphQLError} on auth/validation failures.
   */
  async sendToActor(
    targetUuid: string,
    payload: string,
    targetChunk: ChunkCoordinatesInput,
    options: { sequenceNumber?: number } = {},
  ): Promise<boolean> {
    validateCrowdyUuid(targetUuid);
    validateChunkCoordinates(targetChunk);
    return this.udp.sendSingleActorMessage({
      appId: this.appId,
      chunk: targetChunk,
      targetUuid,
      payload,
      sequenceNumber: options.sequenceNumber,
    });
  }
}
