/**
 * Actor stores — the SDK-managed bookkeeping every multiplayer game
 * otherwise hand-writes: your own actor's identity, typed state, and send
 * loop ({@link LocalActorStore}), created via {@link attachLocalActor} on a
 * world session.
 */

import type { ChunkCoordinatesInput } from '../generated/graphql.js';
import type { UdpNotificationHandlers } from '../realtime.js';
import { SequenceAllocator, generateCrowdyUuid, validateCrowdyUuid } from '../utils.js';
import type { StateCodec } from './codec.js';
import type { WorldSessionContext } from './session.js';

/** The notification type delivered for actor updates (incl. your own echo). */
export type ActorUpdateEcho = Parameters<
  NonNullable<UdpNotificationHandlers['actorUpdate']>
>[0];

/** The error notification type. */
export type GenericErrorEcho = Parameters<
  NonNullable<UdpNotificationHandlers['genericError']>
>[0];

// ---------------------------------------------------------------------------
// Uuid persistence
// ---------------------------------------------------------------------------

/** Where the local actor's 32-char uuid lives across page loads. */
export interface UuidStore {
  load(): string | null;
  save(uuid: string): void;
}

/** Keep the uuid for this tab session only (a fresh actor per reload). */
export function memoryUuidStore(): UuidStore {
  let value: string | null = null;
  return {
    load: () => value,
    save: (uuid) => {
      value = uuid;
    },
  };
}

/**
 * Persist the uuid in `localStorage` so the player keeps a stable actor
 * identity across reloads (the convention games converge on). Falls back to
 * {@link memoryUuidStore} behavior outside the browser.
 */
export function localStorageUuidStore(key = 'crowdyjs:actor-uuid'): UuidStore {
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (!storage) return memoryUuidStore();
  return {
    load: () => {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    save: (uuid) => {
      try {
        storage.setItem(key, uuid);
      } catch {
        // Quota/permission failures degrade to per-session identity.
      }
    },
  };
}

// ---------------------------------------------------------------------------
// LocalActorStore
// ---------------------------------------------------------------------------

/** Why a send happened — recorded on {@link SentActorUpdate}. */
export type SendReason =
  | 'join'
  | 'move'
  | 'interval'
  | 'keyframe'
  | 'manual'
  | 'visibility'
  | 'refresh';

/** The record of the most recent outbound actor update. */
export interface SentActorUpdate<T> {
  /** The typed state that was sent. */
  state: T;
  /** The encoded (base64) wire form. */
  encoded: string;
  chunk: ChunkCoordinatesInput;
  sequenceNumber: number;
  sentAt: number;
  reason: SendReason;
}

/** The record of the most recent server-applied echo of our own update. */
export interface AckedActorUpdate<T> {
  /** The typed state decoded from the echo. */
  state: T;
  /** The raw self-echo notification. */
  notification: ActorUpdateEcho;
  receivedAt: number;
}

/** The record of the most recent send error attributed to this actor. */
export interface ActorSendError {
  errorCode: string;
  sequenceNumber: number;
  receivedAt: number;
}

/** Lifecycle of the local actor's replication. */
export type LocalActorStatus = 'idle' | 'pending' | 'acked' | 'error';

/** Options for {@link attachLocalActor}. */
export interface LocalActorConfig<T> {
  /** Codec between your typed replication state and the base64 wire form. */
  codec: StateCodec<T>;
  /** The state sent until {@link LocalActorStore.setState} changes it. */
  initialState: T;
  /** Explicit 32-char uuid (wins over `uuidStore`). */
  uuid?: string;
  /**
   * Where the minted uuid persists. Defaults to {@link memoryUuidStore};
   * pass {@link localStorageUuidStore} for a stable identity across reloads.
   */
  uuidStore?: UuidStore;
  /**
   * Send-loop cadence in ms. Defaults to **200 (5 Hz)** — the proven
   * cadence for player presence. Set `0` or `false` to disable the loop and
   * drive {@link LocalActorStore.sendNow} yourself. Runs on the session
   * {@link Ticker}: pass `workerTicker()` to `createWorldSession` to hold
   * the rate in backgrounded tabs.
   */
  sendIntervalMs?: number | false;
  /**
   * Skip loop sends whose encoded state is byte-identical to the last send.
   * Defaults to true. Explicit sends (`sendNow`, `join`, `moveTo`) always go
   * out.
   */
  sendOnChange?: boolean;
  /**
   * With `sendOnChange`, still force a keyframe send after this many ms of
   * dedup silence so presence never starves. Defaults to 3000.
   */
  keyframeEveryMs?: number;
  /** Default replication radius in chunk units (0-8). */
  distance?: number;
  /** Default replication decay algorithm (0-5). */
  decayRate?: number;
  /**
   * Re-send presence when the browser tab becomes visible again (timers may
   * have been throttled while hidden). Defaults to true in browsers.
   */
  refreshOnVisibility?: boolean;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The SDK-managed **local actor**: identity (minted + persisted uuid), typed
 * replication state, current chunk, an automatic 5 Hz send loop with
 * send-on-change dedup, and queryable send bookkeeping — {@link lastSent},
 * {@link lastAck} (the server-applied self-echo), {@link lastError}, and
 * {@link status}. Replaces the hand-written codec + sender + uuid plumbing
 * every game rebuilds.
 *
 * Reads are synchronous; all record updates happen on WebSocket events, so
 * the render loop can query freely regardless of tab visibility.
 */
export class LocalActorStore<T> {
  /** This actor's 32-char wire id. */
  readonly uuid: string;

  private currentState: T;
  private currentChunk: ChunkCoordinatesInput | null = null;
  private lastSentRecord: SentActorUpdate<T> | null = null;
  private lastAckRecord: AckedActorUpdate<T> | null = null;
  private lastErrorRecord: ActorSendError | null = null;
  private readonly inFlight = new Map<number, number>(); // seq → sentAt
  private readonly sequences = new SequenceAllocator();
  private readonly now: () => number;

  constructor(
    private readonly ctx: WorldSessionContext,
    private readonly config: LocalActorConfig<T>,
  ) {
    this.now = config.now ?? Date.now;
    this.currentState = config.initialState;

    // Identity: explicit uuid > persisted uuid > freshly minted (persisted).
    const uuidStore = config.uuidStore ?? memoryUuidStore();
    let uuid = config.uuid ?? uuidStore.load();
    if (!uuid) {
      uuid = generateCrowdyUuid();
    }
    validateCrowdyUuid(uuid);
    uuidStore.save(uuid);
    this.uuid = uuid;

    // Self-echo: the server includes the sender in the chunk fan-out, so our
    // own applied update arrives as an actorUpdate with our uuid.
    ctx.onDispose(
      ctx.on('actorUpdate', (notification) => {
        if (notification.uuid !== this.uuid) return;
        let state: T;
        try {
          state = this.config.codec.decode(notification.state);
        } catch {
          return; // Not our layout (shouldn't happen for our own echo).
        }
        this.lastAckRecord = { state, notification, receivedAt: this.now() };
        this.inFlight.delete(notification.sequenceNumber);
      }),
    );

    // Attribute send errors to our in-flight sequence numbers.
    ctx.onDispose(
      ctx.on('genericError', (notification) => {
        if (!this.inFlight.has(notification.sequenceNumber)) return;
        this.inFlight.delete(notification.sequenceNumber);
        this.lastErrorRecord = {
          errorCode: String(notification.errorCode),
          sequenceNumber: notification.sequenceNumber,
          receivedAt: this.now(),
        };
      }),
    );

    // The send loop (5 Hz default) on the shared session ticker.
    const interval = config.sendIntervalMs ?? 200;
    if (interval !== false && interval > 0) {
      ctx.onDispose(ctx.ticker.every(interval, () => this.tick()));
    }

    // Tab-return re-registration.
    const doc = (globalThis as { document?: Document }).document;
    if ((config.refreshOnVisibility ?? true) && doc?.addEventListener) {
      const onVisibility = () => {
        if (doc.visibilityState === 'visible') void this.refresh('visibility');
      };
      doc.addEventListener('visibilitychange', onVisibility);
      ctx.onDispose(() => doc.removeEventListener('visibilitychange', onVisibility));
    }
  }

  /** The current typed replication state (what the loop sends). */
  get state(): T {
    return this.currentState;
  }

  /** The actor's current chunk (null before {@link join}). */
  get chunk(): ChunkCoordinatesInput | null {
    return this.currentChunk;
  }

  /** The most recent outbound update (typed + encoded + seq + timestamp). */
  get lastSent(): SentActorUpdate<T> | null {
    return this.lastSentRecord;
  }

  /** The most recent server-applied self-echo. */
  get lastAck(): AckedActorUpdate<T> | null {
    return this.lastAckRecord;
  }

  /** The most recent send error attributed to this actor. */
  get lastError(): ActorSendError | null {
    return this.lastErrorRecord;
  }

  /**
   * Replication lifecycle: `idle` (nothing sent), `pending` (sent, no echo
   * yet), `acked` (echo at or after the last send), `error` (an error
   * arrived after the last send).
   */
  get status(): LocalActorStatus {
    if (!this.lastSentRecord) return 'idle';
    if (
      this.lastErrorRecord &&
      this.lastErrorRecord.receivedAt >= this.lastSentRecord.sentAt
    ) {
      return 'error';
    }
    if (
      this.lastAckRecord &&
      this.lastAckRecord.receivedAt >= this.lastSentRecord.sentAt
    ) {
      return 'acked';
    }
    return 'pending';
  }

  /** Update the typed state; the next loop tick (or `sendNow`) sends it. */
  setState(state: T): void {
    this.currentState = state;
  }

  /** Merge a partial update into the typed state (object states only). */
  patchState(patch: Partial<T>): void {
    this.currentState = { ...this.currentState, ...patch };
  }

  /**
   * Enter a chunk: records it as the actor's current chunk and immediately
   * sends presence there. (The first message to a brand-new chunk may be
   * dropped server-side while grid permissions load — if {@link status}
   * stays `pending`, call {@link refresh}.)
   */
  async join(chunk: ChunkCoordinatesInput, state?: T): Promise<void> {
    this.currentChunk = chunk;
    if (state !== undefined) this.currentState = state;
    await this.send('join');
  }

  /** Move to another chunk and immediately send presence there. */
  async moveTo(chunk: ChunkCoordinatesInput): Promise<void> {
    this.currentChunk = chunk;
    await this.send('move');
  }

  /** Send the current state now, bypassing dedup. */
  async sendNow(): Promise<void> {
    await this.send('manual');
  }

  /** Re-register presence (reconnects, tab return, dropped first join). */
  async refresh(reason: SendReason = 'refresh'): Promise<void> {
    if (!this.currentChunk) return;
    await this.send(reason);
  }

  /** One send-loop tick: dedup unchanged state, keyframe when quiet. */
  private tick(): void {
    if (!this.currentChunk) return;
    const encoded = this.config.codec.encode(this.currentState);
    if ((this.config.sendOnChange ?? true) && this.lastSentRecord) {
      const quietFor = this.now() - this.lastSentRecord.sentAt;
      const keyframeEvery = this.config.keyframeEveryMs ?? 3000;
      if (encoded === this.lastSentRecord.encoded && quietFor < keyframeEvery) {
        return;
      }
      if (encoded === this.lastSentRecord.encoded) {
        void this.send('keyframe', encoded);
        return;
      }
    }
    void this.send('interval', encoded);
  }

  private async send(reason: SendReason, preEncoded?: string): Promise<void> {
    const chunk = this.currentChunk;
    if (!chunk) {
      throw new Error('Local actor must join a chunk before sending');
    }
    const state = this.currentState;
    const encoded = preEncoded ?? this.config.codec.encode(state);
    const sequenceNumber = this.sequences.next();
    const sentAt = this.now();

    this.lastSentRecord = { state, encoded, chunk, sequenceNumber, sentAt, reason };
    this.inFlight.set(sequenceNumber, sentAt);
    if (this.inFlight.size > 256) {
      const oldest = this.inFlight.keys().next().value;
      if (oldest !== undefined) this.inFlight.delete(oldest);
    }
    this.ctx.trackSend({
      kind: 'actorUpdate',
      sequenceNumber,
      sentAt,
      uuid: this.uuid,
      detail: { reason },
    });

    await this.ctx.client.udp.sendActorUpdate({
      appId: this.ctx.appId,
      chunk,
      uuid: this.uuid,
      state: encoded,
      sequenceNumber,
      ...(this.config.distance !== undefined ? { distance: this.config.distance } : {}),
      ...(this.config.decayRate !== undefined
        ? { decayRate: this.config.decayRate }
        : {}),
    });
  }
}

/**
 * Attach a {@link LocalActorStore} to a world session context. Prefer the
 * `self` key of `createWorldSession`'s config; use this directly for custom
 * compositions.
 */
export function attachLocalActor<T>(
  ctx: WorldSessionContext,
  config: LocalActorConfig<T>,
): LocalActorStore<T> {
  return new LocalActorStore(ctx, config);
}
