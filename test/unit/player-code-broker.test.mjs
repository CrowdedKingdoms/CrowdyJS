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
}

test('PlayerCodeBroker keeps a host allowlist and grid clamp', async () => {
  const { PlayerCodeBroker } = await loadSdk();
  const worker = new FakeWorker();
  const calls = [];
  const broker = new PlayerCodeBroker({
    workerUrl: 'player-worker.js',
    workerFactory: () => worker,
    grid: {
      low: { x: 0n, y: 0n, z: 0n },
      high: { x: 2n, y: 2n, z: 2n },
    },
    onHostCall: async (call) => {
      calls.push(call);
      return { accepted: true };
    },
  });
  await broker.start(new ArrayBuffer(8));

  worker.receive({
    type: 'hostcall',
    id: 1,
    fn: 'chunk_get',
    args: { x: 1, y: 1, z: 1 },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.deepEqual(worker.sent.at(-1), {
    type: 'hostcall-result',
    id: 1,
    ok: true,
    data: { accepted: true },
  });

  worker.receive({
    type: 'hostcall',
    id: 2,
    fn: 'chunk_get',
    args: { x: 3, y: 1, z: 1 },
  });
  worker.receive({
    type: 'hostcall',
    id: 3,
    fn: 'fetch',
    args: { url: 'https://evil.invalid' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(worker.sent.at(-2).ok, false);
  assert.match(worker.sent.at(-2).error.message, /outside/);
  assert.equal(worker.sent.at(-1).ok, false);
  assert.match(worker.sent.at(-1).error.message, /not allowed/);

  worker.receive({
    type: 'hostcall',
    id: 4,
    fn: 'send_client_event',
    args: { x: 1, y: 1, z: 1, eventType: 1, payloadBase64: '' },
  });
  worker.receive({
    type: 'hostcall',
    id: 5,
    fn: 'send_client_event',
    args: { x: 9, y: 0, z: 0 },
  });
  worker.receive({
    type: 'hostcall',
    id: 6,
    fn: 'teleport_request',
    args: { destChunkX: 9, destChunkY: 0, destChunkZ: 0, uuid: 'self' },
  });
  worker.receive({
    type: 'hostcall',
    id: 7,
    fn: 'login',
    args: {},
  });
  worker.receive({
    type: 'hostcall',
    id: 8,
    fn: 'pose_set',
    args: { chunkX: 9, chunkY: 0, chunkZ: 0, x: 1, y: 0, z: 0 },
  });
  worker.receive({
    type: 'hostcall',
    id: 9,
    fn: 'inventory_transfer',
    args: { targetChunkX: 9, targetChunkY: 0, targetChunkZ: 0, targetUuid: 'bob' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].fn, 'send_client_event');
  const byId = Object.fromEntries(worker.sent.map((message) => [message.id, message]));
  assert.equal(byId[5].ok, false);
  assert.match(byId[5].error.message, /outside/);
  assert.equal(byId[6].ok, false);
  assert.match(byId[6].error.message, /outside/);
  assert.equal(byId[7].ok, false);
  assert.match(byId[7].error.message, /not allowed/);
  assert.equal(byId[8].ok, false);
  assert.match(byId[8].error.message, /outside/);
  assert.equal(byId[9].ok, false);
  assert.match(byId[9].error.message, /outside/);

  broker.stop();
  assert.equal(worker.terminated, true);
});
