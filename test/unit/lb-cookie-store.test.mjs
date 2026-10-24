import assert from 'node:assert/strict';
import test from 'node:test';

test('LbCookieStore ingests cks_ga and formats Cookie header', async () => {
  const { LbCookieStore } = await import('../../dist/lb-cookie-store.js');
  const store = new LbCookieStore();
  assert.equal(store.headerValue(), null);

  const headers = new Headers();
  headers.append(
    'set-cookie',
    'cks_ga=abc123; Path=/; HttpOnly; Secure; SameSite=None',
  );
  store.ingestSetCookie(headers);
  assert.equal(store.getValue(), 'abc123');
  assert.equal(store.headerValue(), 'cks_ga=abc123');
});

test('LbCookieStore forgets cks_ga when a response expires it, and on clear()', async () => {
  // A draining game-api ends a client's affinity with exactly this header.
  const { LbCookieStore } = await import('../../dist/lb-cookie-store.js');
  const expiring = [
    'cks_ga=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None',
    'cks_ga=old; Path=/; Max-Age=0',
    'cks_ga=old; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'cks_ga=; Path=/',
  ];
  for (const line of expiring) {
    const store = new LbCookieStore();
    const first = new Headers();
    first.append('set-cookie', 'cks_ga=abc123; Path=/; HttpOnly; Secure; SameSite=None');
    store.ingestSetCookie(first);
    assert.equal(store.getValue(), 'abc123');
    const expire = new Headers();
    expire.append('set-cookie', line);
    store.ingestSetCookie(expire);
    assert.equal(store.headerValue(), null, line);
  }

  const store = new LbCookieStore();
  const later = new Headers();
  later.append(
    'set-cookie',
    `cks_ga=fresh; Path=/; Expires=${new Date(Date.now() + 3_600_000).toUTCString()}`,
  );
  store.ingestSetCookie(later);
  assert.equal(store.getValue(), 'fresh');
  store.clear();
  assert.equal(store.headerValue(), null);
});

test('LbCookieStore.primeFromGraphql maps abort to CrowdyTimeoutError', async () => {
  const { LbCookieStore } = await import('../../dist/lb-cookie-store.js');
  const { CrowdyTimeoutError } = await import('../../dist/errors.js');
  const store = new LbCookieStore();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const signal = init?.signal;
    await new Promise((_, reject) => {
      if (signal?.aborted) {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    });
    throw new Error('unreachable');
  };

  try {
    await assert.rejects(
      () =>
        store.primeFromGraphql({
          endpoint: 'https://example.test/graphql',
          timeoutMs: 20,
        }),
      (error) => error instanceof CrowdyTimeoutError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
