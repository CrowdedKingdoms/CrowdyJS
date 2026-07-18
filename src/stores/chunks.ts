/**
 * ChunkStore — the SDK-managed chunk/voxel cache: bulk loading, typed
 * per-voxel and per-chunk state, realtime merge of voxel notifications,
 * optimistic local edits, and the deterministic-worldgen write-back pattern.
 * Replaces the WorldStreamer + WorldState + codec plumbing every voxel game
 * hand-writes (~860 LOC in Blocks with Friends).
 */

import { generateCrowdyUuid, decodeBase64, encodeBase64 } from '../utils.js';
import { rawCodec, type StateCodec } from './codec.js';
import {
  CHUNK_VOLUME,
  chunkDistance,
  chunkKey,
  chunksAround,
  fromChunkInput,
  toChunkInput,
  voxelIndex,
  type ChunkCoord,
} from './keys.js';
import type { WorldSessionContext } from './session.js';

/** Load lifecycle of a cached chunk. */
export type ChunkLoadState =
  | 'loading' // fetch in flight
  | 'loaded' // server copy applied
  | 'missing' // server has no such chunk (worldgen candidate)
  | 'seeded' // locally generated/edited before any server copy
  | 'failed'; // fetch threw

/**
 * One cached chunk. Object identity is stable; check `revision` for cheap
 * change detection from a render loop.
 */
export interface CachedChunk<TVoxelState = string, TChunkState = string> {
  readonly key: string;
  readonly coord: ChunkCoord;
  /** Dense voxel-type grid (4096 bytes, `x + y*16 + z*256`), null when unknown. */
  voxels: Uint8Array | null;
  /** Sparse typed per-voxel state by voxel index. */
  voxelStates: Map<number, TVoxelState>;
  /** Typed chunk-level state (null when absent/undecoded). */
  chunkState: TChunkState | null;
  loadState: ChunkLoadState;
  /** Bumped on every change to this chunk. */
  revision: number;
  /** Local time of the last change. */
  updatedAt: number;
  /** Whether sparse voxel states were hydrated (bulk loads omit them). */
  hydrated: boolean;
  /** Whether local edits are queued for write-back. */
  dirty: boolean;
}

/** Options for {@link attachChunkStore}. */
export interface ChunkStoreConfig<TVoxelState = string, TChunkState = string> {
  /** Codec for per-voxel state blobs. Defaults to raw base64 strings. */
  voxelStateCodec?: StateCodec<TVoxelState>;
  /** Codec for the chunk-level state blob. Defaults to raw base64 strings. */
  chunkStateCodec?: StateCodec<TChunkState>;
  /**
   * After a bulk load, fetch each chunk individually to hydrate its sparse
   * `voxelStates` (`getChunksByDistance` does NOT return them — a platform
   * trap this store encapsulates). Defaults to true when a
   * `voxelStateCodec` is configured, else false.
   */
  hydrateVoxelStates?: boolean;
  /**
   * Called for chunks the server has never stored. Return a 4096-byte dense
   * grid to seed it locally (deterministic client-side worldgen) — seeded
   * chunks are queued for write-back so the world persists and stays
   * identical for everyone.
   */
  onMissing?: (coord: ChunkCoord) => Uint8Array | undefined | void;
  /**
   * Write-back cadence: one dirty chunk persists per tick (throttled, like
   * the proven BWF pattern). Defaults to 700 ms; `false` disables the timer
   * (call {@link ChunkStore.flush} yourself). Runs on the session ticker.
   */
  writeBackIntervalMs?: number | false;
  /** Replication radius for outbound voxel updates (0-8). */
  distance?: number;
  /** Decay algorithm for outbound voxel updates (0-5). */
  decayRate?: number;
  /**
   * The actor uuid stamped on outbound voxel updates. Wired from the
   * session's local actor automatically; a random uuid otherwise.
   */
  actorUuid?: string | (() => string | null);
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** A voxel edit for {@link ChunkStore.setVoxel}. */
export interface SetVoxelInput<TVoxelState> {
  chunk: ChunkCoord;
  /** Within-chunk voxel coordinates (0-15 each). */
  x: number;
  y: number;
  z: number;
  voxelType: number;
  /** Typed per-voxel state (encoded with the store's codec). */
  state?: TVoxelState;
  /** Apply locally before the send resolves. Defaults to true. */
  optimistic?: boolean;
}

/**
 * The SDK-managed **chunk/voxel cache** — the client-side source of truth
 * for terrain:
 *
 * - `ensureAround(center, radius)` bulk-loads via `chunks.byDistance`
 *   (in-flight deduped), hydrates sparse voxel states, marks chunks the
 *   server never stored as `missing`, and hands them to your `onMissing`
 *   worldgen hook.
 * - Realtime `voxelUpdate` notifications merge into the cache automatically
 *   (dense grid write + typed state decode + revision bump + change event).
 * - `setVoxel` applies locally (optimistic) and replicates via the UDP path.
 * - `seed`/`flush` implement deterministic-worldgen write-back through
 *   `chunks.update`, one throttled chunk at a time.
 *
 * All reads are synchronous; writes land on WebSocket events, so render
 * loops and background tabs behave (see the module docs).
 */
export class ChunkStore<TVoxelState = string, TChunkState = string> {
  private readonly chunks = new Map<string, CachedChunk<TVoxelState, TChunkState>>();
  private readonly inFlight = new Set<string>();
  private readonly writeBackQueue: string[] = [];
  private readonly changeListeners = new Set<
    (chunk: CachedChunk<TVoxelState, TChunkState>) => void
  >();
  private readonly voxelStateCodec: StateCodec<TVoxelState>;
  private readonly chunkStateCodec: StateCodec<TChunkState>;
  private readonly hydrateStates: boolean;
  private readonly now: () => number;
  private readonly fallbackUuid = generateCrowdyUuid();
  private revisionValue = 0;
  private sequence = 0;

  constructor(
    private readonly ctx: WorldSessionContext,
    private readonly config: ChunkStoreConfig<TVoxelState, TChunkState> = {},
  ) {
    this.voxelStateCodec =
      config.voxelStateCodec ?? (rawCodec as unknown as StateCodec<TVoxelState>);
    this.chunkStateCodec =
      config.chunkStateCodec ?? (rawCodec as unknown as StateCodec<TChunkState>);
    this.hydrateStates = config.hydrateVoxelStates ?? config.voxelStateCodec !== undefined;
    this.now = config.now ?? Date.now;

    // Realtime merge: live edits land in the cache as they replicate.
    ctx.onDispose(
      ctx.on('voxelUpdate', (notification) => {
        const coord = {
          x: Number(notification.chunkX),
          y: Number(notification.chunkY),
          z: Number(notification.chunkZ),
        };
        const chunk = this.chunks.get(chunkKey(coord));
        if (!chunk) return; // only merge into chunks we track
        this.applyVoxel(
          chunk,
          notification.voxelX,
          notification.voxelY,
          notification.voxelZ,
          notification.voxelType,
          notification.voxelState || undefined,
        );
      }),
    );

    const writeBackInterval = config.writeBackIntervalMs ?? 700;
    if (writeBackInterval !== false && writeBackInterval > 0) {
      ctx.onDispose(
        ctx.ticker.every(writeBackInterval, () => {
          void this.persistNext();
        }),
      );
    }
  }

  /** Bumped on every cache change — poll it cheaply from a render loop. */
  get revision(): number {
    return this.revisionValue;
  }

  /** The cached chunk at a coordinate (any load state), if tracked. */
  get(coord: ChunkCoord): CachedChunk<TVoxelState, TChunkState> | undefined {
    return this.chunks.get(chunkKey(coord));
  }

  /** Every tracked chunk (any load state). */
  list(): Array<CachedChunk<TVoxelState, TChunkState>> {
    return [...this.chunks.values()];
  }

  /** The dense voxel type at a within-chunk coordinate (0 when unknown). */
  voxelTypeAt(coord: ChunkCoord, x: number, y: number, z: number): number {
    const chunk = this.chunks.get(chunkKey(coord));
    return chunk?.voxels?.[voxelIndex(x, y, z)] ?? 0;
  }

  /** The typed per-voxel state at a within-chunk coordinate, if any. */
  voxelStateAt(
    coord: ChunkCoord,
    x: number,
    y: number,
    z: number,
  ): TVoxelState | undefined {
    return this.chunks.get(chunkKey(coord))?.voxelStates.get(voxelIndex(x, y, z));
  }

  /** Subscribe to per-chunk changes (loads, merges, edits). @returns off. */
  onChunkChanged(
    listener: (chunk: CachedChunk<TVoxelState, TChunkState>) => void,
  ): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Ensure every chunk within `radius` (Chebyshev, 1-8) of `center` is
   * tracked: bulk-loads untracked ones, hydrates sparse voxel states when
   * configured, marks server-unknown chunks `missing`, and seeds them via
   * `onMissing`. In-flight requests are deduped; safe to call every time the
   * player crosses a chunk boundary.
   */
  async ensureAround(center: ChunkCoord, radius: number): Promise<void> {
    const wanted = chunksAround(center, radius).filter((coord) => {
      const key = chunkKey(coord);
      return !this.chunks.has(key) && !this.inFlight.has(key);
    });
    if (wanted.length === 0) return;
    for (const coord of wanted) this.inFlight.add(chunkKey(coord));

    try {
      const response = await this.ctx.client.chunks.byDistance({
        appId: this.ctx.appId,
        centerCoordinate: toChunkInput(center),
        maxDistance: Math.max(1, Math.min(8, radius)),
        limit: (2 * radius + 1) ** 3,
      });
      const returned = new Set<string>();
      for (const chunk of response.chunks) {
        const coord = fromChunkInput(chunk.coordinates);
        returned.add(chunkKey(coord));
        this.applyServerChunk(coord, chunk.voxels ?? null, chunk.chunkState ?? null);
      }
      // Requested-but-absent chunks have never been stored server-side.
      for (const coord of wanted) {
        if (returned.has(chunkKey(coord))) continue;
        this.markMissing(coord);
      }
      if (this.hydrateStates) {
        await Promise.all(
          wanted
            .filter((coord) => returned.has(chunkKey(coord)))
            .map((coord) => this.hydrate(coord)),
        );
      }
    } catch (error) {
      for (const coord of wanted) {
        const key = chunkKey(coord);
        if (!this.chunks.has(key)) {
          const chunk = this.ensureEntry(coord);
          chunk.loadState = 'failed';
          this.touch(chunk);
        }
      }
      throw error;
    } finally {
      for (const coord of wanted) this.inFlight.delete(chunkKey(coord));
    }
  }

  /**
   * Hydrate one chunk's sparse voxel states (and chunk state) via a
   * single-chunk fetch — bulk loads omit them.
   */
  async hydrate(coord: ChunkCoord): Promise<void> {
    const full = await this.ctx.client.chunks.get({
      appId: this.ctx.appId,
      coordinates: toChunkInput(coord),
    });
    if (!full) {
      this.markMissing(coord);
      return;
    }
    const chunk = this.ensureEntry(coord);
    if (full.voxels != null) chunk.voxels = decodeBase64(full.voxels);
    chunk.chunkState = this.decodeChunkState(full.chunkState ?? null);
    for (const entry of full.voxelStates ?? []) {
      const index = voxelIndex(entry.voxelCoord.x, entry.voxelCoord.y, entry.voxelCoord.z);
      if (chunk.voxels) chunk.voxels[index] = entry.voxelType;
      if (entry.state) {
        try {
          chunk.voxelStates.set(index, this.voxelStateCodec.decode(entry.state));
        } catch {
          // Foreign/legacy blobs skip silently; the dense type still applied.
        }
      }
    }
    chunk.loadState = 'loaded';
    chunk.hydrated = true;
    this.touch(chunk);
  }

  /**
   * Edit one voxel: applies to the cache immediately (optimistic) and
   * replicates via the realtime voxel path. Resolves with the send
   * acceptance.
   */
  async setVoxel(input: SetVoxelInput<TVoxelState>): Promise<boolean> {
    const chunk = this.ensureEntry(input.chunk);
    if (input.optimistic ?? true) {
      this.applyVoxel(
        chunk,
        input.x,
        input.y,
        input.z,
        input.voxelType,
        undefined,
        input.state,
      );
    }
    const sequenceNumber = this.nextSequence();
    this.ctx.trackSend({
      kind: 'voxelUpdate',
      sequenceNumber,
      sentAt: this.now(),
      uuid: this.senderUuid(),
      detail: { chunk: input.chunk, x: input.x, y: input.y, z: input.z },
    });
    return this.ctx.client.udp.sendVoxelUpdate({
      appId: this.ctx.appId,
      chunk: toChunkInput(input.chunk),
      uuid: this.senderUuid(),
      voxel: { x: input.x, y: input.y, z: input.z },
      voxelType: input.voxelType,
      voxelState:
        input.state !== undefined ? this.voxelStateCodec.encode(input.state) : '',
      sequenceNumber,
      ...(this.config.distance !== undefined ? { distance: this.config.distance } : {}),
      ...(this.config.decayRate !== undefined
        ? { decayRate: this.config.decayRate }
        : {}),
    });
  }

  /**
   * Seed a locally generated chunk (deterministic worldgen) and queue it for
   * write-back so the server copy exists for everyone.
   */
  seed(coord: ChunkCoord, voxels: Uint8Array, options: { writeBack?: boolean } = {}): void {
    if (voxels.length !== CHUNK_VOLUME) {
      throw new Error(`seed() needs a ${CHUNK_VOLUME}-byte dense grid, got ${voxels.length}`);
    }
    const chunk = this.ensureEntry(coord);
    chunk.voxels = voxels;
    chunk.loadState = 'seeded';
    if (options.writeBack ?? true) this.markDirty(coord);
    this.touch(chunk);
  }

  /** Queue a tracked chunk's dense grid for (throttled) write-back. */
  markDirty(coord: ChunkCoord): void {
    const key = chunkKey(coord);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dirty = true;
    if (!this.writeBackQueue.includes(key)) this.writeBackQueue.push(key);
  }

  /** Chunks currently queued for write-back. */
  get pendingWriteBacks(): number {
    return this.writeBackQueue.length;
  }

  /** Persist every queued chunk now (awaits all writes). */
  async flush(): Promise<void> {
    while (this.writeBackQueue.length > 0) {
      await this.persistNext();
    }
  }

  /** Drop tracked chunks farther than `radius` from `center` (dirty ones kept). */
  pruneBeyond(center: ChunkCoord, radius: number): void {
    for (const [key, chunk] of this.chunks) {
      if (chunk.dirty) continue;
      if (chunkDistance(chunk.coord, center) > radius) {
        this.chunks.delete(key);
        this.revisionValue += 1;
      }
    }
  }

  // -- internals --------------------------------------------------------------

  private async persistNext(): Promise<void> {
    const key = this.writeBackQueue.shift();
    if (!key) return;
    const chunk = this.chunks.get(key);
    if (!chunk || !chunk.voxels) return;
    try {
      await this.ctx.client.chunks.update({
        appId: this.ctx.appId,
        coordinates: toChunkInput(chunk.coord),
        voxels: encodeBase64(chunk.voxels),
      });
      chunk.dirty = false;
      if (chunk.loadState === 'seeded') chunk.loadState = 'loaded';
      this.touch(chunk);
    } catch {
      // Requeue at the back; the next tick retries.
      chunk.dirty = true;
      this.writeBackQueue.push(key);
    }
  }

  private applyServerChunk(
    coord: ChunkCoord,
    voxels: string | null,
    chunkState: string | null,
  ): void {
    const chunk = this.ensureEntry(coord);
    if (voxels != null) chunk.voxels = decodeBase64(voxels);
    chunk.chunkState = this.decodeChunkState(chunkState);
    chunk.loadState = 'loaded';
    this.touch(chunk);
  }

  private markMissing(coord: ChunkCoord): void {
    const chunk = this.ensureEntry(coord);
    if (chunk.loadState === 'loaded' || chunk.loadState === 'seeded') return;
    chunk.loadState = 'missing';
    this.touch(chunk);
    const generated = this.config.onMissing?.(coord);
    if (generated) this.seed(coord, generated);
  }

  private applyVoxel(
    chunk: CachedChunk<TVoxelState, TChunkState>,
    x: number,
    y: number,
    z: number,
    voxelType: number,
    encodedState?: string,
    decodedState?: TVoxelState,
  ): void {
    if (!chunk.voxels) chunk.voxels = new Uint8Array(CHUNK_VOLUME);
    const index = voxelIndex(x, y, z);
    chunk.voxels[index] = voxelType;
    let state = decodedState;
    if (state === undefined && encodedState) {
      try {
        state = this.voxelStateCodec.decode(encodedState);
      } catch {
        state = undefined;
      }
    }
    if (state !== undefined) {
      chunk.voxelStates.set(index, state);
    } else {
      chunk.voxelStates.delete(index);
    }
    this.touch(chunk);
  }

  private ensureEntry(coord: ChunkCoord): CachedChunk<TVoxelState, TChunkState> {
    const key = chunkKey(coord);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        key,
        coord,
        voxels: null,
        voxelStates: new Map(),
        chunkState: null,
        loadState: 'loading',
        revision: 0,
        updatedAt: this.now(),
        hydrated: false,
        dirty: false,
      };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private decodeChunkState(encoded: string | null): TChunkState | null {
    if (encoded == null || encoded === '') return null;
    try {
      return this.chunkStateCodec.decode(encoded);
    } catch {
      return null;
    }
  }

  private touch(chunk: CachedChunk<TVoxelState, TChunkState>): void {
    chunk.revision += 1;
    chunk.updatedAt = this.now();
    this.revisionValue += 1;
    for (const listener of [...this.changeListeners]) listener(chunk);
  }

  private senderUuid(): string {
    const configured =
      typeof this.config.actorUuid === 'function'
        ? this.config.actorUuid()
        : this.config.actorUuid;
    return configured ?? this.fallbackUuid;
  }

  private nextSequence(): number {
    this.sequence = (this.sequence + 1) % 256;
    return this.sequence;
  }
}

/**
 * Attach a {@link ChunkStore} to a world session context. Prefer the
 * `chunks` key of `createWorldSession`'s config.
 */
export function attachChunkStore<TVoxelState = string, TChunkState = string>(
  ctx: WorldSessionContext,
  config: ChunkStoreConfig<TVoxelState, TChunkState> = {},
): ChunkStore<TVoxelState, TChunkState> {
  return new ChunkStore(ctx, config);
}
