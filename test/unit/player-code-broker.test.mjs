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

  broker.stop();
  assert.equal(worker.terminated, true);
});
