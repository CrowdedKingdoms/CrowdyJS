/**
 * Re-discovery: what a client does when the ONE instance it was given stops
 * answering.
 *
 * Under direct connect the realtime URL names a single api instance rather
 * than a load balancer, so the pre-existing behaviour — retry this URL
 * forever with backoff — cannot recover from that instance being replaced.
 * The client has to go back and ask for another one, the same way CrowdyCPP
 * re-runs serverWithLeastClients when Buddy sends COMMAND_RECONNECT.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RealtimeClient, SERVER_DRAINING_CODE } from '../../dist/realtime.js';

function makeSession(token = 'a'.repeat(64)) {
  return {
    getToken: () => token,
    onChange: () => () => {},
  };
}

/** Reach past the transport: these tests are about the decision, not the socket. */
function makeManager(config = {}) {
  const calls = [];
  const manager = new RealtimeClient(
    {
      wsUrl: 'wss://ck-api-1.example.test/graphql',
      logger: { warn: () => {}, debug: () => {}, error: () => {}, info: () => {} },
      rediscover: async () => {
        calls.push(Date.now());
        return { wsUrl: 'wss://ck-api-2.example.test/graphql' };
      },
      ...config,
    },
    makeSession(),
  );
  return { manager, calls };
}

test('re-discovery replaces the realtime URL', async () => {
  const { manager, calls } = makeManager();
  manager.desired = true;

  await manager.rediscoverEndpoint('test');

  assert.equal(calls.length, 1);
  assert.equal(manager.wsUrl, 'wss://ck-api-2.example.test/graphql');
});

test('the binary relay URL moves with it', async () => {
  // The relay derives from the websocket host; leaving it pointed at the old
  // instance would send gameplay to a machine that is gone while GraphQL
  // worked fine, which is a very confusing failure to debug.
  const { manager } = makeManager();
  await manager.rediscoverEndpoint('test');
  assert.equal(manager.binaryRelayUrl, 'wss://ck-api-2.example.test/realtime');
});

test('concurrent triggers make one discovery call, not several', async () => {
  // Several failing attempts land together. Without coalescing each would
  // resolve independently and could land on different instances, spreading
  // one client's session across the fleet.
  let resolveDiscovery;
  const gate = new Promise((r) => {
    resolveDiscovery = r;
  });
  let callCount = 0;
  const { manager } = makeManager({
    rediscover: async () => {
      callCount += 1;
      await gate;
      return { wsUrl: 'wss://ck-api-2.example.test/graphql' };
    },
  });

  const a = manager.rediscoverEndpoint('one');
  const b = manager.rediscoverEndpoint('two');
  const c = manager.rediscoverEndpoint('three');
  resolveDiscovery();
  await Promise.all([a, b, c]);

  assert.equal(callCount, 1);
});

test('a discovery failure leaves the client on its current endpoint', async () => {
  // Discovery being unreachable is not worse than the situation that
  // prompted the call; the existing backoff keeps trying what we have.
  const { manager } = makeManager({
    rediscover: async () => {
      throw new Error('load balancer unreachable');
    },
  });

  await manager.rediscoverEndpoint('test');
  assert.equal(manager.wsUrl, 'wss://ck-api-1.example.test/graphql');
});

test('discovery returning null or the same URL is not treated as a move', async () => {
  const { manager } = makeManager({ rediscover: async () => null });
  await manager.rediscoverEndpoint('test');
  assert.equal(manager.wsUrl, 'wss://ck-api-1.example.test/graphql');

  const same = makeManager({
    rediscover: async () => ({ wsUrl: 'wss://ck-api-1.example.test/graphql' }),
  });
  await same.manager.rediscoverEndpoint('test');
  assert.equal(same.manager.wsUrl, 'wss://ck-api-1.example.test/graphql');
});

test('no rediscover callback keeps the old retry-one-URL behaviour', async () => {
  // Every existing caller is in this case and must be unaffected.
  const manager = new RealtimeClient(
    { wsUrl: 'wss://lb.example.test/graphql' },
    makeSession(),
  );
  await manager.rediscoverEndpoint('test');
  assert.equal(manager.wsUrl, 'wss://lb.example.test/graphql');
});

test('a draining server moves the client immediately', async () => {
  // The server knows it is about to stop. Waiting for the socket to drop
  // would lose the seconds between the warning and the shutdown.
  const { manager, calls } = makeManager();
  manager.desired = true;

  manager.dispatch({
    __typename: 'RealtimeConnectionEvent',
    code: SERVER_DRAINING_CODE,
    retryable: true,
    message: 'draining',
  });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(calls.length, 1);
});

test('a drain event does not stop the client wanting a connection', async () => {
  // Unlike AUTH_REQUIRED, draining means "go elsewhere", not "give up".
  const { manager } = makeManager();
  manager.desired = true;

  manager.dispatch({
    __typename: 'RealtimeConnectionEvent',
    code: SERVER_DRAINING_CODE,
    retryable: true,
    message: 'draining',
  });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(manager.desired, true);
});

test('a non-retryable connection event still stops the client', async () => {
  const { manager, calls } = makeManager();
  manager.desired = true;

  manager.dispatch({
    __typename: 'RealtimeConnectionEvent',
    code: 'AUTH_REQUIRED',
    retryable: false,
    message: 'no token',
  });

  assert.equal(manager.desired, false);
  assert.equal(calls.length, 0);
});
