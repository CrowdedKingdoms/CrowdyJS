import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The terms and age gate (ck-api v2.35.0). A gameplay token is refused with
 * LEGAL_ACCEPTANCE_REQUIRED until the player's consents are stored, so the SDK
 * carries the two clickwrap fields on `register`, the call that stores them,
 * the read that says whether they are stored, and a predicate for the refusal.
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
      message: 'Accept the current terms and confirm you meet the age of majority before playing.',
      extensions: { code: 'LEGAL_ACCEPTANCE_REQUIRED' },
    },
  ],
};

test('register forwards both clickwrap fields inside registerUserInput', async () => {
  const stub = stubFetch({
    data: { register: { token: 's', gameTokenId: '1', user: { userId: '7', email: 'a@b.invalid', gamertag: null } } },
  });
  try {
    const client = await makeClient();
    await client.auth.register({ email: 'a@b.invalid', password: 'pw-123456', acceptLegal: true, attestAgeOfMajority: true });
    const input = stub.calls[0].body.variables.registerUserInput;
    assert.equal(input.acceptLegal, true);
    assert.equal(input.attestAgeOfMajority, true);
  } finally {
    stub.restore();
  }
});

test('recordPlayerConsents sends both arguments and returns the answer', async () => {
  const stub = stubFetch({ data: { recordPlayerConsents: true } });
  try {
    const client = await makeClient();
    client.setToken('session-token');
    const stored = await client.auth.recordPlayerConsents({ acceptLegal: true, attestAgeOfMajority: true });
    assert.equal(stored, true);
    const { query, variables } = stub.calls[0].body;
    assert.match(
      query,
      /recordPlayerConsents\(\s*acceptLegal: \$acceptLegal\s*,?\s*attestAgeOfMajority: \$attestAgeOfMajority\s*\)/,
    );
    assert.deepEqual(variables, { acceptLegal: true, attestAgeOfMajority: true });
  } finally {
    stub.restore();
  }
});

test('playerLegalAcceptance reads the boolean', async () => {
  const stub = stubFetch({ data: { playerLegalAcceptance: false } });
  try {
    const client = await makeClient();
    client.setToken('session-token');
    assert.equal(await client.auth.playerLegalAcceptance(), false);
    assert.match(stub.calls[0].body.query, /playerLegalAcceptance/);
  } finally {
    stub.restore();
  }
});

test('a refused mint is recognised by isLegalAcceptanceRequiredError', async () => {
  const { isLegalAcceptanceRequiredError } = await import('../../dist/index.js');
  const stub = stubFetch(refusal);
  try {
    const client = await makeClient();
    client.setToken('session-token');
    const err = await client.portal.mintAppToken('42').then(
      () => assert.fail('mint should have been refused'),
      (e) => e,
    );
    assert.equal(isLegalAcceptanceRequiredError(err), true);
  } finally {
    stub.restore();
  }
});

test('isLegalAcceptanceRequiredError reads every shape and nothing else', async () => {
  const { isLegalAcceptanceRequiredError } = await import('../../dist/index.js');
  assert.equal(isLegalAcceptanceRequiredError({ code: 'LEGAL_ACCEPTANCE_REQUIRED' }), true);
  assert.equal(isLegalAcceptanceRequiredError({ extensions: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } }), true);
  assert.equal(
    isLegalAcceptanceRequiredError({ graphQLErrors: [{ extensions: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } }] }),
    true,
  );
  assert.equal(isLegalAcceptanceRequiredError(new Error('LEGAL_ACCEPTANCE_REQUIRED')), true);
  assert.equal(isLegalAcceptanceRequiredError({ code: 'HOSTED_SIGN_IN_REQUIRED' }), false);
  assert.equal(isLegalAcceptanceRequiredError(new Error('Invalid credentials')), false);
  assert.equal(isLegalAcceptanceRequiredError(null), false);
});
