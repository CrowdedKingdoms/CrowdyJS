/**
 * The Crowdy Games shell bridge (third-party hosting, 2026-09-13), offline.
 *
 *   - not framed, or framed by a page that never says hello -> null, and signIn runs
 *     the ordinary top-level flow with the caller's redirectUri;
 *   - framed by a shell that says hello -> signIn uses the SHELL's returnUrl as the
 *     redirect_uri, derives /authorize from the shell's authorizeOrigin, and asks the
 *     shell to navigate (posted to the shell's origin only) instead of location.assign;
 *   - a hello from anything but window.parent, or naming a returnUrl off the hello's own
 *     origin, is ignored;
 *   - the PKCE verifier is still generated and persisted in THIS origin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

/** A fake window framed by `parent`; `deliver` simulates a message event. */
function fakeWindow() {
  const listeners = new Set();
  const posted = [];
  const parent = { postMessage: (message, targetOrigin) => posted.push({ message, targetOrigin }) };
  const win = {
    parent,
    addEventListener: (type, l) => type === 'message' && listeners.add(l),
    removeEventListener: (type, l) => type === 'message' && listeners.delete(l),
    location: { origin: 'https://my-game.content.example.test' },
  };
  const deliver = (data, { origin = 'https://games.example.test', source = parent } = {}) => {
    for (const l of [...listeners]) l({ data, origin, source });
  };
  return { win, parent, posted, deliver };
}

const HELLO = {
  type: 'crowdyjs:host-hello',
  version: 1,
  returnUrl: 'https://games.example.test/my-game/',
  authorizeOrigin: 'https://studio.example.test',
  slug: 'my-game',
};

test('a page that is not framed has no embedded host', async () => {
  const { EmbeddedHost } = await loadSdk();
  const self = { addEventListener() {}, removeEventListener() {} };
  self.parent = self;
  const host = new EmbeddedHost(self);
  assert.equal(host.isFramed(), false);
  assert.equal(await host.hello(10), null);
  const none = new EmbeddedHost(null);
  assert.equal(none.isFramed(), false);
  assert.equal(await none.hello(10), null);
});

test('framed by a page that never answers -> null after the timeout, having asked once', async () => {
  const { EmbeddedHost } = await loadSdk();
  const { win, posted } = fakeWindow();
  const host = new EmbeddedHost(win);
  assert.equal(host.isFramed(), true);
  assert.equal(await host.hello(20), null);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].message.type, 'crowdyjs:host-hello-request');
  assert.equal(posted[0].targetOrigin, '*', 'the request carries nothing and the parent is unknown yet');
});

test('a hello from the parent is recorded; from anyone else, or naming another origin, it is ignored', async () => {
  const { EmbeddedHost } = await loadSdk();
  const { win, deliver } = fakeWindow();
  const host = new EmbeddedHost(win);
  deliver(HELLO, { source: {} }); // not the parent
  deliver({ ...HELLO, returnUrl: 'https://evil.example/steal' }); // returnUrl off the hello's origin
  deliver({ ...HELLO, returnUrl: 'http://games.example.test/my-game/' }, { origin: 'http://games.example.test' }); // not https
  deliver({ type: 'crowdyjs:host-hello' }); // malformed
  assert.equal(host.current(), null);
  const pending = host.hello(500);
  deliver(HELLO);
  const info = await pending;
  assert.deepEqual(info, {
    hostOrigin: 'https://games.example.test',
    returnUrl: 'https://games.example.test/my-game/',
    authorizeOrigin: 'https://studio.example.test',
    slug: 'my-game',
  });
  // navigate posts ONLY to the shell's origin.
  const { posted } = { posted: [] };
  win.parent.postMessage = (message, targetOrigin) => posted.push({ message, targetOrigin });
  host.navigate('https://studio.example.test/authorize?app_id=1');
  assert.equal(posted[0].targetOrigin, 'https://games.example.test');
  assert.equal(posted[0].message.type, 'crowdyjs:navigate');
  host.close();
});

test('signIn under a shell uses the shell\u2019s return URL and Studio, and asks the shell to navigate', async () => {
  const { CrowdyClient, EmbeddedHost } = await loadSdk();
  const { win, posted, deliver } = fakeWindow();
  // The shell answers the hello request as soon as it arrives.
  win.parent.postMessage = (message, targetOrigin) => {
    posted.push({ message, targetOrigin });
    if (message.type === 'crowdyjs:host-hello-request') setTimeout(() => deliver(HELLO), 0);
  };
  const stored = new Map();
  const client = new CrowdyClient({
    httpUrl: 'https://api.self-hosted.example/graphql', // no derivable Studio: the shell's wins
    embeddedHost: new EmbeddedHost(win),
    pkceStore: { get: (s) => stored.get(s) ?? null, set: (s, v) => void stored.set(s, v), remove: (s) => void stored.delete(s) },
  });
  const assigned = [];
  const saved = globalThis.location;
  globalThis.location = { assign: (u) => assigned.push(u), search: '' };
  try {
    const url = new URL(
      await client.portal.signIn({ appId: '9', redirectUri: 'https://my-game.content.example.test/' }),
    );
    assert.equal(url.origin + url.pathname, 'https://studio.example.test/authorize');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://games.example.test/my-game/', 'the SHELL page, not the iframe');
    assert.equal(url.searchParams.get('app_id'), '9');
    const state = url.searchParams.get('state');
    assert.ok(stored.get(state)?.length > 20, 'the verifier is in THIS origin\u2019s store');
    assert.equal(assigned.length, 0, 'the game did not navigate itself');
    const nav = posted.find((p) => p.message.type === 'crowdyjs:navigate');
    assert.ok(nav, 'the shell was asked to navigate');
    assert.equal(nav.targetOrigin, 'https://games.example.test');
    assert.equal(nav.message.url, url.toString());
    assert.deepEqual(client.portal.embeddedHostInfo()?.slug, 'my-game');
  } finally {
    globalThis.location = saved;
    client.close();
  }
});

test('signIn with embedded: false, or with no shell answering, runs the top-level flow unchanged', async () => {
  const { CrowdyClient, EmbeddedHost } = await loadSdk();
  const { win } = fakeWindow();
  const client = new CrowdyClient({
    httpUrl: 'https://ck.dev.crowdedkingdoms.com/graphql',
    embeddedHost: new EmbeddedHost(win, { helloTimeoutMs: 20 }),
  });
  const assigned = [];
  const saved = globalThis.location;
  globalThis.location = { assign: (u) => assigned.push(u), search: '' };
  try {
    const url = new URL(await client.portal.signIn({ appId: '3', redirectUri: 'https://game.example/cb' }));
    assert.equal(url.origin + url.pathname, 'https://studio.dev.crowdedkingdoms.com/authorize');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://game.example/cb');
    assert.equal(assigned.length, 1, 'no shell answered: the game navigates itself');
    const url2 = new URL(await client.portal.signIn({ appId: '3', redirectUri: 'https://game.example/cb', embedded: false, navigate: false }));
    assert.equal(url2.searchParams.get('redirect_uri'), 'https://game.example/cb');
  } finally {
    globalThis.location = saved;
    client.close();
  }
});

test('the hosting surface is on every client, and the Node helper is a subpath export', async () => {
  const { CrowdyClient } = await loadSdk();
  const client = new CrowdyClient({ httpUrl: 'https://game.invalid' });
  for (const m of ['game', 'listed', 'all', 'mine', 'publishes', 'claim', 'beginPublish', 'completePublish', 'abandonPublish', 'setEnabled', 'setListing', 'takeDown']) {
    assert.equal(typeof client.hosting[m], 'function', `client.hosting.${m}`);
  }
  assert.equal(client.embeddedHost, null, 'no window in Node: no bridge');
  client.close();
  const hosting = await import('../../dist/hosting/index.js');
  assert.equal(typeof hosting.publishDirectory, 'function');
  assert.equal(typeof hosting.manifestForDirectory, 'function');
});
