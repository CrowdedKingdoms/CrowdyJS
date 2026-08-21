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
 *
 * Password MANAGEMENT was the same gap one method deeper and was wrapped on
 * 2026-08-21: `requestPasswordReset`, `resetPassword`, `changePassword` and
 * `setInitialPassword`. The four are distinguished by what the caller has
 * proven — an emailed token, the current password, or the session — so the
 * tests below are mostly about NOT collapsing them, and about telling their
 * refusals apart, which the GraphQL error code cannot do.
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

test('changePassword sends both passwords FLAT, not in an input object', async () => {
  const client = await makeClient();
  const { calls, restore } = stubFetch({ data: { changePassword: true } });
  try {
    const ok = await client.auth.changePassword({
      currentPassword: 'old-pw-12345',
      newPassword: 'new-pw-12345',
    });
    assert.equal(ok, true);
    // The server takes two top-level arguments here, unlike login/register
    // which take a named input object. Wrapping them would be refused.
    assert.deepEqual(calls[0].body.variables, {
      currentPassword: 'old-pw-12345',
      newPassword: 'new-pw-12345',
    });
    assert.match(
      calls[0].body.query,
      /changePassword\(currentPassword: \$currentPassword, newPassword: \$newPassword\)/,
    );
  } finally {
    restore();
  }
});

test('setInitialPassword sends only the new password and does not smuggle a current one', async () => {
  const client = await makeClient();
  const { calls, restore } = stubFetch({ data: { setInitialPassword: true } });
  try {
    const ok = await client.auth.setInitialPassword('first-pw-12345');
    assert.equal(ok, true);
    assert.deepEqual(calls[0].body.variables, { newPassword: 'first-pw-12345' });
    // The absence is the assertion. This mutation exists for an account that
    // HAS no password, so there is nothing to verify; a wrapper that accepted a
    // current password would be pretending the two methods are one.
    assert.ok(
      !/currentPassword/.test(calls[0].body.query),
      'setInitialPassword must not reference a current password',
    );
  } finally {
    restore();
  }
});

test('resetPassword sends resetPasswordInput, and requestPasswordReset a bare email', async () => {
  const client = await makeClient();
  {
    const { calls, restore } = stubFetch({ data: { requestPasswordReset: true } });
    try {
      assert.equal(await client.auth.requestPasswordReset('a@b.invalid'), true);
      assert.deepEqual(calls[0].body.variables, { email: 'a@b.invalid' });
    } finally {
      restore();
    }
  }
  {
    const { calls, restore } = stubFetch({ data: { resetPassword: true } });
    try {
      const ok = await client.auth.resetPassword({
        token: 'reset-token',
        newPassword: 'new-pw-12345',
      });
      assert.equal(ok, true);
      // Non-standard argument name, like loginUserInput/registerUserInput.
      assert.deepEqual(calls[0].body.variables, {
        resetPasswordInput: { token: 'reset-token', newPassword: 'new-pw-12345' },
      });
    } finally {
      restore();
    }
  }
});

test('the three password-management refusals are told apart by wording, not by code', async () => {
  const {
    isPasswordAlreadySetError,
    isNoPasswordSetError,
    isInvalidCurrentPasswordError,
  } = await import('../../dist/index.js');

  // Every string below was read off a LIVE tier on 2026-08-21, not out of the
  // server source: setInitialPassword's refusal is a Nest ConflictException and
  // arrives as INTERNAL_SERVER_ERROR despite the schema saying "throws
  // CONFLICT", and both changePassword refusals arrive as UNAUTHENTICATED --
  // which is also what an expired session looks like. That is why these match
  // on wording; the code cannot separate any of them.
  const alreadySet = new Error(
    'This account already has a password. Use changePassword to change it, or ' +
      'the password reset flow if you have forgotten it.',
  );
  const noPassword = new Error(
    'No password is set on this account. Use setInitialPassword to add one ' +
      'while signed in, or the password reset flow.',
  );
  const wrongCurrent = new Error('Invalid current password');

  // Each detector recognises its own case...
  assert.ok(isPasswordAlreadySetError(alreadySet));
  assert.ok(isNoPasswordSetError(noPassword));
  assert.ok(isInvalidCurrentPasswordError(wrongCurrent));

  // ...and none of them recognises another's, which is the half that matters.
  // Confusing the first two sends the user to the method that will refuse them
  // again; confusing either with the third tells them their password is wrong
  // when they do not have one.
  const all = [
    ['alreadySet', alreadySet],
    ['noPassword', noPassword],
    ['wrongCurrent', wrongCurrent],
  ];
  const detectors = [
    ['alreadySet', isPasswordAlreadySetError],
    ['noPassword', isNoPasswordSetError],
    ['wrongCurrent', isInvalidCurrentPasswordError],
  ];
  for (const [caseName, error] of all) {
    for (const [detectorName, detector] of detectors) {
      assert.equal(
        detector(error),
        caseName === detectorName,
        `${detectorName} on ${caseName}`,
      );
    }
  }

  // An expired session is none of the three, and must stay none of them: it is
  // the outcome whose remedy is signing in again.
  const expired = new Error('Unauthorized');
  for (const [, detector] of detectors) assert.ok(!detector(expired));
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
