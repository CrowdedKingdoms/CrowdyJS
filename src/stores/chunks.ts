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

/** How long a sent voxel edit waits for its echo before it is undone and reported. */
const EDIT_TIMEOUT_MS = 10_000;
/**
 * Edits sent and not yet echoed, refused or timed out. The sequence number that matches an echo
 * or a refusal to its edit is one byte, so at most half its values are in use at once.
 */
const MAX_EDITS_IN_FLIGHT = 128;
/** Voxel edits sent per second by default: half of the 500 messages a second the server takes from one session. */
const EDITS_PER_SECOND = 250;
/** Chunks one region read asks for per page. */
const PAGE_SIZE = 1000;
/** The largest box a region read covers (17³, the cube `maxDistance` 8 reads). */
const MAX_BOX_CHUNKS = 17 ** 3;
/** A load needing more boxes than this reads their bounding box instead. */
const MAX_BOXES = 8;
/** How far before the connection dropped a catch-up read starts, for the client's and server's clocks. */
const CATCH_UP_MARGIN_MS = 30_000;

/** A voxel's content before an edit was applied, put back when the edit is refused. */
interface VoxelContent<TVoxelState> {
  voxelType: number;
  state?: TVoxelState;
}

/**
 * A voxel edit this client made that the server has not echoed yet: queued, then sent. `stale` is
 * set when another client's edit of the same voxel arrived (or the edit was not applied locally),
 * so its echo must be applied: the server ordered it last.
 */
interface PendingVoxelEdit<TVoxelState> {
  coord: ChunkCoord;
  voxel: { x: number; y: number; z: number };
  /** The sender uuid and sequence number it went out with; empty and -1 while queued. */
  uuid: string;
  sequenceNumber: number;
  voxelType: number;
  encodedState?: string;
  state?: TVoxelState;
  /** When it was sent; undefined while it waits in the send queue. */
  sentAt?: number;
  stale: boolean;
  optimistic: boolean;
  /** What the voxel held before this edit, for an undo. */
  previous: VoxelContent<TVoxelState>;
}

/** An edit waiting for its turn to be sent. */
interface QueuedVoxelSend<TVoxelState> {
  key: string;
  edit: PendingVoxelEdit<TVoxelState>;
  resolve: (sent: boolean) => void;
  reject: (error: unknown) => void;
}

/** A box of chunks, both corners inclusive. */
interface ChunkBox {
  lo: ChunkCoord;
  hi: ChunkCoord;
}

function boxAround(coords: readonly ChunkCoord[]): ChunkBox {
  const lo = { ...coords[0] };
  const hi = { ...coords[0] };
  for (const c of coords) {
    lo.x = Math.min(lo.x, c.x);
    lo.y = Math.min(lo.y, c.y);
    lo.z = Math.min(lo.z, c.z);
    hi.x = Math.max(hi.x, c.x);
    hi.y = Math.max(hi.y, c.y);
    hi.z = Math.max(hi.z, c.z);
  }
  return { lo, hi };
}

/** A stored row's `updatedAt` (an ISO time, or epoch ms) as epoch ms; null when absent or unreadable. */
function storedAtMs(updatedAt: unknown): number | null {
  if (updatedAt == null || updatedAt === '') return null;
  const ms = typeof updatedAt === 'number' ? updatedAt : Date.parse(String(updatedAt));
  return Number.isFinite(ms) ? ms : null;
}

function boxVolume(box: ChunkBox): number {
  return (box.hi.x - box.lo.x + 1) * (box.hi.y - box.lo.y + 1) * (box.hi.z - box.lo.z + 1);
}

function inBox(box: ChunkBox, c: ChunkCoord): boolean {
  return (
    c.x >= box.lo.x && c.x <= box.hi.x &&
    c.y >= box.lo.y && c.y <= box.hi.y &&
    c.z >= box.lo.z && c.z <= box.hi.z
  );
}

/**
 * Boxes covering `coords`, each at most twice as large as the chunks it holds, found by cutting
 * where the two halves' boxes are smallest. The chunks a step uncovers are one slab per axis
 * moved, so a step is one box per slab. A scattered set needing more than {@link MAX_BOXES} is
 * read as its bounding box.
 */
function coverWithBoxes(coords: readonly ChunkCoord[]): ChunkBox[] {
  const boxes: ChunkBox[] = [];
  const split = (set: readonly ChunkCoord[]): boolean => {
    if (set.length === 0) return true;
    const box = boxAround(set);
    const volume = boxVolume(box);
    if (volume <= MAX_BOX_CHUNKS && volume <= set.length * 2) {
      boxes.push(box);
      return boxes.length <= MAX_BOXES;
    }
    let best: { axis: 'x' | 'y' | 'z'; cut: number; cost: number } | null = null;
    for (const axis of ['x', 'y', 'z'] as const) {
      for (let cut = box.lo[axis]; cut < box.hi[axis]; cut++) {
        const low = set.filter((c) => c[axis] <= cut);
        const high = set.filter((c) => c[axis] > cut);
        if (low.length === 0 || high.length === 0) continue;
        const cost = boxVolume(boxAround(low)) + boxVolume(boxAround(high));
        if (!best || cost < best.cost) best = { axis, cut, cost };
      }
    }
    if (!best) {
      boxes.push(box);
      return boxes.length <= MAX_BOXES;
    }
    const { axis, cut } = best;
    return (
      split(set.filter((c) => c[axis] <= cut)) && split(set.filter((c) => c[axis] > cut))
    );
  };
  if (split(coords)) return boxes;
  // Too scattered for a few boxes: one read of the bounding box (an area is at most 17³).
  return [boxAround(coords)];
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
  /**
   * Whether the last hydration got only part of the chunk's recorded edits (the server returns at
   * most 262,144 per request): the rest are missing from `voxels` and `voxelStates`.
   */
  voxelStatesTruncated: boolean;
  /** When the server last wrote the chunk's stored row (epoch ms), from the last read of it; null when unknown. */
  storedAt: number | null;
  /** Whether local edits are queued for write-back. */
  dirty: boolean;
}

/**
 * A voxel edit the store undid: the server refused it, it could not be sent, or no echo came back
 * in time. See {@link ChunkStore.onEditRefused}.
 */
export interface VoxelEditRefusal<TVoxelState = string> {
  readonly coord: ChunkCoord;
  /** The within-chunk voxel. */
  readonly voxel: { readonly x: number; readonly y: number; readonly z: number };
  /** The type the edit set. */
  readonly voxelType: number;
  /** The state the edit set, when it had one. */
  readonly state?: TVoxelState;
  /**
   * The server's `UdpErrorCode` for a refusal (`UNAUTHORIZED` for a voxel the player may not edit),
   * `NOT_SENT` when the transport did not take it, `SEND_FAILED` when the send threw, or `TIMEOUT`
   * when no echo came back within {@link ChunkStoreConfig.editTimeoutMs}. A timed-out edit may
   * have been applied with its echo lost: a store that hydrates reads the chunk again.
   */
  readonly reason: string;
  /**
   * Whether the store put the voxel back as it was before the edit. It does not when a newer edit
   * of the voxel (this client's or another's) is what the voxel shows, or the edit was sent with
   * `optimistic: false`.
   */
  readonly restored: boolean;
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
  /**
   * Edits sent and not yet answered (echoed, refused or timed out), 1-128. Further edits wait in
   * order. Defaults to 128: the sequence number that matches an answer to its edit is one byte.
   */
  maxEditsInFlight?: number;
  /**
   * Voxel edits sent per second at most; a quarter second's worth may go at once. Defaults to 250,
   * half of the 500 messages a second the server takes from one session (it drops the rest
   * without a word), leaving the other half to actor updates and messages.
   */
  maxEditsPerSecond?: number;
  /**
   * How long a sent edit waits for its echo before the store undoes it and reports `TIMEOUT`.
   * Defaults to 10 000 ms.
   */
  editTimeoutMs?: number;
  /**
   * Read a tracked chunk again when the server reports it was replaced as a whole (`chunkChanged`:
   * a hub's or mod's `world.set_chunk`). The server's copy also replaces a seeded chunk's queued
   * write-back. Defaults to true.
   */
  reloadReplacedChunks?: boolean;
  /**
   * When the realtime connection comes back, read what changed in the last area
   * {@link ChunkStore.ensureAround} loaded while it was down (see {@link ChunkStore.catchUp}).
   * Needs the client's `realtime` (a `CrowdyClient` has it). Defaults to true.
   */
  catchUpOnReconnect?: boolean;
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
 * - `ensureAround(center, radius)` reads only the chunks it does not hold yet,
 *   as boxes (`chunks.byDistance` with `lowChunk`/`highChunk`, paged): a step
 *   reads the slab it uncovers. It hydrates sparse voxel states, marks chunks
 *   the server never stored as `missing`, and hands them to your `onMissing`
 *   worldgen hook.
 * - Realtime `voxelUpdate` notifications merge into the cache automatically
 *   (dense grid write + typed state decode + revision bump + change event; an
 *   edit with a type outside 0-255 or a position outside 0-15 goes to the
 *   chunk's `overlay` instead). A `chunkChanged` (a hub's or mod's
 *   `world.set_chunk`) reads the chunk again.
 * - `setVoxel` applies locally (optimistic) and replicates via the UDP path,
 *   paced: at most 128 edits unanswered and 250 a second by default. The
 *   server delivers every accepted edit back to its sender: that echo is
 *   matched (sender uuid + sequence number + voxel) and not applied again, so a
 *   local edit fires one change event, and an older echo never rolls back a
 *   newer local edit. It is applied only when another client's edit of that
 *   voxel arrived in between (the server ordered yours last) or the edit was
 *   sent with `optimistic: false`. An edit the server refuses, or whose echo
 *   does not come back in time, is undone and reported ({@link onEditRefused}).
 * - After the realtime connection drops and comes back, it reads what changed
 *   in the area meanwhile ({@link catchUp}).
 * - `seed`/`flush` implement deterministic-worldgen write-back through
 *   `chunks.update`, one throttled chunk at a time. Only seeded chunks are
 *   written back: realtime edits are recorded by the server.
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
  private readonly editRefusedListeners = new Set<
    (refusal: VoxelEditRefusal<TVoxelState>) => void
  >();
  private readonly voxelStateCodec: StateCodec<TVoxelState>;
  private readonly chunkStateCodec: StateCodec<TChunkState>;
  private readonly hydrateStates: boolean;
  private readonly now: () => number;
  private readonly fallbackUuid = generateCrowdyUuid();
  private readonly voxelIndex: (x: number, y: number, z: number) => number;
  private readonly maxInFlight: number;
  private readonly editsPerSecond: number;
  private readonly sendBurst: number;
  private readonly editTimeoutMs: number;
  private revisionValue = 0;
  private sequence = 0;
  /** This client's edits not yet echoed back, oldest first, per `chunkKey|voxelKey`. */
  private readonly pendingEdits = new Map<string, Array<PendingVoxelEdit<TVoxelState>>>();
  /** Edits waiting to be sent, in order. */
  private readonly sendQueue: Array<QueuedVoxelSend<TVoxelState>> = [];
  /** Sent edits not yet answered, by sequence number. */
  private readonly inFlightEdits = new Map<
    number,
    { key: string; edit: PendingVoxelEdit<TVoxelState> }
  >();
  private sendTokens: number;
  private tokensAt: number;
  /** Chunks being read again; a key mapped to true is read once more when that read ends. */
  private readonly reloading = new Map<string, boolean>();
  /** The area the last {@link ensureAround} covered, for a catch-up. */
  private lastArea: { center: ChunkCoord; radius: number } | null = null;
  /** When the realtime connection was last lost (while the store had loaded an area). */
  private disconnectedAt: number | null = null;
  private wasConnected = false;
  private disposed = false;

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
    this.maxInFlight = Math.max(
      1,
      Math.min(MAX_EDITS_IN_FLIGHT, Math.floor(config.maxEditsInFlight ?? MAX_EDITS_IN_FLIGHT)),
    );
    this.editsPerSecond = Math.max(1, config.maxEditsPerSecond ?? EDITS_PER_SECOND);
    this.sendBurst = Math.max(1, Math.ceil(this.editsPerSecond / 4));
    this.sendTokens = this.sendBurst;
    this.tokensAt = this.now();
    this.editTimeoutMs = Math.max(1, config.editTimeoutMs ?? EDIT_TIMEOUT_MS);

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

    // A refusal names the sequence number of the send it answers.
    ctx.onDispose(
      ctx.on('genericError', (notification) => {
        const entry = this.inFlightEdits.get(notification.sequenceNumber);
        if (entry) this.undoEdit(entry.key, entry.edit, String(notification.errorCode));
      }),
    );

    if (config.reloadReplacedChunks ?? true) {
      ctx.onDispose(
        ctx.on('chunkChanged', (notification) => {
          const coord = {
            x: Number(notification.chunkX),
            y: Number(notification.chunkY),
            z: Number(notification.chunkZ),
          };
          const chunk = this.chunks.get(chunkKey(coord));
          if (!chunk) return;
          const updatedAt = Number(notification.updatedAtMs);
          if (chunk.storedAt !== null && updatedAt > 0 && chunk.storedAt >= updatedAt) return;
          // The server's copy is newer than a seed waiting to be written back over it.
          if (chunk.dirty) this.dropWriteBack(chunk);
          void this.reload(coord);
        }),
      );
    }

    if ((config.catchUpOnReconnect ?? true) && ctx.client.realtime) {
      ctx.onDispose(
        ctx.client.realtime.onStatus((status) => {
          if (status === 'connected') {
            const since = this.disconnectedAt;
            this.disconnectedAt = null;
            if (this.wasConnected && since !== null) {
              void this.catchUp(new Date(since - CATCH_UP_MARGIN_MS)).catch(() => {
                // Best effort: the next reconnect, or a reload, catches up instead.
              });
            }
            this.wasConnected = true;
          } else if (this.wasConnected && this.disconnectedAt === null) {
            this.disconnectedAt = this.now();
          }
        }),
      );
    }

    // Sends wait for their turn; answers that never come time out.
    ctx.onDispose(
      ctx.ticker.every(50, () => {
        this.expireEdits();
        this.pump();
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

    ctx.onDispose(() => {
      this.disposed = true;
      for (const send of this.sendQueue.splice(0)) send.resolve(false);
    });
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
   * Subscribe to the voxel edits the store undid: the server refused one (a voxel the player may
   * not edit is `UNAUTHORIZED`), the transport did not take it, or its echo did not come back
   * within {@link ChunkStoreConfig.editTimeoutMs}. The voxel already shows what it held before
   * (see {@link VoxelEditRefusal.restored}) when the listener runs. A refusal is matched to its
   * edit by the one-byte sequence number, which other stores' sends share, so it is best effort: an
   * edit undone for another send's refusal comes back with its echo. @returns off.
   */
  onEditRefused(listener: (refusal: VoxelEditRefusal<TVoxelState>) => void): () => void {
    this.editRefusedListeners.add(listener);
    return () => this.editRefusedListeners.delete(listener);
  }

  /** Edits sent and not yet echoed, refused or timed out. */
  get editsInFlight(): number {
    return this.inFlightEdits.size;
  }

  /** Edits waiting for their turn to be sent (see {@link ChunkStoreConfig.maxEditsPerSecond}). */
  get queuedEdits(): number {
    return this.sendQueue.length;
  }

  /**
   * Ensure every chunk within `radius` (Chebyshev, 0-8) of `center` is
   * tracked: reads the untracked ones, hydrates sparse voxel states when
   * configured, marks server-unknown chunks `missing`, and seeds them via
   * `onMissing`. In-flight requests are deduped; safe to call every time the
   * player crosses a chunk boundary.
   *
   * Only chunks the store does not hold are read, as boxes of chunks
   * (`chunks.byDistance` with `lowChunk` and `highChunk`, ck-api v2.67.0): a
   * step along one axis at range 8 reads the 289 chunks it uncovers, not 4,913.
   * Each box is read in pages, following the page size the server says it
   * applied; a chunk a later page repeats is counted in
   * {@link duplicatePageChunks} and not applied twice. A chunk the store
   * already holds keeps what it has: prune it to load it afresh.
   *
   * Requests the platform refuses as busy are asked again with backoff, and
   * at most 8 hydrations run at once. Hydration is best effort: a chunk whose
   * states could not be fetched keeps the voxels the bulk load gave it
   * (`hydrated` stays false) and is hydrated on a later call. A chunk whose
   * bulk load failed is `failed` and is requested again by a later call. The
   * promise rejects only when the bulk load itself fails.
   */
  async ensureAround(center: ChunkCoord, radius: number): Promise<void> {
    const range = Math.max(0, Math.min(8, Math.floor(radius)));
    this.lastArea = { center: { ...center }, radius: range };
    const around = chunksAround(center, range);
    const wanted = around.filter((coord) => {
      const key = chunkKey(coord);
      if (this.inFlight.has(key)) return false;
      const chunk = this.chunks.get(key);
      return !chunk || chunk.loadState === 'failed';
    });
    const returned = new Set<string>();
    if (wanted.length > 0) {
      const wantedKeys = new Set(wanted.map(chunkKey));
      for (const key of wantedKeys) this.inFlight.add(key);
      const pending = new Set(wantedKeys);
      try {
        for (const box of coverWithBoxes(wanted)) {
          await this.readBox(box, (coord, chunk) => {
            const key = chunkKey(coord);
            if (!wantedKeys.has(key)) return;
            // A chunk tracked meanwhile (an edit, a seed) keeps what it has.
            if (this.chunks.get(key)?.loadState === 'loaded' || this.chunks.get(key)?.dirty) return;
            returned.add(key);
            this.applyServerChunk(coord, chunk.voxels ?? null, chunk.chunkState ?? null, chunk.updatedAt);
          });
          // Requested-but-absent chunks have never been stored server-side.
          for (const coord of wanted) {
            const key = chunkKey(coord);
            if (!pending.has(key) || !inBox(box, coord)) continue;
            pending.delete(key);
            if (!returned.has(key)) this.markMissing(coord);
          }
        }
      } catch (error) {
        for (const coord of wanted) {
          if (!pending.has(chunkKey(coord))) continue;
          const chunk = this.chunks.get(chunkKey(coord));
          if (!chunk || chunk.loadState === 'failed' || chunk.loadState === 'loading') {
            const entry = this.ensureEntry(coord);
            entry.loadState = 'failed';
            this.touch(entry);
          }
        }
        throw error;
      } finally {
        for (const key of wantedKeys) this.inFlight.delete(key);
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

  /** Chunks a region read returned twice (on two of its pages); each was applied once. */
  get duplicatePageChunks(): number {
    return this.duplicatePageCount;
  }
  private duplicatePageCount = 0;

  /**
   * Read every stored chunk of a box, page by page, handing each to `take` once. A page shorter
   * than the size the server applied is the last.
   */
  private async readBox(
    box: ChunkBox,
    take: (
      coord: ChunkCoord,
      chunk: { voxels?: string | null; chunkState?: string | null; updatedAt?: unknown },
    ) => void,
    since?: Date,
  ): Promise<void> {
    const seen = new Set<string>();
    let skip = 0;
    for (;;) {
      const response = await whenNotBusy(() =>
        this.ctx.client.chunks.byDistance({
          appId: this.ctx.appId,
          lowChunk: toChunkInput(box.lo),
          highChunk: toChunkInput(box.hi),
          limit: PAGE_SIZE,
          skip,
          ...(since ? { since: since.toISOString() } : {}),
        }),
      );
      for (const chunk of response.chunks) {
        const coord = fromChunkInput(chunk.coordinates);
        const key = chunkKey(coord);
        if (seen.has(key)) {
          this.duplicatePageCount += 1;
          continue;
        }
        seen.add(key);
        take(coord, chunk);
      }
      const applied = response.limit ?? PAGE_SIZE;
      if (response.chunks.length < applied || applied <= 0) return;
      skip = (response.skip ?? skip) + applied;
    }
  }

  /**
   * Hydrate one chunk's sparse voxel states (and chunk state) via a
   * single-chunk fetch — bulk loads omit them. This client's edits the server has not echoed yet
   * stay over the stored copy, which may predate them.
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
    chunk.voxelStatesTruncated = full.voxelStatesTruncated === true;
    chunk.storedAt = storedAtMs(full.updatedAt);
    // The stored copy replaces what the store held for the chunk (a `world.set_chunk` drops the
    // chunk's older edits); a state blob this codec cannot read keeps the one cached before.
    const cachedStates = new Map(chunk.voxelStates);
    const cachedOverlay = new Map(chunk.overlay);
    chunk.voxelStates.clear();
    chunk.overlay.clear();
    for (const entry of full.voxelStates ?? []) {
      const { x, y, z } = entry.voxelCoord;
      if (!fitsDenseGrid(x, y, z, entry.voxelType)) {
        const key = voxelKey(x, y, z);
        let state = entry.state ? cachedOverlay.get(key)?.state : undefined;
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
      // A chunk stored with `voxels: null` still carries its recorded edits.
      if (!chunk.voxels) chunk.voxels = new Uint8Array(CHUNK_VOLUME);
      chunk.voxels[index] = entry.voxelType;
      if (entry.state) {
        try {
          chunk.voxelStates.set(index, this.voxelStateCodec.decode(entry.state));
        } catch {
          // Foreign/legacy blobs keep the state cached before; the dense type still applied.
          const cached = cachedStates.get(index);
          if (cached !== undefined) chunk.voxelStates.set(index, cached);
        }
      }
    }
    this.reapplyPendingEdits(chunk);
    chunk.loadState = 'loaded';
    chunk.hydrated = true;
    this.touch(chunk);
  }

  /**
   * Read the chunks in the last area {@link ensureAround} loaded that changed since `since`: the
   * recorded edits (`voxels.listByDistance`, when the client has `voxels`) are applied to the
   * chunks the store holds, and a chunk whose stored row was written since then
   * (`chunks.byDistance` with `since`: `updateChunk`, `world.set_chunk`) is read again. The store
   * calls it when the realtime connection comes back ({@link ChunkStoreConfig.catchUpOnReconnect}),
   * from 30 s before the connection dropped. Needs ck-api v2.67.0.
   */
  async catchUp(since: Date): Promise<void> {
    const area = this.lastArea;
    if (!area) return;
    const box: ChunkBox = {
      lo: { x: area.center.x - area.radius, y: area.center.y - area.radius, z: area.center.z - area.radius },
      hi: { x: area.center.x + area.radius, y: area.center.y + area.radius, z: area.center.z + area.radius },
    };
    const replaced: ChunkCoord[] = [];
    await this.readBox(
      box,
      (coord, stored) => {
        const chunk = this.chunks.get(chunkKey(coord));
        if (!chunk || chunk.dirty || chunk.loadState !== 'loaded') return;
        const at = storedAtMs(stored.updatedAt);
        if (at !== null && chunk.storedAt !== null && chunk.storedAt >= at) return;
        replaced.push(coord);
      },
      since,
    );
    const voxels = this.ctx.client.voxels;
    if (voxels) {
      for (let skip = 0; ; ) {
        const page = await whenNotBusy(() =>
          voxels.listByDistance({
            appId: this.ctx.appId,
            lowChunk: toChunkInput(box.lo),
            highChunk: toChunkInput(box.hi),
            since: since.toISOString(),
            limit: PAGE_SIZE,
            skip,
          }),
        );
        for (const group of page.chunks) {
          const chunk = this.chunks.get(chunkKey(fromChunkInput(group.coordinates)));
          if (!chunk || chunk.loadState !== 'loaded') continue;
          for (const edit of group.voxels) {
            const { x, y, z } = edit.location;
            // This client's own unanswered edit of the voxel settles with its echo.
            if (this.livePendingEdits(`${chunk.key}|${voxelKey(x, y, z)}`).length > 0) continue;
            this.applyVoxel(chunk, x, y, z, edit.voxelType, edit.state ?? undefined);
          }
        }
        const applied = page.limit ?? PAGE_SIZE;
        if (page.chunks.length < applied || applied <= 0) break;
        skip = (page.skip ?? skip) + applied;
      }
    }
    await Promise.all(replaced.map((coord) => this.reload(coord)));
  }

  /**
   * Edit one voxel: applies to the cache immediately (optimistic) and
   * replicates via the realtime voxel path. Sends are paced
   * ({@link ChunkStoreConfig.maxEditsInFlight},
   * {@link ChunkStoreConfig.maxEditsPerSecond}); the promise resolves with
   * the transport's acceptance once this edit's turn came. An edit the server
   * refuses, or whose echo does not come back in time, is undone and reported
   * through {@link onEditRefused}.
   */
  async setVoxel(input: SetVoxelInput<TVoxelState>): Promise<boolean> {
    const encodedState =
      input.state !== undefined ? this.voxelStateCodec.encode(input.state) : undefined;
    const voxel = { x: input.x, y: input.y, z: input.z };
    assertVoxelEdit({ voxel, voxelType: input.voxelType, voxelState: encodedState });
    if (this.disposed) return false;
    const chunk = this.ensureEntry(input.chunk);
    const optimistic = input.optimistic ?? true;
    const previous: VoxelContent<TVoxelState> = {
      voxelType: this.voxelTypeAt(input.chunk, input.x, input.y, input.z),
    };
    const previousState = this.voxelStateAt(input.chunk, input.x, input.y, input.z);
    if (previousState !== undefined) previous.state = previousState;
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
    const edit: PendingVoxelEdit<TVoxelState> = {
      coord: { ...input.chunk },
      voxel,
      uuid: '',
      sequenceNumber: -1,
      voxelType: input.voxelType,
      ...(encodedState !== undefined ? { encodedState } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      stale: !optimistic,
      optimistic,
      previous,
    };
    const key = this.rememberEdit(chunk, voxel, edit);
    return new Promise<boolean>((resolve, reject) => {
      this.sendQueue.push({ key, edit, resolve, reject });
      this.pump();
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

  /** Stop writing a chunk back: the server's copy replaced it. */
  private dropWriteBack(chunk: CachedChunk<TVoxelState, TChunkState>): void {
    const queued = this.writeBackQueue.indexOf(chunk.key);
    if (queued >= 0) this.writeBackQueue.splice(queued, 1);
    this.forgetWriteBack(chunk.key);
    chunk.dirty = false;
  }

  /**
   * Read a chunk again (a `chunkChanged`, a catch-up, an edit whose echo never came). A request for
   * a chunk already being read makes that read run once more when it ends, so the last answer is
   * the newest. Failures leave what the store holds, marked for the next hydration.
   */
  private async reload(coord: ChunkCoord): Promise<void> {
    const key = chunkKey(coord);
    if (this.reloading.has(key)) {
      this.reloading.set(key, true);
      return;
    }
    this.reloading.set(key, false);
    try {
      do {
        this.reloading.set(key, false);
        if (!this.chunks.has(key) || this.disposed) break;
        try {
          await whenNotBusy(() => this.hydrate(coord));
          this.hydrateFailures.delete(key);
        } catch {
          const chunk = this.chunks.get(key);
          if (chunk) chunk.hydrated = false;
          this.hydrateFailures.set(key, (this.hydrateFailures.get(key) ?? 0) + 1);
          break;
        }
      } while (this.reloading.get(key) === true);
    } finally {
      this.reloading.delete(key);
    }
  }

  private applyServerChunk(
    coord: ChunkCoord,
    voxels: string | null,
    chunkState: string | null,
    updatedAt?: unknown,
  ): void {
    const chunk = this.ensureEntry(coord);
    if (voxels != null) chunk.voxels = decodeBase64(voxels);
    chunk.chunkState = this.decodeChunkState(chunkState);
    chunk.storedAt = storedAtMs(updatedAt);
    this.reapplyPendingEdits(chunk);
    chunk.loadState = 'loaded';
    this.touch(chunk);
  }

  /**
   * Put this client's unanswered optimistic edits of a chunk back over a stored copy just applied,
   * which may predate them. What the copy holds for each such voxel becomes what an undo restores.
   */
  private reapplyPendingEdits(chunk: CachedChunk<TVoxelState, TChunkState>): void {
    const prefix = `${chunk.key}|`;
    for (const [key, edits] of this.pendingEdits) {
      if (!key.startsWith(prefix)) continue;
      const live = edits.filter((edit) => !edit.stale);
      if (live.length === 0) continue;
      const { x, y, z } = live[0].voxel;
      const stored: VoxelContent<TVoxelState> = {
        voxelType: this.voxelTypeAt(chunk.coord, x, y, z),
      };
      const storedState = this.voxelStateAt(chunk.coord, x, y, z);
      if (storedState !== undefined) stored.state = storedState;
      live[0].previous = stored;
      const newest = live[live.length - 1];
      if (!newest.optimistic) continue;
      this.writeVoxel(chunk, x, y, z, newest.voxelType, newest.state);
    }
  }

  /** Send queued edits while the pace and the in-flight limit allow. */
  private pump(): void {
    if (this.disposed) return;
    const at = this.now();
    this.sendTokens = Math.min(
      this.sendBurst,
      this.sendTokens + ((at - this.tokensAt) * this.editsPerSecond) / 1000,
    );
    this.tokensAt = at;
    while (
      this.sendQueue.length > 0 &&
      this.inFlightEdits.size < this.maxInFlight &&
      this.sendTokens >= 1
    ) {
      const send = this.sendQueue.shift()!;
      // An edit undone while it waited (a pruned chunk's) is not sent.
      if (!this.pendingEdits.get(send.key)?.includes(send.edit)) {
        send.resolve(false);
        continue;
      }
      this.sendTokens -= 1;
      this.transmit(send);
    }
  }

  private transmit(send: QueuedVoxelSend<TVoxelState>): void {
    const { edit, key } = send;
    let sequenceNumber = this.nextSequence();
    while (this.inFlightEdits.has(sequenceNumber)) sequenceNumber = this.nextSequence();
    const uuid = this.senderUuid();
    edit.uuid = uuid;
    edit.sequenceNumber = sequenceNumber;
    edit.sentAt = this.now();
    this.inFlightEdits.set(sequenceNumber, { key, edit });
    this.ctx.trackSend({
      kind: 'voxelUpdate',
      sequenceNumber,
      sentAt: edit.sentAt,
      uuid,
      detail: { chunk: edit.coord, x: edit.voxel.x, y: edit.voxel.y, z: edit.voxel.z },
    });
    // Omit voxelState when the caller did not supply state. Sending '' is
    // refused by game-api while VoxelUpdateRequestInput.voxelState is String!;
    // the sibling schema change makes the field nullable, and omitting it is
    // the SDK contract either way.
    let sent: Promise<boolean>;
    try {
      sent = this.ctx.client.udp.sendVoxelUpdate({
        appId: this.ctx.appId,
        chunk: toChunkInput(edit.coord),
        uuid,
        voxel: edit.voxel,
        voxelType: edit.voxelType,
        ...(edit.encodedState !== undefined ? { voxelState: edit.encodedState } : {}),
        sequenceNumber,
        ...(this.config.distance !== undefined ? { distance: this.config.distance } : {}),
        ...(this.config.decayRate !== undefined
          ? { decayRate: this.config.decayRate }
          : {}),
      });
    } catch (error) {
      sent = Promise.reject(error);
    }
    sent.then(
      (accepted) => {
        if (!accepted) this.undoEdit(key, edit, 'NOT_SENT');
        send.resolve(accepted);
      },
      (error: unknown) => {
        this.undoEdit(key, edit, 'SEND_FAILED');
        send.reject(error);
      },
    );
  }

  /** Undo and report the sent edits whose echo did not come back in time. */
  private expireEdits(): void {
    const cutoff = this.now() - this.editTimeoutMs;
    for (const { key, edit } of [...this.inFlightEdits.values()]) {
      if (edit.sentAt !== undefined && edit.sentAt < cutoff) this.undoEdit(key, edit, 'TIMEOUT');
    }
  }

  /**
   * Forget an edit the server will not apply and put its voxel back as it was before it, unless a
   * newer edit is what the voxel shows. Reports it, then lets the next queued edit go.
   */
  private undoEdit(key: string, edit: PendingVoxelEdit<TVoxelState>, reason: string): void {
    const edits = this.pendingEdits.get(key);
    const index = edits?.indexOf(edit) ?? -1;
    if (!edits || index < 0) return;
    edits.splice(index, 1);
    if (edits.length === 0) this.pendingEdits.delete(key);
    if (this.inFlightEdits.get(edit.sequenceNumber)?.edit === edit) {
      this.inFlightEdits.delete(edit.sequenceNumber);
    }
    let restored = false;
    const chunk = this.chunks.get(chunkKey(edit.coord));
    if (chunk && edit.optimistic && !edit.stale) {
      const next = edits[index];
      if (next) {
        // A newer edit of this voxel shows; it now undoes to what this one replaced.
        if (!next.stale) next.previous = edit.previous;
      } else {
        const { x, y, z } = edit.voxel;
        this.applyVoxel(chunk, x, y, z, edit.previous.voxelType, undefined, edit.previous.state);
        restored = true;
      }
    }
    const refusal: VoxelEditRefusal<TVoxelState> = {
      coord: edit.coord,
      voxel: edit.voxel,
      voxelType: edit.voxelType,
      ...(edit.state !== undefined ? { state: edit.state } : {}),
      reason,
      restored,
    };
    for (const listener of [...this.editRefusedListeners]) {
      try {
        listener(refusal);
      } catch {
        // One listener's throw must not starve the others.
      }
    }
    // An edit may have been applied with its echo lost: the server's copy settles it.
    if (reason === 'TIMEOUT' && chunk && this.hydrateStates) void this.reload(edit.coord);
    this.pump();
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
    edit: PendingVoxelEdit<TVoxelState>,
  ): string {
    const key = `${chunk.key}|${voxelKey(voxel.x, voxel.y, voxel.z)}`;
    const edits = this.livePendingEdits(key);
    edits.push(edit);
    this.pendingEdits.set(key, edits);
    return key;
  }

  /** The pending edits for one voxel, oldest first, after undoing the ones that timed out. */
  private livePendingEdits(key: string): Array<PendingVoxelEdit<TVoxelState>> {
    this.expireEdits();
    return this.pendingEdits.get(key) ?? [];
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
        edit.sentAt !== undefined &&
        edit.uuid === notification.uuid &&
        edit.sequenceNumber === notification.sequenceNumber,
    );
    if (index < 0) {
      for (const edit of edits) edit.stale = true;
      return true;
    }
    const [echoed] = edits.splice(index, 1);
    if (edits.length === 0) this.pendingEdits.delete(key);
    if (this.inFlightEdits.get(echoed.sequenceNumber)?.edit === echoed) {
      this.inFlightEdits.delete(echoed.sequenceNumber);
      this.pump();
    }
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
    this.writeVoxel(chunk, x, y, z, voxelType, state);
    this.touch(chunk);
  }

  /** Set one voxel's type and state, in the dense grid or the overlay, without a change event. */
  private writeVoxel(
    chunk: CachedChunk<TVoxelState, TChunkState>,
    x: number,
    y: number,
    z: number,
    voxelType: number,
    state: TVoxelState | undefined,
  ): void {
    if (!fitsDenseGrid(x, y, z, voxelType)) {
      this.putOverlay(chunk, x, y, z, voxelType, state);
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
        voxelStatesTruncated: false,
        storedAt: null,
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
