import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The input log (ck-api's inputLogSessions / inputLogMessages): the recorded client
 * inputs of an app with replay logging on. The wrappers are thin; what they must get
 * right is passing the paging and filters through and returning the connection whole,
 * because a messages page can be short while hasNextPage is true.
 */

const ENDPOINT = 'https://ck.example/graphql';

function stubFetch(payload) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: () => {} },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function makeClient() {
  const { createCrowdyClient } = await import('../../dist/index.js');
  const client = createCrowdyClient({ httpUrl: ENDPOINT, wsUrl: 'wss://ck.example/graphql' });
  client.setToken('app-token');
  return client;
}

const pageInfo = (endCursor, hasNextPage) => ({
  hasNextPage,
  hasPreviousPage: false,
  startCursor: null,
  endCursor,
});

test('sessions passes paging and filters through and returns the connection', async () => {
  const session = {
    appId: '42', gameTokenId: '9001', userId: '7', datacenter: 'or',
    startedAt: '2026-10-09T10:00:00.000Z', lastSeenAt: '2026-10-09T10:05:00.000Z',
    endedAt: null, endReason: null, messageCount: '1500', byteCount: '210000',
    messageTypes: [26, 129],
  };
  const stub = stubFetch({
    data: { inputLogSessions: { edges: [{ cursor: 'c1', node: session }], pageInfo: pageInfo('c1', true), totalCount: 3 } },
  });
  try {
    const client = await makeClient();
    const page = await client.inputLog.sessions('42', {
      first: 1,
      after: 'c0',
      filter: { userId: '7', messageType: 129 },
    });
    assert.equal(page.totalCount, 3);
    assert.equal(page.pageInfo.endCursor, 'c1');
    assert.deepEqual(page.edges[0].node, session);
    const { query, variables } = stub.calls[0].body;
    assert.match(query, /inputLogSessions\(/);
    assert.deepEqual(variables, { appId: '42', first: 1, after: 'c0', filter: { userId: '7', messageType: 129 } });
  } finally {
    stub.restore();
  }
});

test('messages returns a short page with hasNextPage intact, and selects every field', async () => {
  const stub = stubFetch({
    data: { inputLogMessages: { edges: [], pageInfo: pageInfo('aWw6MzoxMDAw', true), totalCount: null } },
  });
  try {
    const client = await makeClient();
    const page = await client.inputLog.messages('42', '9001', { first: 200, filter: { messageTypes: [129] } });
    // An empty page that stopped at the server's scan limit is not the end.
    assert.equal(page.edges.length, 0);
    assert.equal(page.pageInfo.hasNextPage, true);
    assert.equal(page.pageInfo.endCursor, 'aWw6MzoxMDAw');
    const { query, variables } = stub.calls[0].body;
    assert.deepEqual(variables, { appId: '42', gameTokenId: '9001', first: 200, filter: { messageTypes: [129] } });
    for (const field of [
      'receivedAt', 'receivedAtMicros', 'userId', 'gameTokenId', 'messageType', 'seq', 'fromBundle',
      'signed', 'sizeBytes', 'body', 'chunkX', 'chunkY', 'chunkZ', 'actorUuid', 'channelId',
    ]) {
      assert.match(query, new RegExp(`\\b${field}\\b`), `inputLogMessages misses ${field}`);
    }
  } finally {
    stub.restore();
  }
});

test('the refusals surface as CrowdyGraphQLError codes', async () => {
  const { CrowdyGraphQLError } = await import('../../dist/index.js');
  for (const code of ['INPUT_LOG_UNAVAILABLE', 'NOT_FOUND']) {
    const stub = stubFetch({ errors: [{ message: 'refused', extensions: { code } }] });
    try {
      const client = await makeClient();
      await assert.rejects(client.inputLog.messages('42', '9001'), (err) => {
        assert.ok(err instanceof CrowdyGraphQLError);
        assert.equal(err.code, code);
        return true;
      });
    } finally {
      stub.restore();
    }
  }
});
