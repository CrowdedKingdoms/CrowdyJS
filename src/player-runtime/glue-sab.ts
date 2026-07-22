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
 * Layout: [ state:i32, len:i32, requestId:i32 ] header, then a byte data
 * region. The request id prevents a host response that completed after the
 * worker's timeout from waking a later request that reused the same SAB.
 *   state: 0 IDLE, 1 PENDING (worker waiting), 2 DONE.
 * The request travels to the page as a normal postMessage (before the
 * worker blocks); only the reply uses the SAB.
 */

export const SAB_STATE_IDLE = 0;
export const SAB_STATE_PENDING = 1;
export const SAB_STATE_DONE = 2;
export const GLUE_HOST_CALL_TIMEOUT_MS = 5000;

const HEADER_I32 = 3; // state, len, request id
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
const overflowReply = encoder.encode(
  JSON.stringify({
    ok: false,
    error: { kind: 'response_too_large', message: 'host response exceeds reply limit' },
  }),
);

/**
 * Responder side (page/broker): write the reply envelope bytes into the SAB
 * and wake the blocked worker. `respBytes` must already be the SDK Response
 * envelope (`{ok,data}` / `{ok:false,error}`) the guest expects.
 */
export function writeGlueReply(
  view: GlueSab,
  respBytes: Uint8Array,
  requestId?: number,
): boolean {
  if (
    requestId != null &&
    (Atomics.load(view.header, 0) !== SAB_STATE_PENDING ||
      Atomics.load(view.header, 2) !== requestId)
  ) {
    return false;
  }
  const payload =
    respBytes.length <= view.data.length ? respBytes : overflowReply;
  if (payload.length > view.data.length) {
    throw new RangeError('glue reply region cannot hold the overflow envelope');
  }
  view.data.set(payload);
  Atomics.store(view.header, 1, payload.length);
  Atomics.store(view.header, 0, SAB_STATE_DONE);
  Atomics.notify(view.header, 0, 1);
  return true;
}

/** Convenience for responders holding a plain object result. */
export function writeGlueResult(
  view: GlueSab,
  result: unknown,
  requestId?: number,
): boolean {
  return writeGlueReply(view, encoder.encode(JSON.stringify(result)), requestId);
}

/**
 * Requester side (worker): mark PENDING before posting the wake, block until
 * the page flips the state to DONE, then read the reply bytes out. The
 * caller is responsible for posting the request message between `arm()` and
 * `waitAndRead()` — that ordering (post, then wait) is what lets the page
 * see the request while the worker is blocked.
 */
export function armGlueRequest(view: GlueSab, requestId: number): void {
  Atomics.store(view.header, 1, 0);
  Atomics.store(view.header, 2, requestId);
  Atomics.store(view.header, 0, SAB_STATE_PENDING);
}

export function waitAndReadGlueReply(
  view: GlueSab,
  requestId: number,
  timeoutMs = GLUE_HOST_CALL_TIMEOUT_MS,
): Uint8Array {
  const res = Atomics.wait(view.header, 0, SAB_STATE_PENDING, timeoutMs);
  if (res === 'timed-out') {
    Atomics.compareExchange(
      view.header,
      0,
      SAB_STATE_PENDING,
      SAB_STATE_IDLE,
    );
    throw new Error('host call timed out');
  }
  if (Atomics.load(view.header, 2) !== requestId) {
    Atomics.store(view.header, 0, SAB_STATE_IDLE);
    throw new Error('host call reply id mismatch');
  }
  const len = Atomics.load(view.header, 1);
  if (len < 0 || len > view.data.length) {
    Atomics.store(view.header, 0, SAB_STATE_IDLE);
    throw new Error('host call reply length is invalid');
  }
  const out = view.data.slice(0, len);
  Atomics.store(view.header, 0, SAB_STATE_IDLE);
  return out;
}

export { encoder as glueEncoder, decoder as glueDecoder };
