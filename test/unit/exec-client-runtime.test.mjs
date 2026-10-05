/**
 * The player runtime for a ck-exec mod's CLIENT half, the only kind of player module since
 * 18.0: the broker's allowlist is exactly what crowdy-client-sdk can call, the glue offers
 * exactly the CLIENT ABI imports and refuses an unmetered module, and nothing runs without the
 * served hash, fuel budget and consented host calls. The last test runs a real
 * crowdy-client-sdk build when CROWDY_EXEC_CLIENT_WASM names one (Studio's CLIENT starter,
 * built as the game API builds a CLIENT half).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EXEC_CLIENT_ABI_IMPORTS,
  EXEC_CLIENT_HOST_CALLS,
  GLUE_HOST_FUNCTIONS,
  GlueRuntime,
  PlayerCodeBroker,
} from '../../dist/index.js';
import {
  makeExecClientArtifact,
  makeForbiddenImportArtifact,
} from './fixtures/d13-wasm-corpus.mjs';

/** Every host call crowdy-client-sdk wraps (its `api` module, plus nothing else). */
const CLIENT_SDK_CALLS = [
  'actor_despawn',
  'actor_pose',
  'actor_spawn',
  'actors_list',
  'actors_list_radius',
  'avatar_appearance',
  'avatar_state_get',
  'avatar_state_set',
  'chunk_get',
  'clock',
  'emit_channel',
  'emit_event',
  'emit_spatial',
  'events_poll',
  'grid_info',
  'grid_permission_check',
  'hud_set',
  'input_axes',
  'input_key',
  'input_look',
  'overlay_draw',
  'pointer_clicks',
  'pose_get',
  'pose_release',
  'pose_set',
  'scene_catalog',
  'scene_instances',
  'send_actor_message',
  'send_channel_message',
  'send_client_event',
  'send_text',
  'teleport_request',
  'user_state_get',
  'user_state_set',
  'video_set',
  'voice_set',
  'voxel_set',
  'voxels_list',
];
/** Calls the catalog used to offer and a ck-exec CLIENT half now refuses. */
const LEGACY_ONLY = [
  'container_create',
  'container_get',
  'container_get_batch',
  'containers_list',
  'container_delete',
  'property_set',
  'model_invoke',
  'edge_add',
  'edge_delete',
  'sessions_list',
  'grid_state_get',
  'grid_state_set',
];
const flat = (groups) => Object.values(groups).flatMap((s) => [...s]).sort();

test('the allowlist is exactly crowdy-client-sdk\u2019s calls, and the glue names the same', () => {
  assert.deepEqual(flat(EXEC_CLIENT_HOST_CALLS), CLIENT_SDK_CALLS);
  assert.equal(EXEC_CLIENT_HOST_CALLS.model, undefined);
  assert.equal(EXEC_CLIENT_HOST_CALLS.sessions, undefined);
  assert.deepEqual(
    [...EXEC_CLIENT_HOST_CALLS.present].sort(),
    [
      'avatar_appearance',
      'hud_set',
      'overlay_draw',
      'scene_catalog',
      'scene_instances',
      'video_set',
      'voice_set',
    ],
  );
  assert.deepEqual([...GLUE_HOST_FUNCTIONS].sort(), CLIENT_SDK_CALLS);
});

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

const GRID = { low: { x: 0n, y: 0n, z: 0n }, high: { x: 2n, y: 2n, z: 2n }, gridId: '5' };
/** The capability summary's host calls the player consented to. */
const CONSENTED = ['chunk_get', 'voxel_set', 'user_state_get', 'grid_permission_check', 'grid_info'];

async function brokerFor(extra = {}) {
  const worker = new FakeWorker();
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'glue.js',
    workerFactory: () => worker,
    grid: GRID,
    artifactHash: 'f'.repeat(64),
    hashArtifact: async () => 'f'.repeat(64),
    fuelPerDispatch: 1000n,
    consentedHostCalls: CONSENTED,
    eventBus: null,
    onHostCall: async (call) => {
      calls.push(call.fn);
      return { ok: true };
    },
    ...extra,
  });
  await broker.start(new ArrayBuffer(8));
  return { broker, worker, calls };
}

async function ask(worker, id, fn, args) {
  worker.receive({ type: 'hostcall', id, fn, args });
  await new Promise((resolve) => setImmediate(resolve));
  return worker.sent.findLast((m) => m.type === 'hostcall-result' && m.id === id);
}

test('a broker refuses the legacy-only calls and answers the SDK\u2019s', async () => {
  const { broker, worker, calls } = await brokerFor();
  assert.equal(worker.sent[0].engine, 'ck-exec', 'the glue is told which ABI to offer');
  let id = 0;
  for (const fn of LEGACY_ONLY) {
    const reply = await ask(worker, ++id, fn, { containerId: '1', gridId: '5' });
    assert.equal(reply.ok, false, fn);
    assert.match(reply.error.message, /not allowed/, fn);
  }
  for (const [fn, args] of [
    ['chunk_get', { x: 1, y: 1, z: 1 }],
    ['voxel_set', { chunkX: 1, chunkY: 0, chunkZ: 2, voxelX: 1, voxelY: 2, voxelZ: 3, voxelType: 7 }],
    ['user_state_get', { userId: '42' }],
    ['grid_permission_check', { gridId: '5', userId: '42', permissionKey: 'build' }],
  ]) {
    assert.equal((await ask(worker, ++id, fn, args)).ok, true, fn);
  }
  assert.deepEqual(calls, ['chunk_get', 'voxel_set', 'user_state_get', 'grid_permission_check']);
  assert.equal((await ask(worker, ++id, 'grid_permission_check', { gridId: '6' })).ok, false, 'its own grid only');
  const info = await ask(worker, ++id, 'grid_info', {});
  assert.deepEqual(info.data, { low: { x: '0', y: '0', z: '0' }, high: { x: '2', y: '2', z: '2' } });
  broker.stop();
});

test('a broker refuses an SDK call outside the capability summary the player consented to', async () => {
  const { broker, worker, calls } = await brokerFor();
  // In the allowlist, but not in this module's summary: a name it assembled at run time.
  for (const [fn, args] of [
    ['hud_set', { payload: 'x' }],
    ['emit_spatial', { kind: 'text', chunkX: 1, chunkY: 1, chunkZ: 1, uuidHex: 'a'.repeat(64), payloadBase64: '', distance: 1, decay: 0 }],
  ]) {
    const reply = await ask(worker, fn.length, fn, args);
    assert.equal(reply.ok, false, fn);
    assert.match(reply.error.message, /outside the capabilities the player consented to/, fn);
  }
  assert.deepEqual(calls, []);
  broker.stop();
});

test('a broker runs only hash-bound, metered and bounded by what the player consented to', async () => {
  const served = {
    workerUrl: 'glue.js',
    grid: GRID,
    artifactHash: 'f'.repeat(64),
    fuelPerDispatch: 1000n,
    consentedHostCalls: CONSENTED,
    onHostCall: async () => null,
  };
  for (const [what, override] of [
    ['artifactHash', { artifactHash: undefined }],
    ['fuelPerDispatch', { fuelPerDispatch: undefined }],
    ['a zero budget', { fuelPerDispatch: 0n }],
    ['consentedHostCalls', { consentedHostCalls: undefined }],
    ['the legacy engine', { engine: 'player-compute' }],
  ]) {
    const worker = new FakeWorker();
    const broker = new PlayerCodeBroker({ ...served, workerFactory: () => worker, ...override });
    await assert.rejects(broker.start(new ArrayBuffer(8)), /artifactHash, fuelPerDispatch and consentedHostCalls/, what);
    assert.equal(worker.sent.length, 0, what);
  }
});

test('the glue offers exactly the CLIENT ABI imports, whatever engine it is asked for', () => {
  for (const engine of [undefined, 'ck-exec', 'player-compute']) {
    const imports = new GlueRuntime({ engine, hostCallSync: () => new Uint8Array() }).buildImports(() => null);
    assert.deepEqual(
      Object.fromEntries(Object.entries(imports).map(([mod, fns]) => [mod, Object.keys(fns).sort()])),
      Object.fromEntries(Object.entries(EXEC_CLIENT_ABI_IMPORTS).map(([mod, fns]) => [mod, [...fns].sort()])),
      String(engine),
    );
  }
  assert.deepEqual(EXEC_CLIENT_ABI_IMPORTS, {
    ck: ['log', 'now_ms', 'state_get', 'state_set', 'host_call'],
    wasi_snapshot_preview1: ['random_get'],
  });
});

test('the glue will not link an import outside the ABI, nor run an unmetered module', async () => {
  const glue = (fuelPerDispatch = 1000n) =>
    new GlueRuntime({ fuelPerDispatch, hostCallSync: () => new Uint8Array() });
  const stray = makeForbiddenImportArtifact('wasi_snapshot_preview1', 'fd_write');
  await assert.rejects(glue().instantiate(stray.buffer), (e) => e instanceof WebAssembly.LinkError);
  // No `wasi_unstable` module at all: V8 refuses a missing module as a TypeError.
  const unstable = makeForbiddenImportArtifact('wasi_unstable', 'random_get');
  await assert.rejects(
    glue().instantiate(unstable.buffer),
    (e) => e instanceof WebAssembly.LinkError || e instanceof TypeError,
  );

  const withStub = makeExecClientArtifact({ extraImport: ['wasi_snapshot_preview1', 'proc_exit'] });
  await assert.rejects(glue().instantiate(withStub.buffer), (e) => e instanceof WebAssembly.LinkError);

  const unmetered = makeExecClientArtifact({ withFuel: false });
  await assert.rejects(glue().instantiate(unmetered.buffer), /ck_fuel meter/);
  await assert.rejects(glue(null).instantiate(makeExecClientArtifact().buffer), /fuel budget/);

  const logs = [];
  const metered = new GlueRuntime({
    fuelPerDispatch: 1000n,
    hostCallSync: () => new Uint8Array(),
    onLog: (level, message) => logs.push([level, message]),
  });
  await metered.instantiate(makeExecClientArtifact().buffer);
  metered.init();
  metered.tick(16);
  assert.deepEqual(logs, [[1, 'ready']]);
});

const realArtifact = process.env.CROWDY_EXEC_CLIENT_WASM;

test(
  'a real crowdy-client-sdk CLIENT half runs in the ck-exec glue: host calls, state, and a fuel trap',
  {
    skip: realArtifact
      ? false
      : 'set CROWDY_EXEC_CLIENT_WASM to Studio\u2019s CLIENT starter built by the platform pipeline (cargo, instrument, wasm-opt)',
  },
  async () => {
    const bytes = readFileSync(realArtifact);
    const requests = [];
    const logs = [];
    const runtime = (fuelPerDispatch) =>
      new GlueRuntime({
        fuelPerDispatch,
        onLog: (level, message) => logs.push([level, message]),
        hostCallSync: (req) => {
          requests.push(JSON.parse(new TextDecoder().decode(req)));
          return new TextEncoder().encode(JSON.stringify({ ok: true, data: { delivered: true } }));
        },
      });
    const glue = runtime(100_000_000n);
    await glue.instantiate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    glue.init();
    glue.tick(16);
    glue.tick(16);
    assert.deepEqual(logs, [[1, 'ready']]);
    assert.deepEqual(requests, [
      { fn: 'hud_set', args: { payload: { text: 'Ticks here: 1' } } },
      { fn: 'hud_set', args: { payload: { text: 'Ticks here: 2' } } },
    ]);
    assert.deepEqual([...glue.invoke(new TextEncoder().encode('echo'))], [...new TextEncoder().encode('echo')]);

    const starved = runtime(1n);
    await starved.instantiate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    assert.throws(() => starved.init(), WebAssembly.RuntimeError, 'a dispatch out of fuel traps');
  },
);
