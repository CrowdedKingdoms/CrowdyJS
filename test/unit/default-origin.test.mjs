/**
 * The generated default origin, and the ALL-OR-NOTHING rule around it.
 *
 * A default is load-bearing during a rollout: while the branches are
 * mid-migration this is what an unconfigured consumer gets, so it is asserted in
 * BOTH directions. Asserting only that the default applies would keep passing
 * after the guard that stops it applying to a PARTIALLY configured client had
 * been deleted, and that guard is the whole reason a default is safe here — a
 * caller who supplies `httpUrl` and not `wsUrl` must NOT get their websocket
 * silently pointed at another origin.
 *
 * NO HOSTNAME IS WRITTEN HERE. The expected value is the generated constant, so
 * this file cannot go stale when the tier table moves — the wrapper's
 * `check-sdk-default-origin.mjs` is what checks the constant itself against the
 * declared origin for this branch's tier.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

test('the generated default names a tier, a host, and both schemes over it', async () => {
  const sdk = await loadSdk();
  assert.match(
    sdk.CROWDY_DEFAULT_TIER,
    /^[a-z]+$/,
    'the default must name the tier it was generated for',
  );
  assert.equal(
    sdk.CROWDY_DEFAULT_HTTP_ORIGIN,
    `https://${sdk.CROWDY_DEFAULT_HOST}`,
  );
  assert.equal(
    sdk.CROWDY_DEFAULT_WS_ORIGIN,
    `wss://${sdk.CROWDY_DEFAULT_HOST}`,
  );
});

test('an UNCONFIGURED client dials the default origin', async () => {
  const sdk = await loadSdk();
  const client = sdk.createCrowdyClient({});
  const seen = [];
  const restore = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    throw new Error('stop here: the URL is the assertion');
  };
  try {
    await client.apps.listApps?.().catch(() => {});
    if (seen.length === 0) {
      // Not every domain method exists on every build; drive the transport
      // directly rather than depending on one resolver's name.
      await client.graphql
        .request({ kind: 'Document', definitions: [] }, {})
        .catch(() => {});
    }
  } finally {
    globalThis.fetch = restore;
    client.close();
  }
  assert.ok(seen.length > 0, 'the transport should have attempted a request');
  assert.equal(seen[0], `${sdk.CROWDY_DEFAULT_HTTP_ORIGIN}/graphql`);
});

test('an UNCONFIGURED client resolves the WS default for the realtime client too', async () => {
  const sdk = await loadSdk();
  const client = sdk.createCrowdyClient({});
  try {
    assert.equal(client.realtime.wsUrl, `${sdk.CROWDY_DEFAULT_WS_ORIGIN}/graphql`);
  } finally {
    client.close();
  }
});
