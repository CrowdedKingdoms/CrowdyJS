/**
 * Messaging stores — typed inboxes over the three message-shaped realtime
 * surfaces: channel messages ({@link ChannelInbox}), direct actor-to-actor
 * messages ({@link ActorInbox}), and app-defined client/server events
 * ({@link EventRouter}). Each keeps a queryable history and dispatches typed
 * callbacks, replacing the per-app chat rings and payload plumbing.
 */

import type { ChunkCoordinatesInput } from '../generated/graphql.js';
import { generateCrowdyUuid } from '../utils.js';
import { textCodec, type StateCodec } from './codec.js';
import type { WorldSessionContext } from './session.js';

/** A decoded message in a {@link ChannelInbox} or {@link ActorInbox}. */
export interface InboxMessage<T> {
  /** The channel id (channel messages) or the notification uuid (actor messages). */
  channelId?: string;
  /**
   * The uuid on the wire. For channel messages this is the SENDER's actor
   * uuid; for single-actor messages the payload is opaque to the server, so
   * apps conventionally embed the sender identity in the payload itself.
   */
  uuid: string;
  /** The decoded payload. */
  payload: T;
  epochMillis: number;
  receivedAt: number;
}

// ---------------------------------------------------------------------------
// ChannelInbox
// ---------------------------------------------------------------------------

/** Options for {@link attachChannelInbox}. */
export interface ChannelInboxConfig<T = string> {
  /** Codec for message payloads. Defaults to UTF-8 text. */
  codec?: StateCodec<T>;
  /** Messages kept per channel (oldest dropped). Defaults to 100. */
  capacity?: number;
  /**
   * The sender uuid stamped on outbound messages. Wired from the session's
   * local actor automatically; a random uuid otherwise.
   */
  senderUuid?: string | (() => string | null);
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The SDK-managed **channel inbox**: every `channelMessage` notification is
 * decoded and appended to a per-channel history ring (chronological, capped),
 * with typed send + subscribe. This is the inbound channel fan-out most
 * games never get around to writing.
 */
export class ChannelInbox<T = string> {
  private readonly byChannel = new Map<string, Array<InboxMessage<T>>>();
  private readonly listeners = new Set<{
    channelId?: string;
    handler: (message: InboxMessage<T>) => void;
  }>();
  private readonly codec: StateCodec<T>;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly fallbackUuid = generateCrowdyUuid();
  private decodeFailureCount = 0;
  private sequence = 0;

  constructor(
    private readonly ctx: WorldSessionContext,
    private readonly config: ChannelInboxConfig<T> = {},
  ) {
    this.codec = config.codec ?? (textCodec as unknown as StateCodec<T>);
    this.capacity = Math.max(1, config.capacity ?? 100);
    this.now = config.now ?? Date.now;

    ctx.onDispose(
      ctx.on('channelMessage', (notification) => {
        let payload: T;
        try {
          payload = this.codec.decode(notification.payload);
        } catch {
          this.decodeFailureCount += 1;
          return;
        }
        const message: InboxMessage<T> = {
          channelId: String(notification.channelId),
          uuid: notification.uuid,
          payload,
          epochMillis: Number(notification.epochMillis),
          receivedAt: this.now(),
        };
        const ring = this.ring(String(notification.channelId));
        ring.push(message);
        if (ring.length > this.capacity) ring.splice(0, ring.length - this.capacity);
        for (const entry of [...this.listeners]) {
          if (entry.channelId === undefined || entry.channelId === message.channelId) {
            entry.handler(message);
          }
        }
      }),
    );
  }

  /** One channel's history, oldest first (capped at `capacity`). */
  messages(channelId: string): Array<InboxMessage<T>> {
    return [...(this.byChannel.get(String(channelId)) ?? [])];
  }

  /** Channel ids with recorded history. */
  channels(): string[] {
    return [...this.byChannel.keys()];
  }

  /** Payloads that failed to decode (foreign encodings). */
  get decodeFailures(): number {
    return this.decodeFailureCount;
  }

  /**
   * Subscribe to incoming messages — every channel, or one `channelId`.
   * @returns off.
   */
  onMessage(
    handler: (message: InboxMessage<T>) => void,
    channelId?: string,
  ): () => void {
    const entry = {
      channelId: channelId !== undefined ? String(channelId) : undefined,
      handler,
    };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  /**
   * Send a typed payload to a channel (requires membership with
   * `send_messages`; delivery is app-wide, not chunk-routed).
   */
  async send(channelId: string, payload: T): Promise<boolean> {
    const sequenceNumber = this.nextSequence();
    this.ctx.trackSend({
      kind: 'channelMessage',
      sequenceNumber,
      sentAt: this.now(),
      uuid: this.senderUuid(),
      detail: { channelId: String(channelId) },
    });
    return this.ctx.client.udp.sendChannelMessage({
      channelId,
      uuid: this.senderUuid(),
      payload: this.codec.encode(payload),
      sequenceNumber,
    });
  }

  /** Drop history (one channel, or all). */
  clear(channelId?: string): void {
    if (channelId !== undefined) this.byChannel.delete(String(channelId));
    else this.byChannel.clear();
  }

  private ring(channelId: string): Array<InboxMessage<T>> {
    let ring = this.byChannel.get(channelId);
    if (!ring) {
      ring = [];
      this.byChannel.set(channelId, ring);
    }
    return ring;
  }

  private senderUuid(): string {
    const configured =
      typeof this.config.senderUuid === 'function'
        ? this.config.senderUuid()
        : this.config.senderUuid;
    return configured ?? this.fallbackUuid;
  }

  private nextSequence(): number {
    this.sequence = (this.sequence + 1) % 256;
    return this.sequence;
  }
}

/** Attach a {@link ChannelInbox}. Prefer the `channelInbox` config key. */
export function attachChannelInbox<T = string>(
  ctx: WorldSessionContext,
  config: ChannelInboxConfig<T> = {},
): ChannelInbox<T> {
  return new ChannelInbox(ctx, config);
}

// ---------------------------------------------------------------------------
// ActorInbox
// ---------------------------------------------------------------------------

/** Options for {@link attachActorInbox}. */
export interface ActorInboxConfig<T = string> {
  /** Codec for message payloads. Defaults to UTF-8 text. */
  codec?: StateCodec<T>;
  /** Messages kept (oldest dropped). Defaults to 100. */
  capacity?: number;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The SDK-managed **direct-message inbox**: `singleActorMessage`
 * notifications decoded into a capped history with typed subscribe, plus a
 * typed `send` (the sender must know the target's current chunk — pair with
 * a {@link RemoteActorStore}, whose records carry it).
 */
export class ActorInbox<T = string> {
  private readonly history: Array<InboxMessage<T>> = [];
  private readonly listeners = new Set<(message: InboxMessage<T>) => void>();
  private readonly codec: StateCodec<T>;
  private readonly capacity: number;
  private readonly now: () => number;
  private decodeFailureCount = 0;
  private sequence = 0;

  constructor(
    private readonly ctx: WorldSessionContext,
    config: ActorInboxConfig<T> = {},
  ) {
    this.codec = config.codec ?? (textCodec as unknown as StateCodec<T>);
    this.capacity = Math.max(1, config.capacity ?? 100);
    this.now = config.now ?? Date.now;

    ctx.onDispose(
      ctx.on('singleActorMessage', (notification) => {
        let payload: T;
        try {
          payload = this.codec.decode(notification.payload);
        } catch {
          this.decodeFailureCount += 1;
          return;
        }
        const message: InboxMessage<T> = {
          uuid: notification.uuid,
          payload,
          epochMillis: Number(notification.epochMillis),
          receivedAt: this.now(),
        };
        this.history.push(message);
        if (this.history.length > this.capacity) {
          this.history.splice(0, this.history.length - this.capacity);
        }
        for (const listener of [...this.listeners]) listener(message);
      }),
    );
  }

  /** Received messages, oldest first (capped at `capacity`). */
  messages(): Array<InboxMessage<T>> {
    return [...this.history];
  }

  /** Payloads that failed to decode. */
  get decodeFailures(): number {
    return this.decodeFailureCount;
  }

  /** Subscribe to incoming direct messages. @returns off. */
  onMessage(listener: (message: InboxMessage<T>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Send a typed payload to one actor (identified by uuid + its current
   * chunk). Fire-and-forget: `true` means accepted for sending.
   */
  async send(
    targetUuid: string,
    payload: T,
    targetChunk: ChunkCoordinatesInput,
  ): Promise<boolean> {
    const sequenceNumber = this.nextSequence();
    this.ctx.trackSend({
      kind: 'singleActorMessage',
      sequenceNumber,
      sentAt: this.now(),
      detail: { targetUuid },
    });
    return this.ctx.client.udp.sendSingleActorMessage({
      appId: this.ctx.appId,
      chunk: targetChunk,
      targetUuid,
      payload: this.codec.encode(payload),
      sequenceNumber,
    });
  }

  /** Drop the history. */
  clear(): void {
    this.history.length = 0;
  }

  private nextSequence(): number {
    this.sequence = (this.sequence + 1) % 256;
    return this.sequence;
  }
}

/** Attach an {@link ActorInbox}. Prefer the `actorInbox` config key. */
export function attachActorInbox<T = string>(
  ctx: WorldSessionContext,
  config: ActorInboxConfig<T> = {},
): ActorInbox<T> {
  return new ActorInbox(ctx, config);
}

// ---------------------------------------------------------------------------
// EventRouter
// ---------------------------------------------------------------------------

/** A decoded client/server event delivered by the {@link EventRouter}. */
export interface TypedEvent<T> {
  eventType: number;
  /** Whether another client or the server (model notification) emitted it. */
  origin: 'client' | 'server';
  /** The emitting actor/source uuid. */
  uuid: string;
  value: T;
  chunk: ChunkCoordinatesInput;
  epochMillis: number;
  receivedAt: number;
}

/** Options for {@link attachEventRouter}. */
export interface EventRouterConfig {
  /**
   * The sender uuid stamped on outbound events. Wired from the session's
   * local actor automatically; a random uuid otherwise.
   */
  senderUuid?: string | (() => string | null);
  /** Replication radius for outbound events (0-8). */
  distance?: number;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface EventRegistration {
  codec: StateCodec<unknown>;
  handler: (event: TypedEvent<unknown>) => void;
}

/**
 * The SDK-managed **event router**: register a codec + handler per
 * app-defined `eventType` (uint16) and receive typed client AND server
 * events; the latest decoded event per type stays queryable via
 * {@link lastEvent}. Send typed events with {@link send}.
 */
export class EventRouter {
  private readonly registrations = new Map<number, Set<EventRegistration>>();
  private readonly lastByType = new Map<number, TypedEvent<unknown>>();
  private readonly now: () => number;
  private readonly fallbackUuid = generateCrowdyUuid();
  private decodeFailureCount = 0;
  private sequence = 0;

  constructor(
    private readonly ctx: WorldSessionContext,
    private readonly config: EventRouterConfig = {},
  ) {
    this.now = config.now ?? Date.now;

    const dispatch = (origin: 'client' | 'server') =>
      (notification: {
        eventType: number;
        state: string;
        uuid: string;
        chunkX: string;
        chunkY: string;
        chunkZ: string;
        epochMillis: unknown;
      }) => {
        const set = this.registrations.get(notification.eventType);
        if (!set || set.size === 0) return;
        for (const registration of [...set]) {
          let value: unknown;
          try {
            value = registration.codec.decode(notification.state);
          } catch {
            this.decodeFailureCount += 1;
            continue;
          }
          const event: TypedEvent<unknown> = {
            eventType: notification.eventType,
            origin,
            uuid: notification.uuid,
            value,
            chunk: {
              x: notification.chunkX,
              y: notification.chunkY,
              z: notification.chunkZ,
            },
            epochMillis: Number(notification.epochMillis),
            receivedAt: this.now(),
          };
          this.lastByType.set(notification.eventType, event);
          registration.handler(event);
        }
      };

    ctx.onDispose(ctx.on('clientEvent', dispatch('client')));
    ctx.onDispose(ctx.on('serverEvent', dispatch('server')));
  }

  /**
   * Register a typed handler for one `eventType`. Multiple handlers (even
   * with different codecs) may coexist per type.
   * @returns off.
   */
  on<T>(
    eventType: number,
    codec: StateCodec<T>,
    handler: (event: TypedEvent<T>) => void,
  ): () => void {
    let set = this.registrations.get(eventType);
    if (!set) {
      set = new Set();
      this.registrations.set(eventType, set);
    }
    const registration = {
      codec: codec as StateCodec<unknown>,
      handler: handler as (event: TypedEvent<unknown>) => void,
    };
    set.add(registration);
    return () => set.delete(registration);
  }

  /** The latest decoded event of one type (undefined before the first). */
  lastEvent<T = unknown>(eventType: number): TypedEvent<T> | undefined {
    return this.lastByType.get(eventType) as TypedEvent<T> | undefined;
  }

  /** Events whose registered codec failed to decode. */
  get decodeFailures(): number {
    return this.decodeFailureCount;
  }

  /**
   * Send a typed app-defined event to a chunk (fanned out to nearby actors
   * as a `ClientEventNotification`).
   */
  async send<T>(
    eventType: number,
    codec: StateCodec<T>,
    value: T,
    chunk: ChunkCoordinatesInput,
  ): Promise<boolean> {
    const sequenceNumber = this.nextSequence();
    this.ctx.trackSend({
      kind: 'clientEvent',
      sequenceNumber,
      sentAt: this.now(),
      uuid: this.senderUuid(),
      detail: { eventType },
    });
    return this.ctx.client.udp.sendClientEvent({
      appId: this.ctx.appId,
      chunk,
      uuid: this.senderUuid(),
      eventType,
      state: codec.encode(value),
      sequenceNumber,
      ...(this.config.distance !== undefined ? { distance: this.config.distance } : {}),
    });
  }

  private senderUuid(): string {
    const configured =
      typeof this.config.senderUuid === 'function'
        ? this.config.senderUuid()
        : this.config.senderUuid;
    return configured ?? this.fallbackUuid;
  }

  private nextSequence(): number {
    this.sequence = (this.sequence + 1) % 256;
    return this.sequence;
  }
}

/** Attach an {@link EventRouter}. Prefer the `events` config key. */
export function attachEventRouter(
  ctx: WorldSessionContext,
  config: EventRouterConfig = {},
): EventRouter {
  return new EventRouter(ctx, config);
}
