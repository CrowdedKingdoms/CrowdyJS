import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

class FakeWorker {
  sent = [];
  listener = null;
  terminated = false;
  postMessage(message) {
    this.sent.push(message);
    if (message?.type === 'init') {
      queueMicrotask(() => this.receive({ type: 'ready' }));
    }
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
const flush = () => new Promise((r) => setImmediate(r));

async function makeBroker(overrides = {}) {
  const { PlayerCodeBroker } = await loadSdk();
  const worker = new FakeWorker();
  const calls = [];
  const presentations = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'glue.js',
    workerFactory: () => worker,
    grid: GRID,
    onHostCall: async (call) => {
      calls.push(call);
      return { ok: true };
    },
    onPresentation: (p) => presentations.push(p),
    ...overrides,
  });
  return { broker, worker, calls, presentations };
}

test('grid_skin_set is present-family and never hits onHostCall', async () => {
  const { broker, worker, calls, presentations } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'grid_skin_set',
    args: { remap: { '2': { all: 'glowstone', emission: 8 } } },
  });
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(presentations.length, 1);
  assert.equal(presentations[0].channel, 'appearance');
  assert.equal(presentations[0].fn, 'grid_skin_set');
  assert.equal(worker.lastResult().ok, true);
  broker.stop();
});

test('grid_skin_set rejects a new-block dump of raw bytes', async () => {
  const { broker, worker, presentations } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'grid_skin_set',
    args: { bytes: 'AAAA', remap: { 2: { all: 'dirt' } } },
  });
  await flush();
  assert.equal(presentations.length, 0);
  assert.equal(worker.lastResult().ok, false);
  assert.match(worker.lastResult().error.message, /raw asset bytes/);
  broker.stop();
});

test('mesh_asset_register + attach are mesh-channel presentation', async () => {
  const { broker, worker, calls, presentations } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'mesh_asset_register',
    args: { id: 'bow', kind: 'primitive', primitive: { shape: 'bow_placeholder' } },
  });
  worker.receive({
    type: 'hostcall',
    id: 2,
    fn: 'mesh_asset_attach',
    args: { id: 'bow', anchor: 'hand' },
  });
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(presentations.length, 2);
  assert.equal(presentations[0].channel, 'mesh');
  assert.equal(presentations[1].fn, 'mesh_asset_attach');
  broker.stop();
});

test('mechanics_emit fire is mechanics-channel', async () => {
  const { broker, worker, presentations } = await makeBroker();
  await broker.start(new ArrayBuffer(8));
  worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'mechanics_emit',
    args: { event: 'fire', payload: { asset: 'bow' } },
  });
  await flush();
  assert.equal(presentations[0].channel, 'mechanics');
  assert.equal(presentations[0].args.event, 'fire');
  broker.stop();
});

test('assertPluginHostArgs exports from the SDK', async () => {
  const { assertPluginHostArgs, PLUGIN_HOST_FUNCTIONS } = await loadSdk();
  assert.ok(PLUGIN_HOST_FUNCTIONS.includes('grid_skin_set'));
  assert.throws(() => assertPluginHostArgs('mechanics_emit', { event: 'explode' }));
  assert.doesNotThrow(() =>
    assertPluginHostArgs('mechanics_emit', { event: 'score', payload: { n: 1 } }),
  );
  assert.doesNotThrow(() =>
    assertPluginHostArgs('grid_skin_set', {
      remap: { '2': { all: 'mod_slot_00', emission: 15 } },
      paint: [{ slot: 0, fill: '#d8e4f0', speckle: '#ffe066', speckleCount: 40, seed: 12 }],
    }),
  );
  assert.throws(() =>
    assertPluginHostArgs('grid_skin_set', {
      remap: { '2': { all: 'mod_slot_00' } },
      paint: [{ slot: 0, seed: 70000 }],
    }),
  );
  assert.doesNotThrow(() =>
    assertPluginHostArgs('mesh_asset_spawn', {
      id: 'disco',
      pose: { x: 8, y: 29.5, z: 8, yaw: 0.4, pitch: 0.1 },
    }),
  );
  assert.throws(() =>
    assertPluginHostArgs('mesh_asset_spawn', {
      id: 'disco',
      pose: { yaw: 'spin' },
    }),
  );
  assert.throws(() =>
    assertPluginHostArgs('mesh_asset_register', {
      id: 'box',
      kind: 'gltf',
    }),
  );
  assert.doesNotThrow(() =>
    assertPluginHostArgs('mesh_asset_register', {
      id: 'box',
      kind: 'gltf',
      artifactHash: 'a'.repeat(64),
    }),
  );
  assert.doesNotThrow(() =>
    assertPluginHostArgs('mesh_asset_register', {
      id: 'box',
      kind: 'gltf',
      url: 'https://forge.example.com/lfs/box.glb',
    }),
  );
});
