import assert from 'node:assert/strict';
import test from 'node:test';
import { createBootstrapRediscover } from '../../dist/bootstrap-rediscover.js';

/**
 * Re-discovery for a client that holds only an app token.
 *
 * The failure this guards against is specific: under direct connect a client is
 * pinned to one instance, and if that instance dies, retrying its hostname can
 * never recover. Asking the load balancer is the only way out, so these tests
 * care most about WHERE the request goes and about never throwing out of a
 * reconnect path.
 */

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('asks the discovery URL, not the instance, and returns its endpoints', async () => {
  const calls = [];
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://ck.prod.crowdedkingdoms.com',
    getToken: () => 'app-token',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        data: {
          gameClientBootstrap: {
            gameApiUrl: 'https://ck-api-or-5.prod.crowdedkingdoms.com',
            gameApiWsUrl: 'wss://ck-api-or-5.prod.crowdedkingdoms.com',
          },
        },
      });
    },
  });

  const got = await rediscover('76375790011136');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ck.prod.crowdedkingdoms.com/graphql');
  assert.equal(calls[0].init.headers.authorization, 'Bearer app-token');
  assert.deepEqual(got, {
    httpUrl: 'https://ck-api-or-5.prod.crowdedkingdoms.com',
    wsUrl: 'wss://ck-api-or-5.prod.crowdedkingdoms.com',
  });
});

test('does not double up /graphql when the discovery URL already has it', async () => {
  let seen = null;
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://ck.prod.crowdedkingdoms.com/graphql',
    getToken: () => 't',
    fetchImpl: async (url) => {
      seen = url;
      return jsonResponse({
        data: { gameClientBootstrap: { gameApiUrl: 'https://x' } },
      });
    },
  });
  await rediscover('1');
  assert.equal(seen, 'https://ck.prod.crowdedkingdoms.com/graphql');
});

test('returns null instead of throwing when the load balancer is down', async () => {
  // Throwing here would propagate out of a reconnect path and take the client
  // down with the instance it was trying to escape.
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://lb.example',
    getToken: () => 't',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(await rediscover('1'), null);
});

test('returns null on a non-2xx without trying to parse it', async () => {
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://lb.example',
    getToken: () => 't',
    fetchImpl: async () =>
      jsonResponse(
        {
          get data() {
            throw new Error('body should not be parsed');
          },
        },
        false,
        503,
      ),
  });
  assert.equal(await rediscover('1'), null);
});

test('says so when the server predates the discoveryUrl fields', async () => {
  const warnings = [];
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://lb.example',
    getToken: () => 't',
    logger: { warn: (m) => warnings.push(m) },
    fetchImpl: async () =>
      jsonResponse({ data: { gameClientBootstrap: {} } }),
  });
  assert.equal(await rediscover('1'), null);
  assert.match(warnings.join('\n'), /predate/);
});

test('needs an appId and says which one is missing', async () => {
  const warnings = [];
  const rediscover = createBootstrapRediscover({
    discoveryUrl: 'https://lb.example',
    getToken: () => 't',
    logger: { warn: (m) => warnings.push(m) },
    fetchImpl: async () => {
      throw new Error('should not be called without an appId');
    },
  });
  assert.equal(await rediscover(null), null);
  assert.match(warnings.join('\n'), /appId/);
});
