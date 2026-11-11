import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The email gate (ck-api v2.65.0). A password account made since 2026-11-11 gets
 * no gameplay token until it confirms its email, so the SDK carries a predicate
 * for the refusal and the two calls that answer it: the resend, and the
 * confirmation for a client that serves the link's page.
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
  return createCrowdyClient({ httpUrl: ENDPOINT, wsUrl: 'wss://ck.example/graphql' });
}

const refusal = {
  errors: [
    {
      message:
        'Confirm your email address before playing: open the link we emailed when the account was created. resendConfirmationEmail sends another.',
      extensions: { code: 'EMAIL_CONFIRMATION_REQUIRED' },
    },
  ],
};

test('a refused mint is recognised by isEmailConfirmationRequiredError, not as a documents refusal', async () => {
  const { isEmailConfirmationRequiredError, isLegalAcceptanceRequiredError } = await import(
    '../../dist/index.js'
  );
  const stub = stubFetch(refusal);
  try {
    const client = await makeClient();
    client.setToken('session-token');
    const err = await client.portal.mintAppToken('42').then(
      () => assert.fail('mint should have been refused'),
      (e) => e,
    );
    assert.equal(isEmailConfirmationRequiredError(err), true);
    assert.equal(isLegalAcceptanceRequiredError(err), false);
  } finally {
    stub.restore();
  }
});

test('isEmailConfirmationRequiredError reads every shape and nothing else', async () => {
  const { isEmailConfirmationRequiredError } = await import('../../dist/index.js');
  const code = 'EMAIL_CONFIRMATION_REQUIRED';
  assert.equal(isEmailConfirmationRequiredError({ code }), true);
  assert.equal(isEmailConfirmationRequiredError({ extensions: { code } }), true);
  assert.equal(isEmailConfirmationRequiredError({ graphQLErrors: [{ extensions: { code } }] }), true);
  assert.equal(isEmailConfirmationRequiredError({ graphqlErrors: [{ extensions: { code } }] }), true);
  assert.equal(isEmailConfirmationRequiredError(new Error(code)), true);
  assert.equal(isEmailConfirmationRequiredError({ code: 'LEGAL_ACCEPTANCE_REQUIRED' }), false);
  assert.equal(isEmailConfirmationRequiredError(new Error('Invalid credentials')), false);
  assert.equal(isEmailConfirmationRequiredError(null), false);
});

test('resendConfirmationEmail sends the address and returns the answer, with no token', async () => {
  const stub = stubFetch({ data: { resendConfirmationEmail: true } });
  try {
    const client = await makeClient();
    assert.equal(await client.auth.resendConfirmationEmail('a@b.invalid'), true);
    const { query, variables } = stub.calls[0].body;
    assert.match(query, /resendConfirmationEmail\(\s*email: \$email\s*\)/);
    assert.deepEqual(variables, { email: 'a@b.invalid' });
  } finally {
    stub.restore();
  }
});

test('confirmEmail sends the token and returns false for a bad one', async () => {
  const stub = stubFetch({ data: { confirmEmail: false } });
  try {
    const client = await makeClient();
    assert.equal(await client.auth.confirmEmail('emailed-token'), false);
    const { query, variables } = stub.calls[0].body;
    assert.match(query, /confirmEmail\(\s*token: \$token\s*\)/);
    assert.deepEqual(variables, { token: 'emailed-token' });
  } finally {
    stub.restore();
  }
});
