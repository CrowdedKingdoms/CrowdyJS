import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Email + password sign-in, which this SDK did not wrap until 2026-08-20.
 *
 * The server has had `login` and `register` throughout; only the SDK claimed the
 * product was passwordless, and its own surface test asserted the two methods
 * were absent. The gap is what pushed automated clients onto `devLogin`, so
 * these tests exist to keep the wrappers honest about the three things that are
 * easy to get wrong:
 *
 *   - the argument names are `loginUserInput` / `registerUserInput`, not `input`
 *   - a successful call must store the session token, or the next call is anonymous
 *   - `register` on an existing address FAILS, and the failure arrives as
 *     INTERNAL_SERVER_ERROR rather than CONFLICT
 */

const ENDPOINT = 'https://ck.example/graphql';

/** A fetch double that answers with one scripted payload and records the request. */
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

const authResponse = (name) => ({
  data: {
    [name]: {
      token: 'session-token',
      gameTokenId: 'gt-1',
      user: { userId: '7', email: 'a@b.invalid', gamertag: null },
    },
  },
});

async function makeClient() {
  const { createCrowdyClient } = await import('../../dist/index.js');
  return createCrowdyClient({ httpUrl: ENDPOINT, wsUrl: 'wss://ck.example/graphql' });
}

test('login sends loginUserInput, not input, and stores the session', async () => {
  const client = await makeClient();
  const { calls, restore } = stubFetch(authResponse('login'));
  try {
    const r = await client.auth.login({ email: 'a@b.invalid', password: 'pw12345678' });
    assert.equal(r.user.userId, '7');
    // The non-standard argument name is the whole hazard: `input` would be
    // refused by the server with a message naming a variable the caller never wrote.
    assert.deepEqual(calls[0].body.variables, {
      loginUserInput: { email: 'a@b.invalid', password: 'pw12345678' },
    });
    assert.match(calls[0].body.query, /login\(loginUserInput: \$loginUserInput\)/);
    assert.equal(client.auth.getToken(), 'session-token');
  } finally {
    restore();
  }
});

test('register sends registerUserInput and stores the session', async () => {
  const client = await makeClient();
  const { calls, restore } = stubFetch(authResponse('register'));
  try {
    await client.auth.register({
      email: 'a@b.invalid',
      password: 'pw12345678',
      gamertag: 'bot',
    });
    assert.deepEqual(calls[0].body.variables, {
      registerUserInput: { email: 'a@b.invalid', password: 'pw12345678', gamertag: 'bot' },
    });
    assert.equal(client.auth.getToken(), 'session-token');
  } finally {
    restore();
  }
});

test('requestLoginLink no longer selects devToken', async () => {
  // The field leaked an emailed one-time secret to any unauthenticated caller
  // whenever the server had the bypass on. It is gone from the server, so
  // selecting it would fail validation on every call.
  const client = await makeClient();
  const { calls, restore } = stubFetch({ data: { requestLoginLink: { sent: true } } });
  try {
    const r = await client.auth.requestLoginLink({ email: 'a@b.invalid' });
    assert.equal(r.sent, true);
    assert.ok(!calls[0].body.query.includes('devToken'), 'devToken must not be selected');
  } finally {
    restore();
  }
});

test('an already-registered address is recognised despite arriving as INTERNAL_SERVER_ERROR', async () => {
  const { isAlreadyRegisteredError, isPasswordUnconfirmedError } = await import(
    '../../dist/index.js'
  );
  // Verified against a live tier: Nest's ConflictException surfaces with this
  // code, so a caller keying on CONFLICT would treat a routine collision as a
  // server fault and stop.
  const conflict = new Error(
    'An account with this email already exists. We emailed a link to confirm ' +
      'and finish adding password sign-in; until then, continue using your ' +
      'existing sign-in method.',
  );
  assert.ok(isAlreadyRegisteredError(conflict));
  assert.ok(!isPasswordUnconfirmedError(conflict));

  const unconfirmed = new Error(
    'Confirm your email to enable password sign-in for this account.',
  );
  assert.ok(isPasswordUnconfirmedError(unconfirmed));
  assert.ok(!isAlreadyRegisteredError(unconfirmed));

  // Wrong password is neither, and must stay neither: reporting it as
  // "confirm your email" sends the user to an inbox that will not help.
  const bad = new Error('Invalid credentials');
  assert.ok(!isAlreadyRegisteredError(bad));
  assert.ok(!isPasswordUnconfirmedError(bad));
});

test('checkAuthMethod asks without revealing whether the account exists', async () => {
  const client = await makeClient();
  const { calls, restore } = stubFetch({ data: { checkAuthMethod: { hasPassword: true } } });
  try {
    const r = await client.auth.checkAuthMethod('a@b.invalid');
    assert.equal(r.hasPassword, true);
    assert.deepEqual(calls[0].body.variables, { input: { email: 'a@b.invalid' } });
  } finally {
    restore();
  }
});
