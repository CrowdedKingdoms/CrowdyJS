/**
 * Browser Web Worker entry for browser-target player WASM (player compute
 * P3/P5). This is the ONLY platform code that shares an execution context
 * with an untrusted player module. It is intentionally thin: the auditable
 * runtime + ABI marshalling live in [glue-runtime.ts] and the synchronous
 * host-call transport in [glue-sab.ts]; this file only wires them to the
 * worker message loop.
 *
 *  - it instantiates the gas-injected player artifact with an import table
 *    that exposes ONLY `ck.*` + inert wasi stubs (nothing else importable),
 *  - it never has the DOM, `window`, auth tokens, `fetch`, or third-party
 *    `importScripts`,
 *  - `ck.host_call` blocks the worker on a SharedArrayBuffer while the
 *    page-side broker services the (async) server-authorized call and writes
 *    the reply back, so the guest sees a synchronous gateway,
 *  - it announces each dispatch before entering WASM; the page-side broker
 *    owns the hard watchdog and can terminate this worker if WASM never
 *    returns. The local elapsed-time helper only classifies completed calls.
 *
 * Re-exports the pure helpers + the runtime so tests and bundlers can use
 * them without touching worker globals.
 */

import {
  GlueRuntime,
  GLUE_HOST_FUNCTIONS,
  parseFuelBudget,
  runWithWatchdog,
  type GlueInitMessage,
  type GlueDispatchResult,
} from './glue-runtime.js';
import {
  createGlueSab,
  armGlueRequest,
  GLUE_HOST_CALL_TIMEOUT_MS,
  waitAndReadGlueReply,
  type GlueSab,
} from './glue-sab.js';

export {
  GlueRuntime,
  GLUE_HOST_FUNCTIONS,
  parseFuelBudget,
  runWithWatchdog,
  type GlueInitMessage,
  type GlueDispatchResult,
};

declare const self: {
  addEventListener?: (type: string, listener: (e: MessageEvent) => void) => void;
  postMessage?: (message: unknown, transfer?: Transferable[]) => void;
} & Record<string, unknown>;

/**
 * Wire the glue runtime to a worker-like message port. Exported (not just
 * run at import) so the Node integration test can drive the identical wiring
 * over a `worker_threads` port.
 */
export function startGlueWorker(port: {
  addEventListener?: (t: string, l: (e: MessageEvent) => void) => void;
  on?: (t: string, l: (data: unknown) => void) => void;
  postMessage: (message: unknown) => void;
}): void {
  let runtime: GlueRuntime | null = null;
  let sab: GlueSab | null = null;
  let hostCallId = 0;
  let dispatchId = 0;
  let hostCallTimeoutMs = GLUE_HOST_CALL_TIMEOUT_MS;
  let ticking = false;

  const post = (message: unknown) => port.postMessage(message);

  // Synchronous gateway: post the request (so the page can see it), then
  // block on the SAB until the broker writes the reply.
  const hostCallSync = (reqBytes: Uint8Array): Uint8Array => {
    if (!sab) throw new Error('host-call transport not initialized');
    let parsed: { fn?: unknown; args?: unknown };
    try {
      parsed = JSON.parse(new TextDecoder().decode(reqBytes));
    } catch {
      throw new Error('host_call request was not valid JSON');
    }
    hostCallId = (hostCallId % 0x7ffffffe) + 1;
    const id = hostCallId;
    armGlueRequest(sab, id);
    post({
      type: 'hostcall',
      id,
      fn: parsed.fn,
      args: parsed.args ?? {},
      reply: sab.sab,
    });
    return waitAndReadGlueReply(sab, id, hostCallTimeoutMs);
  };

  const beginDispatch = (kind: 'init' | 'tick' | 'invoke'): number => {
    dispatchId = (dispatchId % 0x7ffffffe) + 1;
    post({ type: 'dispatch-start', id: dispatchId, kind });
    return dispatchId;
  };

  const report = (
    id: number,
    kind: 'init' | 'tick' | 'invoke',
    result: GlueDispatchResult,
  ) => {
    if (result.ok) post({ type: 'dispatch-ok', id, kind });
    else {
      post({
        type: 'trap',
        id,
        kind,
        reason: result.reason,
        detail: result.detail,
      });
    }
  };

  // Trap classification remains local, but wall-clock enforcement is entirely
  // page-side so time blocked on an authorized async host call is excluded.
  const runDispatch = (dispatch: () => unknown) =>
    runWithWatchdog(dispatch, Number.POSITIVE_INFINITY);

  const onInit = async (init: GlueInitMessage) => {
    hostCallTimeoutMs =
      init.hostCallTimeoutMs ?? GLUE_HOST_CALL_TIMEOUT_MS;
    sab = createGlueSab();
    const fuelPerDispatch = parseFuelBudget(init.fuelPerDispatch);
    runtime = new GlueRuntime({
      hostCallSync,
      onLog: (level, message) => post({ type: 'log', level, message }),
      fuelPerDispatch,
    });
    try {
      await runtime.instantiate(init.artifact);
      const id = beginDispatch('init');
      const initResult = await runDispatch(() => runtime!.init());
      report(id, 'init', initResult);
      if (!initResult.ok) return;
      if ((init.tickIntervalMs ?? 0) > 0) startTicking(init.tickIntervalMs!);
      post({ type: 'ready' });
    } catch (err) {
      post({
        type: 'trap',
        kind: 'startup',
        reason: 'trap',
        detail: (err as Error).message,
      });
    }
  };

  const startTicking = (intervalMs: number) => {
    if (ticking) return;
    ticking = true;
    let last = Date.now();
    const loop = () => {
      if (!ticking || !runtime) return;
      const nowT = Date.now();
      const dt = nowT - last;
      last = nowT;
      const id = beginDispatch('tick');
      void runDispatch(() => runtime!.tick(dt)).then((result) =>
        report(id, 'tick', result),
      );
      setTimeout(loop, intervalMs);
    };
    setTimeout(loop, intervalMs);
  };

  const handle = (data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg.type === 'init') void onInit(msg as unknown as GlueInitMessage);
    else if (msg.type === 'tick' && runtime) {
      const id = beginDispatch('tick');
      void runDispatch(
        () => runtime!.tick(typeof msg.dtMs === 'number' ? msg.dtMs : 0),
      ).then((result) => report(id, 'tick', result));
    } else if (msg.type === 'invoke' && runtime) {
      const payload =
        msg.payload instanceof Uint8Array ? msg.payload : new Uint8Array(0);
      const id = beginDispatch('invoke');
      let out: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      void runDispatch(() => {
        out = runtime!.invoke(payload);
      }).then((result) => {
        report(id, 'invoke', result);
        if (result.ok) {
          post({ type: 'invoke-result', id: msg.id, ok: true, payload: out });
        } else {
          post({
            type: 'invoke-result',
            id: msg.id,
            ok: false,
            error: result.detail ?? result.reason,
          });
        }
      });
    } else if (msg.type === 'stop') {
      ticking = false;
    }
  };

  if (port.addEventListener) {
    port.addEventListener('message', (e: MessageEvent) => handle(e.data));
  } else if (port.on) {
    port.on('message', (d: unknown) => handle(d));
  }
}

// Auto-start when loaded as a real browser Web Worker (has addEventListener,
// no window). Guarded so importing for the pure helpers never touches globals.
if (
  typeof self !== 'undefined' &&
  typeof self.addEventListener === 'function' &&
  typeof (self as Record<string, unknown>).window === 'undefined'
) {
  startGlueWorker({
    addEventListener: self.addEventListener.bind(self),
    postMessage: (m: unknown) => self.postMessage?.(m),
  });
}
