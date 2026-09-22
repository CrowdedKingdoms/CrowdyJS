import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

class FakeWorker {
  sent = [];
  listener = null;
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
  terminate() {}
  receive(data) {
    this.listener?.({ data });
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function brokerOn(sdk, { gridId, moduleName, bus, calls = [] }) {
  const worker = new FakeWorker();
  const broker = new sdk.PlayerCodeBroker({
    workerUrl: 'player-worker.js',
    workerFactory: () => worker,
    grid: {
      low: { x: 0n, y: 0n, z: 0n },
      high: { x: 1n, y: 1n, z: 1n },
      gridId,
    },
    moduleName,
    eventBus: bus,
    onHostCall: async (call) => {
      calls.push(call);
      return { ok: true };
    },
  });
  return { worker, broker, calls };
}

test('the broker allowlist is the client half of the host catalog', async () => {
  const sdk = await loadSdk();
  const client = sdk.GENERATED_HOST_CATALOG.functions
    .filter((fn) => fn.targets.includes('client'))
    .map((fn) => fn.name)
    .sort();
  const allowed = Object.values(sdk.ALLOWED_HOST_CALLS)
    .flatMap((set) => [...set])
    .sort();
  assert.deepEqual(allowed, client);
  for (const fn of ['emit_channel', 'emit_event', 'edge_add', 'sessions_list', 'container_get_batch']) {
    assert.ok(allowed.includes(fn), `${fn} is offered to client mods (DN-10)`);
  }
});

test('grid parity calls reach the host; a foreign gridId is refused', async () => {
  const sdk = await loadSdk();
  const { worker, broker, calls } = brokerOn(sdk, {
    gridId: '42',
    moduleName: 'a',
    bus: new sdk.ClientGridEventBus(),
  });
  await broker.start(new ArrayBuffer(8));
  worker.receive({ type: 'hostcall', id: 1, fn: 'sessions_list', args: {} });
  worker.receive({ type: 'hostcall', id: 2, fn: 'emit_channel', args: { channelId: '9', payloadBase64: 'AA==' } });
  worker.receive({ type: 'hostcall', id: 3, fn: 'grid_state_get', args: { gridId: '43' } });
  await tick();
  assert.deepEqual(
    calls.map((c) => c.fn),
    ['sessions_list', 'emit_channel'],
  );
  const refused = worker.sent.find((m) => m.id === 3);
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /outside the player grid/);
  broker.stop();
});

test('emit_event reaches other mods on the same grid, never another grid, never the host', async () => {
  const sdk = await loadSdk();
  const bus = new sdk.ClientGridEventBus();
  const a = brokerOn(sdk, { gridId: '42', moduleName: 'a', bus });
  const b = brokerOn(sdk, { gridId: '42', moduleName: 'b', bus });
  const other = brokerOn(sdk, { gridId: '99', moduleName: 'c', bus });
  for (const m of [a, b, other]) await m.broker.start(new ArrayBuffer(8));
  await tick();

  a.worker.receive({
    type: 'hostcall',
    id: 7,
    fn: 'emit_event',
    args: { name: 'goal', payload: { team: 'red' } },
  });
  await tick();
  const reply = a.worker.sent.find((m) => m.id === 7);
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.data, { delivered: 1 });
  assert.equal(a.calls.length, 0, 'the bus is page-local; the host never sees it');

  const delivered = b.worker.sent.filter((m) => m.type === 'event');
  assert.equal(delivered.length, 1);
  const event = JSON.parse(new TextDecoder().decode(delivered[0].payload));
  assert.deepEqual(event, {
    kind: 'grid_event',
    gridId: '42',
    eventName: 'goal',
    payload: { team: 'red' },
    sourceModule: 'a',
    target: null,
    cascadeDepth: 1,
  });
  assert.equal(other.worker.sent.filter((m) => m.type === 'event').length, 0);
  assert.equal(a.worker.sent.filter((m) => m.type === 'event').length, 0);

  a.worker.receive({
    type: 'hostcall',
    id: 8,
    fn: 'emit_event',
    args: { name: 'ping', target: 'a' },
  });
  await tick();
  assert.deepEqual(a.worker.sent.find((m) => m.id === 8).data, { delivered: 1 });
  assert.equal(a.worker.sent.filter((m) => m.type === 'event').length, 1);
  for (const m of [a, b, other]) m.broker.stop();
});

test('the bus drops events past the cascade cap', async () => {
  const sdk = await loadSdk();
  const bus = new sdk.ClientGridEventBus();
  let seen = 0;
  bus.subscribe('1', { moduleName: 'x', deliver: () => ((seen += 1), true) });
  const base = { kind: 'grid_event', gridId: '1', eventName: 'e', payload: null, sourceModule: null, target: null };
  assert.equal(bus.publish({ ...base, cascadeDepth: 8 }), 1);
  assert.equal(bus.publish({ ...base, cascadeDepth: 9 }), 0);
  assert.equal(seen, 1);
});
