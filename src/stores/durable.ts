/**
 * Durable-state stores: host election tracking ({@link HostTracker}), the
 * per-user app save blob ({@link SaveStateStore}), and typed avatar state
 * ({@link AvatarStateStore}). These wrap the GraphQL surfaces with local
 * caches and typed codecs — independent types from your replication state,
 * as durable and realtime payloads rarely share a layout.
 */

import { jsonCodec, type StateCodec } from './codec.js';
import type { WorldSessionContext } from './session.js';

// ---------------------------------------------------------------------------
// HostTracker
// ---------------------------------------------------------------------------

/** Options for {@link attachHostTracker}. */
export interface HostTrackerConfig {
  /**
   * The authenticated user's id (or a getter), used to compute
   * {@link HostTracker.isHost}. Without it only `hostUserId` is tracked.
   */
  myUserId?: string | (() => string | null);
  /** Heartbeat cadence in ms (also keeps you host-eligible). Defaults to 3000. */
  intervalMs?: number;
  /** Send one heartbeat immediately on attach. Defaults to true. */
  heartbeatImmediately?: boolean;
}

/**
 * The SDK-managed **host election tracker**: heartbeats on the session
 * ticker (keeping this client host-eligible), caches the elected host, and
 * fires {@link onHostChanged} on transitions. Election is informational —
 * gate authoritative writes with `is_host` invoke policies server-side.
 * Transient heartbeat failures keep the last known host.
 */
export class HostTracker {
  private hostUserIdValue: string | null = null;
  private readonly listeners = new Set<(hostUserId: string | null) => void>();

  constructor(
    private readonly ctx: WorldSessionContext,
    private readonly config: HostTrackerConfig = {},
  ) {
    const interval = config.intervalMs ?? 3000;
    ctx.onDispose(ctx.ticker.every(interval, () => void this.beat()));
    if (config.heartbeatImmediately ?? true) void this.beat();
  }

  /** The elected host's user id (null until the first successful beat). */
  get hostUserId(): string | null {
    return this.hostUserIdValue;
  }

  /** Whether the configured user is the elected host. */
  get isHost(): boolean {
    const mine =
      typeof this.config.myUserId === 'function'
        ? this.config.myUserId()
        : this.config.myUserId;
    return mine != null && this.hostUserIdValue != null && String(mine) === this.hostUserIdValue;
  }

  /** Fired when the elected host changes (including the first election). @returns off. */
  onHostChanged(listener: (hostUserId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Send one heartbeat now and apply the result. */
  async beat(): Promise<void> {
    let result: { hostUserId: unknown } | null;
    try {
      result = await this.ctx.client.host.heartbeat(this.ctx.appId);
    } catch {
      return; // Transient failure: keep the last known host.
    }
    const next = result?.hostUserId != null ? String(result.hostUserId) : null;
    if (next !== this.hostUserIdValue) {
      this.hostUserIdValue = next;
      for (const listener of [...this.listeners]) listener(next);
    }
  }
}

/** Attach a {@link HostTracker}. Prefer the `host` config key. */
export function attachHostTracker(
  ctx: WorldSessionContext,
  config: HostTrackerConfig = {},
): HostTracker {
  return new HostTracker(ctx, config);
}

// ---------------------------------------------------------------------------
// SaveStateStore
// ---------------------------------------------------------------------------

/** Options for {@link attachSaveState}. */
export interface SaveStateConfig<T> {
  /** Codec for the save blob. Defaults to JSON. */
  codec?: StateCodec<T>;
  /**
   * Debounced autosave: when set, a dirty value persists automatically at
   * most once per this many ms (on the session ticker). Defaults to off.
   */
  autosaveMs?: number | false;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The SDK-managed **save state**: a typed local cache over the per-user
 * per-app `client.state` blob. `load()` hydrates it, `set()` updates it (and
 * autosave persists it when configured), `save()` persists on demand.
 * The type is intentionally independent of your replication state — durable
 * saves and 5 Hz poses are different data.
 */
export class SaveStateStore<T> {
  private current: T | null = null;
  private dirtyFlag = false;
  private saving = false;
  private lastSavedAtValue: number | null = null;
  private readonly codec: StateCodec<T>;
  private readonly now: () => number;

  constructor(
    private readonly ctx: WorldSessionContext,
    config: SaveStateConfig<T> = {},
  ) {
    this.codec = config.codec ?? jsonCodec<T>();
    this.now = config.now ?? Date.now;
    const autosave = config.autosaveMs ?? false;
    if (autosave !== false && autosave > 0) {
      ctx.onDispose(
        ctx.ticker.every(autosave, () => {
          if (this.dirtyFlag && !this.saving) void this.save();
        }),
      );
    }
  }

  /** The cached typed save (null before {@link load}/{@link set}). */
  get value(): T | null {
    return this.current;
  }

  /** Whether the cache has unsaved changes. */
  get dirty(): boolean {
    return this.dirtyFlag;
  }

  /** Local time of the last successful save. */
  get lastSavedAt(): number | null {
    return this.lastSavedAtValue;
  }

  /** Fetch and decode the server copy into the cache (null when none). */
  async load(): Promise<T | null> {
    const record = await this.ctx.client.state.getOne(this.ctx.appId);
    if (record?.state == null) {
      this.current = null;
      return null;
    }
    try {
      this.current = this.codec.decode(record.state);
    } catch {
      this.current = null;
    }
    this.dirtyFlag = false;
    return this.current;
  }

  /** Update the cached save and mark it dirty (autosave persists it). */
  set(value: T): void {
    this.current = value;
    this.dirtyFlag = true;
  }

  /** Merge a partial update into the cached save (object saves only). */
  patch(patch: Partial<T>): void {
    this.set({ ...(this.current as T), ...patch });
  }

  /** Persist the cached save now. No-op when nothing is cached. */
  async save(): Promise<void> {
    if (this.current === null) return;
    this.saving = true;
    try {
      await this.ctx.client.state.update({
        appId: this.ctx.appId,
        state: this.codec.encode(this.current),
      });
      this.dirtyFlag = false;
      this.lastSavedAtValue = this.now();
    } finally {
      this.saving = false;
    }
  }
}

/** Attach a {@link SaveStateStore}. Prefer the `save` config key. */
export function attachSaveState<T>(
  ctx: WorldSessionContext,
  config: SaveStateConfig<T> = {},
): SaveStateStore<T> {
  return new SaveStateStore(ctx, config);
}

// ---------------------------------------------------------------------------
// AvatarStateStore
// ---------------------------------------------------------------------------

/** Options for {@link attachAvatarState}. */
export interface AvatarStateConfig<TPublic, TPrivate, TApp> {
  /** The avatar to bind. Omit to bind the caller's first avatar on load. */
  avatarId?: string;
  /** Codec for the public (anyone-readable) avatar state. Defaults to JSON. */
  publicCodec?: StateCodec<TPublic>;
  /** Codec for the private (owner-only) avatar state. Defaults to JSON. */
  privateCodec?: StateCodec<TPrivate>;
  /** Codec for the per-app avatar state. Defaults to JSON. */
  appCodec?: StateCodec<TApp>;
}

/**
 * The SDK-managed **avatar state**: typed, cached views of one avatar's
 * public / private / per-app state blobs, each with its own codec (three
 * independent types — public profiles, private inventory-ish data, and
 * app-specific progress rarely share a shape).
 */
export class AvatarStateStore<TPublic = unknown, TPrivate = unknown, TApp = unknown> {
  private avatarIdValue: string | null;
  private publicValue: TPublic | null = null;
  private privateValue: TPrivate | null = null;
  private appValue: TApp | null = null;
  private readonly publicCodec: StateCodec<TPublic>;
  private readonly privateCodec: StateCodec<TPrivate>;
  private readonly appCodec: StateCodec<TApp>;

  constructor(
    private readonly ctx: WorldSessionContext,
    config: AvatarStateConfig<TPublic, TPrivate, TApp> = {},
  ) {
    this.avatarIdValue = config.avatarId ?? null;
    this.publicCodec = config.publicCodec ?? jsonCodec<TPublic>();
    this.privateCodec = config.privateCodec ?? jsonCodec<TPrivate>();
    this.appCodec = config.appCodec ?? jsonCodec<TApp>();
  }

  /** The bound avatar id (null before {@link load} resolves a default). */
  get avatarId(): string | null {
    return this.avatarIdValue;
  }

  /** The cached decoded public state. */
  get publicState(): TPublic | null {
    return this.publicValue;
  }

  /** The cached decoded private state (owner-only). */
  get privateState(): TPrivate | null {
    return this.privateValue;
  }

  /** The cached decoded per-app state. */
  get appState(): TApp | null {
    return this.appValue;
  }

  /**
   * Hydrate the cache: resolves the avatar (the caller's first when no
   * `avatarId` was configured), decodes its public/private state, and
   * fetches this app's avatar state.
   */
  async load(): Promise<void> {
    if (!this.avatarIdValue) {
      const mine = await this.ctx.client.avatars.mine();
      const first = mine[0];
      if (!first) {
        throw new Error('No avatar to bind — create one with client.avatars.create()');
      }
      this.avatarIdValue = String(first.avatarId);
    }
    const avatar = await this.ctx.client.avatars.get(this.avatarIdValue);
    this.publicValue = this.decodeWith(this.publicCodec, avatar?.publicState);
    this.privateValue = this.decodeWith(this.privateCodec, avatar?.privateState);
    const appRecord = await this.ctx.client.avatars.appState(
      this.ctx.appId,
      this.avatarIdValue,
    );
    this.appValue = this.decodeWith(this.appCodec, appRecord?.state);
  }

  /** Write the public and/or private state (typed) and update the cache. */
  async setIdentityState(input: {
    publicState?: TPublic;
    privateState?: TPrivate;
  }): Promise<void> {
    const avatarId = this.requireAvatar();
    await this.ctx.client.avatars.updateState(avatarId, {
      ...(input.publicState !== undefined
        ? { publicState: this.publicCodec.encode(input.publicState) }
        : {}),
      ...(input.privateState !== undefined
        ? { privateState: this.privateCodec.encode(input.privateState) }
        : {}),
    });
    if (input.publicState !== undefined) this.publicValue = input.publicState;
    if (input.privateState !== undefined) this.privateValue = input.privateState;
  }

  /** Write this app's avatar state (typed) and update the cache. */
  async setAppState(value: TApp): Promise<void> {
    const avatarId = this.requireAvatar();
    await this.ctx.client.avatars.updateAppState({
      appId: this.ctx.appId,
      avatarId,
      state: this.appCodec.encode(value),
    });
    this.appValue = value;
  }

  private requireAvatar(): string {
    if (!this.avatarIdValue) {
      throw new Error('AvatarStateStore is unbound — call load() first or configure avatarId');
    }
    return this.avatarIdValue;
  }

  private decodeWith<V>(codec: StateCodec<V>, encoded: string | null | undefined): V | null {
    if (encoded == null || encoded === '') return null;
    try {
      return codec.decode(encoded);
    } catch {
      return null;
    }
  }
}

/** Attach an {@link AvatarStateStore}. Prefer the `avatar` config key. */
export function attachAvatarState<TPublic = unknown, TPrivate = unknown, TApp = unknown>(
  ctx: WorldSessionContext,
  config: AvatarStateConfig<TPublic, TPrivate, TApp> = {},
): AvatarStateStore<TPublic, TPrivate, TApp> {
  return new AvatarStateStore(ctx, config);
}
