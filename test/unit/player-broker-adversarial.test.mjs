/**
 * Player-compute P3 broker adversarial suite (09 T7/T9), the CrowdyJS half.
 *
 * Exercises the page-side security boundary against a hostile module speaking
 * the worker protocol: allowlist bypass, grid-filter bypass, confused-deputy
 * payloads, side-loaded bytes, rate-cap floods, and the trap circuit breaker.
 * Covers the broker-reachable rows of C1-C14 from 13-phase-3-plan.md §5; the
 * server-authorization backstop and draft egress are proven in the game-api
 * suites.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

class FakeWorker {
  sent = [];
  listener = null;
  terminated = false;
  postMessage(message) {
    this.sent.push(message);
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
  lastResult() {
    return this.sent.filter((m) => m?.type === 'hostcall-result').at(-1);
  }
}

const GRID = { low: { x: 0n, y: 0n, z: 0n }, high: { x: 2n, y: 2n, z: 2n } };

async function makeBroker(overrides = {}) {
  const { PlayerCodeBroker } = await loadSdk();
  const worker = new FakeWorker();
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'glue.js',
    workerFactory: () => worker,
    grid: GRID,
    onHostCall: async (call) => {
      calls.push(call);
      return { ok: true };
    },
    ...overrides,
  });
  return { broker, worker, calls };
}

const flush = () => new Promise((r) => setImmediate(r));

test('C2: a bridge call outside the allowlist is denied', async () => {
  const { broker, worker, calls } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  for (const fn of ['fetch', 'setToken', 'admin_kill', 'transferGridOwnership', 'createCheckout']) {
    worker.receive({ type: 'hostcall', id: 1, fn, args: {} });
  }
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(worker.lastResult().ok, false);
  assert.match(worker.lastResult().error.message, /not allowed/);
});

test('C3: reads and effects outside the grid AABB are filtered', async () => {
  const { broker, worker, calls } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({ type: 'hostcall', id: 1, fn: 'chunk_get', args: { x: 9, y: 0, z: 0 } });
  worker.receive({ type: 'hostcall', id: 2, fn: 'voxel_set', args: { chunkX: 0, chunkY: 9, chunkZ: 0 } });
  worker.receive({ type: 'hostcall', id: 3, fn: 'emit_spatial', args: { chunkX: 0, chunkY: 0, chunkZ: 9 } });
  await flush();
  assert.equal(calls.length, 0);
  for (const m of worker.sent.filter((s) => s.type === 'hostcall-result')) {
    assert.equal(m.ok, false);
    assert.match(m.error.message, /outside/);
  }
  // An in-grid read is allowed through.
  worker.receive({ type: 'hostcall', id: 4, fn: 'chunk_get', args: { x: 1, y: 1, z: 1 } });
  await flush();
  assert.equal(calls.length, 1);
});

test('C4: confused-deputy malformed payloads are rejected, not coerced', async () => {
  const { broker, worker, calls } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({ type: 'hostcall', id: 1, fn: 'model_invoke', args: 'not-an-object' });
  worker.receive({ type: 'hostcall', fn: 'model_invoke', args: {} }); // missing id
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(worker.lastResult().ok, false);
});

test('C5: a side-loaded artifact (hash mismatch) is refused', async () => {
  const { broker, worker } = await makeBroker({
    artifactHash: 'expected-platform-hash',
    hashArtifact: async () => 'some-other-hash',
  });
  await assert.rejects(
    () => broker.start(new ArrayBuffer(8)),
    /not fetched from the platform/,
  );
  assert.equal(worker.terminated, false);
  assert.equal(worker.sent.length, 0);
});

test('C5: a platform-fetched artifact (hash match) starts', async () => {
  const { broker, worker } = await makeBroker({
    artifactHash: 'h',
    hashArtifact: async () => 'h',
  });
  await broker.start(new ArrayBuffer(8));
  assert.equal(worker.sent[0].type, 'init');
  assert.equal(worker.sent[0].authority, 'player');
});

test('C8: a rate-cap flood on one family is capped; other families still work', async () => {
  const { broker, worker, calls } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  let denied = 0;
  for (let i = 0; i < 120; i++) {
    worker.receive({ type: 'hostcall', id: i, fn: 'emit_spatial', args: { chunkX: 1, chunkY: 1, chunkZ: 1 } });
  }
  await flush();
  denied = worker.sent.filter((m) => m.type === 'hostcall-result' && !m.ok).length;
  assert.ok(denied > 0, 'egress flood should hit the rate cap');
  const egressAccepted = calls.filter((c) => c.fn === 'emit_spatial').length;
  assert.ok(egressAccepted <= 60, 'egress accepted stays within the cap');
  // A different family is unaffected.
  worker.receive({ type: 'hostcall', id: 999, fn: 'chunk_get', args: { x: 1, y: 1, z: 1 } });
  await flush();
  assert.ok(calls.some((c) => c.fn === 'chunk_get'));
});

test('C7: repeated traps open the local circuit breaker and terminate the worker', async () => {
  let opened = null;
  const { broker, worker } = await makeBroker({
    onCircuitOpen: (reason) => {
      opened = reason;
    },
  });
  await broker.start(new ArrayBuffer(8));
  for (let i = 0; i < 5; i++) {
    worker.receive({ type: 'trap', reason: 'fuel' });
  }
  await flush();
  assert.equal(opened, 'fuel');
  assert.equal(worker.terminated, true);
  await assert.rejects(() => broker.start(new ArrayBuffer(8)), /circuit is open/);
  broker.resetCircuit();
});

test('presentation calls route to the host sink, never to the SDK host path', async () => {
  const presented = [];
  const { broker, worker, calls } = await makeBroker({
    onPresentation: (p) => presented.push(p),
  });
  await broker.start(new ArrayBuffer(8));
  worker.receive({ type: 'hostcall', id: 1, fn: 'hud_set', args: { payload: { hp: 3 } } });
  worker.receive({ type: 'hostcall', id: 2, fn: 'overlay_draw', args: { payload: { line: [1, 2] } } });
  await flush();
  assert.equal(calls.length, 0, 'presentation never reaches onHostCall');
  assert.deepEqual(presented.map((p) => p.channel), ['hud', 'overlay']);
});

test('glue helpers: fuel budget parsing and watchdog classification', async () => {
  const { parseFuelBudget, runWithWatchdog } = await loadSdk();
  assert.equal(parseFuelBudget(undefined), null);
  assert.equal(parseFuelBudget('0'), null);
  assert.equal(parseFuelBudget('-5'), null);
  assert.equal(parseFuelBudget('100000000'), 100000000n);

  assert.deepEqual(await runWithWatchdog(() => {}, 250), { ok: true });
  const fuel = await runWithWatchdog(() => {
    throw new Error('wasm fuel exhausted');
  }, 250);
  assert.equal(fuel.ok, false);
  assert.equal(fuel.reason, 'fuel');
  let t = 0;
  const hung = await runWithWatchdog(() => {}, 10, () => (t += 100));
  assert.equal(hung.ok, false);
  assert.equal(hung.reason, 'watchdog');
});
