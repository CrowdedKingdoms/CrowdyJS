import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.closeCalls = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.CONNECTING) return;
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(rawMessage) {
    const message = JSON.parse(String(rawMessage));
    this.sent.push(message);
    if (message.type === 'connection_init') {
      queueMicrotask(() => this.receive({ type: 'connection_ack' }));
    }
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  emitNext(data) {
    assert.ok(this.subscriptionId, 'subscription should be established');
    this.receive({
      id: this.subscriptionId,
      type: 'next',
      payload: { data },
    });
  }

  close(code = 1000, reason = '') {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.closeCalls.push({ code, reason });
    queueMicrotask(() => this.onclose?.({
      code,
      reason,
      wasClean: code === 1000,
    }));
  }

  get subscriptionId() {
    return this.sent.find((message) => message.type === 'subscribe')?.id;
  }
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

test('activePlayerCount maps its positional app id and generated snapshot payload', async () => {
  const {
    GameModelAPI,
    GameModelPlayerCountStatus,
  } = await loadSdk();
  const appId = '900719925474099312345';
  const snapshot = {
    appId,
    activePlayerCount: 0,
    status: GameModelPlayerCountStatus.Partial,
    observedAt: '2026-07-24T22:00:00.000Z',
    revision: '18446744073709551617',
  };
  const calls = [];
  const api = new GameModelAPI({
    async request(document, variables) {
      calls.push({ document, variables });
      return { gameModelActivePlayerCount: snapshot };
    },
  });

  const result = await api.activePlayerCount(appId);

  assert.equal(result, snapshot);
  assert.deepEqual(calls[0].variables, { appId });
  assert.equal(typeof result.appId, 'string');
  assert.equal(typeof result.revision, 'string');
  assert.equal(GameModelPlayerCountStatus.Fresh, 'FRESH');
  assert.equal(GameModelPlayerCountStatus.Partial, 'PARTIAL');
  assert.equal(GameModelPlayerCountStatus.Unavailable, 'UNAVAILABLE');

  const operation = calls[0].document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
  assert.equal(operation.name.value, 'GameModelActivePlayerCount');
  assert.deepEqual(
    operation.selectionSet.selections[0].selectionSet.selections.map(
      (selection) => selection.name.value,
    ),
    ['appId', 'activePlayerCount', 'status', 'observedAt', 'revision'],
  );
});

test('activePlayerCountChanged maps payloads and disposes its websocket', async () => {
  FakeWebSocket.instances.length = 0;
  const { GameModelAPI } = await loadSdk();
  const appId = '900719925474099312345';
  const api = new GameModelAPI(
    { request: async () => assert.fail('HTTP request was not expected') },
    {
      wsUrl: 'wss://game.invalid/graphql',
      getToken: () => 'app-token',
    },
  );
  const events = [];
  const errors = [];
  const unsubscribe = api.activePlayerCountChanged(
    { appId },
    {
      next: (event) => events.push(event),
      error: (error) => errors.push(error),
      webSocketImpl: FakeWebSocket,
    },
  );

  await waitFor(
    () => FakeWebSocket.instances[0]?.subscriptionId,
    'graphql-ws did not send the subscription',
  );
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, 'wss://game.invalid/graphql');
  assert.equal(socket.protocol, 'graphql-transport-ws');
  assert.deepEqual(
    socket.sent.find((message) => message.type === 'connection_init'),
    {
      type: 'connection_init',
      payload: { Authorization: 'Bearer app-token' },
    },
  );
  const subscribeMessage = socket.sent.find(
    (message) => message.type === 'subscribe',
  );
  assert.deepEqual(subscribeMessage.payload.variables, { appId });
  assert.match(
    subscribeMessage.payload.query,
    /subscription GameModelActivePlayerCountChanged\(\$appId: BigInt!\)/,
  );

  const event = {
    appId,
    previousCount: 8,
    currentCount: 10,
    delta: 2,
    revision: '18446744073709551618',
    observedAt: '2026-07-24T22:01:00.000Z',
  };
  socket.emitNext({ gameModelActivePlayerCountChanged: event });
  assert.deepEqual(events, [event]);
  assert.equal(typeof events[0].appId, 'string');
  assert.equal(typeof events[0].revision, 'string');
  assert.deepEqual(errors, []);

  unsubscribe();
  await waitFor(
    () => socket.closeCalls.length > 0,
    'unsubscribe did not dispose the graphql-ws client',
  );
  assert.ok(
    socket.sent.some(
      (message) =>
        message.type === 'complete' && message.id === subscribeMessage.id,
    ),
    'unsubscribe should complete the active operation',
  );
  assert.deepEqual(socket.closeCalls[0], {
    code: 1000,
    reason: 'Normal Closure',
  });
});

test('activePlayerCountChanged fails synchronously without wsUrl', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
  });

  assert.throws(
    () => client.gameModel.activePlayerCountChanged(
      { appId: '1' },
      { next() {}, webSocketImpl: FakeWebSocket },
    ),
    /activePlayerCountChanged requires a wsUrl/,
  );
  client.close();
});
