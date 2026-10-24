import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSdk } from '../helpers.mjs';

/**
 * `send*AndWait`: the echo window starts once the send is accepted, and the
 * first awaited send of a session is retried once when a game server that does
 * not hold a session's first messages refuses or drops it.
 */

const APP_ID = '42';
const CHUNK = { x: '0', y: '0', z: '0' };
const UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function offlineClient() {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
  });
  client.setToken('game-token');
  client.realtime.ensureSubscription = () => {};
  return client;
}

/**
 * Stub the actor-update mutation. `reply(sequenceNumber, attempt)` runs as the
 * send leaves and may dispatch notifications; the sends' sequence numbers are
 * recorded in order.
 */
function stubSend(client, { delayMs = 0, reply = () => {} } = {}) {
  const sequences = [];
  client.graphql.request = async (_document, variables) => {
    const sequenceNumber = variables.input.sequenceNumber;
    sequences.push(sequenceNumber);
    if (delayMs) await sleep(delayMs);
    reply(sequenceNumber, sequences.length);
    return { sendActorUpdate: true };
  };
  return sequences;
}

const echo = (sequenceNumber) => ({
  __typename: 'ActorUpdateNotification',
  sequenceNumber,
  uuid: UUID,
});

const refusal = (sequenceNumber) => ({
  __typename: 'GenericErrorResponse',
  sequenceNumber,
  errorCode: 'UNAUTHORIZED',
});

const update = (over = {}) => ({
  appId: APP_ID,
  chunk: CHUNK,
  uuid: UUID,
  state: 'AA==',
  distance: 8,
  ...over,
});

/** A new realtime session, as a (re)connect reports it. */
function newSession(client) {
  client.realtime.setStatus('reconnecting');
  client.realtime.setStatus('connected');
}

test('the echo window starts when the send is accepted, not when it is called', async () => {
  const client = await offlineClient();
  try {
    // A 300 ms send leg against a 200 ms window: counted from the call, the wait
    // would have expired before the echo could arrive.
    stubSend(client, {
      delayMs: 300,
      reply: (seq) => setTimeout(() => client.realtime.dispatch(echo(seq)), 100),
    });
    const result = await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    assert.equal(result.__typename, 'ActorUpdateNotification');
  } finally {
    client.close();
  }
});

test('an echo that arrives before the send returns is not missed', async () => {
  const client = await offlineClient();
  try {
    stubSend(client, { reply: (seq) => client.realtime.dispatch(echo(seq)) });
    const result = await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    assert.equal(result.__typename, 'ActorUpdateNotification');
  } finally {
    client.close();
  }
});

test('a send that fails leaves no wait behind', async () => {
  const client = await offlineClient();
  try {
    client.graphql.request = async () => {
      throw new Error('send refused');
    };
    await assert.rejects(
      client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 50 }),
      /send refused/,
    );
    assert.equal(client.realtime.pending.size, 0);
  } finally {
    client.close();
  }
});

test("a session's first awaited send is retried once on UNAUTHORIZED, with a fresh sequence number", async () => {
  const client = await offlineClient();
  try {
    newSession(client);
    const sequences = stubSend(client, {
      reply: (seq, attempt) =>
        client.realtime.dispatch(attempt === 1 ? refusal(seq) : echo(seq)),
    });
    const result = await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    assert.equal(sequences.length, 2);
    assert.notEqual(sequences[0], sequences[1]);
    assert.equal(result.sequenceNumber, sequences[1]);
  } finally {
    client.close();
  }
});

test("a session's first awaited send is retried once when its echo never comes", async () => {
  const client = await offlineClient();
  try {
    const sequences = stubSend(client, {
      reply: (seq, attempt) => {
        if (attempt === 2) client.realtime.dispatch(echo(seq));
      },
    });
    const result = await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 50 });
    assert.equal(sequences.length, 2);
    assert.equal(result.sequenceNumber, sequences[1]);
  } finally {
    client.close();
  }
});

test('the retry happens once: a second failure is the caller\'s', async () => {
  const client = await offlineClient();
  try {
    const sequences = stubSend(client, {
      reply: (seq) => client.realtime.dispatch(refusal(seq)),
    });
    await assert.rejects(
      client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 }),
      (error) => error.code === 'UNAUTHORIZED',
    );
    assert.equal(sequences.length, 2);
  } finally {
    client.close();
  }
});

test('later awaited sends in the same session are not retried', async () => {
  const client = await offlineClient();
  try {
    let refuse = false;
    const sequences = stubSend(client, {
      reply: (seq) => client.realtime.dispatch(refuse ? refusal(seq) : echo(seq)),
    });
    await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    refuse = true;
    await assert.rejects(
      client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 }),
      (error) => error.code === 'UNAUTHORIZED',
    );
    assert.equal(sequences.length, 2, 'one send each, no retry for the second');
  } finally {
    client.close();
  }
});

test('a reconnect or a move makes the next awaited send the first of a new session', async () => {
  const client = await offlineClient();
  try {
    let refuseNext = false;
    const sequences = stubSend(client, {
      reply: (seq) => {
        const refused = refuseNext;
        refuseNext = false;
        client.realtime.dispatch(refused ? refusal(seq) : echo(seq));
      },
    });
    await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });

    newSession(client);
    refuseNext = true;
    await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    assert.equal(sequences.length, 3, 'the reconnect\'s first send was retried');

    client.realtime.moveToDirectedEndpoint({
      httpUrl: 'https://other.invalid/graphql',
      wsUrl: 'wss://other.invalid/graphql',
      reason: 'draining',
    });
    refuseNext = true;
    await client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 });
    assert.equal(sequences.length, 5, 'the move\'s first send was retried');
  } finally {
    client.close();
  }
});

test('a send whose sequence number the caller chose is never retried', async () => {
  const client = await offlineClient();
  try {
    const sequences = stubSend(client, {
      reply: (seq) => client.realtime.dispatch(refusal(seq)),
    });
    await assert.rejects(
      client.udp.sendActorUpdateAndWait(update({ sequenceNumber: 42 }), { timeoutMs: 200 }),
      (error) => error.code === 'UNAUTHORIZED',
    );
    assert.deepEqual(sequences, [42]);
  } finally {
    client.close();
  }
});

test('waitForSequence still starts its clock at once', async () => {
  const client = await offlineClient();
  try {
    const started = Date.now();
    await assert.rejects(
      client.realtime.waitForSequence(7, 50),
      (error) => error.code === 'UDP_SEQUENCE_TIMEOUT',
    );
    assert.ok(Date.now() - started < 1000);
  } finally {
    client.close();
  }
});

test("a text send's timeout is its success: it is not retried, and it answers for the session", async () => {
  const client = await offlineClient();
  try {
    const sequences = [];
    client.graphql.request = async (_document, variables) => {
      sequences.push(variables.input.sequenceNumber);
      return { sendTextPacket: true, sendActorUpdate: true };
    };
    const text = { appId: APP_ID, chunk: CHUNK, uuid: UUID, text: 'hi', distance: 8 };
    await assert.rejects(
      client.udp.sendTextPacketAndWait(text, { timeoutMs: 30 }),
      (error) => error.code === 'UDP_SEQUENCE_TIMEOUT',
    );
    assert.equal(sequences.length, 1, 'no retry of a silent success');

    // The session answered, so a later refused actor update is not retried.
    client.graphql.request = async (_document, variables) => {
      sequences.push(variables.input.sequenceNumber);
      client.realtime.dispatch(refusal(variables.input.sequenceNumber));
      return { sendActorUpdate: true };
    };
    await assert.rejects(
      client.udp.sendActorUpdateAndWait(update(), { timeoutMs: 200 }),
      (error) => error.code === 'UNAUTHORIZED',
    );
    assert.equal(sequences.length, 2);
  } finally {
    client.close();
  }
});

test("a session's first text send is retried once when it is refused", async () => {
  const client = await offlineClient();
  try {
    const sequences = [];
    client.graphql.request = async (_document, variables) => {
      const seq = variables.input.sequenceNumber;
      sequences.push(seq);
      if (sequences.length === 1) client.realtime.dispatch(refusal(seq));
      return { sendTextPacket: true };
    };
    const text = { appId: APP_ID, chunk: CHUNK, uuid: UUID, text: 'hi', distance: 8 };
    await assert.rejects(
      client.udp.sendTextPacketAndWait(text, { timeoutMs: 30 }),
      (error) => error.code === 'UDP_SEQUENCE_TIMEOUT',
    );
    assert.equal(sequences.length, 2, 'refused once, then sent again and accepted silently');
  } finally {
    client.close();
  }
});
