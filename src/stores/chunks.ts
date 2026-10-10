/**
 * ChunkStore — the SDK-managed chunk/voxel cache: bulk loading, typed
 * per-voxel and per-chunk state, realtime merge of voxel notifications,
 * optimistic local edits, and the deterministic-worldgen write-back pattern.
 * Replaces the WorldStreamer + WorldState + codec plumbing every voxel game
 * hand-writes (~860 LOC in Blocks with Friends).
 *
 * It is a helper for 16×16×16 chunks with one byte per voxel. Voxel positions and
 * types are the app's signed 16-bit values, which the platform does not check; an
 * edit the dense grid cannot hold (a type outside 0-255, a position outside 0-15)
 * goes to the chunk's `overlay` instead, and reads of that voxel return it. An app
 * with other addressing reads the raw voxel events (`udp.subscribe`'s
 * `voxelUpdate`, `chunks.get`'s `voxelStates`).
 */

import { assertVoxelEdit } from '../binary-wire.js';
import { generateCrowdyUuid, decodeBase64, encodeBase64 } from '../utils.js';
import { rawCodec, type StateCodec } from './codec.js';
import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  chunkDistance,
  chunkKey,
  chunksAround,
  fromChunkInput,
  toChunkInput,
  voxelIndex,
  voxelKey,
  type ChunkCoord,
} from './keys.js';
import type { WorldSessionContext } from './session.js';

/**
 * Hydrations in flight at once. Each is one request, and a bulk load returns hundreds of
 * chunks: sent together, the API refuses a share of them as busy.
 */
const HYDRATE_CONCURRENCY = 8;
/** Attempts for a request the platform refused before running it. */
const BUSY_ATTEMPTS = 4;
/** A chunk whose hydration failed this many times in a row is not asked for again. */
const HYDRATE_GIVE_UP = 3;

/** How long a local voxel edit waits for its echo before it is forgotten (a lost or refused send). */
const PENDING_EDIT_TTL_MS = 10_000;

/**
 * A voxel edit this client sent and the server has not echoed yet. `stale` is set when another
 * client's edit of the same voxel arrived (or the edit was not applied locally), so its echo
 * must be applied: the server ordered it last.
 */
interface PendingVoxelEdit {
  uuid: string;
  sequenceNumber: number;
  voxelType: number;
  encodedState?: string;
  sentAt: number;
  stale: boolean;
}

/** The platform refused the call before running it: asking again can succeed. */
function refusedBeforeRunning(error: unknown): boolean {
  const e = error as { code?: unknown; extensions?: { code?: unknown; retryable?: unknown } };
  const code = e?.code ?? e?.extensions?.code;
  return code === 'PLATFORM_BUSY' || e?.extensions?.retryable === true;
}

/** Attempts for one chunk write-back whose failures could clear (busy, network, 5xx). */
const WRITE_BACK_ATTEMPTS = 5;
/** Wait before the second write-back attempt; doubles for each one after it. */
const WRITE_BACK_BACKOFF_MS = 700;

/** Codes for a request the server read and will refuse again unchanged. */
const WRITE_BACK_REFUSAL_CODES = new Set([
  'FORBIDDEN',
  'SCOPE_MISSING',
  'NOT_ALLOWED',
  'BAD_REQUEST',
  'BAD_USER_INPUT',
  'INVALID_REQUEST',
  'GRAPHQL_VALIDATION_FAILED',
  'NOT_FOUND',
]);
const WRITE_BACK_REFUSAL_STATUSES = new Set([400, 403, 404, 413, 422]);

/**
 * Whether a failed write-back can succeed if sent again unchanged. A permission or
 * validation refusal cannot; a busy platform, a network drop or a server error can.
 */
function writeBackRetryable(error: unknown): boolean {
  if (refusedBeforeRunning(error)) return true;
  const e = error as {
    code?: unknown;
    status?: unknown;
    retryable?: unknown;
    extensions?: { code?: unknown; retryable?: unknown; httpStatus?: unknown };
  };
  if (e?.extensions?.retryable === false || e?.retryable === false) return false;
  const code = e?.code ?? e?.extensions?.code;
  if (typeof code === 'string' && WRITE_BACK_REFUSAL_CODES.has(code)) return false;
  const status = e?.status ?? e?.extensions?.httpStatus;
  if (typeof status === 'number' && WRITE_BACK_REFUSAL_STATUSES.has(status)) return false;
  return true;
}

async function whenNotBusy<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= BUSY_ATTEMPTS || !refusedBeforeRunning(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
    }
  }
}

/** A within-chunk position inside the 16³ grid (0-15 on each axis). */
function inDenseGrid(x: number, y: number, z: number): boolean {
  return [x, y, z].every((v) => Number.isInteger(v) && v >= 0 && v < CHUNK_SIZE);
}

/** Whether the dense grid can hold this edit: a position inside it and a type 0-255. */
function fitsDenseGrid(x: number, y: number, z: number, voxelType: number): boolean {
  return inDenseGrid(x, y, z) && Number.isInteger(voxelType) && voxelType >= 0 && voxelType <= 255;
}

/**
 * A voxel the dense grid cannot hold, kept in its chunk's `overlay`: a type outside 0-255, or a
 * position outside 0-15 (the app's signed 16-bit values, as the edit carried them).
 */
export interface ChunkOverlayVoxel<TVoxelState = string> {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  voxelType: number;
  /** Its typed state, when it has one. */
  state?: TVoxelState;
}

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
  /**
   * Dense voxel-type grid (4096 bytes), null when unknown. Indexed
   * `x + y*16 + z*256` by default; see {@link ChunkStoreConfig.voxelIndex}.
   * Holds 0 where an in-grid voxel's type is in {@link overlay}.
   */
  voxels: Uint8Array | null;
  /** Sparse typed per-voxel state by voxel index (voxels in the dense grid). */
  voxelStates: Map<number, TVoxelState>;
  /**
   * The voxels the dense grid cannot hold (a type outside 0-255, a position outside 0-15), each
   * with its state, keyed by `voxelKey(x, y, z)`. {@link ChunkStore.voxelTypeAt} and
   * {@link ChunkStore.voxelStateAt} read them first.
   */
  overlay: Map<string, ChunkOverlayVoxel<TVoxelState>>;
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

/**
 * A chunk write-back the store stopped trying. The chunk keeps its local voxels and is
 * no longer dirty, so it can be pruned and loaded again from the server's copy.
 */
export interface ChunkWriteBackFailure<TVoxelState = string, TChunkState = string> {
  readonly chunk: CachedChunk<TVoxelState, TChunkState>;
  readonly coord: ChunkCoord;
  /** The error of the last attempt. */
  readonly error: unknown;
  /**
   * `refused`: the server will refuse it again unchanged (no permission on the chunk,
   * a closed wilderness, an invalid grid). `exhausted`: every attempt failed with an
   * error that could have cleared (busy, network, a server error).
   */
  readonly reason: 'refused' | 'exhausted';
  /** Attempts made, the last one included. */
  readonly attempts: number;
}

/** Options for {@link attachChunkStore}. */
export interface ChunkStoreConfig<TVoxelState = string, TChunkState = string> {
  /** Codec for per-voxel state blobs. Defaults to raw base64 strings. */
  voxelStateCodec?: StateCodec<TVoxelState>;
  /** Codec for the chunk-level state blob. Defaults to raw base64 strings. */
  chunkStateCodec?: StateCodec<TChunkState>;
  /**
   * After a bulk load, fetch each newly loaded chunk with `chunks.get` and
   * apply its `voxelStates`: each entry's voxel type at its voxel, and its
   * state. The bulk load reads only `voxels`, and since ck-api v2.33.0 every
   * voxel edit recorded for a chunk (a hub's or mod's `world.set_voxels`,
   * `updateVoxel`, realtime voxel updates) arrives only in `voxelStates`, so
   * without hydration none of them shows after a reload. Defaults to true
   * when a `voxelStateCodec` is configured, else false.
   */
  hydrateVoxelStates?: boolean;
  /**
   * Called for chunks the server has never stored. Return a 4096-byte dense
   * grid to seed it locally (deterministic client-side worldgen) — seeded
   * chunks are queued for write-back so the world persists and stays
   * identical for everyone. Return `{ voxels, writeBack: false }` to seed
   * locally WITHOUT persisting (e.g. outside your world's write-back radius
   * or budget).
   */
  onMissing?: (
    coord: ChunkCoord,
  ) => Uint8Array | { voxels: Uint8Array; writeBack?: boolean } | undefined | void;
  /**
   * Write-back cadence: one dirty chunk persists per tick (throttled, like
   * the proven BWF pattern). Defaults to 700 ms; `false` disables the timer
   * (call {@link ChunkStore.flush} yourself). Runs on the session ticker.
   *
   * A write the server refuses (FORBIDDEN, a validation error) is dropped at once. One
   * that fails for a reason that can clear (PLATFORM_BUSY, network, a server error) is
   * tried again after 0.7 s, 1.4 s, 2.8 s and 5.6 s, then dropped. Both are reported
   * through {@link ChunkStore.onWriteBackFailed}.
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
  /**
   * Within-chunk (x,y,z in 0-15) → dense-grid byte offset. Defaults to the
   * platform-documented layout `x + y*16 + z*256`. Override for worlds whose
   * existing dense blobs were written with a different convention (e.g.
   * Blocks with Friends uses `y*256 + z*16 + x`) — the layout is opaque to
   * the platform, so all clients of a world just have to agree.
   */
  voxelIndex?: (x: number, y: number, z: number) => number;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** A voxel edit for {@link ChunkStore.setVoxel}. */
export interface SetVoxelInput<TVoxelState> {
  chunk: ChunkCoord;
  /**
   * Within-chunk voxel coordinates: 0-15 each for the dense grid; any other signed 16-bit value
   * is kept in the chunk's overlay.
   */
  x: number;
  y: number;
  z: number;
  /** The app's voxel type (signed 16-bit); outside 0-255 it is kept in the overlay. */
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
 *   (dense grid write + typed state decode + revision bump + change event; an
 *   edit with a type outside 0-255 or a position outside 0-15 goes to the
 *   chunk's `overlay` instead).
 * - `setVoxel` applies locally (optimistic) and replicates via the UDP path. The
 *   server delivers every accepted edit back to its sender: that echo is matched
 *   (sender uuid + sequence number + voxel) and not applied again, so a local edit
 *   fires one change event, and an older echo never rolls back a newer local edit.
 *   It is applied only when another client's edit of that voxel arrived in
 *   between (the server ordered yours last) or the edit was sent with
 *   `optimistic: false`.
 * - `seed`/`flush` implement deterministic-worldgen write-back through
 *   `chunks.update`, one throttled chunk at a time.
 *
 * All reads are synchronous; writes land on WebSocket events, so render
 * loops and background tabs behave (see the module docs).
 */
export class ChunkStore<TVoxelState = string, TChunkState = string> {
  private readonly chunks = new Map<string, CachedChunk<TVoxelState, TChunkState>>();
  private readonly inFlight = new Set<string>();
  private readonly hydrating = new Set<string>();
  /** Consecutive failed hydrations per chunk key. */
  private readonly hydrateFailures = new Map<string, number>();
  private readonly writeBackQueue: string[] = [];
  /** Failed attempts so far per queued chunk key. */
  private readonly writeBackAttempts = new Map<string, number>();
  /** When a chunk key whose write-back failed may be tried again. */
  private readonly writeBackDueAt = new Map<string, number>();
  private readonly changeListeners = new Set<
    (chunk: CachedChunk<TVoxelState, TChunkState>) => void
  >();
  private readonly writeBackFailureListeners = new Set<
    (failure: ChunkWriteBackFailure<TVoxelState, TChunkState>) => void
  >();
  private readonly voxelStateCodec: StateCodec<TVoxelState>;
  private readonly chunkStateCodec: StateCodec<TChunkState>;
  private readonly hydrateStates: boolean;
  private readonly now: () => number;
  private readonly fallbackUuid = generateCrowdyUuid();
  private readonly voxelIndex: (x: number, y: number, z: number) => number;
  private revisionValue = 0;
  private sequence = 0;
  /** This client's edits not yet echoed back, oldest first, per `chunkKey|voxelKey`. */
  private readonly pendingEdits = new Map<string, PendingVoxelEdit[]>();

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
    this.voxelIndex = config.voxelIndex ?? voxelIndex;

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
        if (!this.takeEcho(chunk, notification)) return;
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

  /**
   * The voxel type at a within-chunk coordinate: the overlay's when it holds that voxel, else the
   * dense grid's (0 when unknown, or for a position outside the grid with no overlay entry).
   */
  voxelTypeAt(coord: ChunkCoord, x: number, y: number, z: number): number {
    const chunk = this.chunks.get(chunkKey(coord));
    if (!chunk) return 0;
    const wide = chunk.overlay.get(voxelKey(x, y, z));
    if (wide) return wide.voxelType;
    if (!inDenseGrid(x, y, z)) return 0;
    return chunk.voxels?.[this.voxelIndex(x, y, z)] ?? 0;
  }

  /** The typed per-voxel state at a within-chunk coordinate (the overlay's first), if any. */
  voxelStateAt(
    coord: ChunkCoord,
    x: number,
    y: number,
    z: number,
  ): TVoxelState | undefined {
    const chunk = this.chunks.get(chunkKey(coord));
    if (!chunk) return undefined;
    const wide = chunk.overlay.get(voxelKey(x, y, z));
    if (wide) return wide.state;
    if (!inDenseGrid(x, y, z)) return undefined;
    return chunk.voxelStates.get(this.voxelIndex(x, y, z));
  }

  /** Subscribe to per-chunk changes (loads, merges, edits). @returns off. */
  onChunkChanged(
    listener: (chunk: CachedChunk<TVoxelState, TChunkState>) => void,
  ): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Subscribe to write-backs the store gave up on: refused by the server (a visitor
   * editing someone else's claimed plot or a safe zone, a closed wilderness) or out of
   * attempts. Undo or flag the local edit here; the store does not revert it.
   * @returns off.
   */
  onWriteBackFailed(
    listener: (failure: ChunkWriteBackFailure<TVoxelState, TChunkState>) => void,
  ): () => void {
    this.writeBackFailureListeners.add(listener);
    return () => this.writeBackFailureListeners.delete(listener);
  }

  /**
   * Ensure every chunk within `radius` (Chebyshev, 1-8) of `center` is
   * tracked: bulk-loads untracked ones, hydrates sparse voxel states when
   * configured, marks server-unknown chunks `missing`, and seeds them via
   * `onMissing`. In-flight requests are deduped; safe to call every time the
   * player crosses a chunk boundary.
   *
   * A chunk already loaded keeps what the store holds for it when a later
   * bulk load returns it again: its stored `voxels` carry none of the edits
   * hydration and realtime merges applied. Prune it to load it afresh.
   *
   * Requests the platform refuses as busy are asked again with backoff, and
   * at most 8 hydrations run at once. Hydration is best effort: a chunk whose
   * states could not be fetched keeps the voxels the bulk load gave it
   * (`hydrated` stays false) and is hydrated on a later call. A chunk whose
   * bulk load failed is `failed` and is requested again by a later call. The
   * promise rejects only when the bulk load itself fails.
   */
  async ensureAround(center: ChunkCoord, radius: number): Promise<void> {
    const around = chunksAround(center, radius);
    const wanted = around.filter((coord) => {
      const key = chunkKey(coord);
      if (this.inFlight.has(key)) return false;
      const chunk = this.chunks.get(key);
      return !chunk || chunk.loadState === 'failed';
    });
    const returned = new Set<string>();
    if (wanted.length > 0) {
      for (const coord of wanted) this.inFlight.add(chunkKey(coord));
      try {
        const response = await whenNotBusy(() =>
          this.ctx.client.chunks.byDistance({
            appId: this.ctx.appId,
            centerCoordinate: toChunkInput(center),
            maxDistance: Math.max(1, Math.min(8, radius)),
            limit: (2 * radius + 1) ** 3,
          }),
        );
        for (const chunk of response.chunks) {
          const coord = fromChunkInput(chunk.coordinates);
          const key = chunkKey(coord);
          // The cube around a new center includes chunks loaded from an earlier one.
          if (this.chunks.get(key)?.loadState === 'loaded') continue;
          returned.add(key);
          this.applyServerChunk(coord, chunk.voxels ?? null, chunk.chunkState ?? null);
        }
        // Requested-but-absent chunks have never been stored server-side.
        for (const coord of wanted) {
          if (returned.has(chunkKey(coord))) continue;
          this.markMissing(coord);
        }
      } catch (error) {
        for (const coord of wanted) {
          const key = chunkKey(coord);
          const chunk = this.chunks.get(key);
          if (!chunk || chunk.loadState === 'failed') {
            const entry = this.ensureEntry(coord);
            entry.loadState = 'failed';
            this.touch(entry);
          }
        }
        throw error;
      } finally {
        for (const coord of wanted) this.inFlight.delete(chunkKey(coord));
      }
    }
    if (this.hydrateStates) {
      // What the bulk load just returned, and what an earlier call failed to hydrate.
      // Chunks seeded here and written back are the server's copy already.
      await this.hydrateAll(
        around.filter((coord) => {
          const key = chunkKey(coord);
          const chunk = this.chunks.get(key);
          const failures = this.hydrateFailures.get(key) ?? 0;
          return (
            chunk?.loadState === 'loaded' &&
            !chunk.hydrated &&
            !this.hydrating.has(key) &&
            (returned.has(key) || (failures > 0 && failures < HYDRATE_GIVE_UP))
          );
        }),
      );
    }
  }

  /** Hydrates chunks with at most {@link HYDRATE_CONCURRENCY} requests in flight. */
  private async hydrateAll(coords: ChunkCoord[]): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < coords.length) {
        const coord = coords[next++];
        const key = chunkKey(coord);
        this.hydrating.add(key);
        try {
          await whenNotBusy(() => this.hydrate(coord));
          this.hydrateFailures.delete(key);
        } catch {
          this.hydrateFailures.set(key, (this.hydrateFailures.get(key) ?? 0) + 1);
        } finally {
          this.hydrating.delete(key);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(HYDRATE_CONCURRENCY, coords.length) }, worker));
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
      const { x, y, z } = entry.voxelCoord;
      if (!fitsDenseGrid(x, y, z, entry.voxelType)) {
        const key = voxelKey(x, y, z);
        let state = entry.state ? chunk.overlay.get(key)?.state : undefined;
        if (entry.state) {
          try {
            state = this.voxelStateCodec.decode(entry.state);
          } catch {
            // As below: a foreign blob keeps the state already cached.
          }
        }
        this.putOverlay(chunk, x, y, z, entry.voxelType, state);
        continue;
      }
      const index = this.voxelIndex(x, y, z);
      chunk.overlay.delete(voxelKey(x, y, z));
      // A chunk stored with `voxels: null` still carries its recorded edits.
      if (!chunk.voxels) chunk.voxels = new Uint8Array(CHUNK_VOLUME);
      chunk.voxels[index] = entry.voxelType;
      if (entry.state) {
        try {
          chunk.voxelStates.set(index, this.voxelStateCodec.decode(entry.state));
        } catch {
          // Foreign/legacy blobs skip silently; the dense type still applied.
        }
      } else {
        chunk.voxelStates.delete(index);
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
    const encodedState =
      input.state !== undefined ? this.voxelStateCodec.encode(input.state) : undefined;
    const voxel = { x: input.x, y: input.y, z: input.z };
    assertVoxelEdit({ voxel, voxelType: input.voxelType, voxelState: encodedState });
    const chunk = this.ensureEntry(input.chunk);
    const optimistic = input.optimistic ?? true;
    if (optimistic) {
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
    const uuid = this.senderUuid();
    this.rememberEdit(chunk, voxel, {
      uuid,
      sequenceNumber,
      voxelType: input.voxelType,
      encodedState,
      sentAt: this.now(),
      stale: !optimistic,
    });
    this.ctx.trackSend({
      kind: 'voxelUpdate',
      sequenceNumber,
      sentAt: this.now(),
      uuid,
      detail: { chunk: input.chunk, x: input.x, y: input.y, z: input.z },
    });
    // Omit voxelState when the caller did not supply state. Sending '' is
    // refused by game-api while VoxelUpdateRequestInput.voxelState is String!;
    // the sibling schema change makes the field nullable, and omitting it is
    // the SDK contract either way.
    return this.ctx.client.udp.sendVoxelUpdate({
      appId: this.ctx.appId,
      chunk: toChunkInput(input.chunk),
      uuid,
      voxel,
      voxelType: input.voxelType,
      ...(encodedState !== undefined ? { voxelState: encodedState } : {}),
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

  /**
   * Persist every queued chunk now, waiting out the backoff of chunks whose last attempt
   * failed. Resolves with the write-backs dropped along the way (also reported through
   * {@link onWriteBackFailed}); it does not reject for them.
   */
  async flush(): Promise<Array<ChunkWriteBackFailure<TVoxelState, TChunkState>>> {
    const failures: Array<ChunkWriteBackFailure<TVoxelState, TChunkState>> = [];
    while (this.writeBackQueue.length > 0) {
      const dueAt = this.writeBackDueAt.get(this.writeBackQueue[0]);
      const wait = dueAt === undefined ? 0 : dueAt - this.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const failure = await this.persistNext(true);
      if (failure) failures.push(failure);
    }
    return failures;
  }

  /** Drop tracked chunks farther than `radius` from `center` (dirty ones kept). */
  pruneBeyond(center: ChunkCoord, radius: number): void {
    for (const [key, chunk] of this.chunks) {
      if (chunk.dirty) continue;
      if (chunkDistance(chunk.coord, center) > radius) {
        this.chunks.delete(key);
        this.hydrateFailures.delete(key);
        this.revisionValue += 1;
      }
    }
  }

  // -- internals --------------------------------------------------------------

  /**
   * Write back the first queued chunk that is due (the head of the queue when `now`).
   * @returns the failure when the store gave up on it.
   */
  private async persistNext(
    now = false,
  ): Promise<ChunkWriteBackFailure<TVoxelState, TChunkState> | undefined> {
    const at = this.now();
    const index = now
      ? 0
      : this.writeBackQueue.findIndex((queued) => (this.writeBackDueAt.get(queued) ?? 0) <= at);
    if (index < 0 || index >= this.writeBackQueue.length) return undefined;
    const [key] = this.writeBackQueue.splice(index, 1);
    const chunk = this.chunks.get(key);
    if (!chunk || !chunk.voxels) {
      this.forgetWriteBack(key);
      return undefined;
    }
    try {
      await this.ctx.client.chunks.update({
        appId: this.ctx.appId,
        coordinates: toChunkInput(chunk.coord),
        voxels: encodeBase64(chunk.voxels),
      });
      this.forgetWriteBack(key);
      chunk.dirty = false;
      if (chunk.loadState === 'seeded') chunk.loadState = 'loaded';
      this.touch(chunk);
      return undefined;
    } catch (error) {
      const attempts = (this.writeBackAttempts.get(key) ?? 0) + 1;
      const retryable = writeBackRetryable(error);
      if (retryable && attempts < WRITE_BACK_ATTEMPTS) {
        this.writeBackAttempts.set(key, attempts);
        this.writeBackDueAt.set(key, this.now() + WRITE_BACK_BACKOFF_MS * 2 ** (attempts - 1));
        chunk.dirty = true;
        if (!this.writeBackQueue.includes(key)) this.writeBackQueue.push(key);
        return undefined;
      }
      this.forgetWriteBack(key);
      const queuedAgain = this.writeBackQueue.indexOf(key);
      if (queuedAgain >= 0) this.writeBackQueue.splice(queuedAgain, 1);
      chunk.dirty = false;
      const failure: ChunkWriteBackFailure<TVoxelState, TChunkState> = {
        chunk,
        coord: chunk.coord,
        error,
        reason: retryable ? 'exhausted' : 'refused',
        attempts,
      };
      for (const listener of [...this.writeBackFailureListeners]) listener(failure);
      return failure;
    }
  }

  private forgetWriteBack(key: string): void {
    this.writeBackAttempts.delete(key);
    this.writeBackDueAt.delete(key);
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
    if (generated instanceof Uint8Array) {
      this.seed(coord, generated);
    } else if (generated) {
      this.seed(coord, generated.voxels, { writeBack: generated.writeBack ?? true });
    }
  }

  private rememberEdit(
    chunk: CachedChunk<TVoxelState, TChunkState>,
    voxel: { x: number; y: number; z: number },
    edit: PendingVoxelEdit,
  ): void {
    const key = `${chunk.key}|${voxelKey(voxel.x, voxel.y, voxel.z)}`;
    const edits = this.livePendingEdits(key);
    edits.push(edit);
    this.pendingEdits.set(key, edits);
  }

  /** The unexpired pending edits for one voxel, dropping the expired ones. */
  private livePendingEdits(key: string): PendingVoxelEdit[] {
    const cutoff = this.now() - PENDING_EDIT_TTL_MS;
    const edits = (this.pendingEdits.get(key) ?? []).filter((edit) => edit.sentAt >= cutoff);
    if (edits.length === 0) this.pendingEdits.delete(key);
    else this.pendingEdits.set(key, edits);
    return edits;
  }

  /**
   * Match a realtime voxel edit against this client's pending edits. Returns whether to apply it.
   * The server delivers every accepted edit back to its sender: the echo of an edit already
   * applied optimistically is not applied again (no second change event), and an echo is never
   * applied over a newer local edit of the same voxel. Another client's edit is applied, and
   * marks the pending local edits of that voxel stale so their echoes restore them.
   */
  private takeEcho(
    chunk: CachedChunk<TVoxelState, TChunkState>,
    notification: { uuid: string; sequenceNumber: number; voxelX: number; voxelY: number; voxelZ: number },
  ): boolean {
    const key = `${chunk.key}|${voxelKey(notification.voxelX, notification.voxelY, notification.voxelZ)}`;
    const edits = this.livePendingEdits(key);
    if (edits.length === 0) return true;
    const index = edits.findIndex(
      (edit) =>
        edit.uuid === notification.uuid && edit.sequenceNumber === notification.sequenceNumber,
    );
    if (index < 0) {
      for (const edit of edits) edit.stale = true;
      return true;
    }
    const [echoed] = edits.splice(index, 1);
    if (edits.length === 0) this.pendingEdits.delete(key);
    const newerLocalEdit = edits.length > index;
    return echoed.stale && !newerLocalEdit;
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
    let state = decodedState;
    if (state === undefined && encodedState) {
      try {
        state = this.voxelStateCodec.decode(encodedState);
      } catch {
        state = undefined;
      }
    }
    if (!fitsDenseGrid(x, y, z, voxelType)) {
      this.putOverlay(chunk, x, y, z, voxelType, state);
      this.touch(chunk);
      return;
    }
    chunk.overlay.delete(voxelKey(x, y, z));
    if (!chunk.voxels) chunk.voxels = new Uint8Array(CHUNK_VOLUME);
    const index = this.voxelIndex(x, y, z);
    chunk.voxels[index] = voxelType;
    if (state !== undefined) {
      chunk.voxelStates.set(index, state);
    } else {
      chunk.voxelStates.delete(index);
    }
    this.touch(chunk);
  }

  /**
   * Keep a voxel the dense grid cannot hold in the overlay. An in-grid position with a wide type
   * leaves 0 in the grid and no dense state; one outside the grid never touches the grid.
   */
  private putOverlay(
    chunk: CachedChunk<TVoxelState, TChunkState>,
    x: number,
    y: number,
    z: number,
    voxelType: number,
    state: TVoxelState | undefined,
  ): void {
    if (inDenseGrid(x, y, z)) {
      if (!chunk.voxels) chunk.voxels = new Uint8Array(CHUNK_VOLUME);
      const index = this.voxelIndex(x, y, z);
      chunk.voxels[index] = 0;
      chunk.voxelStates.delete(index);
    }
    chunk.overlay.set(voxelKey(x, y, z), {
      x,
      y,
      z,
      voxelType,
      ...(state !== undefined ? { state } : {}),
    });
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
        overlay: new Map(),
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
