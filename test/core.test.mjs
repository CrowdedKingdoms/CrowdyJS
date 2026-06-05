import assert from 'node:assert/strict';
import test from 'node:test';

test('package import is silent and exposes v4 browser APIs', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    const sdk = await import('../dist/index.js');
    const pkg = await import('../package.json', { with: { type: 'json' } });
    // VERSION constant must stay in lockstep with the published package
    // version so consumers reading `client.session` / `sdk.VERSION` don't
    // get a different number than their `npm ls` output.
    assert.equal(sdk.VERSION, pkg.default.version);
    assert.equal(typeof sdk.createCrowdyClient, 'function');
    assert.equal(typeof sdk.CrowdyClient, 'function');
    assert.equal(typeof sdk.RealtimeClient, 'function');
    assert.equal(typeof sdk.SequenceAllocator, 'function');
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(logs, []);
});

test('SessionStore persists and restores tokens through a TokenStore', async () => {
  let stored = null;
  const store = {
    get: () => stored,
    set: (token) => {
      stored = token;
    },
    clear: () => {
      stored = null;
    },
  };

  const { SessionStore } = await import('../dist/index.js');
  const session = new SessionStore(store);
  const seen = [];
  session.onChange((token) => seen.push(token));

  session.setToken('abc');
  assert.equal(stored, 'abc');
  assert.equal(session.getToken(), 'abc');

  const restored = new SessionStore(store);
  assert.equal(await restored.restore(), 'abc');
  assert.equal(restored.getToken(), 'abc');

  session.clear();
  assert.equal(stored, null);
  assert.deepEqual(seen, [null, 'abc', null]);
});

test('SequenceAllocator wraps in uint8 space', async () => {
  const { SequenceAllocator } = await import('../dist/index.js');
  const allocator = new SequenceAllocator(254);
  assert.equal(allocator.next(), 254);
  assert.equal(allocator.next(), 255);
  assert.equal(allocator.next(), 0);
});

test('CrowdyGraphQLError preserves all GraphQL errors and codes', async () => {
  const { CrowdyGraphQLError } = await import('../dist/index.js');
  const error = new CrowdyGraphQLError([
    {
      message: 'Nope',
      path: ['login'],
      extensions: { code: 'UNAUTHORIZED' },
    },
  ]);

  assert.equal(error.message, 'Nope');
  assert.equal(error.code, 'UNAUTHORIZED');
  assert.equal(error.graphqlErrors[0].path[0], 'login');
});
