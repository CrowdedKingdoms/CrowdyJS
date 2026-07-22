/**
 * The synchronous host-call transport for browser-target player WASM
 * (player compute P5). WASM imports are synchronous, but the host-call
 * handler (the server-authorized SDK path) is async and lives on the page,
 * while the guest runs in a Worker. The only correct bridge is a
 * SharedArrayBuffer the worker blocks on with `Atomics.wait`: the worker
 * writes the request, posts a wake to the page, and blocks; the page
 * services the async call and writes the reply back into the SAB, then
 * `Atomics.notify` wakes the worker. (A worker blocked in `Atomics.wait`
 * cannot receive `postMessage`, which is exactly why the reply must return
 * through the SAB, not a message.)
 *
 * SharedArrayBuffer + Atomics require cross-origin isolation
 * (COOP: same-origin + COEP: require-corp) in the browser; Node worker
 * threads have them unconditionally, which is how this is integration-tested.
 *
 * Layout: [ state:i32, len:i32 ] header, then a byte data region.
 *   state: 0 IDLE, 1 PENDING (worker waiting), 2 DONE.
 * The request travels to the page as a normal postMessage (before the
 * worker blocks); only the reply uses the SAB.
 */

export const SAB_STATE_IDLE = 0;
export const SAB_STATE_PENDING = 1;
export const SAB_STATE_DONE = 2;

const HEADER_I32 = 2; // state, len
export const SAB_HEADER_BYTES = HEADER_I32 * 4;
/** 1 MiB reply region — host-call replies (chunk/actor reads) are well under this. */
export const SAB_DATA_BYTES = 1024 * 1024;

export interface GlueSab {
  sab: SharedArrayBuffer;
  header: Int32Array;
  data: Uint8Array;
}

export function createGlueSab(dataBytes = SAB_DATA_BYTES): GlueSab {
  const sab = new SharedArrayBuffer(SAB_HEADER_BYTES + dataBytes);
  return wrapGlueSab(sab);
}

export function wrapGlueSab(sab: SharedArrayBuffer): GlueSab {
  return {
    sab,
    header: new Int32Array(sab, 0, HEADER_I32),
    data: new Uint8Array(sab, SAB_HEADER_BYTES),
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Responder side (page/broker): write the reply envelope bytes into the SAB
 * and wake the blocked worker. `respBytes` must already be the SDK Response
 * envelope (`{ok,data}` / `{ok:false,error}`) the guest expects.
 */
export function writeGlueReply(view: GlueSab, respBytes: Uint8Array): void {
  const len = Math.min(respBytes.length, view.data.length);
  view.data.set(respBytes.subarray(0, len));
  Atomics.store(view.header, 1, len);
  Atomics.store(view.header, 0, SAB_STATE_DONE);
  Atomics.notify(view.header, 0, 1);
}

/** Convenience for responders holding a plain object result. */
export function writeGlueResult(view: GlueSab, result: unknown): void {
  writeGlueReply(view, encoder.encode(JSON.stringify(result)));
}

/**
 * Requester side (worker): mark PENDING before posting the wake, block until
 * the page flips the state to DONE, then read the reply bytes out. The
 * caller is responsible for posting the request message between `arm()` and
 * `waitAndRead()` — that ordering (post, then wait) is what lets the page
 * see the request while the worker is blocked.
 */
export function armGlueRequest(view: GlueSab): void {
  Atomics.store(view.header, 1, 0);
  Atomics.store(view.header, 0, SAB_STATE_PENDING);
}

export function waitAndReadGlueReply(view: GlueSab, timeoutMs = 5000): Uint8Array {
  const res = Atomics.wait(view.header, 0, SAB_STATE_PENDING, timeoutMs);
  if (res === 'timed-out') {
    throw new Error('host call timed out');
  }
  const len = Atomics.load(view.header, 1);
  const out = view.data.slice(0, len);
  Atomics.store(view.header, 0, SAB_STATE_IDLE);
  return out;
}

export { encoder as glueEncoder, decoder as glueDecoder };
