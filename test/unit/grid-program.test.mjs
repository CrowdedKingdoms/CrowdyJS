import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

const gp = await import('../../dist/grid-program/index.js');

function domPort(port) {
  const map = new Map();
  return {
    postMessage: (m) => port.postMessage(m),
    addEventListener: (_t, l) => {
      const w = (data) => l({ data });
      map.set(l, w);
      port.on('message', w);
    },
    removeEventListener: (_t, l) => port.off('message', map.get(l)),
    start: () => {},
  };
}

const HELD = {
  token: 'real-grid-token',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  low: { x: '4', y: '0', z: '0' },
  high: { x: '4', y: '0', z: '0' },
};

class FakeServerSocket {
  static instances = [];
  sent = [];
  protocol = 'graphql-transport-ws';
  constructor(url, protocol) {
    this.url = url;
    this.requested = protocol;
    FakeServerSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.({}));
  }
  send(data) {
    this.sent.push(JSON.parse(data));
    const frame = JSON.parse(data);
    if (frame.type === 'connection_init') {
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'connection_ack' }) }));
    }
  }
  close(code, reason) {
    queueMicrotask(() => this.onclose?.({ code: code ?? 1000, reason: reason ?? '' }));
  }
}

async function setup() {
  const { port1, port2 } = new MessageChannel();
  const seen = [];
  const refused = [];
  const host = new gp.GridProgramHost({
    port: domPort(port1),
    appId: '7',
    gridId: '42',
    graphqlUrl: 'http://ck.test/graphql',
    graphqlWsUrl: 'ws://ck.test/graphql',
    mintToken: async () => HELD,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ data: { me: { userId: '9' } } }), { status: 200 });
    },
    WebSocketImpl: FakeServerSocket,
    onRefused: (r) => refused.push(r),
  });
  await host.start();
  const program = await gp.createGridProgramClient(domPort(port2));
  return { host, program, seen, refused, port1, port2 };
}

test('the program learns its grid and holds only a placeholder token', async () => {
  const { host, program, port1, port2 } = await setup();
  assert.equal(program.appId, '7');
  assert.equal(program.gridId, '42');
  assert.equal(program.box.low.x, 4n);
  assert.equal(program.client.session.getToken(), gp.GRID_PROGRAM_PLACEHOLDER_TOKEN);
  host.stop();
  port1.close();
  port2.close();
});

test('HTTP is relayed with the grid token, never the program placeholder', async () => {
  const { host, program, seen, port1, port2 } = await setup();
  const me = await program.client.users.me();
  assert.deepEqual(me, { userId: '9' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'http://ck.test/graphql');
  assert.equal(seen[0].init.headers.authorization, 'Bearer real-grid-token');
  assert.doesNotMatch(seen[0].init.body, /grid-program/);
  host.stop();
  port1.close();
  port2.close();
});

test('the host refuses batched or subscription documents over HTTP', async () => {
  const { host, program, seen, refused, port1, port2 } = await setup();
  await assert.rejects(
    program.client.graphql.query('query A { me { userId } } query B { me { userId } }', {}),
  );
  await assert.rejects(program.client.graphql.query('subscription { udpNotifications { __typename } }', {}));
  assert.equal(seen.length, 0);
  assert.equal(refused.length, 2);
  host.stop();
  port1.close();
  port2.close();
});

test('the websocket connection_init is rewritten with the grid token', async () => {
  FakeServerSocket.instances = [];
  const { host, program, port1, port2 } = await setup();
  const off = program.client.udp.subscribe({ text() {} }, '7');
  for (let i = 0; i < 50 && !FakeServerSocket.instances[0]?.sent.length; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const socket = FakeServerSocket.instances[0];
  assert.ok(socket, 'the host opened a websocket to ck-api');
  assert.equal(socket.url, 'ws://ck.test/graphql');
  assert.equal(socket.requested, 'graphql-transport-ws');
  const init = socket.sent.find((f) => f.type === 'connection_init');
  assert.deepEqual(init.payload, {
    Authorization: 'Bearer real-grid-token',
    appId: '7',
    clientKind: 'grid-program',
  });
  off();
  host.stop();
  port1.close();
  port2.close();
});

test('GridScope refuses a send whose origin is outside the grid before any request', async () => {
  const { host, program, seen, port1, port2 } = await setup();
  assert.equal(program.grid.contains({ x: 4, y: 0, z: 0 }), true);
  assert.equal(program.grid.contains({ x: 5, y: 0, z: 0 }), false);
  await assert.rejects(
    async () => program.grid.send.text({ chunk: { x: '5', y: '0', z: '0' }, uuid: '0'.repeat(32), text: 'x' }),
    (e) => e.name === 'GridScopeError',
  );
  assert.equal(seen.length, 0);
  host.stop();
  port1.close();
  port2.close();
});
