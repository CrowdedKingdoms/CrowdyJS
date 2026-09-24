/**
 * Hosted sign-in (ck-api v1.88.0): a browser game on its own domain signs a
 * player in by sending them to Studio's /authorize and exchanging the code it
 * comes back with. These are the SDK-side guarantees, offline:
 *
 *   - the hosted page is derived from the API host by convention
 *     (ck.<tier>.<brand> -> studio.<tier>.<brand>; localhost:* -> :3001), and
 *     anything else has to be passed explicitly rather than guessed;
 *   - `signIn` builds a PKCE authorize URL with the verifier persisted under the
 *     state, navigates only when asked (and when a `location` exists);
 *   - `handleSignInCallback` is a no-op without ?code=, exchanges once with the
 *     verifier, stores the token, and strips code/state from the address bar;
 *   - `isHostedSignInRequiredError` recognises the server's refusal in every
 *     shape it arrives in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

test('defaultHostedSignInUrl follows the ck. -> studio. convention and localhost -> :3001', async () => {
  const { defaultHostedSignInUrl } = await loadSdk();
  assert.equal(
    defaultHostedSignInUrl('https://ck.dev.crowdedkingdoms.com/graphql'),
    'https://studio.dev.crowdedkingdoms.com/authorize',
  );
  assert.equal(
    defaultHostedSignInUrl('https://ck.prod.crowdedkingdoms.com/graphql'),
    'https://studio.prod.crowdedkingdoms.com/authorize',
  );
  assert.equal(
    defaultHostedSignInUrl('http://localhost:3000/graphql'),
    'http://localhost:3001/authorize',
  );
  assert.throws(
    () => defaultHostedSignInUrl('https://api.self-hosted.example/graphql'),
    /pass authorizeUrl/,
  );
});

test('signIn builds a PKCE authorize URL against the derived Studio page and keeps the verifier', async () => {
  const { CrowdyClient } = await loadSdk();
  const stored = new Map();
  const client = new CrowdyClient({
    httpUrl: 'https://ck.dev.crowdedkingdoms.com/graphql',
    pkceStore: {
      get: (s) => stored.get(s) ?? null,
      set: (s, v) => void stored.set(s, v),
      remove: (s) => void stored.delete(s),
    },
  });
  const url = new URL(
    await client.portal.signIn({
      appId: '2',
      redirectUri: 'https://game.customer.example/auth/callback',
      navigate: false,
    }),
  );
  assert.equal(url.origin + url.pathname, 'https://studio.dev.crowdedkingdoms.com/authorize');
  assert.equal(url.searchParams.get('app_id'), '2');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://game.customer.example/auth/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const state = url.searchParams.get('state');
  assert.ok(state && state.length > 8, 'a state is generated');
  assert.ok(url.searchParams.get('code_challenge')?.length > 20, 'a challenge is present');
  assert.ok(stored.get(state)?.length > 20, 'the verifier is persisted under the state');
});

test('signIn honours an explicit authorizeUrl and navigates when a location exists', async () => {
  const { CrowdyClient } = await loadSdk();
  const client = new CrowdyClient({ httpUrl: 'https://api.self-hosted.example/graphql' });
  const assigned = [];
  const saved = globalThis.location;
  globalThis.location = { assign: (u) => assigned.push(u), search: '' };
  try {
    const url = await client.portal.signIn({
      appId: '7',
      redirectUri: 'https://game.example/cb',
      authorizeUrl: 'https://identity.example/authorize',
    });
    assert.ok(url.startsWith('https://identity.example/authorize?'));
    assert.deepEqual(assigned, [url]);
  } finally {
    if (saved === undefined) delete globalThis.location;
    else globalThis.location = saved;
  }
});

test('handleSignInCallback is a no-op without a code, exchanges once with the verifier, stores the token', async () => {
  const { CrowdyClient } = await loadSdk();
  const calls = [];
  const client = new CrowdyClient({
    httpUrl: 'https://ck.dev.crowdedkingdoms.com/graphql',
    pkceStore: {
      get: (s) => (s === 'st4te' ? 'the-verifier' : null),
      set: () => {},
      remove: (s) => calls.push(['remove', s]),
    },
  });
  client.graphql.request = async (_doc, vars) => {
    calls.push(['request', vars]);
    return {
      exchangePortalCode: {
        token: 'app-token-1',
        gameTokenId: '1',
        appId: '2',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        gameApiUrl: null,
        gameApiWsUrl: null,
        discoveryUrl: null,
        launchUrl: null,
      },
    };
  };

  assert.equal(await client.portal.handleSignInCallback(''), null);
  assert.equal(calls.length, 0);

  const entered = await client.portal.handleSignInCallback('?code=abc123&state=st4te');
  assert.equal(entered.token, 'app-token-1');
  assert.deepEqual(calls[0], ['request', { input: { code: 'abc123', codeVerifier: 'the-verifier' } }]);
  assert.deepEqual(calls[1], ['remove', 'st4te']);
  assert.equal(client.session.getToken(), 'app-token-1');
});

test('handleSignInCallback strips code and state from the address bar after a successful exchange', async () => {
  const { CrowdyClient } = await loadSdk();
  const client = new CrowdyClient({
    httpUrl: 'https://ck.dev.crowdedkingdoms.com/graphql',
    pkceStore: { get: () => 'v', set: () => {}, remove: () => {} },
  });
  client.graphql.request = async () => ({
    exchangePortalCode: {
      token: 't', gameTokenId: '1', appId: '2', expiresAt: '2030-01-01T00:00:00Z',
      gameApiUrl: null, gameApiWsUrl: null, discoveryUrl: null, launchUrl: null,
    },
  });
  const savedLoc = globalThis.location;
  const savedHist = globalThis.history;
  const replaced = [];
  globalThis.location = {
    href: 'https://game.example/auth/callback?code=abc&state=s&keep=1',
    search: '?code=abc&state=s&keep=1',
  };
  globalThis.history = { replaceState: (_a, _b, url) => replaced.push(url) };
  try {
    await client.portal.handleSignInCallback();
    assert.deepEqual(replaced, ['https://game.example/auth/callback?keep=1']);
  } finally {
    if (savedLoc === undefined) delete globalThis.location; else globalThis.location = savedLoc;
    if (savedHist === undefined) delete globalThis.history; else globalThis.history = savedHist;
  }
});

test('isHostedSignInRequiredError recognises the refusal in every shape', async () => {
  const { isHostedSignInRequiredError } = await loadSdk();
  assert.equal(isHostedSignInRequiredError({ code: 'HOSTED_SIGN_IN_REQUIRED' }), true);
  assert.equal(isHostedSignInRequiredError({ extensions: { code: 'HOSTED_SIGN_IN_REQUIRED' } }), true);
  assert.equal(
    isHostedSignInRequiredError({ graphQLErrors: [{ extensions: { code: 'HOSTED_SIGN_IN_REQUIRED' } }] }),
    true,
  );
  assert.equal(
    isHostedSignInRequiredError(new Error('Direct sign-in is only available to first-party Crowded Kingdoms pages.')),
    true,
  );
  assert.equal(isHostedSignInRequiredError({ code: 'UNAUTHENTICATED' }), false);
  assert.equal(isHostedSignInRequiredError(null), false);
});
