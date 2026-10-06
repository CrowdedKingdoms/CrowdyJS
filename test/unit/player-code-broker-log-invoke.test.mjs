/**
 * What a CLIENT half says and answers, on the page: its `crowdy::log` lines reach the broker's
 * `onLog` within a rate and size bound, and the page can call its `handle_invoke` export with
 * `invoke`. The worker cases run the production glue over a worker_threads Worker; the last one
 * runs a real crowdy-client-sdk build when CROWDY_EXEC_CLIENT_WASM names one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSdk, sleep } from '../helpers.mjs';
import { makeExecClientArtifact } from './fixtures/d13-wasm-corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const glueWorkerPath = join(here, 'fixtures', 'd13-glue-worker.mjs');
const GRID = { low: { x: 0n, y: 0n, z: 0n }, high: { x: 2n, y: 2n, z: 2n }, gridId: '5' };
const HASH = 'e'.repeat(64);
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeWorker {
  sent = [];
  listener = null;
  terminated = false;
  postMessage(message) {
    this.sent.push(message);
    if (message?.type === 'init') queueMicrotask(() => this.receive({ type: 'ready' }));
  }
  addEventListener(_type, listener) {
    this.listener = listener;
  }
  removeEventListener() {
    this.listener = null;
  }
  terminate() {
    this.terminated = true;
  }
  receive(data) {
    this.listener?.({ data });
  }
}

class NodeWorkerAdapter {
  worker = new Worker(glueWorkerPath);
  listeners = new Set();
  messages = [];
  constructor() {
    this.worker.on('message', (data) => {
      this.messages.push(data);
      for (const listener of [...this.listeners]) listener({ data });
    });
  }
  postMessage(message, transfer = []) {
    this.worker.postMessage(message, transfer);
  }
  addEventListener(_type, listener) {
    this.listeners.add(listener);
  }
  removeEventListener(_type, listener) {
    this.listeners.delete(listener);
  }
  terminate() {
    void this.worker.terminate();
  }
}

async function makeBroker(overrides = {}, worker = new FakeWorker()) {
  const { PlayerCodeBroker } = await loadSdk();
  const lines = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'glue.js',
    workerFactory: () => worker,
    grid: GRID,
    moduleName: 'hud',
    artifactHash: HASH,
    hashArtifact: async () => HASH,
    fuelPerDispatch: 1_000_000n,
    consentedHostCalls: [],
    eventBus: null,
    onHostCall: async () => null,
    onLog: (line) => lines.push(line),
    ...overrides,
  });
  return { broker, worker, lines };
}

async function until(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await sleep(5);
  }
}

test('a CLIENT half\u2019s log lines reach onLog with crowdy-client-sdk\u2019s levels and its module name', async () => {
  const { broker, worker, lines } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  for (const [level, message] of [[0, 'd'], [1, 'i'], [2, 'w'], [3, 'e'], [9, 'odd'], ['2', 'text level']]) {
    worker.receive({ type: 'log', level, message });
  }
  worker.receive({ type: 'log', level: 1, message: { html: '<b>' } });
  worker.receive({ type: 'log', level: 1 });
  await flush();
  assert.deepEqual(lines, [
    { level: 'debug', message: 'd', moduleName: 'hud' },
    { level: 'info', message: 'i', moduleName: 'hud' },
    { level: 'warn', message: 'w', moduleName: 'hud' },
    { level: 'error', message: 'e', moduleName: 'hud' },
    { level: 'info', message: 'odd', moduleName: 'hud' },
    { level: 'info', message: 'text level', moduleName: 'hud' },
  ]);
  broker.stop();
});

test('log lines are bounded: 20 a second, 1,000 characters, and a count of what was dropped', async () => {
  const { PLAYER_CODE_LOG_LINES_PER_SECOND, PLAYER_CODE_LOG_MAX_CHARS } = await loadSdk();
  const { broker, worker, lines } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({ type: 'log', level: 1, message: 'x'.repeat(5000) });
  for (let i = 0; i < 30; i++) worker.receive({ type: 'log', level: 1, message: `line ${i}` });
  await flush();
  assert.equal(lines.length, PLAYER_CODE_LOG_LINES_PER_SECOND);
  assert.equal(lines[0].message.length, PLAYER_CODE_LOG_MAX_CHARS);
  assert.ok(lines[0].message.endsWith('…'));

  // The worker's own count of lines it did not post is added to the broker's.
  worker.receive({ type: 'log', level: 1, message: 'held', dropped: 4 });
  await sleep(1050);
  worker.receive({ type: 'log', level: 1, message: 'after' });
  await flush();
  assert.deepEqual(lines.slice(PLAYER_CODE_LOG_LINES_PER_SECOND), [
    { level: 'warn', message: '16 log lines dropped (more than 20 a second)', moduleName: 'hud' },
    { level: 'info', message: 'after', moduleName: 'hud' },
  ]);
  broker.stop();
});

test('a sink that throws, a stale worker and a broker without a sink drop lines without harm', async () => {
  const quiet = await makeBroker({ onLog: undefined });
  await quiet.broker.start(new ArrayBuffer(8));
  quiet.worker.receive({ type: 'log', level: 1, message: 'nobody listens' });

  let calls = 0;
  const loud = await makeBroker({
    onLog: () => {
      calls += 1;
      throw new Error('the page broke');
    },
  });
  await loud.broker.start(new ArrayBuffer(8));
  loud.worker.receive({ type: 'log', level: 1, message: 'one' });
  loud.worker.receive({ type: 'log', level: 1, message: 'two' });
  await flush();
  assert.equal(calls, 2);

  const stale = loud.worker;
  loud.broker.stop();
  stale.receive({ type: 'log', level: 1, message: 'after stop' });
  await flush();
  assert.equal(calls, 2);
  quiet.broker.stop();
});

test('invoke calls handle_invoke with the payload and resolves with the reply', async () => {
  const { broker, worker } = await makeBroker();
  await assert.rejects(broker.invoke(new Uint8Array([1])), /not running/);
  await broker.start(new ArrayBuffer(8));
  await flush();

  const answer = broker.invoke(new Uint8Array([1, 2, 3]));
  const request = worker.sent.find((m) => m.type === 'invoke');
  assert.deepEqual([...request.payload], [1, 2, 3]);
  worker.receive({ type: 'invoke-result', id: request.id + 1, ok: true, payload: new Uint8Array([9]) });
  worker.receive({ type: 'invoke-result', id: request.id, ok: true, payload: new Uint8Array([4, 5]) });
  assert.deepEqual([...(await answer)], [4, 5]);

  const failed = broker.invoke(new Uint8Array(0));
  const second = worker.sent.filter((m) => m.type === 'invoke').at(-1);
  worker.receive({ type: 'invoke-result', id: second.id, ok: false, error: 'unreachable executed' });
  await assert.rejects(failed, /handle_invoke failed: unreachable executed/);

  const empty = broker.invoke(new Uint8Array(0));
  const third = worker.sent.filter((m) => m.type === 'invoke').at(-1);
  worker.receive({ type: 'invoke-result', id: third.id, ok: true, payload: 'not bytes' });
  await assert.rejects(empty, /no bytes/);
  broker.stop();
});

test('invoke is bounded: payload and reply size, eight pending, a timeout, and stop', async () => {
  const { PLAYER_CODE_INVOKE_MAX_BYTES } = await loadSdk();
  const { broker, worker } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  await flush();

  await assert.rejects(broker.invoke(new Uint8Array(PLAYER_CODE_INVOKE_MAX_BYTES + 1)), /exceeds/);
  await assert.rejects(broker.invoke('text'), /Uint8Array/);

  const big = broker.invoke(new Uint8Array(1));
  const bigId = worker.sent.filter((m) => m.type === 'invoke').at(-1).id;
  worker.receive({ type: 'invoke-result', id: bigId, ok: true, payload: new Uint8Array(PLAYER_CODE_INVOKE_MAX_BYTES + 1) });
  await assert.rejects(big, /reply exceeds/);

  await assert.rejects(broker.invoke(new Uint8Array(1), { timeoutMs: 20 }), /did not answer the invoke in time/);

  const pending = Array.from({ length: 8 }, () =>
    broker.invoke(new Uint8Array(1)).then(() => 'answered', (error) => error.message),
  );
  await assert.rejects(broker.invoke(new Uint8Array(1)), /too many invokes are pending/);
  broker.stop();
  assert.deepEqual(await Promise.all(pending), Array(8).fill('the CLIENT half stopped'));
});

test('through the production glue: a CLIENT half\u2019s init log reaches onLog, and invoke echoes', async () => {
  const artifact = makeExecClientArtifact({ withInvoke: true });
  const worker = new NodeWorkerAdapter();
  const { broker, lines } = await makeBroker({}, worker);
  try {
    await broker.start(artifact.slice().buffer);
    await until(() => worker.messages.some((m) => m?.type === 'ready'));
    await flush();
    assert.deepEqual(lines, [{ level: 'info', message: 'ready', moduleName: 'hud' }]);
    const reply = await broker.invoke(new TextEncoder().encode('ping'));
    assert.equal(new TextDecoder().decode(reply), 'ping');
  } finally {
    broker.stop();
  }
});

test('through the production glue: a module that floods its log costs the page at most 50 lines a second', async () => {
  const artifact = makeExecClientArtifact({ initLogs: 120 });
  const received = [];
  const worker = new NodeWorkerAdapter();
  worker.addEventListener('message', ({ data }) => {
    if (data?.type === 'log') received.push(data);
  });
  const { broker, lines } = await makeBroker({}, worker);
  try {
    await broker.start(artifact.slice().buffer);
    await until(() => lines.length >= 20);
    await sleep(50);
    assert.equal(received.length, 50, 'the worker posted 50 of 120');
    assert.equal(lines.length, 20, 'the page saw 20');
  } finally {
    broker.stop();
  }
});

test('the glue reads at most 4 KiB of a log message and refuses one outside guest memory', async () => {
  const { GlueRuntime, GLUE_LOG_MAX_BYTES } = await loadSdk();
  const memory = { buffer: new ArrayBuffer(64 * 1024) };
  new Uint8Array(memory.buffer).fill(0x61);
  const seen = [];
  const glue = new GlueRuntime({ fuelPerDispatch: 1n, hostCallSync: () => new Uint8Array(), onLog: (l, m) => seen.push([l, m]) });
  const imports = glue.buildImports(() => ({ memory, ck_alloc: () => 0 }));
  imports.ck.log(2, 0, 10_000);
  assert.equal(seen[0][0], 2);
  assert.equal(seen[0][1].length, GLUE_LOG_MAX_BYTES);
  assert.throws(() => imports.ck.log(1, 60 * 1024, 10_000), /outside guest memory/);
});

const realArtifact = process.env.CROWDY_EXEC_CLIENT_WASM;

test(
  'a real crowdy-client-sdk build on the page: its log line, a HUD each tick, and invoke',
  {
    skip: realArtifact
      ? false
      : 'set CROWDY_EXEC_CLIENT_WASM to Studio\u2019s CLIENT starter built by the platform pipeline (cargo, instrument, wasm-opt)',
  },
  async () => {
    const bytes = readFileSync(realArtifact);
    const presentations = [];
    const worker = new NodeWorkerAdapter();
    const { broker, lines } = await makeBroker(
      {
        fuelPerDispatch: 100_000_000n,
        consentedHostCalls: ['hud_set'],
        tickIntervalMs: 20,
        onPresentation: (presentation) => presentations.push(presentation),
      },
      worker,
    );
    try {
      await broker.start(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      await until(() => presentations.length >= 2);
      assert.deepEqual(lines[0], { level: 'info', message: 'ready', moduleName: 'hud' });
      assert.deepEqual(presentations.slice(0, 2), [
        { channel: 'hud', payload: { text: 'Ticks here: 1' } },
        { channel: 'hud', payload: { text: 'Ticks here: 2' } },
      ]);
      const reply = await broker.invoke(new TextEncoder().encode('echo'));
      assert.equal(new TextDecoder().decode(reply), 'echo');
    } finally {
      broker.stop();
    }
  },
);
