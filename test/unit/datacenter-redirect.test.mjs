import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Moving to the app's own datacenter, and knowing when not to.
 *
 * The server refuses a gameplay call for an app that lives somewhere else. There
 * are two refusals and they demand opposite behaviour:
 *
 *   WRONG_DATACENTER  names an endpoint -> move there and retry; a player sees nothing.
 *   APP_UNAVAILABLE   names none, because the app's datacenter is not serving ->
 *                     stop, and tell the player, because no amount of retrying fixes it.
 *
 * Telling them apart is the whole job. Treating the second as the first sends the
 * client to a dead address and turns a clear "offline" into a hang.
 */

const ENDPOINT = 'https://ck-va.prod.crowdedkingdoms.com/graphql';
const OR_HTTP = 'https://ck-or.prod.crowdedkingdoms.com';
const OR_WS = 'wss://ck-or.prod.crowdedkingdoms.com';

function wrongDatacenterError() {
  return {
    message: "App 42 is served from datacenter 'or', not 'va'.",
    extensions: {
      code: 'WRONG_DATACENTER',
      appId: '42',
      appDatacenter: 'or',
      servedBy: 'va',
      gameApiUrl: OR_HTTP,
      gameApiWsUrl: OR_WS,
    },
  };
}

function appUnavailableError() {
  return {
    message:
      "This app is temporarily offline. Its datacenter ('or') is not currently " +
      'serving clients, and we are working on it. Nothing needs to be done on ' +
      'your side — try again shortly.',
    extensions: {
      code: 'APP_UNAVAILABLE',
      appId: '42',
      appDatacenter: 'or',
      servedBy: 'va',
      retryable: true,
    },
  };
}

/** A fetch double that plays a scripted sequence of responses, recording each URL. */
function scriptedFetch(steps) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return {
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: () => {} },
      json: async () => step,
      text: async () => JSON.stringify(step),
    };
  };
  return { impl, calls };
}

async function makeTransport(steps, extra = {}) {
  const { GraphQLClient, SessionStore } = await import('../../dist/index.js');
  const { impl, calls } = scriptedFetch(steps);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  const session = new SessionStore();
  const client = new GraphQLClient(
    { graphqlEndpoint: ENDPOINT, ...extra },
    session,
  );
  return { client, calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test('moveFromErrors reads the endpoint out of a WRONG_DATACENTER', async () => {
  const { moveFromErrors } = await import('../../dist/index.js');
  const move = moveFromErrors([wrongDatacenterError()]);
  assert.equal(move.gameApiUrl, OR_HTTP);
  assert.equal(move.gameApiWsUrl, OR_WS);
  assert.equal(move.appDatacenter, 'or');
});

test('moveFromErrors scans past a leading unrelated error', async () => {
  // A query naming several apps is refused per app, so the redirect need not be
  // first. Reading only errors[0] would ignore a move sitting right there.
  const { moveFromErrors } = await import('../../dist/index.js');
  const move = moveFromErrors([
    { message: 'nope', extensions: { code: 'FORBIDDEN' } },
    wrongDatacenterError(),
  ]);
  assert.equal(move.gameApiUrl, OR_HTTP);
});

test('moveFromErrors refuses to move on APP_UNAVAILABLE', async () => {
  // The case that matters most: this error deliberately carries no endpoint, and
  // treating it as a move would send the client to the datacenter that is down.
  const { moveFromErrors } = await import('../../dist/index.js');
  assert.equal(moveFromErrors([appUnavailableError()]), null);
});

test('moveFromErrors refuses a WRONG_DATACENTER with no endpoint', async () => {
  // A contract violation rather than an ordinary case. "Do not move" beats
  // "move to undefined".
  const { moveFromErrors } = await import('../../dist/index.js');
  const broken = wrongDatacenterError();
  delete broken.extensions.gameApiUrl;
  assert.equal(moveFromErrors([broken]), null);
});

test('the transport moves and retries once, and the retry succeeds', async () => {
  const moves = [];
  const { client, calls, restore } = await makeTransport(
    [{ errors: [wrongDatacenterError()] }, { data: { chunk: 'ok' } }],
    {
      onWrongDatacenter: (move) => {
        moves.push(move);
        client.setEndpoint(`${move.gameApiUrl}/graphql`);
        return true;
      },
    },
  );
  try {
    const data = await client.query('query { chunk }');
    assert.deepEqual(data, { chunk: 'ok' });
    assert.equal(calls.length, 2, 'expected exactly one retry');
    assert.equal(calls[0].url, ENDPOINT);
    assert.equal(calls[1].url, `${OR_HTTP}/graphql`, 'retry went to the new datacenter');
    assert.equal(moves.length, 1);
  } finally {
    restore();
  }
});

test('the transport does not retry when the handler declines', async () => {
  // A handler returns false when it did not actually move -- most often because
  // the endpoint named is the one already in use. Retrying then re-sends to the
  // same instance, is refused identically, and loops.
  const { client, calls, restore } = await makeTransport(
    [{ errors: [wrongDatacenterError()] }],
    { onWrongDatacenter: () => false },
  );
  try {
    await assert.rejects(() => client.query('query { chunk }'), (err) => {
      assert.equal(err.code, 'WRONG_DATACENTER');
      return true;
    });
    assert.equal(calls.length, 1, 'must not retry');
  } finally {
    restore();
  }
});

test('the transport retries at most once', async () => {
  // Two datacenters each saying the app is in the other is a placement problem an
  // operator has to see, not one a client should smooth over by bouncing forever.
  const { client, calls, restore } = await makeTransport(
    [{ errors: [wrongDatacenterError()] }],
    {
      onWrongDatacenter: (move) => {
        client.setEndpoint(`${move.gameApiUrl}/graphql?n=${calls.length}`);
        return true;
      },
    },
  );
  try {
    await assert.rejects(() => client.query('query { chunk }'));
    assert.equal(calls.length, 2, 'one original plus one retry, and no more');
  } finally {
    restore();
  }
});

test('a handler that throws surfaces the original refusal', async () => {
  const { client, calls, restore } = await makeTransport(
    [{ errors: [wrongDatacenterError()] }],
    {
      onWrongDatacenter: () => {
        throw new Error('storage blew up');
      },
    },
  );
  try {
    await assert.rejects(() => client.query('query { chunk }'), (err) => {
      // The refusal, not the handler's problem: the caller asked about their
      // query, and "storage blew up" would send them somewhere unrelated.
      assert.equal(err.code, 'WRONG_DATACENTER');
      return true;
    });
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});

test('APP_UNAVAILABLE throws a typed error a host can show a player', async () => {
  const { CrowdyAppUnavailableError, CrowdyGraphQLError } = await import(
    '../../dist/index.js'
  );
  const { client, calls, restore } = await makeTransport([
    { errors: [appUnavailableError()] },
  ]);
  try {
    await assert.rejects(() => client.query('query { chunk }'), (err) => {
      assert.ok(err instanceof CrowdyAppUnavailableError);
      // Still a CrowdyGraphQLError, so every existing catch keeps working and
      // only code that WANTS to tell "offline" from "forbidden" has to change.
      assert.ok(err instanceof CrowdyGraphQLError);
      assert.equal(err.code, 'APP_UNAVAILABLE');
      assert.equal(err.appDatacenter, 'or');
      assert.equal(err.appId, '42');
      assert.equal(err.retryable, true);
      assert.match(err.message, /temporarily offline/i);
      return true;
    });
    // No retry: nothing the client does fixes this one.
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});

test('APP_UNAVAILABLE never leaks an endpoint to move to', async () => {
  const { client, restore } = await makeTransport([
    { errors: [appUnavailableError()] },
  ]);
  try {
    await assert.rejects(() => client.query('query { chunk }'), (err) => {
      assert.equal(err.extensions.gameApiUrl, undefined);
      return true;
    });
  } finally {
    restore();
  }
});

test('an ordinary error is untouched by any of this', async () => {
  const { CrowdyAppUnavailableError } = await import('../../dist/index.js');
  const { client, calls, restore } = await makeTransport([
    { errors: [{ message: 'nope', extensions: { code: 'FORBIDDEN' } }] },
  ]);
  try {
    await assert.rejects(() => client.query('query { chunk }'), (err) => {
      assert.equal(err.code, 'FORBIDDEN');
      assert.ok(!(err instanceof CrowdyAppUnavailableError));
      return true;
    });
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});
