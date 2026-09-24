import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSdk } from '../helpers.mjs';

const OLD_TOKEN = 'game-token-old';
const FRESH_TOKEN = {
  token: 'game-token-fresh',
  gameTokenId: 'token-id-fresh',
  appId: '42',
  expiresAt: '2026-07-22T19:00:00.000Z',
  gameApiUrl: 'https://game.invalid',
  gameApiWsUrl: 'wss://game.invalid',
  launchUrl: null,
};

function createClient(createCrowdyClient, tokenStore) {
  return createCrowdyClient({
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
    tokenStore,
  });
}

test('refreshGameplayToken orders proxy teardown, refresh/store, and reconnect without duplicating subscriptions', async () => {
  const { createCrowdyClient } = await loadSdk();
  const order = [];
  const tokenStore = {
    get: () => null,
    set: (token) => order.push(`set:${token}`),
    clear: () => order.push('clear'),
  };
  const client = createClient(createCrowdyClient, tokenStore);
  client.setToken(OLD_TOKEN);
  order.length = 0;

  // Keep the unit test offline while exercising the real subscriber registry
  // and the real SessionStore token listener.
  client.realtime.ensureSubscription = () => {};
  let deliveries = 0;
  const unsubscribe = client.udp.subscribe(
    { actorUpdate: () => deliveries++ },
    FRESH_TOKEN.appId,
  );
  const subscriberCount = client.realtime.subscribers.size;
  client.realtime.restart = () => order.push('realtime-restart');

  client.udp.disconnect = async () => {
    order.push(`disconnect:${client.getToken()}`);
    return true;
  };
  client.graphql.request = async () => {
    order.push(`refresh:${client.getToken()}`);
    return { refreshAppToken: FRESH_TOKEN };
  };
  client.udp.connect = async () => {
    order.push(`connect:${client.getToken()}`);
    return { connected: true };
  };

  const result = await client.refreshGameplayToken();

  assert.equal(result, FRESH_TOKEN);
  assert.equal(client.getToken(), FRESH_TOKEN.token);
  assert.deepEqual(order, [
    `disconnect:${OLD_TOKEN}`,
    `refresh:${OLD_TOKEN}`,
    `set:${FRESH_TOKEN.token}`,
    'realtime-restart',
    `connect:${FRESH_TOKEN.token}`,
  ]);
  assert.equal(client.realtime.subscribers.size, subscriberCount);

  client.realtime.dispatch({ __typename: 'ActorUpdateNotification' });
  assert.equal(deliveries, 1, 'the existing handler remains registered exactly once');

  unsubscribe();
  client.close();
});

test('refreshGameplayToken aborts rotation when old proxy closure is not confirmed', async () => {
  const { createCrowdyClient, CrowdyProtocolError } = await loadSdk();
  const client = createClient(createCrowdyClient);
  client.setToken(OLD_TOKEN);
  let refreshCalls = 0;
  let connectCalls = 0;

  client.udp.disconnect = async () => false;
  client.graphql.request = async () => {
    refreshCalls++;
    return { refreshAppToken: FRESH_TOKEN };
  };
  client.udp.connect = async () => {
    connectCalls++;
    return { connected: true };
  };

  await assert.rejects(
    client.refreshGameplayToken(),
    (error) => error instanceof CrowdyProtocolError,
  );
  assert.equal(client.getToken(), OLD_TOKEN);
  assert.equal(refreshCalls, 0);
  assert.equal(connectCalls, 0);
  client.close();
});

test('refreshGameplayToken preserves the old token when the token refresh fails', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createClient(createCrowdyClient);
  const refreshError = new Error('refresh failed');
  client.setToken(OLD_TOKEN);
  let connectCalls = 0;

  client.udp.disconnect = async () => true;
  client.graphql.request = async () => {
    throw refreshError;
  };
  client.udp.connect = async () => {
    connectCalls++;
    return { connected: true };
  };

  await assert.rejects(
    client.refreshGameplayToken(),
    (error) => error === refreshError,
  );
  assert.equal(client.getToken(), OLD_TOKEN);
  assert.equal(connectCalls, 0);
  client.close();
});

test('refreshGameplayToken retains the fresh token when reconnect fails so connect can be retried', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createClient(createCrowdyClient);
  const connectError = new Error('connect failed');
  client.setToken(OLD_TOKEN);
  let connectCalls = 0;

  client.udp.disconnect = async () => true;
  client.graphql.request = async () => ({ refreshAppToken: FRESH_TOKEN });
  client.udp.connect = async () => {
    connectCalls++;
    assert.equal(client.getToken(), FRESH_TOKEN.token);
    if (connectCalls === 1) throw connectError;
    return { connected: true };
  };

  await assert.rejects(
    client.refreshGameplayToken(),
    (error) => error === connectError,
  );
  assert.equal(client.getToken(), FRESH_TOKEN.token);

  const retry = await client.udp.connect();
  assert.deepEqual(retry, { connected: true });
  assert.equal(connectCalls, 2);
  client.close();
});

function operationName(document) {
  const def = document?.definitions?.find((d) => d.kind === 'OperationDefinition');
  return def?.name?.value ?? null;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const ACTOR_UPDATE = {
  appId: '42',
  chunk: { x: '0', y: '0', z: '0' },
  uuid: 'a'.repeat(32),
  state: '',
};

test('refreshGameplayToken waits for in-flight sendActorUpdate before disconnect', async () => {
  const { createCrowdyClient } = await loadSdk();
  const order = [];
  const tokenStore = {
    get: () => null,
    set: (token) => order.push(`set:${token}`),
    clear: () => {},
  };
  const client = createClient(createCrowdyClient, tokenStore);
  client.setToken(OLD_TOKEN);
  order.length = 0;
  const sendGate = deferred();
  const sendStarted = deferred();
  client.graphql.request = async (document) => {
    const name = operationName(document);
    if (name === 'SendActorUpdate') {
      order.push(`send:${client.getToken()}`);
      sendStarted.resolve();
      await sendGate.promise;
      return { sendActorUpdate: true };
    }
    if (name === 'RefreshAppToken') {
      order.push(`refresh:${client.getToken()}`);
      return { refreshAppToken: FRESH_TOKEN };
    }
    throw new Error(`unexpected GraphQL operation ${name}`);
  };
  client.udp.disconnect = async () => {
    order.push(`disconnect:${client.getToken()}`);
    return true;
  };
  client.udp.connect = async () => {
    order.push(`connect:${client.getToken()}`);
    return { connected: true };
  };

  const send = client.udp.sendActorUpdate(ACTOR_UPDATE);
  await sendStarted.promise;
  const refresh = client.refreshGameplayToken();
  await Promise.resolve();
  assert.equal(
    order.includes(`disconnect:${OLD_TOKEN}`),
    false,
    'disconnect must wait for the in-flight actorUpdate',
  );
  sendGate.resolve();
  await send;
  await refresh;
  assert.deepEqual(order, [
    `send:${OLD_TOKEN}`,
    `disconnect:${OLD_TOKEN}`,
    `refresh:${OLD_TOKEN}`,
    `set:${FRESH_TOKEN.token}`,
    `connect:${FRESH_TOKEN.token}`,
  ]);
  client.close();
});

test('sendActorUpdate during refreshGameplayToken waits and uses the new token', async () => {
  const { createCrowdyClient } = await loadSdk();
  const order = [];
  const tokenStore = {
    get: () => null,
    set: (token) => order.push(`set:${token}`),
    clear: () => {},
  };
  const client = createClient(createCrowdyClient, tokenStore);
  client.setToken(OLD_TOKEN);
  order.length = 0;
  const disconnectGate = deferred();
  const disconnectStarted = deferred();
  client.udp.disconnect = async () => {
    order.push(`disconnect:${client.getToken()}`);
    disconnectStarted.resolve();
    await disconnectGate.promise;
    return true;
  };
  client.graphql.request = async (document) => {
    const name = operationName(document);
    if (name === 'SendActorUpdate') {
      order.push(`send:${client.getToken()}`);
      return { sendActorUpdate: true };
    }
    if (name === 'RefreshAppToken') {
      order.push(`refresh:${client.getToken()}`);
      return { refreshAppToken: FRESH_TOKEN };
    }
    throw new Error(`unexpected GraphQL operation ${name}`);
  };
  client.udp.connect = async () => {
    order.push(`connect:${client.getToken()}`);
    return { connected: true };
  };

  const refresh = client.refreshGameplayToken();
  await disconnectStarted.promise;
  const send = client.udp.sendActorUpdate(ACTOR_UPDATE);
  await Promise.resolve();
  assert.equal(
    order.some((entry) => entry.startsWith('send:')),
    false,
    'send must wait for the in-flight gameplay-token refresh',
  );
  disconnectGate.resolve();
  await refresh;
  await send;
  assert.deepEqual(order, [
    `disconnect:${OLD_TOKEN}`,
    `refresh:${OLD_TOKEN}`,
    `set:${FRESH_TOKEN.token}`,
    `connect:${FRESH_TOKEN.token}`,
    `send:${FRESH_TOKEN.token}`,
  ]);
  client.close();
});
