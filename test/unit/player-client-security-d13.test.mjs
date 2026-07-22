/**
 * D13 browser/client-mod security gate.
 *
 * Rows in test names map directly to p5-client-code-security.md. The corpus
 * uses hand-encoded executable WebAssembly for deterministic hostile cases.
 * Tests marked "worker" drive the production startGlueWorker + GlueRuntime
 * over an actual worker_threads Worker; the env-gated pipeline row separately
 * covers a production-toolchain artifact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSdk } from '../helpers.mjs';
import {
  COMPILED_CLIENT_CORPUS,
  makeForbiddenImportArtifact,
  makeHostCallArtifact,
  makeInfiniteSpinArtifact,
  makeMalformedHostCallLoopArtifact,
} from './fixtures/d13-wasm-corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const glueWorkerPath = join(here, 'fixtures', 'd13-glue-worker.mjs');
const GRID = {
  low: { x: 0n, y: 0n, z: 0n },
  high: { x: 2n, y: 2n, z: 2n },
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class FakeWorker {
  sent = [];
  listeners = new Set();
  terminated = false;

  postMessage(message) {
    this.sent.push(message);
    if (message?.type === 'init') {
      queueMicrotask(() => this.receive({ type: 'ready' }));
    }
  }

  addEventListener(_type, listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type, listener) {
    this.listeners.delete(listener);
  }

  terminate() {
    this.terminated = true;
  }

  receive(data) {
    for (const listener of this.listeners) listener({ data });
  }

  results() {
    return this.sent.filter((message) => message?.type === 'hostcall-result');
  }
}

class SilentWorker extends FakeWorker {
  postMessage(message) {
    this.sent.push(message);
  }
}

class NodeWorkerAdapter {
  worker = new Worker(glueWorkerPath);
  sent = [];
  messages = [];
  listeners = new Set();
  terminated = false;

  constructor() {
    this.worker.on('message', (data) => {
      this.messages.push(data);
      for (const listener of [...this.listeners]) listener({ data });
    });
  }

  postMessage(message, transfer = []) {
    this.sent.push(message);
    this.worker.postMessage(message, transfer);
  }

  addEventListener(_type, listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type, listener) {
    this.listeners.delete(listener);
  }

  terminate() {
    this.terminated = true;
    void this.worker.terminate();
  }

  send(message) {
    this.worker.postMessage(message);
  }

  async waitFor(predicate, after = 0, timeoutMs = 4000) {
    const existing = this.messages.slice(after).find(predicate);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.worker.off('message', onMessage);
        reject(new Error('timed out waiting for D13 worker message'));
      }, timeoutMs);
      const onMessage = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timeout);
        this.worker.off('message', onMessage);
        resolve(message);
      };
      this.worker.on('message', onMessage);
    });
  }
}

async function makeFakeBroker(overrides = {}) {
  const { PlayerCodeBroker } = await loadSdk();
  const worker = new FakeWorker();
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'd13-glue-worker.js',
    workerFactory: () => worker,
    grid: GRID,
    onHostCall: async (call) => {
      calls.push(call);
      return { accepted: true };
    },
    ...overrides,
  });
  return { broker, worker, calls };
}

async function makeRealBroker(overrides = {}) {
  const { PlayerCodeBroker } = await loadSdk();
  const worker = new NodeWorkerAdapter();
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: glueWorkerPath,
    workerFactory: () => worker,
    grid: GRID,
    onHostCall: async (call) => {
      calls.push(call);
      return { accepted: true };
    },
    ...overrides,
  });
  return { broker, worker, calls };
}

async function makeRestartingRealBroker(overrides = {}) {
  const { PlayerCodeBroker } = await loadSdk();
  const workers = [];
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: glueWorkerPath,
    workerFactory: () => {
      const worker = new NodeWorkerAdapter();
      workers.push(worker);
      return worker;
    },
    grid: GRID,
    onHostCall: async (call) => {
      calls.push(call);
      return { accepted: true };
    },
    ...overrides,
  });
  return { broker, workers, calls };
}

function artifactBuffer(bytes) {
  return bytes.slice().buffer;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

test('C2/C3: bounded property fuzz rejects malformed host_call fields without reaching the host', async () => {
  const { broker, worker, calls } = await makeFakeBroker();
  await broker.start(new ArrayBuffer(8));
  const random = mulberry32(0xd13c2c3);
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);

  try {
    for (let iteration = 0; iteration < 112; iteration++) {
      const id = iteration + 1;
      const cycle = Math.floor(iteration / 14);
      const base = {
        type: 'hostcall',
        id,
        fn: 'chunk_get',
        args: { x: 1, y: 1, z: 1 },
      };
      const mutation = iteration % 14;
      let envelope;
      switch (mutation) {
        case 0:
          envelope = { ...base, id: [NaN, Infinity, -1, 1.5, '1'][cycle % 5] };
          break;
        case 1:
          envelope = { ...base, fn: `unknown_${Math.floor(random() * 1_000_000)}` };
          break;
        case 2:
          envelope = { ...base, fn: [null, 4, {}, []][cycle % 4] };
          break;
        case 3:
          envelope = { ...base, args: [null, [], 'args', new Date(0)][cycle % 4] };
          break;
        case 4:
          envelope = { ...base, bindingKind: 'studio' };
          break;
        case 5:
          envelope = { ...base, args: { ...base.args, bindingKind: 'studio' } };
          break;
        case 6:
          envelope = {
            ...base,
            args: {
              x: [
                Number.MAX_SAFE_INTEGER + 1,
                1.25,
                NaN,
                Infinity,
                '',
                ' 1',
                '0x1',
                '1.5',
              ][cycle % 8],
              y: 1,
              z: 1,
            },
          };
          break;
        case 7:
          envelope = { ...base, args: { x: 1, y: 1 } };
          break;
        case 8:
          envelope = {
            ...base,
            fn: 'model_invoke',
            args: { payload: 'x'.repeat(256 * 1024 + 1) },
          };
          break;
        case 9: {
          const circular = {};
          circular.self = circular;
          envelope = { ...base, fn: 'model_invoke', args: circular };
          break;
        }
        case 10:
          envelope = {
            ...base,
            args: Object.assign(Object.create({ inherited: true }), base.args),
          };
          break;
        case 11:
          envelope = {
            ...base,
            fn: 'fetch',
            reply: new SharedArrayBuffer(1),
          };
          break;
        case 12:
          envelope = { ...base, fn: 'f'.repeat(129) };
          break;
        default:
          envelope = { ...base, args: { ...base.args, authority: 'operator' } };
      }

      const before = worker.results().length;
      worker.receive(envelope);
      await flush();
      const result = worker.results().at(-1);
      assert.equal(worker.results().length, before + 1, `mutation ${mutation} replies`);
      assert.equal(result.ok, false, `mutation ${mutation} is denied`);
      assert.equal(result.error.kind, 'denied');
    }
    await flush();
  } finally {
    process.off('unhandledRejection', onUnhandled);
    broker.stop();
  }

  assert.equal(calls.length, 0);
  assert.deepEqual(unhandled, []);
  assert.equal(worker.terminated, true, 'worker remains controllable after the fuzz loop');
});

test('C4: every host-call family is independently rate-capped under deterministic floods', async () => {
  const families = [
    ['model', 100, 'container_get', {}],
    ['state', 100, 'user_state_get', {}],
    ['world_read', 400, 'chunk_get', { x: 1, y: 1, z: 1 }],
    ['world_write', 200, 'voxel_set', { chunkX: 1, chunkY: 1, chunkZ: 1 }],
    ['egress', 60, 'emit_spatial', { chunkX: 1, chunkY: 1, chunkZ: 1 }],
    ['present', 120, 'hud_set', { payload: 'bounded' }],
    ['meta', 100, 'grid_permission_check', {}],
  ];

  for (const [family, cap, fn, args] of families) {
    const presented = [];
    const { broker, worker } = await makeFakeBroker({
      onPresentation: (value) => presented.push(value),
    });
    await broker.start(new ArrayBuffer(8));
    for (let id = 0; id <= cap; id++) {
      worker.receive({ type: 'hostcall', id, fn, args });
    }
    await flush();
    const results = worker.results();
    assert.equal(
      results.filter((result) => result.ok).length,
      cap,
      `${family} accepts exactly its cap`,
    );
    assert.equal(
      results.filter((result) => !result.ok).length,
      1,
      `${family} denies the first excess call`,
    );
    assert.match(
      results.find((result) => !result.ok).error.message,
      /rate cap exceeded/,
    );

    const before = worker.results().length;
    const other =
      family === 'world_read'
        ? { fn: 'container_get', args: {} }
        : { fn: 'chunk_get', args: { x: 1, y: 1, z: 1 } };
    worker.receive({ type: 'hostcall', id: 10_000, ...other });
    await flush();
    assert.equal(worker.results().length, before + 1);
    assert.equal(worker.results().at(-1).ok, true, `${family} flood does not starve peers`);
    if (family === 'present') assert.equal(presented.length, cap);
    broker.stop();
  }
});

test('C1: hand-encoded forbidden imports fail closed in the real glue runtime', async () => {
  const { GlueRuntime } = await loadSdk();
  const attempts = [
    ['env', 'fetch'],
    ['worker', 'postMessage'],
    ['js', 'globalThis'],
    ['ck', 'WebAssembly.instantiate'],
    ['wasi_snapshot_preview1', 'sock_open'],
  ];

  for (const [moduleName, importName] of attempts) {
    const artifact = makeForbiddenImportArtifact(moduleName, importName);
    await WebAssembly.compile(artifact);
    const runtime = new GlueRuntime({ hostCallSync: () => new Uint8Array(0) });
    await assert.rejects(
      () => runtime.instantiate(artifactBuffer(artifact)),
      /(import|module|function|callable)/i,
      `${moduleName}.${importName} must not resolve`,
    );
  }

  const { broker, worker } = await makeRealBroker();
  await broker.start(
    artifactBuffer(makeForbiddenImportArtifact('worker', 'postMessage')),
  );
  const trap = await worker.waitFor((message) => message?.type === 'trap');
  assert.match(trap.detail, /(import|module|function|callable)/i);
  assert.equal(worker.messages.some((message) => message?.type === 'ready'), false);
  broker.stop();
});

test('C5: pointer/length ABI fuzz fails closed and handles memory growth without stale-buffer access', async () => {
  const { GlueRuntime } = await loadSdk();
  const memory = { buffer: new ArrayBuffer(64) };
  let allocPtr = 32;
  const exports = {
    memory,
    ck_alloc: () => allocPtr,
    ck_free: () => {},
  };
  const requests = [];
  let randomFillCalls = 0;
  const runtime = new GlueRuntime({
    hostCallSync: (bytes) => {
      requests.push(bytes.slice());
      return new Uint8Array([9, 8, 7]);
    },
    randomFill: (buf) => {
      randomFillCalls += 1;
      buf.fill(0xa5);
    },
  });
  const imports = runtime.buildImports(() => exports);

  for (const [ptr, len] of [
    [-1, 1],
    [0, -1],
    [64, 1],
    [63, 2],
    [65, 0],
    [Number.MAX_SAFE_INTEGER, 1],
  ]) {
    assert.throws(
      () => imports.ck.host_call(ptr, len),
      /outside guest memory/,
      `ptr=${ptr}, len=${len}`,
    );
  }

  assert.doesNotThrow(() => imports.ck.host_call(0, 0));
  assert.equal(requests.at(-1).length, 0);

  assert.throws(
    () => imports.wasi_snapshot_preview1.random_get(0, 0x7fffffff),
    /outside guest memory/,
  );
  assert.equal(
    randomFillCalls,
    0,
    'random_get validates guest bounds before allocating or filling',
  );
  assert.equal(imports.wasi_snapshot_preview1.random_get(8, 4), 0);
  assert.equal(randomFillCalls, 1);
  assert.deepEqual([...new Uint8Array(memory.buffer, 8, 4)], [0xa5, 0xa5, 0xa5, 0xa5]);

  allocPtr = 0;
  assert.throws(
    () => imports.ck.host_call(0, 0),
    /null reply pointer/,
  );
  allocPtr = 63;
  assert.throws(
    () => imports.ck.host_call(0, 0),
    /outside guest memory/,
  );

  const growingMemory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
  const growingExports = {
    memory: growingMemory,
    ck_alloc: () => 1024,
    ck_free: () => {},
  };
  new Uint8Array(growingMemory.buffer, 16, 3).set([1, 2, 3]);
  const oldBuffer = growingMemory.buffer;
  const growingRuntime = new GlueRuntime({
    hostCallSync: (bytes) => {
      assert.deepEqual([...bytes], [1, 2, 3]);
      growingMemory.grow(1);
      return new Uint8Array([4, 5, 6]);
    },
  });
  const growingImports = growingRuntime.buildImports(() => growingExports);
  const packed = growingImports.ck.host_call(16, 3);
  assert.equal(oldBuffer.byteLength, 0, 'memory.grow detached the original buffer');
  assert.deepEqual(
    [...new Uint8Array(growingMemory.buffer, Number(packed >> 32n), 3)],
    [4, 5, 6],
  );
});

test('C5: hostile hand-encoded artifacts trap in the real worker for OOB, zero-length, and bad alloc pointers', async () => {
  const hostileCorpus = [
    ['request OOB', makeHostCallArtifact({
      request: '{}',
      callPtr: 65_530,
      callLen: 64,
    }), /outside guest memory/],
    ['zero-length JSON', makeHostCallArtifact({
      request: '{}',
      callPtr: 0,
      callLen: 0,
    }), /not valid JSON/],
    ['null ck_alloc', makeHostCallArtifact({
      request: { fn: 'grid_info', args: {} },
      allocPtr: 0,
    }), /null reply pointer/],
    ['OOB ck_alloc', makeHostCallArtifact({
      request: { fn: 'grid_info', args: {} },
      allocPtr: 65_535,
    }), /outside guest memory/],
  ];

  for (const [name, artifact, detail] of hostileCorpus) {
    await WebAssembly.compile(artifact);
    const { broker, worker } = await makeRealBroker();
    await broker.start(artifactBuffer(artifact));
    const trap = await worker.waitFor((message) => message?.type === 'trap');
    assert.match(trap.detail, detail, name);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(worker.messages.some((message) => message?.type === 'ready'), false);
    broker.stop();
  }
});

test('C5: oversized SAB replies become a valid bounded error envelope', async () => {
  const {
    SAB_DATA_BYTES,
    createGlueSab,
    glueDecoder,
    writeGlueReply,
  } = await import('../../dist/player-runtime/glue-sab.js');
  const view = createGlueSab(128);
  const oversized = new Uint8Array(SAB_DATA_BYTES / 1024);
  oversized.fill(0x5a);
  writeGlueReply(view, oversized);
  const replyLength = Atomics.load(view.header, 1);
  assert.ok(replyLength <= view.data.length);
  const decoded = JSON.parse(
    glueDecoder.decode(view.data.slice(0, replyLength)),
  );
  assert.deepEqual(decoded, {
    ok: false,
    error: {
      kind: 'response_too_large',
      message: 'host response exceeds reply limit',
    },
  });
});

test('C5: late SAB replies are rejected by request id and cannot wake the next call', async () => {
  const {
    SAB_STATE_PENDING,
    armGlueRequest,
    createGlueSab,
    glueDecoder,
    waitAndReadGlueReply,
    writeGlueResult,
  } = await import('../../dist/player-runtime/glue-sab.js');
  const view = createGlueSab(256);

  armGlueRequest(view, 1);
  assert.throws(() => waitAndReadGlueReply(view, 1, 1), /timed out/);

  armGlueRequest(view, 2);
  assert.equal(
    writeGlueResult(view, { ok: true, data: 'stale' }, 1),
    false,
  );
  assert.equal(Atomics.load(view.header, 0), SAB_STATE_PENDING);
  assert.equal(
    writeGlueResult(view, { ok: true, data: 'current' }, 2),
    true,
  );
  const decoded = JSON.parse(
    glueDecoder.decode(waitAndReadGlueReply(view, 2, 1)),
  );
  assert.deepEqual(decoded, { ok: true, data: 'current' });
});

test('C6: a one-byte tamper of an executable artifact is rejected before worker creation', async () => {
  const original = COMPILED_CLIENT_CORPUS.benignRead.slice();
  await WebAssembly.compile(original);
  const expectedHash = createHash('sha256').update(original).digest('hex');
  const tampered = original.slice();
  tampered[tampered.length - 1] ^= 0x01;

  const rejected = await makeFakeBroker({ artifactHash: expectedHash });
  await assert.rejects(
    () => rejected.broker.start(artifactBuffer(tampered)),
    /not fetched from the platform/,
  );
  assert.equal(rejected.worker.sent.length, 0);

  const accepted = await makeFakeBroker({ artifactHash: expectedHash });
  await accepted.broker.start(artifactBuffer(original));
  assert.equal(accepted.worker.sent[0].type, 'init');
  accepted.broker.stop();
});

test('C8: hand-encoded presentation payloads stay opaque and sink-only through the real worker', async () => {
  const calls = [];
  const presented = [];
  const { broker, worker } = await makeRealBroker({
    onHostCall: async (call) => {
      calls.push(call);
      return {};
    },
    onPresentation: (presentation) => presented.push(presentation),
  });
  await broker.start(artifactBuffer(COMPILED_CLIENT_CORPUS.presentation));
  await worker.waitFor((message) => message?.type === 'ready');
  assert.equal(calls.length, 0);
  assert.deepEqual(presented, [{
    channel: 'hud',
    payload: '<img src=x onerror=globalThis.pwned=1>',
  }]);
  assert.equal(globalThis.pwned, undefined);
  broker.stop();
});

test('C1/C2 corpus: a benign hand-encoded artifact runs through the production worker and broker', async () => {
  const { broker, worker, calls } = await makeRealBroker();
  await broker.start(artifactBuffer(COMPILED_CLIENT_CORPUS.benignRead));
  await worker.waitFor((message) => message?.type === 'ready');
  assert.deepEqual(calls, [{
    fn: 'actors_list',
    args: { x: 1, y: 1, z: 1 },
  }]);
  assert.ok(worker.messages.some((message) => message?.type === 'dispatch-ok'));
  broker.stop();
});

test('C4: a slow valid host call pauses the CPU watchdog without killing the worker', async () => {
  const { broker, worker } = await makeRealBroker({
    dispatchWatchdogMs: 100,
    hostCallTimeoutMs: 1000,
    onHostCall: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { accepted: true };
    },
  });
  try {
    await broker.start(artifactBuffer(COMPILED_CLIENT_CORPUS.benignRead));
    await worker.waitFor((message) => message?.type === 'ready');
    assert.equal(worker.terminated, false);
  } finally {
    broker.stop();
  }
});

test('C4: timed-out host calls terminate and replace the blocked worker', async () => {
  let resolveOpened;
  const openedPromise = new Promise((resolve) => {
    resolveOpened = resolve;
  });
  const { broker, workers } = await makeRestartingRealBroker({
    dispatchWatchdogMs: 20,
    hostCallTimeoutMs: 25,
    startupWatchdogMs: 1000,
    onHostCall: () => new Promise(() => {}),
    onCircuitOpen: resolveOpened,
  });
  await broker.start(artifactBuffer(COMPILED_CLIENT_CORPUS.benignRead));
  const reason = await withTimeout(
    openedPromise,
    8000,
    'host-call timeout circuit did not open',
  );
  assert.equal(reason, 'hostcall-timeout');
  assert.equal(workers.length, 5);
  assert.ok(workers.every((worker) => worker.terminated));
  broker.resetCircuit();
  broker.stop();
});

const toolchainArtifactPath = process.env.CROWDY_D13_TOOLCHAIN_WASM;
test(
  'C1/C2 pipeline: a production-toolchain client artifact runs through the worker and broker',
  {
    skip: toolchainArtifactPath
      ? false
      : 'set CROWDY_D13_TOOLCHAIN_WASM to a client artifact emitted by the production pipeline',
  },
  async () => {
    const file = await readFile(toolchainArtifactPath);
    const artifact = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    );
    await WebAssembly.compile(artifact);
    const { broker, worker } = await makeRealBroker({
      startupWatchdogMs: 5000,
      fuelPerDispatch: 4_000_000_000n,
    });
    await broker.start(artifact);
    await worker.waitFor((message) => message?.type === 'ready', 0, 8000);
    broker.stop();
  },
);

test('C2/A5-client: forged bindingKind is stripped by glue and refused by the broker', async () => {
  const { broker, worker, calls } = await makeRealBroker();
  await broker.start(artifactBuffer(COMPILED_CLIENT_CORPUS.forgedBinding));
  await worker.waitFor((message) => message?.type === 'ready');
  const bridged = worker.messages.find((message) => message?.type === 'hostcall');
  assert.equal(Object.hasOwn(bridged, 'bindingKind'), false);
  assert.equal(calls.length, 0);
  const denied = worker.sent.find(
    (message) => message?.type === 'hostcall-result' && !message.ok,
  );
  assert.match(denied.error.message, /cannot override 'bindingKind'/);
  broker.stop();

  const direct = await makeFakeBroker();
  await direct.broker.start(new ArrayBuffer(8));
  direct.worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'actors_list',
    args: { x: 1, y: 1, z: 1 },
    bindingKind: 'studio',
  });
  await flush();
  assert.equal(direct.calls.length, 0);
  assert.match(
    direct.worker.results().at(-1).error.message,
    /unexpected hostcall envelope field 'bindingKind'/,
  );
  direct.broker.stop();
});

test('C4: the page watchdog terminates and recreates truly nonterminating workers', async () => {
  const spinner = makeInfiniteSpinArtifact();
  await WebAssembly.compile(spinner);
  let resolveOpened;
  const openedPromise = new Promise((resolve) => {
    resolveOpened = resolve;
  });
  const { broker, workers } = await makeRestartingRealBroker({
    dispatchWatchdogMs: 20,
    startupWatchdogMs: 1000,
    tickIntervalMs: 1,
    onCircuitOpen: resolveOpened,
  });
  await broker.start(artifactBuffer(spinner));
  const reason = await withTimeout(
    openedPromise,
    8000,
    'hard watchdog did not open circuit',
  );
  assert.equal(reason, 'dispatch-watchdog');
  assert.equal(workers.length, 5, 'one initial worker plus four replacements');
  assert.ok(workers.every((worker) => worker.terminated));
  await assert.rejects(
    () => broker.start(artifactBuffer(makeInfiniteSpinArtifact())),
    /circuit is open/,
  );
  broker.resetCircuit();
  broker.stop();
});

test('C4: the startup watchdog replaces workers that never initialize', async () => {
  const { PlayerCodeBroker } = await loadSdk();
  const workers = [];
  let resolveOpened;
  const openedPromise = new Promise((resolve) => {
    resolveOpened = resolve;
  });
  const broker = new PlayerCodeBroker({
    workerUrl: 'silent-worker.js',
    workerFactory: () => {
      const worker = new SilentWorker();
      workers.push(worker);
      return worker;
    },
    grid: GRID,
    startupWatchdogMs: 10,
    onHostCall: async () => ({}),
    onCircuitOpen: resolveOpened,
  });
  await broker.start(new ArrayBuffer(8));
  const reason = await withTimeout(
    openedPromise,
    2000,
    'startup watchdog did not open circuit',
  );
  assert.equal(reason, 'startup-watchdog');
  assert.equal(workers.length, 5);
  assert.ok(workers.every((worker) => worker.terminated));
  broker.resetCircuit();
  broker.stop();
});

test('C4: a sustained malformed host-call loop trips the early global abuse circuit', async () => {
  const flooder = makeMalformedHostCallLoopArtifact();
  await WebAssembly.compile(flooder);
  let resolveOpened;
  const openedPromise = new Promise((resolve) => {
    resolveOpened = resolve;
  });
  const { broker, workers, calls } = await makeRestartingRealBroker({
    dispatchWatchdogMs: 5000,
    startupWatchdogMs: 1000,
    tickIntervalMs: 1,
    onCircuitOpen: resolveOpened,
  });
  await broker.start(artifactBuffer(flooder));
  const reason = await withTimeout(
    openedPromise,
    8000,
    'malformed-call abuse circuit did not open',
  );
  assert.equal(reason, 'global host-call rate exceeded');
  assert.equal(calls.length, 0);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, true);
  broker.resetCircuit();
  broker.stop();
});
