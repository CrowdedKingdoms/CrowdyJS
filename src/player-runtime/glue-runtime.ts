/**
 * Factored, environment-agnostic core of the platform glue for a ck-exec mod's
 * CLIENT half. This is the ONLY platform code that shares an execution context
 * with an untrusted player module, so it is deliberately tiny and auditable
 * and has NO dependency on worker globals, the DOM, or the SDK client — the
 * browser worker entry ([player-glue-worker.ts]) and the Node integration
 * test both drive this same core.
 *
 * ABI (crowdy-client-sdk `lib.rs`, CLIENT ABI 0): the guest imports module
 * `ck` with `log`, `now_ms`, `state_get`, `state_set`, and the JSON gateway
 * `host_call(ptr,len) -> u64` (packed `resp_ptr<<32 | resp_len`, guest frees
 * with `ck_free`), plus `wasi_snapshot_preview1.random_get`, and nothing else.
 * The guest exports `memory`, `ck_alloc`, `ck_free`, the `ck_fuel` meter the
 * build's instrument step injects, and the module hooks `init`,
 * `tick(dt_ms)`, `handle_invoke(ptr,len)->u64` and optional
 * `on_event(ptr,len)`.
 *
 * `host_call` is SYNCHRONOUS from the guest's view. The single synchronous
 * dependency this core takes is `hostCallSync(reqBytes) -> respBytes`; the
 * browser/Node entry realizes it with a SharedArrayBuffer + `Atomics.wait`
 * (the worker blocks; the page/broker services the async SDK call and writes
 * the reply back). Everything else here is pure.
 */

import { EXEC_CLIENT_HOST_CALLS } from './client-host-calls.js';

/** The host-call names a guest may send: the broker's allowlist, {@link EXEC_CLIENT_HOST_CALLS}. */
export const GLUE_HOST_FUNCTIONS: readonly string[] = Object.values(EXEC_CLIENT_HOST_CALLS).flatMap(
  (fns) => [...fns],
);

/** The most of one `ck.log` message read out of guest memory, in bytes. */
export const GLUE_LOG_MAX_BYTES = 4096;

/**
 * The largest `ck.host_call` request read out of guest memory, in bytes: the broker's 256 KiB
 * args limit and room for the envelope. A longer one is answered `request_too_large` unread.
 */
export const GLUE_HOST_CALL_REQUEST_MAX_BYTES = 256 * 1024 + 1024;

/** The largest blob `ck.state_set` keeps, in bytes; a larger one is refused (returns 1). */
export const GLUE_STATE_MAX_BYTES = 1024 * 1024;

/** The largest `handle_invoke` reply read out of guest memory, in bytes. */
export const GLUE_INVOKE_REPLY_MAX_BYTES = 256 * 1024;

/** Every import a ck-exec CLIENT half may have (CLIENT ABI 0), by module. */
export const EXEC_CLIENT_ABI_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  ck: ['log', 'now_ms', 'state_get', 'state_set', 'host_call'],
  wasi_snapshot_preview1: ['random_get'],
};

export interface GlueInitMessage {
  type: 'init';
  artifact: ArrayBuffer;
  authority: 'player';
  /** A mod's CLIENT half, offered exactly {@link EXEC_CLIENT_ABI_IMPORTS}: the only engine. */
  engine?: 'ck-exec';
  /** Server-authored budget loaded into the module's mutable `ck_fuel` global; required. */
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
  /**
   * Sink for guest `ck.log` (optional): crowdy-client-sdk's level (0 debug, 1 info, 2 warn,
   * 3 error) and at most {@link GLUE_LOG_MAX_BYTES} of the message.
   */
  onLog?: (level: number, message: string) => void;
  /** Deterministic-enough randomness for the guest `random_get` (defaults to crypto). */
  randomFill?: (buf: Uint8Array) => void;
  now?: () => number;
  /** The per-dispatch budget; a module is refused without one. */
  fuelPerDispatch?: bigint | null;
  /**
   * `'ck-exec'`, the only engine: offer exactly {@link EXEC_CLIENT_ABI_IMPORTS} and refuse a
   * module that does not export the `ck_fuel` meter, or a missing budget.
   */
  engine?: 'ck-exec';
}

const textDecoder = new TextDecoder();
const requestTooLargeReply = new TextEncoder().encode(
  JSON.stringify({
    ok: false,
    error: { kind: 'request_too_large', message: 'host call request exceeds the browser sandbox limit' },
  }),
);

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
        const ex = getExports();
        if (!ex) throw new Error('guest not instantiated');
        assertMemoryRange(ex.memory.buffer, ptr, len, 'guest log read');
        if (this.options.onLog) {
          this.options.onLog(level, textDecoder.decode(bytesAt(ptr, Math.min(len, GLUE_LOG_MAX_BYTES))));
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
        if (len > GLUE_STATE_MAX_BYTES) return 1;
        this.stateBlob = bytesAt(ptr, len);
        return 0;
      },
      host_call: (ptr: number, len: number): bigint => {
        const respBytes =
          len > GLUE_HOST_CALL_REQUEST_MAX_BYTES
            ? requestTooLargeReply
            : this.options.hostCallSync(bytesAt(ptr, len));
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

    const random_get = (ptr: number, len: number): number => {
      const ex = getExports();
      if (!ex) throw new Error('guest not instantiated');
      const buffer = ex.memory.buffer;
      assertMemoryRange(buffer, ptr, len, 'random_get write');
      const buf = new Uint8Array(buffer, ptr, len);
      randomFill(buf);
      return 0;
    };
    return {
      ck,
      wasi_snapshot_preview1: { random_get },
    } as unknown as WebAssembly.Imports;
  }

  async instantiate(artifact: ArrayBuffer): Promise<void> {
    const importObject = this.buildImports(() => this.exports);
    const { instance } = await WebAssembly.instantiate(artifact, importObject);
    const ex = instance.exports as unknown as GuestExports;
    if (!ex.memory || typeof ex.ck_alloc !== 'function') {
      throw new Error('artifact is missing the ck ABI (memory / ck_alloc)');
    }
    if (!(ex.ck_fuel instanceof WebAssembly.Global)) {
      throw new Error('a ck-exec CLIENT half must export the ck_fuel meter; it was not instrumented');
    }
    if (this.options.fuelPerDispatch == null) {
      throw new Error('a ck-exec CLIENT half needs its fuel budget');
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

  /** Deliver one grid event to `on_event`; a module without the export ignores it. */
  event(payload: Uint8Array): void {
    const ex = this.exports;
    if (!ex || typeof ex.on_event !== 'function') return;
    const ptr = ex.ck_alloc(payload.length);
    if (payload.length > 0 && ptr === 0) {
      throw new RangeError('ck_alloc returned a null event pointer');
    }
    assertMemoryRange(ex.memory.buffer, ptr, payload.length, 'event write');
    new Uint8Array(ex.memory.buffer, ptr, payload.length).set(payload);
    this.resetFuel();
    ex.on_event(ptr, payload.length);
    ex.ck_free?.(ptr, payload.length);
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
    if (outLen > GLUE_INVOKE_REPLY_MAX_BYTES) {
      throw new RangeError('the invoke reply exceeds the browser sandbox limit');
    }
    assertMemoryRange(ex.memory.buffer, outPtr, outLen, 'invoke reply read');
    const out = new Uint8Array(ex.memory.buffer, outPtr, outLen).slice();
    ex.ck_free?.(outPtr, outLen);
    return out;
  }
}
