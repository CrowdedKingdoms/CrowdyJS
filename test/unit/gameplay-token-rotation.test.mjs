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
    managementUrl: 'https://management.invalid',
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
  client.management.request = async () => {
    order.push(`management-refresh:${client.getToken()}`);
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
    `management-refresh:${OLD_TOKEN}`,
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
  client.management.request = async () => {
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

test('refreshGameplayToken preserves the old token when management refresh fails', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createClient(createCrowdyClient);
  const refreshError = new Error('refresh failed');
  client.setToken(OLD_TOKEN);
  let connectCalls = 0;

  client.udp.disconnect = async () => true;
  client.management.request = async () => {
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
  client.management.request = async () => ({ refreshAppToken: FRESH_TOKEN });
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
