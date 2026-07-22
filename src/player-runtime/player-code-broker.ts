import {
  GLUE_HOST_CALL_TIMEOUT_MS,
  SAB_HEADER_BYTES,
  wrapGlueSab,
  writeGlueResult,
} from './glue-sab.js';

export interface PlayerCodeGridBounds {
  low: { x: bigint; y: bigint; z: bigint };
  high: { x: bigint; y: bigint; z: bigint };
}

export interface PlayerCodeHostCall {
  fn: string;
  args: Record<string, unknown>;
}

export interface PlayerCodeWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  terminate(): void;
}

/**
 * A HUD/overlay presentation message the running mod asked the host game to
 * render. The broker forwards these to the game-declared channel; the mod
 * never touches the DOM (04 §4 presentation hooks).
 */
export interface PlayerCodePresentation {
  channel: 'hud' | 'overlay';
  payload: unknown;
}

export interface PlayerCodeBrokerOptions {
  /** Platform-owned glue worker URL; the worker never receives auth tokens. */
  workerUrl: string | URL;
  grid: PlayerCodeGridBounds;
  /**
   * Content hash of the platform-fetched artifact. When set, start() refuses
   * any artifact whose hash does not match — a side-loaded module cannot be
   * run (09 T7). Compute it from the same bytes the game-api served.
   */
  artifactHash?: string;
  /**
   * Informational server-authored fuel metadata. The browser does not enforce
   * this value; metering must be injected into the platform artifact.
   */
  fuelPerDispatch?: bigint;
  onHostCall: (call: PlayerCodeHostCall) => Promise<unknown>;
  /** Optional sink for HUD/overlay presentation the mod emits (BWF wires this). */
  onPresentation?: (presentation: PlayerCodePresentation) => void;
  /** Called when the local circuit breaker trips (repeated traps / rate abuse). */
  onCircuitOpen?: (reason: string) => void;
  workerFactory?: (url: string | URL) => PlayerCodeWorkerLike;
  /** Override the hash function for tests; defaults to SubtleCrypto SHA-256. */
  hashArtifact?: (artifact: ArrayBuffer) => Promise<string>;
  /** Wall-clock ms allowed per dispatch before the broker recycles the worker. */
  dispatchWatchdogMs?: number;
  /** Wall-clock ms allowed for worker creation + WASM instantiation. */
  startupWatchdogMs?: number;
  /** Wall-clock ms allowed while an async SDK host call is outstanding. */
  hostCallTimeoutMs?: number;
  /**
   * Local tick cadence (ms) for a client mod: the worker self-drives `tick`
   * at this interval. Omit/0 for invoke-only mods (no periodic tick). A HUD
   * mod typically ticks ~1 Hz; the per-dispatch watchdog still bounds each.
   */
  tickIntervalMs?: number;
}

/**
 * Deny-by-default host-call allowlist, grouped by capability (04 §4). Only
 * owner-lawful reads and effects cross the bridge; auth, admin, authoring,
 * grid mutation, raw UDP pose, voice, teams, and any network fetch are
 * absent by construction, not by a denylist.
 */
const ALLOWED_HOST_CALLS: Record<string, ReadonlySet<string>> = {
  model: new Set([
    'container_create',
    'container_get',
    'containers_list',
    'container_delete',
    'property_set',
    'model_invoke',
  ]),
  state: new Set([
    'user_state_get',
    'user_state_set',
    'grid_state_get',
    'grid_state_set',
  ]),
  world_read: new Set([
    'chunk_get',
    'voxels_list',
    'actors_list',
    'actors_list_radius',
  ]),
  world_write: new Set(['voxel_set']),
  egress: new Set(['emit_spatial']),
  present: new Set(['hud_set', 'overlay_draw']),
  // grid_info is answered by the broker itself (the mod's own clamped bounds),
  // so a client mod can address its grid without a server round-trip.
  meta: new Set(['grid_permission_check', 'grid_info']),
};

/** Per-call-family rate caps (calls per rolling second); flood one, others hold. */
const RATE_CAPS: Record<string, number> = {
  model: 100,
  state: 100,
  world_read: 400,
  world_write: 200,
  egress: 60,
  present: 120,
  meta: 100,
};

const CHUNK_FUNCTIONS = new Set([
  'chunk_get',
  'voxels_list',
  'actors_list',
  'actors_list_radius',
]);

const PRESENTATION_FUNCTIONS = new Set(['hud_set', 'overlay_draw']);

const FN_TO_GROUP = new Map<string, string>();
for (const [group, fns] of Object.entries(ALLOWED_HOST_CALLS)) {
  for (const fn of fns) FN_TO_GROUP.set(fn, group);
}

const RATE_WINDOW_MS = 1000;
const CIRCUIT_TRIP_THRESHOLD = 5;
const GLOBAL_HOST_CALL_CAP = 1000;
const MAX_HOST_CALL_FN_BYTES = 128;
const MAX_HOST_CALL_ARGS_BYTES = 256 * 1024;
const HOST_CALL_ENVELOPE_KEYS = new Set([
  'type',
  'id',
  'fn',
  'args',
  'reply',
]);
const FORBIDDEN_BINDING_KEYS = new Set([
  'authority',
  'bindingKind',
  'binding_kind',
]);
const utf8Encoder = new TextEncoder();

/**
 * Page-side security broker for browser-target player WASM (production shape,
 * player compute P3).
 *
 * The untrusted glue worker runs the player module; the broker is the trusted
 * boundary on the page:
 *  - artifact bytes come only from the platform (hash-verified; side-load
 *    refused),
 *  - a deny-by-default, capability-grouped host-call allowlist crosses the
 *    bridge, each call re-validated (confused-deputy safe) and grid-AABB
 *    filtered on both reads and effects,
 *  - per-call-family rate caps bound a runaway mod,
 *  - a local circuit breaker + per-dispatch watchdog recover the page from a
 *    hung or abusive worker.
 *
 * Tokens, DOM, admin/authoring domains, and the network are never reachable
 * from the worker: the broker only ever calls the injected onHostCall (which
 * routes to the ordinary server-authorized SDK path) and the presentation
 * sink the host game opted into.
 */
export class PlayerCodeBroker {
  private worker: PlayerCodeWorkerLike | null = null;
  private workerListener:
    | ((event: MessageEvent<unknown>) => void)
    | null = null;
  private artifact: ArrayBuffer | null = null;
  private circuitOpen = false;
  private consecutiveTraps = 0;
  private hardTimeouts = 0;
  private readonly rateBuckets = new Map<string, number[]>();
  private globalCallBucket: number[] = [];
  private generation = 0;
  private lifecycleVersion = 0;
  private starting = false;
  private workerReady = false;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private dispatchTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDispatch:
    | { generation: number; id: number; kind: string }
    | null = null;

  constructor(private readonly options: PlayerCodeBrokerOptions) {}

  /**
   * Start the worker on a platform-fetched artifact. Verifies the artifact
   * hash (side-load refusal, T7) before handing bytes to the worker. A retained
   * copy allows the page-side hard watchdog to replace a wedged worker.
   */
  async start(artifact: ArrayBuffer): Promise<void> {
    if (this.worker || this.starting) {
      throw new Error('PlayerCodeBroker is already started');
    }
    if (this.circuitOpen) {
      throw new Error('player code circuit is open; reset before starting');
    }
    const lifecycleVersion = ++this.lifecycleVersion;
    this.starting = true;
    try {
      if (this.options.artifactHash) {
        const actual = await this.hash(artifact);
        if (actual !== this.options.artifactHash) {
          throw new Error(
            'refusing to run an artifact that was not fetched from the platform',
          );
        }
      }
      if (lifecycleVersion !== this.lifecycleVersion) {
        throw new Error('PlayerCodeBroker start was cancelled');
      }
      this.artifact = artifact.slice(0);
      this.spawnWorker();
    } finally {
      if (lifecycleVersion === this.lifecycleVersion) this.starting = false;
    }
  }

  /** Terminate + respawn on a fresh artifact — the client hot-reload path. */
  async restart(artifact: ArrayBuffer): Promise<void> {
    this.stop();
    await this.start(artifact);
  }

  stop(): void {
    this.lifecycleVersion += 1;
    this.starting = false;
    this.stopWorker();
    this.artifact = null;
  }

  /** Clear a tripped circuit so the caller can start again after a fix. */
  resetCircuit(): void {
    this.circuitOpen = false;
    this.consecutiveTraps = 0;
    this.hardTimeouts = 0;
    this.rateBuckets.clear();
    this.globalCallBucket = [];
  }

  private async handleMessage(
    raw: unknown,
    generation: number,
    sourceWorker: PlayerCodeWorkerLike,
  ): Promise<void> {
    if (
      this.worker !== sourceWorker ||
      generation !== this.generation ||
      !isRecord(raw)
    ) {
      return;
    }
    if (raw.type === 'ready') {
      this.workerReady = true;
      this.clearStartupTimer();
      return;
    }
    if (raw.type === 'dispatch-start') {
      if (!Number.isSafeInteger(raw.id) || (raw.id as number) <= 0) {
        this.recycleWorker('invalid dispatch-start id');
        return;
      }
      if (this.activeDispatch) {
        this.recycleWorker('overlapping guest dispatches');
        return;
      }
      this.activeDispatch = {
        generation,
        id: raw.id as number,
        kind: typeof raw.kind === 'string' ? raw.kind : 'unknown',
      };
      this.armDispatchTimer(generation, raw.id as number);
      return;
    }
    if (raw.type === 'trap') {
      this.finishDispatch(generation, raw.id);
      const reason = typeof raw.reason === 'string' ? raw.reason : 'trap';
      const detail = typeof raw.detail === 'string' ? raw.detail : '';
      const trapKind = typeof raw.kind === 'string' ? raw.kind : '';
      if (reason === 'watchdog' || /host call timed out/i.test(detail)) {
        this.recycleWorker(
          /host call timed out/i.test(detail) ? 'hostcall-timeout' : reason,
        );
      } else if (trapKind === 'startup' || trapKind === 'init') {
        this.stopWorker();
        this.recordTrap(reason);
      } else {
        this.recordTrap(reason);
      }
      return;
    }
    if (raw.type === 'dispatch-ok') {
      const kind = this.activeDispatch?.kind;
      this.finishDispatch(generation, raw.id);
      if (kind && kind !== 'init') {
        this.consecutiveTraps = 0;
        this.hardTimeouts = 0;
      }
      return;
    }
    if (raw.type !== 'hostcall') return;
    this.armHostCallTimer(generation);
    if (!this.enforceGlobalRate()) return;
    const id = raw.id;
    try {
      if (!Number.isSafeInteger(id) || (id as number) < 0) {
        throw new Error('invalid hostcall id');
      }
      for (const key of Object.keys(raw)) {
        if (!HOST_CALL_ENVELOPE_KEYS.has(key)) {
          throw new Error(`unexpected hostcall envelope field '${key}'`);
        }
      }
      if (typeof raw.fn !== 'string') throw new Error('missing host call fn');
      if (
        raw.fn.length === 0 ||
        utf8Encoder.encode(raw.fn).length > MAX_HOST_CALL_FN_BYTES
      ) {
        throw new Error('invalid host call fn');
      }
      const group = FN_TO_GROUP.get(raw.fn);
      if (!group) {
        throw new Error('host call is not allowed in the player browser sandbox');
      }
      if (!isPlainRecord(raw.args)) {
        // Confused-deputy guard: reject malformed payloads outright rather
        // than coercing them (09 T7).
        throw new Error('host call args must be a plain object');
      }
      const args = raw.args;
      for (const key of FORBIDDEN_BINDING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(args, key)) {
          throw new Error(`host call cannot override '${key}'`);
        }
      }
      let encodedArgs: Uint8Array;
      try {
        encodedArgs = utf8Encoder.encode(JSON.stringify(args));
      } catch {
        throw new Error('host call args must be JSON-serializable');
      }
      if (encodedArgs.length > MAX_HOST_CALL_ARGS_BYTES) {
        throw new Error('host call args exceed the browser sandbox limit');
      }
      this.enforceRate(group, raw.fn);
      this.assertGridScope(raw.fn, args);
      let data: unknown;
      if (raw.fn === 'grid_info') {
        // Answered locally: the mod's own clamped grid bounds, so it can
        // address its chunks without knowing world coordinates or a server
        // round-trip. Chunk coords cross as decimal strings (may exceed 2^53).
        const { low, high } = this.options.grid;
        data = {
          low: { x: low.x.toString(), y: low.y.toString(), z: low.z.toString() },
          high: { x: high.x.toString(), y: high.y.toString(), z: high.z.toString() },
        };
        this.reply(sourceWorker, generation, raw.reply, id, {
          type: 'hostcall-result',
          id,
          ok: true,
          data,
        });
        return;
      }
      if (PRESENTATION_FUNCTIONS.has(raw.fn)) {
        // Presentation never reaches the SDK/server: it goes only to the
        // game-declared channel. A game that offers no sink silently drops it.
        this.options.onPresentation?.({
          channel: raw.fn === 'hud_set' ? 'hud' : 'overlay',
          payload: args.payload,
        });
        data = { delivered: !!this.options.onPresentation };
      } else {
        data = await this.options.onHostCall({ fn: raw.fn, args });
      }
      this.reply(sourceWorker, generation, raw.reply, id, {
        type: 'hostcall-result',
        id,
        ok: true,
        data,
      });
    } catch (error) {
      this.reply(sourceWorker, generation, raw.reply, id, {
        type: 'hostcall-result',
        id,
        ok: false,
        error: { kind: 'denied', message: (error as Error).message },
      });
    }
  }

  /**
   * Deliver a host-call reply. Always posts the message (the offline test
   * shape + any async-transport consumer), and — when the worker shared a
   * SharedArrayBuffer for this call — ALSO writes the SDK Response envelope
   * into it and wakes the worker blocked in Atomics.wait. The synchronous
   * guest can only receive the reply through the SAB (a blocked worker never
   * runs its message handler), so the SAB write is the load-bearing path in
   * the browser; the postMessage is harmless there.
   */
  private reply(
    sourceWorker: PlayerCodeWorkerLike,
    generation: number,
    replyBuffer: unknown,
    id: number,
    message: { type: string; id: number; ok: boolean; data?: unknown; error?: unknown },
  ): void {
    if (this.worker !== sourceWorker || generation !== this.generation) return;
    let sabAttempted = false;
    let delivered = false;
    if (
      typeof SharedArrayBuffer !== 'undefined' &&
      replyBuffer instanceof SharedArrayBuffer &&
      replyBuffer.byteLength >= SAB_HEADER_BYTES
    ) {
      sabAttempted = true;
      try {
        const view = wrapGlueSab(replyBuffer);
        const envelope = message.ok
          ? { ok: true, data: message.data }
          : { ok: false, error: message.error };
        delivered = writeGlueResult(view, envelope, id);
      } catch {
        // The async postMessage result above is still delivered. A forged or
        // undersized SAB must not turn a denied worker request into an
        // unhandled page-side rejection.
      }
    }
    if (!sabAttempted || delivered) {
      try {
        sourceWorker.postMessage(message);
      } catch {
        // The SAB is authoritative in production. An async mirror that cannot
        // be cloned must not strand a successfully delivered synchronous reply.
      }
    }
    if (delivered) this.resumeDispatchWatchdog(generation);
  }

  private spawnWorker(): void {
    if (!this.artifact || this.circuitOpen) return;
    const factory: (url: string | URL) => PlayerCodeWorkerLike =
      this.options.workerFactory ??
      ((url: string | URL) =>
        new Worker(url, { type: 'module' }) as unknown as PlayerCodeWorkerLike);
    const worker = factory(this.options.workerUrl);
    const generation = ++this.generation;
    const listener = (event: MessageEvent<unknown>) => {
      void this.handleMessage(event.data, generation, worker);
    };
    this.worker = worker;
    this.workerListener = listener;
    this.workerReady = false;
    worker.addEventListener('message', listener);
    const workerArtifact = this.artifact.slice(0);
    try {
      worker.postMessage(
        {
          type: 'init',
          artifact: workerArtifact,
          authority: 'player',
          fuelPerDispatch: this.options.fuelPerDispatch?.toString(),
          hostCallTimeoutMs:
            this.options.hostCallTimeoutMs ?? GLUE_HOST_CALL_TIMEOUT_MS,
          tickIntervalMs: this.options.tickIntervalMs ?? 0,
        },
        [workerArtifact],
      );
      this.armStartupTimer(generation);
    } catch (error) {
      this.stopWorker();
      throw error;
    }
  }

  private stopWorker(): void {
    this.clearStartupTimer();
    this.clearDispatchTimer();
    this.activeDispatch = null;
    this.workerReady = false;
    const worker = this.worker;
    const listener = this.workerListener;
    this.worker = null;
    this.workerListener = null;
    if (!worker) return;
    if (listener) worker.removeEventListener('message', listener);
    worker.terminate();
  }

  private armStartupTimer(generation: number): void {
    this.clearStartupTimer();
    const timeoutMs =
      this.options.startupWatchdogMs ??
      Math.max(5000, (this.options.dispatchWatchdogMs ?? 250) * 4);
    this.startupTimer = setTimeout(() => {
      if (
        generation === this.generation &&
        this.worker &&
        !this.workerReady
      ) {
        this.recycleWorker('startup-watchdog');
      }
    }, timeoutMs);
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  private armDispatchTimer(generation: number, id: number): void {
    this.clearDispatchTimer();
    this.dispatchTimer = setTimeout(() => {
      if (
        this.activeDispatch?.generation === generation &&
        this.activeDispatch.id === id
      ) {
        this.recycleWorker('dispatch-watchdog');
      }
    }, this.options.dispatchWatchdogMs ?? 250);
  }

  private armHostCallTimer(generation: number): void {
    if (
      this.activeDispatch?.generation !== generation ||
      !this.worker
    ) {
      return;
    }
    const id = this.activeDispatch.id;
    this.clearDispatchTimer();
    this.dispatchTimer = setTimeout(() => {
      if (
        this.activeDispatch?.generation === generation &&
        this.activeDispatch.id === id
      ) {
        this.recycleWorker('hostcall-timeout');
      }
    }, this.options.hostCallTimeoutMs ?? GLUE_HOST_CALL_TIMEOUT_MS);
  }

  private resumeDispatchWatchdog(generation: number): void {
    if (this.activeDispatch?.generation !== generation) return;
    this.armDispatchTimer(generation, this.activeDispatch.id);
  }

  private finishDispatch(generation: number, id: unknown): void {
    if (
      !Number.isSafeInteger(id) ||
      this.activeDispatch?.generation !== generation ||
      this.activeDispatch.id !== id
    ) {
      return;
    }
    this.clearDispatchTimer();
    this.activeDispatch = null;
  }

  private clearDispatchTimer(): void {
    if (this.dispatchTimer) clearTimeout(this.dispatchTimer);
    this.dispatchTimer = null;
  }

  private recycleWorker(reason: string): void {
    if (!this.worker || this.circuitOpen) return;
    this.hardTimeouts += 1;
    this.consecutiveTraps += 1;
    this.stopWorker();
    if (this.hardTimeouts >= CIRCUIT_TRIP_THRESHOLD) {
      this.openCircuit(reason);
      return;
    }
    this.spawnWorker();
  }

  private openCircuit(reason: string): void {
    if (this.circuitOpen) return;
    this.circuitOpen = true;
    this.stopWorker();
    this.options.onCircuitOpen?.(reason);
  }

  private enforceGlobalRate(): boolean {
    const now = Date.now();
    this.globalCallBucket = this.globalCallBucket.filter(
      (timestamp) => now - timestamp < RATE_WINDOW_MS,
    );
    if (this.globalCallBucket.length >= GLOBAL_HOST_CALL_CAP) {
      this.openCircuit('global host-call rate exceeded');
      return false;
    }
    this.globalCallBucket.push(now);
    return true;
  }

  private enforceRate(group: string, fn: string): void {
    const cap = RATE_CAPS[group] ?? 60;
    const now = Date.now();
    const bucket = (this.rateBuckets.get(group) ?? []).filter(
      (t) => now - t < RATE_WINDOW_MS,
    );
    if (bucket.length >= cap) {
      throw new Error(`rate cap exceeded for '${fn}'`);
    }
    bucket.push(now);
    this.rateBuckets.set(group, bucket);
  }

  private recordTrap(reason: string): void {
    this.consecutiveTraps += 1;
    if (this.consecutiveTraps >= CIRCUIT_TRIP_THRESHOLD && !this.circuitOpen) {
      this.openCircuit(reason);
    }
  }

  private assertGridScope(fn: string, args: Record<string, unknown>): void {
    if (CHUNK_FUNCTIONS.has(fn)) {
      this.assertChunk(args.x, args.y, args.z);
    } else if (fn === 'voxel_set' || fn === 'emit_spatial') {
      this.assertChunk(args.chunkX, args.chunkY, args.chunkZ);
    }
  }

  private assertChunk(xRaw: unknown, yRaw: unknown, zRaw: unknown): void {
    const x = toBigInt(xRaw);
    const y = toBigInt(yRaw);
    const z = toBigInt(zRaw);
    const { low, high } = this.options.grid;
    if (
      x < low.x ||
      x > high.x ||
      y < low.y ||
      y > high.y ||
      z < low.z ||
      z > high.z
    ) {
      throw new Error('target is outside the player grid');
    }
  }

  private async hash(artifact: ArrayBuffer): Promise<string> {
    if (this.options.hashArtifact) return this.options.hashArtifact(artifact);
    const digest = await crypto.subtle.digest('SHA-256', artifact);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toBigInt(value: unknown): bigint {
  if (
    typeof value === 'string' &&
    !/^-?(0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error('chunk coordinates must be decimal integer strings');
  }
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || !Number.isFinite(value))
  ) {
    throw new Error('chunk coordinates must be safe integers or decimal strings');
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'bigint'
  ) {
    throw new Error('chunk coordinates must be integers');
  }
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    throw new Error('chunk coordinates must be integers');
  }
}
