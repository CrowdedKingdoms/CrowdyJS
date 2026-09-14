import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

/**
 * The session-system wrappers (17.2.0): each is a thin request over its
 * generated document, so what is worth pinning is the document name, the
 * selection the server contract promises, and -- for the subscription -- the
 * graphql-transport-ws frames and disposal. Offline: the transport is faked.
 */

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
    this.receive({ id: this.subscriptionId, type: 'next', payload: { data } });
  }

  close(code = 1000, reason = '') {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.closeCalls.push({ code, reason });
    queueMicrotask(() => this.onclose?.({ code, reason, wasClean: code === 1000 }));
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

function operationOf(document) {
  return document.definitions.find((d) => d.kind === 'OperationDefinition');
}

function fragmentFields(document, name) {
  const fragment = document.definitions.find(
    (d) => d.kind === 'FragmentDefinition' && d.name.value === name,
  );
  assert.ok(fragment, `fragment ${name} is spread by the document`);
  return fragment.selectionSet.selections.map((s) => s.name.value);
}

test('the session mutations wrap their documents with { input } and unwrap the root field', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = new GameModelAPI({
    async request(document, variables) {
      const root = operationOf(document).selectionSet.selections[0].name.value;
      calls.push({ op: operationOf(document).name.value, root, variables });
      return { [root]: { marker: root } };
    },
  });

  const appId = '89512039153664';
  const sessionId = 'd66c4190-c773-430e-b20d-fdd071c7dee3';
  const cases = [
    ['createSession', { appId, name: 'lobby', maxParticipants: 4, admission: 'open' }, 'GameModelCreateSession', 'gameModelCreateSession'],
    ['joinSession', { appId, sessionId, actorUuid: 'a'.repeat(32) }, 'GameModelJoinSession', 'gameModelJoinSession'],
    ['leaveSession', { appId, sessionId, incarnation: 2 }, 'GameModelLeaveSession', 'gameModelLeaveSession'],
    ['setSessionTurn', { appId, sessionId, userId: '1', expectedHostTerm: 1 }, 'GameModelSetSessionTurn', 'gameModelSetSessionTurn'],
    ['setSessionAdmission', { appId, sessionId, admission: 'locked', expectedHostTerm: 1 }, 'GameModelSetSessionAdmission', 'gameModelSetSessionAdmission'],
    ['transferSessionHost', { appId, sessionId, toUserId: '2' }, 'GameModelTransferSessionHost', 'gameModelTransferSessionHost'],
    ['endSession', { appId, sessionId, reason: 'completed' }, 'GameModelEndSession', 'gameModelEndSession'],
  ];
  for (const [method, input, op, root] of cases) {
    const result = await api[method](input);
    const call = calls.at(-1);
    assert.equal(call.op, op, method);
    assert.equal(call.root, root, method);
    assert.deepEqual(call.variables, { input }, method);
    assert.deepEqual(result, { marker: root }, method);
  }
});

test("kit.matches creates its session with presence 'none' (a kit match never replicates an actor)", async () => {
  const { MatchesKit } = await loadSdk();
  const created = [];
  const gameModel = {
    async createSession(input) {
      created.push(input);
      return { sessionId: 'sid', status: 'active', presence: input.presence ?? 'actor' };
    },
    async createContainer(input) {
      return { containerId: 'meta-1', displayName: input.displayName, sessionId: 'sid' };
    },
    async container() {
      return { containerId: 'meta-1', displayName: 'm', sessionId: 'sid', typeName: 'MatchMeta' };
    },
    async containerState() {
      return { properties: [] };
    },
  };
  const channels = {
    async create() {
      return { groupId: '77' };
    },
  };
  const kit = new MatchesKit('7', gameModel, channels, undefined);
  await kit.create({ creatorUserId: '42', mode: 'duel' }).catch(() => undefined);
  assert.equal(created.length, 1, 'one createSession call');
  assert.equal(created[0].presence, 'none');
  assert.equal(created[0].appId, '7');
});

test('the session reads pass their variables through and select the contract fields', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = new GameModelAPI({
    async request(document, variables) {
      const root = operationOf(document).selectionSet.selections[0].name.value;
      calls.push({ document, root, variables });
      return { [root]: root === 'gameModelSessions' || root === 'gameModelSessionEvents' ? [] : {} };
    },
  });
  const appId = '89512039153664';
  const sessionId = 'sid';

  await api.sessions({ appId, status: 'active', admission: 'open', limit: 10 });
  assert.deepEqual(calls.at(-1).variables, { appId, status: 'active', admission: 'open', limit: 10 });
  assert.deepEqual(fragmentFields(calls.at(-1).document, 'GmSessionFields'), [
    'sessionId', 'appId', 'name', 'status', 'createdByUserId', 'currentTurnUserId', 'metadataJson',
    'admission', 'maxParticipants', 'participantCount', 'hostUserId', 'hostTerm', 'revision',
    'endedAt', 'endReason', 'createdAt', 'presence',
  ]);

  await api.sessionSnapshot({ appId, sessionId });
  assert.equal(calls.at(-1).root, 'gameModelSessionSnapshot');
  assert.deepEqual(fragmentFields(calls.at(-1).document, 'GmSessionParticipantFields'), [
    'sessionId', 'userId', 'role', 'state', 'incarnation', 'actorUuid', 'joinedAt', 'leftAt', 'leftReason',
  ]);

  await api.sessionEvents({ appId, sessionId, afterRevision: '0', limit: 50 });
  assert.equal(calls.at(-1).root, 'gameModelSessionEvents');
  assert.deepEqual(calls.at(-1).variables, { appId, sessionId, afterRevision: '0', limit: 50 });
  assert.deepEqual(fragmentFields(calls.at(-1).document, 'GmSessionEventFields'), [
    'appId', 'sessionId', 'revision', 'kind', 'payloadJson', 'createdAt',
  ]);

  await api.sessionInspect({ appId, sessionId });
  assert.equal(calls.at(-1).root, 'gameModelSessionInspect');
});

test('sessionChanged subscribes with afterRevision, maps events and disposes its websocket', async () => {
  FakeWebSocket.instances.length = 0;
  const { GameModelAPI } = await loadSdk();
  const appId = '89512039153664';
  const sessionId = 'd66c4190-c773-430e-b20d-fdd071c7dee3';
  const api = new GameModelAPI(
    { request: async () => assert.fail('HTTP request was not expected') },
    { wsUrl: 'wss://game.invalid/graphql', getToken: () => 'app-token' },
  );
  const events = [];
  const errors = [];
  const unsubscribe = api.sessionChanged(
    { appId, sessionId, afterRevision: '3' },
    {
      next: (event) => events.push(event),
      error: (error) => errors.push(error),
      webSocketImpl: FakeWebSocket,
    },
  );

  await waitFor(() => FakeWebSocket.instances[0]?.subscriptionId, 'graphql-ws did not send the subscription');
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.protocol, 'graphql-transport-ws');
  assert.deepEqual(socket.sent.find((m) => m.type === 'connection_init'), {
    type: 'connection_init',
    payload: { Authorization: 'Bearer app-token' },
  });
  const subscribe = socket.sent.find((m) => m.type === 'subscribe');
  assert.deepEqual(subscribe.payload.variables, { appId, sessionId, afterRevision: '3' });
  assert.match(
    subscribe.payload.query,
    /subscription GameModelSessionChanged\(\$appId: BigInt!, \$sessionId: String!, \$afterRevision: String\)/,
  );

  const event = {
    appId,
    sessionId,
    revision: '4',
    kind: 'host_changed',
    payloadJson: '{"hostUserId":"2","hostTerm":2,"previousHostUserId":"1","reason":"host_left"}',
    createdAt: '2026-09-14T00:00:00.000Z',
  };
  socket.emitNext({ gameModelSessionChanged: event });
  assert.deepEqual(events, [event]);
  assert.equal(typeof events[0].revision, 'string');
  assert.deepEqual(errors, []);

  unsubscribe();
  await waitFor(() => socket.closeCalls.length > 0, 'unsubscribe did not close the websocket');
});

test('sessionChanged refuses synchronously without a wsUrl', async () => {
  const { GameModelAPI } = await loadSdk();
  const api = new GameModelAPI({ request: async () => ({}) });
  assert.throws(
    () => api.sessionChanged({ appId: '1', sessionId: 's' }, { next: () => {} }),
    /requires a wsUrl/,
  );
});
