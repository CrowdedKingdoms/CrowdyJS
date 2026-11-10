/**
 * A session released for idleness is final (operator, 2026-11-10).
 *
 * The replication server releases a session that sent no gameplay input for its
 * app's timeout. On the binary relay that is close 4410; on the GraphQL proxy a
 * RealtimeConnectionEvent with code IDLE_TIMEOUT and retryable false. Either way
 * the SDK reports `inactive` and does not reconnect: the game calls connect()
 * on the player's next input.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BinaryRelayTransport, GAMEPLAY_IDLE_CLOSE_CODE } from '../../dist/binary-relay.js';
import { IDLE_TIMEOUT_CODE, RealtimeClient } from '../../dist/realtime.js';

const TOKEN = 'a'.repeat(64);

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  ready(gameTokenId = '123') {
    this.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId }) });
  }
  drop(code) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: code !== 1006 });
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function makeTransport() {
  const statuses = [];
  const errors = [];
  const transport = new BinaryRelayTransport(
    {
      url: 'wss://ck.example.test/realtime',
      retryInitialDelayMs: 0,
      retryMaxDelayMs: 0,
      retryAttempts: 20,
      logger: { warn: () => {}, error: () => {}, debug: () => {}, info: () => {} },
    },
    {
      getToken: () => TOKEN,
      onNotification: () => {},
      onError: (e) => errors.push(e),
      onStatus: (s) => statuses.push(s),
      onUnavailable: () => statuses.push('unavailable'),
      onReconnectDirective: () => {},
    },
  );
  return { transport, statuses, errors };
}

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
});

test('the relay reports inactive on close 4410 and opens nothing more', async () => {
  assert.equal(GAMEPLAY_IDLE_CLOSE_CODE, 4410);
  const { transport, statuses } = makeTransport();
  transport.connect('76375790011136');
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.open();
  ws.ready();
  await settle();

  ws.drop(GAMEPLAY_IDLE_CLOSE_CODE);
  await settle();
  await settle();

  assert.equal(statuses.at(-1), 'inactive');
  assert.equal(FakeWebSocket.instances.length, 1, 'a released session must not be redialled');
});

test('another close still reconnects, as before', async () => {
  const { transport, statuses } = makeTransport();
  transport.connect('76375790011136');
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.open();
  ws.ready();
  await settle();

  ws.drop(4408); // the transport's own 120 s idle: retryable
  await settle();

  assert.ok(FakeWebSocket.instances.length > 1, 'a 4408 close is retried');
  assert.ok(!statuses.includes('inactive'));
});

test('connect() after inactive opens a new relay session', async () => {
  const { transport } = makeTransport();
  transport.connect('76375790011136');
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.open();
  ws.ready();
  await settle();
  ws.drop(GAMEPLAY_IDLE_CLOSE_CODE);
  await settle();

  transport.connect('76375790011136');
  await settle();
  assert.equal(FakeWebSocket.instances.length, 2, 'the next player input reconnects on request');
});

test('the GraphQL path reports inactive, not failed, for IDLE_TIMEOUT', () => {
  assert.equal(IDLE_TIMEOUT_CODE, 'IDLE_TIMEOUT');
  const client = new RealtimeClient(
    { wsUrl: 'wss://ck.example.test/graphql' },
    { getToken: () => TOKEN, onChange: () => () => {} },
  );
  const seen = [];
  client.onStatus((s) => seen.push(s));
  client.dispatch({
    __typename: 'RealtimeConnectionEvent',
    status: 'inactive',
    code: IDLE_TIMEOUT_CODE,
    message: 'released',
    retryable: false,
  });
  assert.equal(client.status(), 'inactive');
  assert.ok(!seen.includes('failed'));
});
