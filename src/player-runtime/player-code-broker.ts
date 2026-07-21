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

export interface PlayerCodeBrokerOptions {
  /** Platform-owned glue worker URL; the worker never receives auth tokens. */
  workerUrl: string | URL;
  grid: PlayerCodeGridBounds;
  onHostCall: (call: PlayerCodeHostCall) => Promise<unknown>;
  workerFactory?: (url: string | URL) => PlayerCodeWorkerLike;
}

const ALLOWED_HOST_CALLS = new Set([
  'container_create',
  'container_get',
  'containers_list',
  'container_delete',
  'property_set',
  'model_invoke',
  'user_state_get',
  'user_state_set',
  'grid_state_get',
  'grid_state_set',
  'chunk_get',
  'voxels_list',
  'actors_list',
  'actors_list_radius',
  'voxel_set',
  'grid_permission_check',
  'emit_spatial',
]);

const CHUNK_FUNCTIONS = new Set([
  'chunk_get',
  'voxels_list',
  'actors_list',
  'actors_list_radius',
]);

/**
 * Page-side security broker for browser-target player WASM.
 *
 * P1 provides the production-shaped boundary: artifact bytes go to a dedicated
 * worker, tokens stay on the page, only an explicit host-call allowlist crosses
 * the bridge, and world effects are locally grid-checked before the normal SDK
 * path performs the server-authorized call. The platform worker glue owns WASM
 * instantiation/fuel/watchdog; P3 supplies the live-coding UI and game-specific
 * presentation hooks.
 */
export class PlayerCodeBroker {
  private worker: PlayerCodeWorkerLike | null = null;
  private readonly onMessage = (event: MessageEvent<unknown>) => {
    void this.handleMessage(event.data);
  };

  constructor(private readonly options: PlayerCodeBrokerOptions) {}

  start(artifact: ArrayBuffer): void {
    if (this.worker) throw new Error('PlayerCodeBroker is already started');
    const factory =
      this.options.workerFactory ??
      ((url: string | URL) => new Worker(url, { type: 'module' }));
    this.worker = factory(this.options.workerUrl);
    this.worker.addEventListener('message', this.onMessage);
    this.worker.postMessage(
      { type: 'init', artifact, authority: 'player' },
      [artifact],
    );
  }

  stop(): void {
    if (!this.worker) return;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
    this.worker = null;
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!this.worker || !isRecord(raw) || raw.type !== 'hostcall') return;
    const id = raw.id;
    try {
      if (typeof id !== 'number') throw new Error('invalid hostcall id');
      if (typeof raw.fn !== 'string' || !ALLOWED_HOST_CALLS.has(raw.fn)) {
        throw new Error('host call is not allowed in the player browser sandbox');
      }
      const args = isRecord(raw.args) ? raw.args : {};
      this.assertGridScope(raw.fn, args);
      const data = await this.options.onHostCall({ fn: raw.fn, args });
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

  private assertGridScope(
    fn: string,
    args: Record<string, unknown>,
  ): void {
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
