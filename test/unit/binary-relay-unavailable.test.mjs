/**
 * What a client does when the binary relay will not come up.
 *
 * Under direct connect the relay URL names ONE api instance, so "the relay is
 * unavailable" almost always means that instance is gone rather than that the
 * relay is unavailable anywhere. Falling straight back to the GraphQL
 * transport — the old behaviour — cannot help, because the GraphQL websocket
 * points at the same dead host. The client sat retrying a dead hostname while
 * the rest of the fleet was healthy, and every rung and every shipped game hit
 * this, because none of them wired `rediscover`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RealtimeClient } from '../../dist/realtime.js';
import { createMintRediscover } from '../../dist/rediscover.js';

function makeSession(token = 'a'.repeat(64)) {
  return { getToken: () => token, onChange: () => () => {} };
}

function makeManager(config = {}) {
  const warnings = [];
  const manager = new RealtimeClient(
    {
      wsUrl: 'wss://ck-api-1.example.test/graphql',
      binaryTransport: true,
      logger: {
        warn: (msg) => warnings.push(String(msg)),
        debug: () => {},
        error: () => {},
        info: () => {},
      },
      ...config,
    },
    makeSession(),
  );
  return { manager, warnings };
}

test('an unavailable relay re-discovers before degrading', async () => {
  const { manager } = makeManager({
    rediscover: async () => ({ wsUrl: 'wss://ck-api-2.example.test/graphql' }),
  });
  manager.desired = true;

  await manager.handleBinaryRelayUnavailable();

  // Moved to a healthy instance, and the relay is still the transport: the
  // whole point is not to lose the fast path over one instance dying.
  assert.equal(manager.wsUrl, 'wss://ck-api-2.example.test/graphql');
  assert.equal(manager.binaryRelayUrl, 'wss://ck-api-2.example.test/realtime');
  assert.equal(manager.binaryUnavailable, false);
});

test('it falls back to GraphQL when re-discovery finds nothing better', async () => {
  // Nothing better available means the relay really is unavailable, not that
  // this instance is gone. Degrading is then the right answer.
  const { manager } = makeManager({ rediscover: async () => null });
  manager.desired = true;

  await manager.handleBinaryRelayUnavailable();

  assert.equal(manager.wsUrl, 'wss://ck-api-1.example.test/graphql');
  assert.equal(manager.binaryUnavailable, true);
});

test('it falls back, and says why, when no rediscover is wired', async () => {
  // The shipped-game case until now. The fallback cannot help a dead instance,
  // so the log has to name the missing piece — the symptom (a session that
  // connects and carries nothing) points nowhere near the cause.
  const { manager, warnings } = makeManager();
  manager.desired = true;

  await manager.handleBinaryRelayUnavailable();

  assert.equal(manager.binaryUnavailable, true);
  assert.ok(
    warnings.some((w) => w.includes('realtime.rediscover')),
    `expected a warning naming realtime.rediscover, got: ${warnings.join(' | ')}`,
  );
});

test('a re-discovery that throws still degrades rather than hanging', async () => {
  const { manager } = makeManager({
    rediscover: async () => {
      throw new Error('load balancer unreachable');
    },
  });
  manager.desired = true;

  await manager.handleBinaryRelayUnavailable();

  assert.equal(manager.binaryUnavailable, true);
});

test('the subscribed appId is handed to rediscover', async () => {
  // So one implementation can serve a client that switches apps, and so the
  // helper below does not need the appId baked in at construction.
  let seen = 'not-called';
  const { manager } = makeManager({
    rediscover: async (appId) => {
      seen = appId;
      return null;
    },
  });
  manager.subscribedAppId = '76375790011136';

  await manager.rediscoverEndpoint('test');

  assert.equal(seen, '76375790011136');
});

test('createMintRediscover returns the URLs mintAppToken hands back', async () => {
  const rediscover = createMintRediscover({
    mintAppToken: async (appId) => {
      assert.equal(appId, '42');
      return {
        gameApiUrl: 'https://ck-api-2.example.test',
        gameApiWsUrl: 'wss://ck-api-2.example.test',
      };
    },
  });

  assert.deepEqual(await rediscover('42'), {
    httpUrl: 'https://ck-api-2.example.test',
    wsUrl: 'wss://ck-api-2.example.test',
  });
});

test('createMintRediscover survives a mint failure', async () => {
  // Returning null keeps the client on its current endpoint and its normal
  // retry, which beats throwing out of a reconnect path.
  const warnings = [];
  const rediscover = createMintRediscover(
    {
      mintAppToken: async () => {
        throw new Error('502');
      },
    },
    { logger: { warn: (m) => warnings.push(String(m)) } },
  );

  assert.equal(await rediscover('42'), null);
  assert.ok(warnings.some((w) => w.includes('mintAppToken')));
});

test('createMintRediscover declines when there is no appId to mint for', async () => {
  const rediscover = createMintRediscover({
    mintAppToken: async () => {
      throw new Error('should not be called');
    },
  });
  assert.equal(await rediscover(null), null);
});
