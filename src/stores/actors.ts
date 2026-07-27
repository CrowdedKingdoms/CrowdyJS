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

// ---------------------------------------------------------------------------
// RemoteActorStore
// ---------------------------------------------------------------------------

/** One timestamped state sample of a remote actor (newest first in history). */
export interface RemoteActorSample<T> {
  state: T;
  chunk: ChunkCoordinatesInput;
  /** Server-stamped epoch ms of the update. */
  epochMillis: number;
  /** Local receive time (ms). */
  receivedAt: number;
}

/**
 * A tracked remote actor. The object identity is **stable** across updates
 * (fields mutate in place), so render code can hold references; check the
 * lane's `revision` for cheap change detection.
 */
export interface RemoteActor<T> {
  readonly uuid: string;
  /** The latest decoded state. */
  state: T;
  /** The chunk of the latest update. */
  chunk: ChunkCoordinatesInput;
  /** Replication radius of the latest update. */
  distance: number;
  /** Server-stamped epoch ms of the latest update. */
  epochMillis: number;
  /** Local receive time of the latest update (ms). */
  receivedAt: number;
  /**
   * Interest tier from the experiment snapshot stream (`0` near / `1` mid /
   * `2` far). Undefined for GraphQL-WS Path B updates.
   */
  interestTier?: 0 | 1 | 2;
  /**
   * Recent samples, newest first (length ≤ `historySize`) — the data an
   * interpolating renderer needs without keeping its own buffers.
   */
  samples: Array<RemoteActorSample<T>>;
}

/** Options for {@link attachRemoteActors}. */
export interface RemoteActorsConfig<T> {
  /** Codec between the base64 wire state and the typed actor state. */
  codec: StateCodec<T>;
  /**
   * The local actor's uuid (or a getter), filtered out as the self-echo.
   * `createWorldSession` wires this automatically from `config.self`.
   */
  selfUuid?: string | (() => string | null);
  /**
   * Actors quieter than this are considered gone: excluded from reads and
   * physically reaped (with `onLeave`) by the reap timer. Defaults to
   * 12 000 ms. `false` disables staleness entirely.
   */
  staleAfterMs?: number | false;
  /**
   * Experiment: per interest-tier stale timeouts (near/mid/far). Far-tier
   * snapshot poses refresh ~0.2 Hz and must not be reaped at the 12 s default.
   * Missing tiers fall back to {@link staleAfterMs}.
   */
  staleAfterByTierMs?: Partial<Record<0 | 1 | 2, number | false>>;
  /**
   * Reap-timer cadence (physically deletes stale records and fires
   * `onLeave`). Defaults to 1000 ms; `false` relies on read-time filtering +
   * manual {@link RemoteActorStore.reap} only. Reads are always correct
   * regardless — staleness is ALSO computed at read time, so a throttled
   * timer can never serve stale actors.
   */
  reapIntervalMs?: number | false;
  /** Samples kept per actor for interpolation. Defaults to 2. */
  historySize?: number;
  /**
   * Named lanes routing one decoded notification to the first matching
   * sub-registry — e.g. `{ players: (s) => !(s.flags & 2), mobs: (s) => !!(s.flags & 2) }`
   * lets a player renderer and a mob system share the stream without
   * double-decoding. Omit for a single implicit lane.
   */
  lanes?: Record<string, (state: T, notification: ActorUpdateEcho) => boolean>;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** One lane's registry of remote actors. */
export class RemoteActorLane<T> {
  private readonly actors = new Map<string, RemoteActor<T>>();
  private readonly joinListeners = new Set<(actor: RemoteActor<T>) => void>();
  private readonly updateListeners = new Set<(actor: RemoteActor<T>) => void>();
  private readonly leaveListeners = new Set<(actor: RemoteActor<T>) => void>();
  private revisionValue = 0;

  constructor(
    private readonly historySize: number,
    private readonly staleAfterMs: number | false,
    private readonly now: () => number,
    private readonly staleAfterByTierMs?: Partial<Record<0 | 1 | 2, number | false>>,
  ) {}

  /** Bumped on every change — poll it cheaply from a render loop. */
  get revision(): number {
    return this.revisionValue;
  }

  /** Live actors (stale ones filtered at read time), unordered. */
  list(): Array<RemoteActor<T>> {
    const out: Array<RemoteActor<T>> = [];
    for (const actor of this.actors.values()) {
      if (!this.isStale(actor)) out.push(actor);
    }
    return out;
  }

  /** One live actor, or undefined when unknown/stale. */
  get(uuid: string): RemoteActor<T> | undefined {
    const actor = this.actors.get(uuid);
    return actor && !this.isStale(actor) ? actor : undefined;
  }

  /** Live actor count. */
  get count(): number {
    return this.list().length;
  }

  /** A new actor appeared. @returns off. */
  onJoin(listener: (actor: RemoteActor<T>) => void): () => void {
    this.joinListeners.add(listener);
    return () => this.joinListeners.delete(listener);
  }

  /** An actor's state updated (fires after `onJoin` for the first update). @returns off. */
  onUpdate(listener: (actor: RemoteActor<T>) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  /** An actor went stale and was reaped (or the store was cleared). @returns off. */
  onLeave(listener: (actor: RemoteActor<T>) => void): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  /** Apply one decoded update (internal). */
  apply(
    uuid: string,
    state: T,
    chunk: ChunkCoordinatesInput,
    distance: number,
    epochMillis: number,
    interestTier?: 0 | 1 | 2,
  ): void {
    const receivedAt = this.now();
    let actor = this.actors.get(uuid);
    const isNew = !actor;
    if (!actor) {
      actor = {
        uuid,
        state,
        chunk,
        distance,
        epochMillis,
        receivedAt,
        samples: [],
      };
      this.actors.set(uuid, actor);
    }
    actor.state = state;
    actor.chunk = chunk;
    actor.distance = distance;
    actor.epochMillis = epochMillis;
    actor.receivedAt = receivedAt;
    if (interestTier !== undefined) {
      actor.interestTier = interestTier;
    }
    actor.samples.unshift({ state, chunk, epochMillis, receivedAt });
    if (actor.samples.length > this.historySize) {
      actor.samples.length = this.historySize;
    }
    this.revisionValue += 1;
    if (isNew) {
      for (const listener of [...this.joinListeners]) listener(actor);
    }
    for (const listener of [...this.updateListeners]) listener(actor);
  }

  /** Physically delete stale records, firing `onLeave` for each. */
  reap(): void {
    for (const [uuid, actor] of this.actors) {
      if (this.isStale(actor)) {
        this.actors.delete(uuid);
        this.revisionValue += 1;
        for (const listener of [...this.leaveListeners]) listener(actor);
      }
    }
  }

  /** Drop every record (fires `onLeave` for each live one). */
  clear(): void {
    for (const [uuid, actor] of this.actors) {
      this.actors.delete(uuid);
      this.revisionValue += 1;
      for (const listener of [...this.leaveListeners]) listener(actor);
    }
  }

  private isStale(actor: RemoteActor<T>): boolean {
    let limit = this.staleAfterMs;
    if (
      actor.interestTier !== undefined &&
      this.staleAfterByTierMs &&
      Object.prototype.hasOwnProperty.call(this.staleAfterByTierMs, actor.interestTier)
    ) {
      limit = this.staleAfterByTierMs[actor.interestTier] as number | false;
    }
    return limit !== false && this.now() - actor.receivedAt > limit;
  }
}

/**
 * The SDK-managed **remote actor registry**: subscribes to `actorUpdate`,
 * decodes each notification ONCE, filters the local self-echo, and maintains
 * per-actor records with timestamped sample history, staleness, and
 * join/update/leave events. With `lanes`, one decoded stream feeds several
 * consumers (players vs mobs) without double-decoding.
 *
 * Reads are synchronous and always live-filtered (staleness is computed at
 * read time), so render loops can query at any cadence — including after a
 * backgrounded tab resumes.
 */
export class RemoteActorStore<T> {
  private readonly lanes = new Map<string, RemoteActorLane<T>>();
  private readonly laneFilters: Array<
    [string, (state: T, notification: ActorUpdateEcho) => boolean]
  >;
  private readonly defaultLane: RemoteActorLane<T> | null;
  private decodeFailureCount = 0;

  constructor(ctx: WorldSessionContext, private readonly config: RemoteActorsConfig<T>) {
    const now = config.now ?? Date.now;
    const historySize = Math.max(1, config.historySize ?? 2);
    const staleAfterMs = config.staleAfterMs ?? 12_000;
    const staleAfterByTierMs = config.staleAfterByTierMs;

    const laneNames = config.lanes ? Object.keys(config.lanes) : ['default'];
    for (const name of laneNames) {
      this.lanes.set(
        name,
        new RemoteActorLane<T>(historySize, staleAfterMs, now, staleAfterByTierMs),
      );
    }
    this.laneFilters = config.lanes
      ? Object.entries(config.lanes)
      : [['default', () => true]];
    this.defaultLane = config.lanes ? null : this.lanes.get('default')!;

    ctx.onDispose(
      ctx.on('actorUpdate', (notification) => {
        const selfUuid =
          typeof this.config.selfUuid === 'function'
            ? this.config.selfUuid()
            : this.config.selfUuid;
        if (selfUuid && notification.uuid === selfUuid) return;

        let state: T;
        try {
          state = this.config.codec.decode(notification.state);
        } catch {
          this.decodeFailureCount += 1;
          return;
        }
        for (const [name, filter] of this.laneFilters) {
          let matches: boolean;
          try {
            matches = filter(state, notification);
          } catch {
            continue;
          }
          if (!matches) continue;
          this.lanes.get(name)!.apply(
            notification.uuid,
            state,
            {
              x: notification.chunkX,
              y: notification.chunkY,
              z: notification.chunkZ,
            },
            notification.distance,
            Number(notification.epochMillis),
          );
          break; // first matching lane wins
        }
      }),
    );

    const reapInterval = config.reapIntervalMs ?? 1000;
    if (reapInterval !== false && reapInterval > 0 && staleAfterMs !== false) {
      ctx.onDispose(ctx.ticker.every(reapInterval, () => this.reap()));
    }
  }

  /** A named lane's registry (throws for unknown names). */
  lane(name: string): RemoteActorLane<T> {
    const lane = this.lanes.get(name);
    if (!lane) {
      throw new Error(
        `Unknown actor lane '${name}' (configured: ${[...this.lanes.keys()].join(', ')})`,
      );
    }
    return lane;
  }

  /** Live actors across every lane (the default lane when none configured). */
  list(): Array<RemoteActor<T>> {
    if (this.defaultLane) return this.defaultLane.list();
    const out: Array<RemoteActor<T>> = [];
    for (const lane of this.lanes.values()) out.push(...lane.list());
    return out;
  }

  /** One live actor, searched across lanes. */
  get(uuid: string): RemoteActor<T> | undefined {
    for (const lane of this.lanes.values()) {
      const actor = lane.get(uuid);
      if (actor) return actor;
    }
    return undefined;
  }

  /** Live actor count across lanes. */
  get count(): number {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.count;
    return total;
  }

  /** Sum of lane revisions — poll it cheaply from a render loop. */
  get revision(): number {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.revision;
    return total;
  }

  /** Notifications whose state failed to decode (foreign layouts). */
  get decodeFailures(): number {
    return this.decodeFailureCount;
  }

  /**
   * Experiment: apply a decoded pose from the regional `/poses` snapshot
   * stream (bypasses GraphQL-WS). `stateBase64` is the same base64 shape as
   * `ActorUpdateNotification.state`.
   */
  ingestSnapshotPose(input: {
    uuid: string;
    stateBase64: string;
    chunkX: string | number;
    chunkY: string | number;
    chunkZ: string | number;
    interestTier?: 0 | 1 | 2;
    epochMillis?: number;
    distance?: number;
  }): void {
    const selfUuid =
      typeof this.config.selfUuid === 'function'
        ? this.config.selfUuid()
        : this.config.selfUuid;
    if (selfUuid && input.uuid === selfUuid) return;

    let state: T;
    try {
      state = this.config.codec.decode(input.stateBase64);
    } catch {
      this.decodeFailureCount += 1;
      return;
    }
    const notification = {
      uuid: input.uuid,
      state: input.stateBase64,
      chunkX: String(input.chunkX),
      chunkY: String(input.chunkY),
      chunkZ: String(input.chunkZ),
      distance: input.distance ?? 0,
      epochMillis: String(input.epochMillis ?? Date.now()),
    } as ActorUpdateEcho;
    for (const [name, filter] of this.laneFilters) {
      let matches: boolean;
      try {
        matches = filter(state, notification);
      } catch {
        continue;
      }
      if (!matches) continue;
      this.lanes.get(name)!.apply(
        input.uuid,
        state,
        {
          x: String(input.chunkX),
          y: String(input.chunkY),
          z: String(input.chunkZ),
        },
        input.distance ?? 0,
        Number(input.epochMillis ?? Date.now()),
        input.interestTier,
      );
      break;
    }
  }

  /** A new actor appeared (default/single-lane sugar; use `lane()` with lanes). */
  onJoin(listener: (actor: RemoteActor<T>) => void): () => void {
    return this.everyLane((lane) => lane.onJoin(listener));
  }

  /** An actor updated. */
  onUpdate(listener: (actor: RemoteActor<T>) => void): () => void {
    return this.everyLane((lane) => lane.onUpdate(listener));
  }

  /** An actor was reaped. */
  onLeave(listener: (actor: RemoteActor<T>) => void): () => void {
    return this.everyLane((lane) => lane.onLeave(listener));
  }

  /** Physically delete stale records in every lane. */
  reap(): void {
    for (const lane of this.lanes.values()) lane.reap();
  }

  /** Drop every record in every lane. */
  clear(): void {
    for (const lane of this.lanes.values()) lane.clear();
  }

  private everyLane(register: (lane: RemoteActorLane<T>) => () => void): () => void {
    const offs = [...this.lanes.values()].map(register);
    return () => {
      for (const off of offs) off();
    };
  }
}

/**
 * Attach a {@link RemoteActorStore} to a world session context. Prefer the
 * `actors` key of `createWorldSession`'s config.
 */
export function attachRemoteActors<T>(
  ctx: WorldSessionContext,
  config: RemoteActorsConfig<T>,
): RemoteActorStore<T> {
  return new RemoteActorStore(ctx, config);
}
