/**
 * Factored, environment-agnostic core of the platform glue (player compute
 * P3/P5). This is the ONLY platform code that shares an execution context
 * with an untrusted player module, so it is deliberately tiny and auditable
 * and has NO dependency on worker globals, the DOM, or the SDK client — the
 * browser worker entry ([player-glue-worker.ts]) and the Node integration
 * test both drive this same core.
 *
 * ABI (matches crowdy-compute-sdk `lib.rs`): the guest imports module `ck`
 * with `log`, `now_ms`, `state_get`, `state_set`, and the JSON gateway
 * `host_call(ptr,len) -> u64` (packed `resp_ptr<<32 | resp_len`, guest frees
 * with `ck_free`), plus `wasi_snapshot_preview1.random_get`. The guest
 * exports `memory`, `ck_alloc`, `ck_free`, and the module hooks `init`,
 * `tick(dt_ms)`, `handle_invoke(ptr,len)->u64`, optional `on_event(ptr,len)`.
 *
 * `host_call` is SYNCHRONOUS from the guest's view. The single synchronous
 * dependency this core takes is `hostCallSync(reqBytes) -> respBytes`; the
 * browser/Node entry realizes it with a SharedArrayBuffer + `Atomics.wait`
 * (the worker blocks; the page/broker services the async SDK call and writes
 * the reply back). Everything else here is pure.
 */

/** The host-call names surfaced to a guest (mirrors the broker allowlist). */
export const GLUE_HOST_FUNCTIONS = [
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
  'emit_spatial',
  'hud_set',
  'overlay_draw',
  'grid_skin_set',
  'grid_skin_clear',
  'mesh_asset_register',
  'mesh_asset_attach',
  'mesh_asset_spawn',
  'mesh_asset_clear',
  'mechanics_emit',
  'grid_permission_check',
] as const;

export interface GlueInitMessage {
  type: 'init';
  artifact: ArrayBuffer;
  authority: 'player';
  /** Server-authored budget loaded into an injected mutable `ck_fuel` global. */
  fuelPerDispatch?: string;
  /** Legacy metadata; the hard watchdog is owned by the page-side broker. */
  watchdogMs?: number;
  hostCallTimeoutMs?: number;
  /** Local client tick cadence in ms (0/undefined => no self-tick). */
  tickIntervalMs?: number;
}

/**
 * Parse the server-authored budget used to refill an instrumented artifact's
 * mutable `ck_fuel` global before every guest dispatch.
 */
export function parseFuelBudget(raw: string | undefined): bigint | null {
  if (raw == null) return null;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** A dispatch outcome the worker reports back to the broker. */
export type GlueDispatchResult =
  | { ok: true }
  | { ok: false; reason: 'fuel' | 'watchdog' | 'trap'; detail?: string };

/**
 * Classify a completed guest dispatch by elapsed wall time. This cannot
 * interrupt synchronous WASM; the page-side PlayerCodeBroker owns the hard
 * dispatch watchdog and terminates a worker whose dispatch never returns.
 */
export async function runWithWatchdog(
  dispatch: () => unknown,
  watchdogMs: number,
  now: () => number = () => Date.now(),
): Promise<GlueDispatchResult> {
  const start = now();
  try {
    dispatch();
  } catch (err) {
    const message = (err as Error).message ?? 'trap';
    if (/fuel|gas|unreachable/i.test(message)) {
      return { ok: false, reason: 'fuel', detail: message };
    }
    return { ok: false, reason: 'trap', detail: message };
  }
  if (now() - start > watchdogMs) {
    return { ok: false, reason: 'watchdog' };
  }
  return { ok: true };
}

/** The minimal guest-instance surface the runtime drives (a real WebAssembly.Instance satisfies it). */
export interface GuestExports {
  memory: { buffer: ArrayBuffer };
  ck_fuel?: WebAssembly.Global;
  ck_alloc(len: number): number;
  ck_free?(ptr: number, len: number): void;
  init?(): void;
  tick?(dtMs: number): void;
  handle_invoke?(ptr: number, len: number): bigint | number;
  on_event?(ptr: number, len: number): void;
}

export interface GlueRuntimeOptions {
  /** Synchronous host-API gateway: JSON request bytes in, SDK Response-envelope bytes out. */
  hostCallSync: (reqBytes: Uint8Array) => Uint8Array;
  /** debug/info/warn/error sink for guest `ck.log` (optional). */
  onLog?: (level: number, message: string) => void;
  /** Deterministic-enough randomness for the guest `random_get` (defaults to crypto). */
  randomFill?: (buf: Uint8Array) => void;
  now?: () => number;
  fuelPerDispatch?: bigint | null;
}

const textDecoder = new TextDecoder();

function assertMemoryRange(
  buffer: ArrayBuffer,
  ptr: number,
  len: number,
  operation: string,
): void {
  if (
    !Number.isSafeInteger(ptr) ||
    !Number.isSafeInteger(len) ||
    ptr < 0 ||
    len < 0 ||
    ptr > buffer.byteLength ||
    len > buffer.byteLength - ptr
  ) {
    throw new RangeError(`${operation} is outside guest memory`);
  }
}

function defaultRandomFill(buf: Uint8Array): void {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    // getRandomValues caps at 65536 bytes per call.
    for (let off = 0; off < buf.length; off += 65536) {
      c.getRandomValues(buf.subarray(off, Math.min(off + 65536, buf.length)));
    }
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
  }
}

/**
 * Drives one untrusted guest module: builds the `ck` + wasi import table,
 * instantiates the artifact, and marshals the synchronous `host_call`
 * gateway across guest linear memory. Durable client state is kept in-worker
 * (a client module's blob is ephemeral per session — the durable store is a
 * host_call away for anything that must survive).
 */
export class GlueRuntime {
  private exports: GuestExports | null = null;
  private stateBlob: Uint8Array = new Uint8Array(0);

  constructor(private readonly options: GlueRuntimeOptions) {}

  private resetFuel(): void {
    const fuel = this.exports?.ck_fuel;
    if (!fuel) return;
    if (this.options.fuelPerDispatch == null) {
      throw new Error('instrumented artifact is missing a fuel budget');
    }
    fuel.value = this.options.fuelPerDispatch;
  }

  /** The import object handed to `WebAssembly.instantiate`. Guest sees only these. */
  buildImports(getExports: () => GuestExports | null): WebAssembly.Imports {
    const mem = (): DataView => {
      const ex = getExports();
      if (!ex) throw new Error('guest not instantiated');
      return new DataView(ex.memory.buffer);
    };
    const bytesAt = (ptr: number, len: number): Uint8Array => {
      const ex = getExports();
      if (!ex) throw new Error('guest not instantiated');
      const buffer = ex.memory.buffer;
      assertMemoryRange(buffer, ptr, len, 'guest memory read');
      // Copy into a fresh ArrayBuffer-backed view — the guest buffer may
      // detach/grow between calls (and may be a SharedArrayBuffer).
      const out = new Uint8Array(len);
      out.set(new Uint8Array(buffer, ptr, len));
      return out;
    };
    const writeAt = (ptr: number, src: Uint8Array): void => {
      const ex = getExports();
      if (!ex) throw new Error('guest not instantiated');
      const buffer = ex.memory.buffer;
      assertMemoryRange(buffer, ptr, src.length, 'guest memory write');
      new Uint8Array(buffer, ptr, src.length).set(src);
    };
    const now = this.options.now ?? (() => Date.now());
    const randomFill = this.options.randomFill ?? defaultRandomFill;

    const ck: Record<string, (...args: number[]) => number | bigint | void> = {
      log: (level: number, ptr: number, len: number): void => {
        if (this.options.onLog) {
          this.options.onLog(level, textDecoder.decode(bytesAt(ptr, len)));
        }
      },
      now_ms: (): bigint => BigInt(now()),
      state_get: (dest: number, cap: number): number => {
        const len = this.stateBlob.length;
        if (dest !== 0 && cap > 0) {
          writeAt(dest, this.stateBlob.subarray(0, Math.min(len, cap)));
        }
        return len;
      },
      state_set: (ptr: number, len: number): number => {
        this.stateBlob = bytesAt(ptr, len);
        return 0;
      },
      host_call: (ptr: number, len: number): bigint => {
        const reqBytes = bytesAt(ptr, len);
        const respBytes = this.options.hostCallSync(reqBytes);
        const ex = getExports();
        if (!ex) throw new Error('guest not instantiated');
        const outPtr = ex.ck_alloc(respBytes.length);
        if (respBytes.length > 0 && outPtr === 0) {
          throw new RangeError('ck_alloc returned a null reply pointer');
        }
        writeAt(outPtr, respBytes);
        // Packed (ptr << 32 | len); the guest reads then ck_frees it.
        return (BigInt(outPtr) << 32n) | BigInt(respBytes.length >>> 0);
      },
    };

    const wasi = {
      random_get: (ptr: number, len: number): number => {
        const ex = getExports();
        if (!ex) throw new Error('guest not instantiated');
        const buffer = ex.memory.buffer;
        assertMemoryRange(buffer, ptr, len, 'random_get write');
        const buf = new Uint8Array(buffer, ptr, len);
        randomFill(buf);
        return 0;
      },
      // A player artifact may pull in a few benign wasi stubs; keep them inert.
      proc_exit: (): void => {
        throw new Error('proc_exit called (guest trap)');
      },
      fd_write: (): number => 0,
      environ_get: (): number => 0,
      environ_sizes_get: (envcPtr: number, envBufSzPtr: number): number => {
        const dv = mem();
        dv.setUint32(envcPtr, 0, true);
        dv.setUint32(envBufSzPtr, 0, true);
        return 0;
      },
    };

    return {
      ck,
      wasi_snapshot_preview1: wasi,
      // Some toolchains name the module `wasi_unstable`; alias defensively.
      wasi_unstable: wasi,
    } as unknown as WebAssembly.Imports;
  }

  async instantiate(artifact: ArrayBuffer): Promise<void> {
    const importObject = this.buildImports(() => this.exports);
    const { instance } = await WebAssembly.instantiate(artifact, importObject);
    const ex = instance.exports as unknown as GuestExports;
    if (!ex.memory || typeof ex.ck_alloc !== 'function') {
      throw new Error('artifact is missing the ck ABI (memory / ck_alloc)');
    }
    this.exports = ex;
  }

  /** Run the module's `init` export (once, after instantiate). */
  init(): void {
    this.resetFuel();
    this.exports?.init?.();
  }

  /** Run one `tick(dt_ms)`. Throws propagate to the caller's watchdog wrapper. */
  tick(dtMs: number): void {
    this.resetFuel();
    this.exports?.tick?.(dtMs);
  }

  /** Invoke the module with an opaque payload; returns the reply bytes (copied out). */
  invoke(payload: Uint8Array): Uint8Array {
    const ex = this.exports;
    if (!ex || typeof ex.handle_invoke !== 'function') return new Uint8Array(0);
    const ptr = ex.ck_alloc(payload.length);
    if (payload.length > 0 && ptr === 0) {
      throw new RangeError('ck_alloc returned a null invoke pointer');
    }
    assertMemoryRange(ex.memory.buffer, ptr, payload.length, 'invoke request write');
    new Uint8Array(ex.memory.buffer, ptr, payload.length).set(payload);
    this.resetFuel();
    const packed = BigInt(ex.handle_invoke(ptr, payload.length));
    ex.ck_free?.(ptr, payload.length);
    const outPtr = Number(packed >> 32n);
    const outLen = Number(packed & 0xffffffffn);
    if (outLen === 0) return new Uint8Array(0);
    if (outPtr === 0) {
      throw new RangeError('guest returned a null invoke reply pointer');
    }
    assertMemoryRange(ex.memory.buffer, outPtr, outLen, 'invoke reply read');
    const out = new Uint8Array(ex.memory.buffer, outPtr, outLen).slice();
    ex.ck_free?.(outPtr, outLen);
    return out;
  }
}
