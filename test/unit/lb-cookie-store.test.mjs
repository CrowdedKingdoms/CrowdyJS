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
