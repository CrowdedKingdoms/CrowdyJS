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
  /** Per-dispatch client fuel budget (from playerComputeArtifact); the glue traps past it. */
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
  meta: new Set(['grid_permission_check']),
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
  private circuitOpen = false;
  private consecutiveTraps = 0;
  private readonly rateBuckets = new Map<string, number[]>();
  private readonly onMessage = (event: MessageEvent<unknown>) => {
    void this.handleMessage(event.data);
  };

  constructor(private readonly options: PlayerCodeBrokerOptions) {}

  /**
   * Start the worker on a platform-fetched artifact. Verifies the artifact
   * hash (side-load refusal, T7) before handing bytes to the worker, and
   * forwards the fuel budget so the glue can trap a runaway dispatch.
   */
  async start(artifact: ArrayBuffer): Promise<void> {
    if (this.worker) throw new Error('PlayerCodeBroker is already started');
    if (this.circuitOpen) {
      throw new Error('player code circuit is open; reset before starting');
    }
    if (this.options.artifactHash) {
      const actual = await this.hash(artifact);
      if (actual !== this.options.artifactHash) {
        throw new Error(
          'refusing to run an artifact that was not fetched from the platform',
        );
      }
    }
    const factory =
      this.options.workerFactory ??
      ((url: string | URL) => new Worker(url, { type: 'module' }));
    this.worker = factory(this.options.workerUrl);
    this.worker.addEventListener('message', this.onMessage);
    this.worker.postMessage(
      {
        type: 'init',
        artifact,
        authority: 'player',
        fuelPerDispatch:
          this.options.fuelPerDispatch != null
            ? this.options.fuelPerDispatch.toString()
            : undefined,
        watchdogMs: this.options.dispatchWatchdogMs ?? 250,
      },
      [artifact],
    );
  }

  /** Terminate + respawn on a fresh artifact — the client hot-reload path. */
  async restart(artifact: ArrayBuffer): Promise<void> {
    this.stop();
    await this.start(artifact);
  }

  stop(): void {
    if (!this.worker) return;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
    this.worker = null;
  }

  /** Clear a tripped circuit so the caller can start again after a fix. */
  resetCircuit(): void {
    this.circuitOpen = false;
    this.consecutiveTraps = 0;
    this.rateBuckets.clear();
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!this.worker || !isRecord(raw)) return;
    if (raw.type === 'trap') {
      this.recordTrap(typeof raw.reason === 'string' ? raw.reason : 'trap');
      return;
    }
    if (raw.type === 'dispatch-ok') {
      this.consecutiveTraps = 0;
      return;
    }
    if (raw.type !== 'hostcall') return;
    const id = raw.id;
    try {
      if (typeof id !== 'number') throw new Error('invalid hostcall id');
      if (typeof raw.fn !== 'string') throw new Error('missing host call fn');
      const group = FN_TO_GROUP.get(raw.fn);
      if (!group) {
        throw new Error('host call is not allowed in the player browser sandbox');
      }
      if (!isRecord(raw.args)) {
        // Confused-deputy guard: reject malformed payloads outright rather
        // than coercing them (09 T7).
        throw new Error('host call args must be an object');
      }
      const args = raw.args;
      this.enforceRate(group, raw.fn);
      this.assertGridScope(raw.fn, args);
      let data: unknown;
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
      this.worker?.postMessage({ type: 'hostcall-result', id, ok: true, data });
    } catch (error) {
      this.worker?.postMessage({
        type: 'hostcall-result',
        id,
        ok: false,
        error: { kind: 'denied', message: (error as Error).message },
      });
    }
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
      this.circuitOpen = true;
      this.stop();
      this.options.onCircuitOpen?.(reason);
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

function toBigInt(value: unknown): bigint {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    throw new Error('chunk coordinates must be integers');
  }
}
