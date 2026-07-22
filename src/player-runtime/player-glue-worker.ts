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
 *  - it enforces a per-dispatch wall-clock watchdog and reports traps to the
 *    broker, which owns the local circuit breaker.
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
  let watchdogMs = 250;
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
    const id = ++hostCallId;
    armGlueRequest(sab);
    post({
      type: 'hostcall',
      id,
      fn: parsed.fn,
      args: parsed.args ?? {},
      reply: sab.sab,
    });
    return waitAndReadGlueReply(sab);
  };

  const onInit = async (init: GlueInitMessage) => {
    watchdogMs = init.watchdogMs ?? 250;
    void parseFuelBudget(init.fuelPerDispatch);
    sab = createGlueSab();
    runtime = new GlueRuntime({
      hostCallSync,
      onLog: (level, message) => post({ type: 'log', level, message }),
    });
    try {
      await runtime.instantiate(init.artifact);
      const initResult = await runWithWatchdog(() => runtime!.init(), watchdogMs);
      report(initResult);
      if ((init.tickIntervalMs ?? 0) > 0) startTicking(init.tickIntervalMs!);
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'trap', reason: 'trap', detail: (err as Error).message });
    }
  };

  const report = (result: GlueDispatchResult) => {
    if (result.ok) post({ type: 'dispatch-ok' });
    else post({ type: 'trap', reason: result.reason, detail: result.detail });
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
      void runWithWatchdog(() => runtime!.tick(dt), watchdogMs).then(report);
      setTimeout(loop, intervalMs);
    };
    setTimeout(loop, intervalMs);
  };

  const handle = (data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const msg = data as Record<string, unknown>;
    if (msg.type === 'init') void onInit(msg as unknown as GlueInitMessage);
    else if (msg.type === 'tick' && runtime) {
      void runWithWatchdog(
        () => runtime!.tick(typeof msg.dtMs === 'number' ? msg.dtMs : 0),
        watchdogMs,
      ).then(report);
    } else if (msg.type === 'invoke' && runtime) {
      const payload =
        msg.payload instanceof Uint8Array ? msg.payload : new Uint8Array(0);
      try {
        const out = runtime.invoke(payload);
        post({ type: 'invoke-result', id: msg.id, ok: true, payload: out });
      } catch (err) {
        post({
          type: 'invoke-result',
          id: msg.id,
          ok: false,
          error: (err as Error).message,
        });
      }
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
