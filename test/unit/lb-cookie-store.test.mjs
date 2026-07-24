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
