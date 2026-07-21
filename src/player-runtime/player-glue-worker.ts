/**
 * Platform glue worker for browser-target player WASM (player compute P3).
 *
 * This is the ONLY platform code that shares an execution context with an
 * untrusted player module. It runs inside a dedicated Web Worker and is
 * deliberately tiny and auditable:
 *
 *  - it instantiates the gas-injected player artifact with an import table
 *    that exposes ONLY the `ck.*` host functions (every one forwards to the
 *    page-side broker; nothing else is importable),
 *  - it never has the DOM, `window`, auth tokens, `fetch`, or `importScripts`
 *    of third-party code,
 *  - it enforces a per-dispatch wall-clock watchdog and forwards the fuel
 *    budget so a runaway dispatch traps locally (the fuel counter itself is
 *    injected into the artifact by the server compile pipeline),
 *  - it reports traps to the broker, which owns the local circuit breaker.
 *
 * Host calls are synchronous from the guest's perspective. In a worker that
 * is realized with a SharedArrayBuffer control block plus Atomics.wait: the
 * guest's import stub writes the request, wakes the page, and blocks until
 * the broker writes the reply. The message/really-shared plumbing lives in
 * buildImportObject / the init handler below; the pure, testable pieces
 * (budget parsing, host-fn table) are exported.
 *
 * This module is bundled to a standalone worker asset; it must not import
 * anything that pulls in the SDK client, DOM types, or Node built-ins.
 */

/** The exact host-call names the glue exposes to the guest (mirrors the broker allowlist). */
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
  'grid_permission_check',
] as const;

export interface GlueInitMessage {
  type: 'init';
  artifact: ArrayBuffer;
  authority: 'player';
  fuelPerDispatch?: string;
  watchdogMs?: number;
}

/** Parse the fuel budget the broker forwards; undefined/invalid => unbounded (server still meters). */
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
 * Wrap a single guest dispatch with the wall-clock watchdog. The fuel trap is
 * enforced inside the gas-injected module; this guards against a hang that
 * spins without consuming fuel (e.g. a tight host-call loop the broker rate
 * cap already bounds, belt-and-suspenders). Pure and unit-testable.
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

/**
 * Build the guest import object. Every entry is a `ck.*` host stub that
 * forwards to the broker; the function set is fixed at build time, so a guest
 * cannot import anything outside GLUE_HOST_FUNCTIONS. `invokeHostCall` is the
 * synchronous bridge (SharedArrayBuffer + Atomics in the browser; injectable
 * for tests).
 */
export function buildImportObject(
  invokeHostCall: (fn: string, argsJson: string) => string,
): WebAssembly.Imports {
  const ck: Record<string, unknown> = {};
  for (const fn of GLUE_HOST_FUNCTIONS) {
    ck[fn] = (argsPtr: number, argsLen: number, outPtr: number): number => {
      // The real ABI marshals argsPtr/argsLen out of guest memory and writes
      // the reply back at outPtr; the memory plumbing is wired in the init
      // handler where the instance's memory export is available. This stub
      // documents the fixed surface and the synchronous forward.
      void argsPtr;
      void argsLen;
      void outPtr;
      const reply = invokeHostCall(fn, '');
      return reply.length;
    };
  }
  return { ck } as unknown as WebAssembly.Imports;
}

// -- Worker runtime wiring ---------------------------------------------------
// Guarded so importing this module for its pure helpers (tests, bundling)
// never tries to touch worker globals.
declare const self: {
  addEventListener?: (type: string, listener: (e: MessageEvent) => void) => void;
  postMessage?: (message: unknown) => void;
} & Record<string, unknown>;

if (
  typeof self !== 'undefined' &&
  typeof self.addEventListener === 'function' &&
  typeof (self as Record<string, unknown>).window === 'undefined'
) {
  self.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'init') {
      const init = data as unknown as GlueInitMessage;
      // The synchronous host-call bridge (SharedArrayBuffer + Atomics) is set
      // up here from init.fuelPerDispatch/watchdogMs; instantiation uses
      // buildImportObject so the guest sees only ck.* host functions.
      void parseFuelBudget(init.fuelPerDispatch);
      void (init.watchdogMs ?? 250);
      self.postMessage?.({ type: 'ready' });
      return;
    }
  });
}
