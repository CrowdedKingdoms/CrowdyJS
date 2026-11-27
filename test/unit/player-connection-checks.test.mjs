/**
 * What a player's own realtime client does with what it is sent (18.41.0,
 * OI-2026-11-26-005): the checks `FleetSession` makes, on the two paths a player's
 * notifications arrive by.
 *
 * - The binary relay hands the client the realtime server's datagrams as they are, so the
 *   client verifies them with the player's token: `parsePlayerDatagram`.
 * - The GraphQL subscription hands it objects the Application API read from those
 *   datagrams. There is no signature left to check there, so the client checks the app.
 *
 * The first half proves that nothing a realtime server sends a player's session is dropped:
 * every downlink fixture of `binary-wire-fixtures.json` (the Application API's own corpus)
 * is delivered as before in each form a server sends it in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const wire = await import('../../dist/binary-wire.js');
const root = await import('../../dist/index.js');
const { RealtimeClient } = await import('../../dist/realtime.js');
const { WorldSessionCore } = await import('../../dist/stores/session.js');

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/binary-wire-fixtures.json', import.meta.url)), 'utf8'),
);
const TOKEN = fixtures.gameToken;
const ctx = await wire.createSignContext(BigInt(fixtures.gameTokenId), TOKEN);
const other = await wire.createSignContext(BigInt(fixtures.gameTokenId), 'z'.repeat(64));

const T = wire.WireMessageType;
const bytesOf = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = (kind) => fixtures.downlink.find((f) => f.kind === kind);
const isSpatial = (bytes) => (bytes[0] & 0x80) !== 0;

/** `[type]{[u16 length][member]}…` */
function bundleBody(type, members) {
  const parts = [Buffer.from([type])];
  for (const m of members) parts.push(Buffer.from([m.length & 0xff, m.length >> 8]), Buffer.from(m));
  return Uint8Array.from(Buffer.concat(parts));
}

/** MESSAGE_BUNDLE_SIGNED: the body, then HMAC-SHA256(token, body || token). */
async function signedBundle(signer, members) {
  const body = bundleBody(T.MESSAGE_BUNDLE_SIGNED, members);
  return Uint8Array.from(Buffer.concat([Buffer.from(body), Buffer.from(await wire.signWithToken(signer, body))]));
}

/**
 * A long-spatial notification as a server sends it alone or in a plain bundle: `containsAuth`
 * 1 and its own HMAC over the header and the payload, before the 9-byte tail. Built from the
 * unsigned form (a signed bundle's member).
 */
async function selfSigned(signer, unsignedMember) {
  const prefix = Uint8Array.from(unsignedMember.subarray(0, unsignedMember.length - 9));
  prefix[35] = 1;
  const tag = await wire.signWithToken(signer, prefix);
  return Uint8Array.from(
    Buffer.concat([Buffer.from(prefix), Buffer.from(tag), Buffer.from(unsignedMember.subarray(unsignedMember.length - 9))]),
  );
}

const none = { hmacFailures: 0, malformed: 0, unsigned: 0 };
const counts = ({ hmacFailures, malformed, unsigned }) => ({ hmacFailures, malformed, unsigned });

// ---------------------------------------------------------------------------
// Nothing a realtime server sends a player's session is dropped
// ---------------------------------------------------------------------------

for (const f of fixtures.downlink) {
  const bytes = bytesOf(f.bytesHex);

  if (isSpatial(bytes)) {
    test(`a server's ${f.kind} is delivered: in a signed bundle, and alone with its own HMAC`, async () => {
      // To a session that advertised BUNDLE_SIGNED: a one-member signed bundle.
      const bundled = await wire.parsePlayerDatagram(ctx, await signedBundle(ctx, [bytes]));
      assert.deepEqual(counts(bundled), none);
      assert.deepEqual(plain(bundled.messages.map((m) => m.notification)), f.expected);
      assert.deepEqual(bundled.messages.map((m) => m.verified), [true]);

      // To a session whose capabilities have not landed: signed by itself.
      const own = await selfSigned(ctx, bytes);
      const alone = await wire.parsePlayerDatagram(ctx, own);
      assert.deepEqual(counts(alone), none);
      assert.deepEqual(plain(alone.messages.map((m) => m.notification)), f.expected);
      assert.deepEqual(alone.messages.map((m) => m.verified), [true]);

      // And as a member of a plain bundle.
      const inPlain = await wire.parsePlayerDatagram(ctx, bundleBody(T.MESSAGE_BUNDLE, [own]));
      assert.deepEqual(counts(inPlain), none);
      assert.deepEqual(plain(inPlain.messages.map((m) => m.notification)), f.expected);
    });
  } else if (bytes[0] === T.MESSAGE_BUNDLE) {
    test(`a server's ${f.kind} is delivered whole: signed once, and with each member signed`, async () => {
      const members = [];
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let off = 1; off + 2 <= bytes.length; ) {
        const len = view.getUint16(off, true);
        members.push(bytes.subarray(off + 2, off + 2 + len));
        off += 2 + len;
      }
      assert.ok(members.length >= 2, 'the fixture is a bundle of several members');

      const once = await wire.parsePlayerDatagram(ctx, await signedBundle(ctx, members));
      assert.deepEqual(counts(once), none);
      assert.deepEqual(plain(once.messages.map((m) => m.notification)), f.expected);
      assert.ok(once.messages.every((m) => m.verified));

      const each = [];
      for (const m of members) each.push(isSpatial(m) ? await selfSigned(ctx, m) : m);
      const perMember = await wire.parsePlayerDatagram(ctx, bundleBody(T.MESSAGE_BUNDLE, each));
      assert.deepEqual(counts(perMember), none);
      assert.deepEqual(plain(perMember.messages.map((m) => m.notification)), f.expected);
    });
  } else {
    test(`a server's ${f.kind} has no signature of its own and is delivered alone, unverified`, async () => {
      const alone = await wire.parsePlayerDatagram(ctx, bytes);
      assert.deepEqual(counts(alone), none);
      assert.deepEqual(plain(alone.messages.map((m) => m.notification)), f.expected);
      assert.deepEqual(alone.messages.map((m) => m.verified), [false]);

      const inPlain = await wire.parsePlayerDatagram(ctx, bundleBody(T.MESSAGE_BUNDLE, [bytes]));
      assert.deepEqual(counts(inPlain), none);
      assert.deepEqual(inPlain.messages.map((m) => m.verified), [false]);

      const bundled = await wire.parsePlayerDatagram(ctx, await signedBundle(ctx, [bytes]));
      assert.deepEqual(counts(bundled), none);
      assert.deepEqual(plain(bundled.messages.map((m) => m.notification)), f.expected);
      assert.deepEqual(bundled.messages.map((m) => m.verified), [true]);
    });
  }
}

test("the long-spatial HMAC is the one CrowdyCPP's golden datagram carries", async () => {
  // tests/wire_test.cpp, computed from the public wire formats: a 140 with its own HMAC.
  const golden = bytesOf(
    '8c07000000000000000100000000000000feffffffffffffff03000000000000000801013031323334353637' +
      '383961626364656630313233343536373839616263646566deadbeef43ecd468d2593f17f3fb06368a2b6f47' +
      '32fc2da165acf4ca2bfe16396c43362a15cd5b07000000002a',
  );
  const signer = await wire.createSignContext(
    123456789n,
    'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+/',
  );
  const read = await wire.parsePlayerDatagram(signer, golden);
  assert.deepEqual(counts(read), none);
  assert.equal(read.messages.length, 1);
  assert.equal(read.messages[0].verified, true);
  assert.equal(read.messages[0].notification.__typename, 'GenericSpatialNotification');
  const tampered = Uint8Array.from(golden);
  tampered[70] ^= 1;
  assert.deepEqual(counts(await wire.parsePlayerDatagram(signer, tampered)), { ...none, hmacFailures: 1 });
});

// ---------------------------------------------------------------------------
// What is dropped, and counted
// ---------------------------------------------------------------------------

const actor = bytesOf(fixture('actorNotification').bytesHex);
const errorFrame = bytesOf(fixture('genericError').bytesHex);
const channel = bytesOf(fixture('channelNotification').bytesHex);

test('a signed bundle whose HMAC fails is dropped whole', async () => {
  const good = await signedBundle(ctx, [actor, errorFrame, channel]);
  assert.equal((await wire.parsePlayerDatagram(ctx, good)).messages.length, 3);

  const flipped = Uint8Array.from(good);
  flipped[10] ^= 0x40; // a byte of the first member
  const read = await wire.parsePlayerDatagram(ctx, flipped);
  assert.deepEqual(read.messages, []);
  assert.deepEqual(counts(read), { ...none, hmacFailures: 1 });

  // Signed with another token: another session's bundle, or a forged one.
  const foreign = await wire.parsePlayerDatagram(ctx, await signedBundle(other, [actor]));
  assert.deepEqual(foreign.messages, []);
  assert.deepEqual(counts(foreign), { ...none, hmacFailures: 1 });

  // No room for an HMAC at all.
  const short = await wire.parsePlayerDatagram(ctx, Uint8Array.from([T.MESSAGE_BUNDLE_SIGNED, 1, 2, 3]));
  assert.deepEqual(counts(short), { ...none, malformed: 1 });
});

test('a long-spatial notification whose own HMAC fails is dropped, and its neighbours are not', async () => {
  const good = await selfSigned(ctx, actor);
  const bad = await selfSigned(other, actor);
  const read = await wire.parsePlayerDatagram(ctx, bundleBody(T.MESSAGE_BUNDLE, [bad, good, errorFrame]));
  assert.deepEqual(counts(read), { ...none, hmacFailures: 1 });
  assert.deepEqual(read.messages.map((m) => [m.notification.__typename, m.verified]), [
    ['ActorUpdateNotification', true],
    ['GenericErrorResponse', false],
  ]);
});

test('a long-spatial notification that nothing signed is dropped and counted `unsigned`', async () => {
  // containsAuth 0, alone: the form a signed bundle's member has, outside its bundle.
  const alone = await wire.parsePlayerDatagram(ctx, actor);
  assert.deepEqual(alone.messages, []);
  assert.deepEqual(counts(alone), { ...none, unsigned: 1 });

  // In a plain bundle the channel notification and the refusal beside it are still delivered.
  const mixed = await wire.parsePlayerDatagram(ctx, bundleBody(T.MESSAGE_BUNDLE, [actor, channel, errorFrame, actor]));
  assert.deepEqual(counts(mixed), { ...none, unsigned: 2 });
  assert.deepEqual(mixed.messages.map((m) => [m.notification.__typename, m.verified]), [
    ['ChannelMessageNotification', false],
    ['GenericErrorResponse', false],
  ]);
});

test('what cannot be read is counted `malformed`, and what is not a notification is skipped', async () => {
  assert.deepEqual(counts(await wire.parsePlayerDatagram(ctx, new Uint8Array(0))), { ...none, malformed: 1 });
  // A long-spatial type too short for its header and tail.
  assert.deepEqual(counts(await wire.parsePlayerDatagram(ctx, Uint8Array.from([T.ACTOR_UPDATE_NOTIFICATION_2, 1, 2]))), {
    ...none,
    malformed: 1,
  });
  // containsAuth 1 with no room for the HMAC.
  const claims = Uint8Array.from(actor);
  claims[35] = 1;
  assert.deepEqual(counts(await wire.parsePlayerDatagram(ctx, claims)), { ...none, malformed: 1 });
  // A member length that runs past the datagram ends the walk; the member before it stands.
  const truncated = Uint8Array.from(Buffer.concat([Buffer.from(bundleBody(T.MESSAGE_BUNDLE, [errorFrame])), Buffer.from([200, 0, 1])]));
  const read = await wire.parsePlayerDatagram(ctx, truncated);
  assert.deepEqual(counts(read), { ...none, malformed: 1 });
  assert.equal(read.messages.length, 1);
  // A refusal of two bytes.
  assert.deepEqual(counts(await wire.parsePlayerDatagram(ctx, Uint8Array.from([3, 1]))), { ...none, malformed: 1 });

  // Control frames and a fleet session's frames are not a player's notifications.
  for (const type of [T.COMMAND_RECONNECT, T.COMMAND_SESSION_RELEASED, T.CONTROL_BOUND_ACK, T.FLEET_CARRY_RESULT, T.FLEET_DELIVERY, 99]) {
    const read = await wire.parsePlayerDatagram(ctx, Uint8Array.from([type, ...new Array(40).fill(7)]));
    assert.deepEqual(read.messages, [], `type ${type}`);
    assert.deepEqual(counts(read), none, `type ${type}`);
  }
  // A long-spatial type this SDK does not know, signed: verified, then skipped.
  const unknown = Uint8Array.from(actor);
  unknown[0] = 250;
  const skipped = await wire.parsePlayerDatagram(ctx, await signedBundle(ctx, [unknown]));
  assert.deepEqual(skipped.messages, []);
  assert.deepEqual(counts(skipped), none);
});

test('the root entry exports the reader', () => {
  assert.equal(root.parsePlayerDatagram, wire.parsePlayerDatagram);
});

// ---------------------------------------------------------------------------
// The client on the binary relay
// ---------------------------------------------------------------------------

class FakeWebSocket {
  static instances = [];
  static OPEN = 1;
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const APP = '42'; // the fixtures' app

/** A client on a fake relay that is `ready`, with handlers that record what they are given. */
async function relayClient(t, { warnings } = {}) {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  const realtime = new RealtimeClient(
    {
      wsUrl: 'wss://ck-api.example.test/graphql',
      binaryTransport: true,
      logger: warnings ? { warn: (message) => warnings.push(String(message)) } : undefined,
    },
    { getToken: () => TOKEN, onChange: () => () => {} },
  );
  const seen = { any: [], errors: [], sdkErrors: [] };
  const off = realtime.subscribe(
    {
      any: (n) => seen.any.push(n.__typename),
      genericError: (n, verified) => seen.errors.push([n.errorCode, n.sequenceNumber, verified]),
      error: (e) => seen.sdkErrors.push(e.code),
    },
    APP,
  );
  t.after(() => {
    off();
    realtime.close();
    globalThis.WebSocket = previous;
  });
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.readyState = FakeWebSocket.OPEN;
  ws.onopen?.({});
  ws.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId: String(fixtures.gameTokenId) }) });
  await settle();
  assert.equal(realtime.status(), 'connected');
  const deliver = async (frame) => {
    ws.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
    await realtime.settled();
  };
  return { realtime, seen, ws, deliver };
}

test('the relay delivers what verifies and drops what does not, and receiveStats says which', async (t) => {
  const warnings = [];
  const { realtime, seen, deliver } = await relayClient(t, { warnings });
  assert.deepEqual(realtime.receiveStats(), {
    hmacFailures: 0,
    malformed: 0,
    unsigned: 0,
    wrongApp: 0,
    errorsReceived: 0,
    unauthorizedReceived: 0,
    unverifiedErrorsReceived: 0,
  });

  await deliver(await signedBundle(ctx, [actor, channel]));
  assert.deepEqual(seen.any, ['ActorUpdateNotification', 'ChannelMessageNotification']);

  await deliver(await signedBundle(other, [actor])); // another token's bundle
  await deliver(actor); // nothing signed it
  await deliver(Uint8Array.from([T.ACTOR_UPDATE_NOTIFICATION_2, 1])); // unreadable
  await deliver(channel); // no signature of its own: delivered
  assert.deepEqual(seen.any, ['ActorUpdateNotification', 'ChannelMessageNotification', 'ChannelMessageNotification']);
  const stats = realtime.receiveStats();
  assert.equal(stats.hmacFailures, 1);
  assert.equal(stats.unsigned, 1);
  assert.equal(stats.malformed, 1);
  assert.equal(stats.wrongApp, 0);

  // The log says a counter moved, and nothing of what the frame carried.
  assert.equal(warnings.filter((w) => w.includes('hmacFailures is now 1')).length, 1);
  assert.equal(warnings.filter((w) => w.includes('unsigned is now 1')).length, 1);
  for (const w of warnings) assert.ok(!w.includes(TOKEN), 'no token in a log line');
});

test('notifications reach the handlers in arrival order, verified or not', async (t) => {
  const { realtime, seen, ws } = await relayClient(t);
  const frames = [await signedBundle(ctx, [actor]), channel, await selfSigned(ctx, bytesOf(fixture('textNotification').bytesHex)), errorFrame];
  // All four before any is read: the bundle's check must not let the plain ones overtake it.
  for (const frame of frames) {
    ws.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
  }
  assert.deepEqual(seen.any, [], 'nothing is delivered before it is verified');
  await realtime.settled();
  assert.deepEqual(seen.any, [
    'ActorUpdateNotification',
    'ChannelMessageNotification',
    'ClientTextNotification',
    'GenericErrorResponse',
  ]);
});

/** The actor fixture under another app id, in its unsigned (bundle member) form. */
function actorOfApp(appId, sequenceNumber) {
  const bytes = Uint8Array.from(actor);
  new DataView(bytes.buffer).setBigInt64(1, BigInt(appId), true);
  bytes[bytes.length - 1] = sequenceNumber;
  return bytes;
}

test('a notification that names another app is dropped on the relay, correctly signed or not', async (t) => {
  const warnings = [];
  const { realtime, seen, deliver } = await relayClient(t, { warnings });
  // An awaited send with the sequence number the other app's notification carries.
  let outcome = 'waiting';
  realtime.waitForSequence(77, 60_000).then(
    () => (outcome = 'resolved'),
    () => (outcome = 'rejected'),
  );

  await deliver(await signedBundle(ctx, [actorOfApp(43, 77), actorOfApp(APP, 9), channel]));
  assert.deepEqual(seen.any, ['ActorUpdateNotification', 'ChannelMessageNotification']);
  assert.equal(realtime.receiveStats().wrongApp, 1);
  assert.equal(outcome, 'waiting', "another app's notification settles no awaited send");
  assert.equal(warnings.filter((w) => w.includes('wrongApp is now 1')).length, 1);

  // The same app's notification with that sequence number does settle it.
  await deliver(await signedBundle(ctx, [actorOfApp(APP, 77)]));
  await settle();
  assert.equal(outcome, 'resolved');
  assert.equal(realtime.receiveStats().wrongApp, 1);
});

test('a refusal is delivered with whether it was verified, and changes nothing but its own send', async (t) => {
  const { realtime, seen, ws, deliver } = await relayClient(t);
  const sockets = FakeWebSocket.instances.length;
  const statuses = [];
  realtime.onStatus((s) => statuses.push(s));

  const mine = realtime.waitForSequence(5, 60_000);
  let otherSend = 'waiting';
  realtime.waitForSequence(6, 60_000).then(
    () => (otherSend = 'resolved'),
    () => (otherSend = 'rejected'),
  );

  // TOKEN_EXPIRED (32) for sequence 5, alone: three bytes, as a player's session is sent it.
  await deliver(Uint8Array.from([T.GENERIC_ERROR_MESSAGE, 5, 32]));
  await assert.rejects(mine, (error) => {
    assert.equal(error.code, 'TOKEN_EXPIRED');
    return true;
  });
  assert.deepEqual(seen.errors, [['TOKEN_EXPIRED', 5, false]]);
  assert.equal(otherSend, 'waiting', 'another send is untouched');

  // The client did nothing else about it: same socket, same status, nothing sent because of it.
  assert.equal(realtime.status(), 'connected');
  assert.deepEqual(statuses, ['connected']);
  assert.equal(FakeWebSocket.instances.length, sockets, 'no reconnect');
  assert.equal(ws.readyState, FakeWebSocket.OPEN);
  assert.equal(realtime.binarySendReady(), true);
  assert.deepEqual(seen.sdkErrors, []);

  // The same refusal inside a bundle the client verified is verified.
  await deliver(await signedBundle(ctx, [Uint8Array.from([T.GENERIC_ERROR_MESSAGE, 6, 7])]));
  await settle();
  assert.deepEqual(seen.errors, [
    ['TOKEN_EXPIRED', 5, false],
    ['UNAUTHORIZED', 6, true],
  ]);
  assert.equal(otherSend, 'rejected');

  // One inside a bundle signed with another token is never delivered at all.
  await deliver(await signedBundle(other, [Uint8Array.from([T.GENERIC_ERROR_MESSAGE, 8, 32])]));
  assert.equal(seen.errors.length, 2);

  const stats = realtime.receiveStats();
  assert.equal(stats.errorsReceived, 2);
  assert.equal(stats.unverifiedErrorsReceived, 1);
  assert.equal(stats.unauthorizedReceived, 1);
  assert.equal(stats.hmacFailures, 1);
});

test('a datagram from a socket the client has left is not delivered', async (t) => {
  const { realtime, seen, ws } = await relayClient(t);
  const frame = await signedBundle(ctx, [actor]);
  ws.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
  realtime.disconnect(); // before the check finishes
  await settle();
  assert.deepEqual(seen.any, []);
});

// ---------------------------------------------------------------------------
// The client on the GraphQL subscription
// ---------------------------------------------------------------------------

// graphql-transport-ws server side, enough for one subscription.
class FakeGraphqlSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  constructor(url, protocol) {
    this.url = url;
    this.protocol = typeof protocol === 'string' ? protocol : protocol?.[0];
    this.readyState = 0;
    this.sent = [];
    FakeGraphqlSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  send(data) {
    const message = JSON.parse(data);
    this.sent.push(message);
    if (message.type === 'connection_init') this.reply({ type: 'connection_ack' });
  }
  reply(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: true });
  }
}

test('the GraphQL transport drops another app\'s notification and marks every refusal unverified', async (t) => {
  FakeGraphqlSocket.instances = [];
  const realtime = new RealtimeClient(
    { wsUrl: 'wss://ck-api.example.test/graphql', webSocketImpl: FakeGraphqlSocket },
    { getToken: () => TOKEN, onChange: () => () => {} },
  );
  const seen = { any: [], errors: [] };
  const off = realtime.subscribe(
    {
      any: (n) => seen.any.push([n.__typename, n.appId ?? null]),
      genericError: (n, verified) => seen.errors.push([n.errorCode, verified]),
    },
    APP,
  );
  t.after(() => {
    off();
    realtime.close();
  });
  let subscribe;
  for (let i = 0; i < 50 && !subscribe; i += 1) {
    await settle();
    subscribe = FakeGraphqlSocket.instances.at(-1)?.sent.find((m) => m.type === 'subscribe');
  }
  assert.ok(subscribe, 'the udpNotifications subscription was sent');
  const next = (udpNotifications) =>
    FakeGraphqlSocket.instances.at(-1).reply({ id: subscribe.id, type: 'next', payload: { data: { udpNotifications } } });
  const actorOf = (appId, sequenceNumber) => ({ ...fixture('actorNotification').expected[0], appId, sequenceNumber });

  let outcome = 'waiting';
  realtime.waitForSequence(77, 60_000).then(
    () => (outcome = 'resolved'),
    () => (outcome = 'rejected'),
  );

  next(actorOf('43', 77)); // another app: the Application API's own app fence drops these
  next(actorOf(APP, 9));
  next(fixture('channelNotification').expected[0]); // names no app
  next({ __typename: 'GenericErrorResponse', sequenceNumber: 3, errorCode: 'TOKEN_EXPIRED' });
  next({ __typename: 'RealtimeConnectionEvent', status: 'connected', code: 'OK', message: '', retryable: true });

  assert.deepEqual(seen.any, [
    ['ActorUpdateNotification', APP],
    ['ChannelMessageNotification', null],
    ['GenericErrorResponse', null],
    ['RealtimeConnectionEvent', null],
  ]);
  assert.deepEqual(seen.errors, [['TOKEN_EXPIRED', false]]);
  assert.equal(outcome, 'waiting');
  const stats = realtime.receiveStats();
  assert.equal(stats.wrongApp, 1);
  assert.equal(stats.errorsReceived, 1);
  assert.equal(stats.unverifiedErrorsReceived, 1);
  // Nothing on this transport carries a signature for the client to check.
  assert.equal(stats.hmacFailures + stats.unsigned + stats.malformed, 0);
  assert.notEqual(realtime.status(), 'failed');
  await realtime.settled(); // no relay: resolves at once
});

test('an app id that is not a number judges nothing', async () => {
  // A client subscribed under a name that is not an app id delivers everything, as before.
  FakeGraphqlSocket.instances = [];
  const realtime = new RealtimeClient(
    { wsUrl: 'wss://ck-api.example.test/graphql', webSocketImpl: FakeGraphqlSocket },
    { getToken: () => TOKEN, onChange: () => () => {} },
  );
  const seen = [];
  const off = realtime.subscribe({ any: (n) => seen.push(n.__typename) }, 'not-a-number');
  let subscribe;
  for (let i = 0; i < 50 && !subscribe; i += 1) {
    await settle();
    subscribe = FakeGraphqlSocket.instances.at(-1)?.sent.find((m) => m.type === 'subscribe');
  }
  FakeGraphqlSocket.instances.at(-1).reply({
    id: subscribe.id,
    type: 'next',
    payload: { data: { udpNotifications: fixture('actorNotification').expected[0] } },
  });
  assert.deepEqual(seen, ['ActorUpdateNotification']);
  assert.equal(realtime.receiveStats().wrongApp, 0);
  off();
  realtime.close();
});

test('the World Stores bus hands `genericError` its `verified`', () => {
  let handlers;
  const client = { udp: { subscribe: (h) => ((handlers = h), () => {}) } };
  const session = new WorldSessionCore(client, APP, { every: () => () => {}, dispose: () => {} });
  const heard = [];
  session.on('genericError', (n, verified) => heard.push([n.errorCode, verified]));
  handlers.genericError({ __typename: 'GenericErrorResponse', sequenceNumber: 1, errorCode: 'UNAUTHORIZED' }, true);
  handlers.genericError({ __typename: 'GenericErrorResponse', sequenceNumber: 2, errorCode: 'UNAUTHORIZED' }, false);
  assert.deepEqual(heard, [
    ['UNAUTHORIZED', true],
    ['UNAUTHORIZED', false],
  ]);
  session.dispose();
});
