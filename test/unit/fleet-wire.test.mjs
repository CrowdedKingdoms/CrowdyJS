/**
 * The fleet session's wire codecs (realtime servers v0.50.0): FLEET_CARRY (49), FLEET_RELEASE
 * (50), a carried player's message, and FLEET_CARRY_RESULT (51), FLEET_RELEASED (52) and
 * FLEET_DELIVERY (53) in both of their forms.
 *
 * GOLDEN VECTORS, FOR EVERY SDK. Each expected byte string below is built in this file from
 * the written formats, with `node:crypto` and without the code under test, and then pinned as
 * hex. Another SDK reproduces them from these inputs:
 *
 *   fleet token    "fleet-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"  (64 octets)
 *   fleet id       9001   (the fleet session's gameTokenId)
 *   player token   "player-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO"  (64 octets)
 *   player id      4242   (the player's gameTokenId); a second player, 4243
 *   user id        77
 *   app id         7
 *   carry time     1795000000000  (epoch milliseconds)
 *   actor uuid     "0123456789abcdef0123456789abcdef"
 *   chunk          (1, -2, 3)
 *
 *   HMAC of a signed message = HMAC-SHA256(key = token, message = bytes before the HMAC || token)
 *   carry proof              = HMAC-SHA256(key = player token, "ck-fleet-carry" || fleet id ||
 *                              player id || carry time), each number 8 bytes little endian
 *
 * The 49, 50 and carried actor update vectors are the ones CrowdyCPP pins in its
 * tests/wire_test.cpp. The control frame vectors (22, 44, 45, 46) are the ones the public
 * wire-format page publishes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const wire = await import('../../dist/binary-wire.js');
const fleetWire = await import('../../dist/fleet-wire.js');
const sdk = await import('../../dist/index.js');

const FLEET_TOKEN = 'fleet-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';
const PLAYER_TOKEN = 'player-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO';
const FLEET_ID = 9001n;
const PLAYER_ID = 4242n;
const OTHER_PLAYER_ID = 4243n;
const USER_ID = 77n;
const APP_ID = 7n;
const CARRY_MS = 1795000000000n;
const UUID = '0123456789abcdef0123456789abcdef';
const CHUNK = { x: '1', y: '-2', z: '3' };

// ---- the formats, written out independently of the SDK ----

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fromHex = (h) => new Uint8Array(Buffer.from(h, 'hex'));
const latin1 = (s) => Buffer.from(s, 'latin1');
const i64 = (v) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
};
const u16 = (v) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};
/** HMAC-SHA256(key = token, message = data): the control frames' scheme and the proof's. */
const rawHmac = (token, data) => createHmac('sha256', latin1(token)).update(data).digest();
/** HMAC-SHA256(key = token, message = data || token): every signed message's scheme. */
const tokenHmac = (token, data) => rawHmac(token, Buffer.concat([data, latin1(token)]));

/** [type][appId][chunk x, y, z][distance][decay][containsAuth][32B uuid][payload] */
function spatialHead({ type, chunk = [0, 0, 0], distance = 0, decay = 0, auth, uuid = '', payload = Buffer.alloc(0) }) {
  const id = Buffer.alloc(32);
  id.write(uuid, 'latin1');
  return Buffer.concat([
    Buffer.from([type]),
    i64(APP_ID),
    i64(chunk[0]),
    i64(chunk[1]),
    i64(chunk[2]),
    Buffer.from([distance, decay, auth]),
    id,
    Buffer.from(payload),
  ]);
}
/** A client message: the head, the HMAC keyed with `signToken`, the tail's id, the sequence. */
function clientMessage(fields, { signToken, tailId, seq }) {
  const head = spatialHead({ ...fields, auth: 1 });
  return Buffer.concat([head, tokenHmac(signToken, head), i64(tailId), Buffer.from([seq])]);
}
/** A server notification with no HMAC of its own: the head, epoch ms, the sequence. */
function plainNotification(fields, { epochMs, seq }) {
  return Buffer.concat([spatialHead({ ...fields, auth: 0 }), i64(epochMs), Buffer.from([seq])]);
}
/** The same notification signed for one session: the HMAC sits before the 9-byte tail. */
function signedNotification(fields, { epochMs, seq, token = FLEET_TOKEN }) {
  const head = spatialHead({ ...fields, auth: 1 });
  return Buffer.concat([head, tokenHmac(token, head), i64(epochMs), Buffer.from([seq])]);
}
/** [18 | 36][8B channelId][32B sender uuid][2B length][payload][8B epoch ms][1B seq] */
function channelNotification({ type = 18, channelId, uuid, payload, epochMs, seq }) {
  return Buffer.concat([
    Buffer.from([type]),
    i64(channelId),
    latin1(uuid),
    u16(payload.length),
    Buffer.from(payload),
    i64(epochMs),
    Buffer.from([seq]),
  ]);
}
const carryResult = (player, user, status) =>
  Buffer.concat([Buffer.from([51]), i64(player), i64(user), Buffer.from([status])]);
const released = (player, reason) => Buffer.concat([Buffer.from([52]), i64(player), Buffer.from([reason])]);
const delivery = (players, notification) =>
  Buffer.concat([Buffer.from([53, players.length]), ...players.map(i64), notification]);
/** A frame followed by its own HMAC: the form sent to a session without BUNDLE_SIGNED. */
const withOwnHmac = (frame, token = FLEET_TOKEN) => Buffer.concat([frame, tokenHmac(token, frame)]);
/** [type]{[2B length][member]}… */
const bundle = (type, members) =>
  Buffer.concat([Buffer.from([type]), ...members.flatMap((m) => [u16(m.length), m])]);
/** MESSAGE_BUNDLE_SIGNED (30): the bundle, then one HMAC over all of it. */
function signedBundle(members, token = FLEET_TOKEN) {
  const body = bundle(30, members);
  return Buffer.concat([body, tokenHmac(token, body)]);
}

const fleet = await fleetWire.createFleetSignContext(FLEET_ID, FLEET_TOKEN);
const parse = (datagram, options) => fleetWire.parseFleetDatagram(fleet, new Uint8Array(datagram), options);
const clean = { hmacFailures: 0, malformed: 0, unsigned: 0, staleControl: 0 };

// ---- the pinned vectors ----

const GOLDEN = {
  carryProof: '5602abb9300581f6a20e247ea0b406f690646a3d27f9427e95c5f6363115b35a',
  // FLEET_CARRY (49), sequence 0. 157 bytes.
  carry:
    '3107000000000000000000000000000000000000000000000000000000000000000000010000000000000000' +
    '0000000000000000000000000000000000000000000000009210000000000000005e56eea10100005602abb9' +
    '300581f6a20e247ea0b406f690646a3d27f9427e95c5f6363115b35a9d69b5b07c19a2450e61725d9995c19c' +
    '940e41fa602fcce2535e780e5d2d81e3292300000000000000',
  // FLEET_RELEASE (50), sequence 2. 117 bytes.
  release:
    '3207000000000000000000000000000000000000000000000000000000000000000000010000000000000000' +
    '0000000000000000000000000000000000000000000000009210000000000000903cf330c14c7344619b97d3' +
    '736c97d042c2669c9c8c1ed8e4b1922c327f684d292300000000000002',
  // ACTOR_UPDATE_REQUEST (128) for the carried player, sequence 1: chunk (1,-2,3), distance 8,
  // decay 0, payload de ad be ef. The tail's id is the player's; the HMAC is the fleet token's.
  carriedActorUpdate:
    '8007000000000000000100000000000000feffffffffffffff03000000000000000800013031323334353637' +
    '383961626364656630313233343536373839616263646566deadbeefafca3c1e53f866c6384fb186e2396664' +
    'b62d7acd0fee6d9445b96e283d1c09f4921000000000000001',
  // FLEET_CARRY_RESULT (51): player 4242, user 77, status 0. With its own HMAC: 50 bytes.
  carryResultOwn:
    '3392100000000000004d00000000000000001c1bb3a5ad36f54e3798c7818a8a43fd87537625d7a7ebcfabe6' +
    'c18ff7c7f51e',
  // The same frame as the one member of a MESSAGE_BUNDLE_SIGNED (30). 53 bytes.
  carryResultBundled:
    '1e12003392100000000000004d0000000000000000fe40c2acecba588df1fd5746873fb02e0b62af0e47e64f' +
    'cf2270f8dc795204be',
  // FLEET_RELEASED (52): player 4242, reason 1. With its own HMAC: 42 bytes.
  releasedOwn: '34921000000000000001bbe798feb8e0fd590bbdc5bcedde2defcd4cdbb17f759615c134a068cf7c312b',
  // The same frame as the one member of a MESSAGE_BUNDLE_SIGNED (30). 45 bytes.
  releasedBundled: '1e0a00349210000000000000016d8e653528b3c9929bfe3308bc93f3383c816a821b22c7808c092ebfd0426d38',
  // FLEET_DELIVERY (53) to players 4242 and 4243 of a CLIENT_TEXT_NOTIFICATION_2 (137):
  // chunk (1,-2,3), distance 8, decay 0, containsAuth 0, the uuid above, text "hello",
  // epoch ms 1795000000123, sequence 5. With its own HMAC: 132 bytes.
  deliveryOwn:
    '3502921000000000000093100000000000008907000000000000000100000000000000feffffffffffffff03' +
    '0000000000000008000030313233343536373839616263646566303132333435363738396162636465666865' +
    '6c6c6f7b5e56eea1010000053bb4c5f6e90577f34c177e2a456c4658bed3d13ed2b009ef926a594ed20fb252',
  // The same frame as the one member of a MESSAGE_BUNDLE_SIGNED (30). 135 bytes.
  deliveryBundled:
    '1e64003502921000000000000093100000000000008907000000000000000100000000000000feffffffffff' +
    'ffff030000000000000008000030313233343536373839616263646566303132333435363738396162636465' +
    '6668656c6c6f7b5e56eea101000005c4db2b5669cb7861edf0bdd2284d9536ebee57123797053625c4fd9fab' +
    'ddc7e2',
};

const TEXT = plainNotification(
  { type: 137, chunk: [1, -2, 3], distance: 8, decay: 0, uuid: UUID, payload: Buffer.from('hello') },
  { epochMs: 1795000000123n, seq: 5 },
);
const TEXT_OBJECT = {
  __typename: 'ClientTextNotification',
  appId: '7',
  chunkX: '1',
  chunkY: '-2',
  chunkZ: '3',
  distance: 8,
  decayRate: 0,
  uuid: UUID,
  sequenceNumber: 5,
  epochMillis: '1795000000123',
  text: 'hello',
};

test('the message numbers, capability bits and sizes are the contract\u2019s', () => {
  const T = wire.WireMessageType;
  assert.deepEqual(
    [T.FLEET_CARRY, T.FLEET_RELEASE, T.FLEET_CARRY_RESULT, T.FLEET_RELEASED, T.FLEET_DELIVERY],
    [49, 50, 51, 52, 53],
  );
  assert.deepEqual([T.CLIENT_ACTOR_HEARTBEAT, T.CLIENT_CAPABILITIES], [26, 29]);
  assert.deepEqual(
    [T.COMMAND_RECONNECT, T.COMMAND_SESSION_RELEASED, T.COMMAND_RECONNECT_BOUND, T.COMMAND_SESSION_RELEASED_BOUND, T.CONTROL_BOUND_ACK],
    [22, 28, 44, 45, 46],
  );
  assert.equal(wire.ClientCapability.BUNDLE_SIGNED, 1);
  assert.equal(wire.ClientCapability.BOUND_CONTROL, 2);
  assert.equal(wire.ClientCapability.OWN_MEDIA_ECHO, 4);
  assert.equal(wire.ClientCapability.FLEET_OWN_STATE, 8);
  // What the relay advertises for a player did not change.
  assert.equal(wire.SDK_CAPABILITIES, 1);
  assert.equal(fleetWire.FLEET_MAX_DATAGRAM_BYTES, 1242);
  assert.equal(fleetWire.FLEET_MAX_DELIVERY_PLAYERS, 32);
  assert.equal(fleetWire.FLEET_CARRY_PROOF_LABEL, 'ck-fleet-carry');
  assert.equal(fleetWire.FLEET_CARRY_PROOF_LABEL.length, 14);
  assert.equal(fleetWire.FLEET_CARRY_CLOCK_TOLERANCE_MS, 30_000);
  assert.equal(fleetWire.FLEET_CARRY_PAYLOAD_BYTES, 48);
  assert.equal(fleetWire.FLEET_CARRY_RESULT_BYTES, 18);
  assert.equal(fleetWire.FLEET_RELEASED_BYTES, 10);
  assert.deepEqual(fleetWire.FleetCarryStatus, {
    CARRIED: 0,
    NO_LIVE_TOKEN: 1,
    OTHER_ORGANIZATION: 2,
    PROOF_FAILED: 3,
    SESSION_FULL: 4,
  });
  assert.deepEqual(fleetWire.FleetReleaseReason, { CARRIED_ELSEWHERE: 1, SIGN_IN_ENDED: 2, IDLE: 5 });
  // The codecs are in the root entry, which a browser bundle may import: they hold no I/O.
  for (const name of ['serializeFleetCarry', 'serializeFleetRelease', 'carriedPlayerContext', 'parseFleetDatagram', 'fleetCarryProof']) {
    assert.equal(sdk[name], fleetWire[name], name);
  }
});

test('the carry proof is keyed with the player\u2019s token over the label, both ids and the time', async () => {
  const expected = rawHmac(
    PLAYER_TOKEN,
    Buffer.concat([Buffer.from('ck-fleet-carry', 'ascii'), i64(FLEET_ID), i64(PLAYER_ID), i64(CARRY_MS)]),
  );
  assert.equal(hex(expected), GOLDEN.carryProof);
  const input = { playerToken: PLAYER_TOKEN, fleetGameTokenId: FLEET_ID, playerGameTokenId: PLAYER_ID, epochMillis: CARRY_MS };
  assert.equal(hex(await fleetWire.fleetCarryProof(input)), GOLDEN.carryProof);
  // Ids as the Application API answers them (decimal strings) give the same proof.
  assert.equal(
    hex(await fleetWire.fleetCarryProof({ ...input, fleetGameTokenId: '9001', playerGameTokenId: '4242', epochMillis: 1795000000000 })),
    GOLDEN.carryProof,
  );
  // Another key, session, player or time is another proof.
  for (const change of [
    { playerToken: FLEET_TOKEN },
    { fleetGameTokenId: FLEET_ID + 1n },
    { playerGameTokenId: PLAYER_ID + 1n },
    { epochMillis: CARRY_MS + 1n },
  ]) {
    assert.notEqual(hex(await fleetWire.fleetCarryProof({ ...input, ...change })), GOLDEN.carryProof);
  }
  await assert.rejects(fleetWire.fleetCarryProof({ ...input, playerToken: 'short' }), RangeError);
});

test('FLEET_CARRY (49) is the capabilities\u2019 frame under the fleet id, with the proof', async () => {
  const proof = rawHmac(
    PLAYER_TOKEN,
    Buffer.concat([Buffer.from('ck-fleet-carry', 'ascii'), i64(FLEET_ID), i64(PLAYER_ID), i64(CARRY_MS)]),
  );
  const expected = clientMessage(
    { type: 49, payload: Buffer.concat([i64(PLAYER_ID), i64(CARRY_MS), proof]) },
    { signToken: FLEET_TOKEN, tailId: FLEET_ID, seq: 0 },
  );
  assert.equal(expected.length, 157);
  assert.equal(hex(expected), GOLDEN.carry);
  const built = await fleetWire.serializeFleetCarry(fleet, {
    appId: '7',
    playerGameTokenId: '4242',
    playerToken: PLAYER_TOKEN,
    epochMillis: CARRY_MS,
    sequenceNumber: 0,
  });
  assert.equal(hex(built), GOLDEN.carry);
  // A carry sent again has a new time and therefore a new proof.
  const again = await fleetWire.serializeFleetCarry(fleet, {
    appId: '7',
    playerGameTokenId: '4242',
    playerToken: PLAYER_TOKEN,
    epochMillis: CARRY_MS + 250n,
    sequenceNumber: 0,
  });
  assert.notEqual(hex(again.subarray(84, 116)), GOLDEN.carryProof);
  await assert.rejects(
    fleetWire.serializeFleetCarry(fleet, { appId: '7', playerGameTokenId: '4242', playerToken: 'x'.repeat(63), epochMillis: 1 }),
    RangeError,
  );
});

test('FLEET_RELEASE (50) names the player under the fleet id', async () => {
  const expected = clientMessage({ type: 50, payload: i64(PLAYER_ID) }, { signToken: FLEET_TOKEN, tailId: FLEET_ID, seq: 2 });
  assert.equal(expected.length, 117);
  assert.equal(hex(expected), GOLDEN.release);
  const built = await fleetWire.serializeFleetRelease(fleet, { appId: 7, playerGameTokenId: PLAYER_ID, sequenceNumber: 2 });
  assert.equal(hex(built), GOLDEN.release);
  await assert.rejects(fleetWire.serializeFleetRelease(fleet, { appId: 7, playerGameTokenId: 'nobody' }), RangeError);
});

test('a carried player\u2019s message: the player\u2019s id in the tail, the HMAC keyed with the fleet token', async () => {
  const carried = fleetWire.carriedPlayerContext(fleet, PLAYER_ID);
  const state = Buffer.from('deadbeef', 'hex');
  const fields = { type: 128, chunk: [1, -2, 3], distance: 8, decay: 0, uuid: UUID, payload: state };
  const expected = clientMessage(fields, { signToken: FLEET_TOKEN, tailId: PLAYER_ID, seq: 1 });
  assert.equal(expected.length, 113);
  assert.equal(hex(expected), GOLDEN.carriedActorUpdate);

  const input = { appId: '7', chunk: CHUNK, uuid: UUID, distance: 8, decayRate: 0, state: state.toString('base64'), sequenceNumber: 1 };
  const built = await wire.serializeActorUpdate(carried, input);
  assert.equal(hex(built), GOLDEN.carriedActorUpdate);

  // The player's own session's message differs in the 32 HMAC bytes and nowhere else.
  const own = await wire.serializeActorUpdate(await wire.createSignContext(PLAYER_ID, PLAYER_TOKEN), input);
  assert.equal(hex(own), hex(clientMessage(fields, { signToken: PLAYER_TOKEN, tailId: PLAYER_ID, seq: 1 })));
  const hmacAt = built.length - 41;
  assert.equal(hex(built.subarray(0, hmacAt)), hex(own.subarray(0, hmacAt)));
  assert.notEqual(hex(built.subarray(hmacAt, hmacAt + 32)), hex(own.subarray(hmacAt, hmacAt + 32)));
  assert.equal(hex(built.subarray(hmacAt + 32)), hex(own.subarray(hmacAt + 32)));
});

test('every existing builder signs for a carried player the same way', async () => {
  const carried = fleetWire.carriedPlayerContext(fleet, '4242');
  const base = { appId: '7', chunk: CHUNK, uuid: UUID, sequenceNumber: 9 };
  const b64 = Buffer.from([1, 2, 3]).toString('base64');
  const built = {
    128: await wire.serializeActorUpdate(carried, { ...base, state: b64 }),
    131: await wire.serializeVoxelUpdate(carried, { ...base, voxel: { x: 1, y: 2, z: 3 }, voxelType: 4, voxelState: b64 }),
    138: await wire.serializeClientEvent(carried, { ...base, eventType: 12, state: b64 }),
    136: await wire.serializeTextPacket(carried, { ...base, text: 'hi' }),
    134: await wire.serializeAudioPacket(carried, { ...base, audioData: b64 }),
    143: await wire.serializeVideoPacket(carried, { ...base, videoData: b64 }),
    140: await wire.serializeGenericSpatial(carried, { ...base, payload: b64 }),
    142: await wire.serializeSingleActorMessage(carried, { appId: '7', chunk: CHUNK, targetUuid: UUID, payload: b64, sequenceNumber: 9 }),
    47: await wire.serializeClientMediaSpeakers(carried, '7', { mode: wire.SpeakerListMode.ONLY, names: [UUID] }, undefined, 9),
    26: await wire.serializeActorHeartbeat(carried, base),
    17: await wire.serializeChannelMessage(carried, { channelId: '55', uuid: UUID, payload: b64, sequenceNumber: 9 }),
    35: await wire.serializeChannelAudio(carried, { channelId: '55', uuid: UUID, payload: b64, sequenceNumber: 9 }),
    32: await wire.serializeRangedChannelMessage(carried, { channelId: '55', uuid: UUID, payload: b64, appId: '7', chunk: CHUNK, maxDistance: 4, sequenceNumber: 9 }),
  };
  for (const [type, bytes] of Object.entries(built)) {
    const message = Buffer.from(bytes);
    assert.equal(message[0], Number(type), `type ${type}`);
    // [… signed bytes …][32B HMAC][8B game token id][1B sequence]
    const hmacAt = message.length - 41;
    assert.equal(message.readBigInt64LE(message.length - 9), PLAYER_ID, `type ${type}: the tail names the player`);
    assert.equal(message[message.length - 1], 9);
    assert.equal(
      hex(message.subarray(hmacAt, hmacAt + 32)),
      hex(tokenHmac(FLEET_TOKEN, message.subarray(0, hmacAt))),
      `type ${type}: keyed with the fleet token`,
    );
    assert.notEqual(
      hex(message.subarray(hmacAt, hmacAt + 32)),
      hex(tokenHmac(PLAYER_TOKEN, message.subarray(0, hmacAt))),
      `type ${type}: not keyed with the player's token`,
    );
  }
  assert.throws(() => fleetWire.carriedPlayerContext(fleet, 'p-1'), RangeError);
});

test('the session\u2019s own keepalive is a heartbeat (26) with no actor, under the fleet id', async () => {
  const expected = clientMessage({ type: 26 }, { signToken: FLEET_TOKEN, tailId: FLEET_ID, seq: 3 });
  assert.equal(expected.length, 109);
  assert.equal(hex(await wire.serializeActorHeartbeat(fleet, { appId: '7', sequenceNumber: 3 })), hex(expected));
  // An actor's heartbeat names its chunk and uuid.
  const actor = clientMessage({ type: 26, chunk: [1, -2, 3], uuid: UUID }, { signToken: FLEET_TOKEN, tailId: PLAYER_ID, seq: 4 });
  const carried = fleetWire.carriedPlayerContext(fleet, PLAYER_ID);
  assert.equal(hex(await wire.serializeActorHeartbeat(carried, { appId: '7', chunk: CHUNK, uuid: UUID, sequenceNumber: 4 })), hex(actor));
});

test('capabilities carry the control nonce after the flags when BOUND_CONTROL is set', async () => {
  const nonce = fromHex('0102030405060708');
  const flags = 1 | 2 | 8;
  const payload = Buffer.concat([Buffer.from([flags, 0, 0, 0]), Buffer.from(nonce)]);
  const expected = clientMessage({ type: 29, payload }, { signToken: FLEET_TOKEN, tailId: FLEET_ID, seq: 0 });
  assert.equal(hex(await wire.serializeClientCapabilities(fleet, '7', flags, 0, nonce)), hex(expected));
  await assert.rejects(wire.serializeClientCapabilities(fleet, '7', flags, 0), RangeError);
  await assert.rejects(wire.serializeClientCapabilities(fleet, '7', flags, 0, new Uint8Array(7)), RangeError);
  // Without the bit no nonce is sent, as before.
  const plain = await wire.serializeClientCapabilities(fleet, '7', 1, 0, nonce);
  assert.equal(plain.length, 68 + 4 + 41);
});

test('FLEET_CARRY_RESULT (51) verifies with its own HMAC and as a member of a signed bundle', async () => {
  const frame = carryResult(PLAYER_ID, USER_ID, 0);
  assert.equal(frame.length, 18);
  const own = withOwnHmac(frame);
  assert.equal(own.length, 50);
  assert.equal(hex(own), GOLDEN.carryResultOwn);
  const bundled = signedBundle([frame]);
  assert.equal(hex(bundled), GOLDEN.carryResultBundled);
  const message = { kind: 'carryResult', playerGameTokenId: '4242', userId: '77', status: 0 };
  assert.deepEqual(await parse(own), { messages: [message], ...clean });
  assert.deepEqual(await parse(bundled), { messages: [message], ...clean });
  assert.deepEqual(await parse(fromHex(GOLDEN.carryResultOwn)), { messages: [message], ...clean });
  assert.deepEqual(await parse(fromHex(GOLDEN.carryResultBundled)), { messages: [message], ...clean });
  // Every refusal reads, and its user id is 0.
  for (const status of [1, 2, 3, 4]) {
    const refused = await parse(withOwnHmac(carryResult(PLAYER_ID, 0, status)));
    assert.deepEqual(refused.messages, [{ kind: 'carryResult', playerGameTokenId: '4242', userId: '0', status }]);
  }
  assert.deepEqual(fleetWire.parseFleetCarryResult(new Uint8Array(frame)), { playerGameTokenId: '4242', userId: '77', status: 0 });
  assert.equal(fleetWire.parseFleetCarryResult(new Uint8Array(frame.subarray(0, 17))), null);
  assert.equal(fleetWire.parseFleetCarryResult(new Uint8Array(released(PLAYER_ID, 1))), null);
});

test('FLEET_RELEASED (52) verifies in both forms', async () => {
  const frame = released(PLAYER_ID, 1);
  assert.equal(frame.length, 10);
  const own = withOwnHmac(frame);
  assert.equal(own.length, 42);
  assert.equal(hex(own), GOLDEN.releasedOwn);
  const bundled = signedBundle([frame]);
  assert.equal(hex(bundled), GOLDEN.releasedBundled);
  const message = { kind: 'released', playerGameTokenId: '4242', reason: 1 };
  assert.deepEqual(await parse(own), { messages: [message], ...clean });
  assert.deepEqual(await parse(bundled), { messages: [message], ...clean });
  for (const reason of [2, 5]) {
    assert.deepEqual((await parse(withOwnHmac(released(PLAYER_ID, reason)))).messages, [
      { kind: 'released', playerGameTokenId: '4242', reason },
    ]);
  }
  assert.equal(fleetWire.parseFleetReleased(new Uint8Array(frame.subarray(0, 9))), null);
});

test('FLEET_DELIVERY (53) verifies in both forms and unwraps the notification the existing parsers produce', async () => {
  const frame = delivery([PLAYER_ID, OTHER_PLAYER_ID], TEXT);
  assert.equal(TEXT.length, 82);
  assert.equal(frame.length, 2 + 16 + 82);
  const own = withOwnHmac(frame);
  assert.equal(own.length, 132);
  assert.equal(hex(own), GOLDEN.deliveryOwn);
  const bundled = signedBundle([frame]);
  assert.equal(hex(bundled), GOLDEN.deliveryBundled);

  const message = { kind: 'delivery', players: ['4242', '4243'], notification: TEXT_OBJECT };
  assert.deepEqual(await parse(own), { messages: [message], ...clean });
  assert.deepEqual(await parse(bundled), { messages: [message], ...clean });
  // The same object a player's own session gets from the relay parser for the same bytes.
  assert.deepEqual(message.notification, wire.parseRelayFrame(new Uint8Array(TEXT))[0]);

  // A channel message inside: byte for byte what any session receives.
  const channel = channelNotification({ channelId: 55, uuid: UUID, payload: [1, 2, 3], epochMs: 1795000000456n, seq: 6 });
  const channelFrame = delivery([PLAYER_ID], channel);
  const expected = wire.parseRelayFrame(new Uint8Array(channel))[0];
  assert.equal(expected.__typename, 'ChannelMessageNotification');
  for (const datagram of [withOwnHmac(channelFrame), signedBundle([channelFrame])]) {
    assert.deepEqual(await parse(datagram), {
      messages: [{ kind: 'delivery', players: ['4242'], notification: expected }],
      ...clean,
    });
  }
  // Channel audio (36), spatial voice (135), video (144), a direct message (142), a client's
  // event (138) and an app-defined spatial message (140) unwrap the same way.
  const audio = channelNotification({ type: 36, channelId: 55, uuid: UUID, payload: [9], epochMs: 1n, seq: 1 });
  const inner = [
    audio,
    ...[135, 144, 142, 140].map((type) =>
      plainNotification({ type, chunk: [1, -2, 3], distance: 1, uuid: UUID, payload: Buffer.from([7, 7]) }, { epochMs: 2n, seq: 2 }),
    ),
    plainNotification({ type: 138, chunk: [1, -2, 3], distance: 8, uuid: UUID, payload: Buffer.from([12, 0, 5]) }, { epochMs: 3n, seq: 3 }),
  ];
  for (const notification of inner) {
    const got = await parse(withOwnHmac(delivery([PLAYER_ID], notification)));
    assert.deepEqual(got, {
      messages: [{ kind: 'delivery', players: ['4242'], notification: wire.parseRelayFrame(new Uint8Array(notification))[0] }],
      ...clean,
    });
  }
});

test('a FLEET_DELIVERY lists 1 to 32 players and holds exactly one notification', async () => {
  const players = Array.from({ length: 32 }, (_, i) => 5000n + BigInt(i));
  const full = await parse(signedBundle([delivery(players, TEXT)]));
  assert.deepEqual(full.messages[0].players, players.map(String));
  const bad = [
    Buffer.concat([Buffer.from([53, 0]), TEXT]), // nobody listed
    Buffer.concat([Buffer.from([53, 33]), ...Array.from({ length: 33 }, (_, i) => i64(i)), TEXT]), // over 32
    Buffer.concat([Buffer.from([53, 2]), i64(1), i64(2)]), // no notification after the list
    Buffer.concat([Buffer.from([53, 3]), i64(1), TEXT.subarray(0, 4)]), // shorter than its count
    delivery([PLAYER_ID], Buffer.from([3, 1, 7])), // an error frame is not a notification
    delivery([PLAYER_ID], carryResult(PLAYER_ID, USER_ID, 0)), // nor is a control frame
    delivery([PLAYER_ID], TEXT.subarray(0, 40)), // a notification cut short
  ];
  for (const frame of bad) {
    assert.equal(fleetWire.parseFleetDelivery(new Uint8Array(frame)), null);
    assert.deepEqual(await parse(withOwnHmac(frame)), { messages: [], ...clean, malformed: 1 });
  }
});

test('a 1,242-byte FLEET_DELIVERY is read; one byte more is not', async () => {
  // One player, a notification of 1,200 bytes (68 header, 1,123 payload, 9 tail), its own HMAC.
  const video = plainNotification(
    { type: 144, chunk: [1, -2, 3], distance: 1, uuid: UUID, payload: Buffer.alloc(1123, 0xab) },
    { epochMs: 1795000000789n, seq: 7 },
  );
  assert.equal(video.length, 1200);
  const frame = delivery([PLAYER_ID], video);
  // Above 1,197 bytes it cannot be a member of a signed bundle, so it is sent alone this way
  // to every session, whatever it advertised.
  assert.ok(frame.length > 1197);
  const datagram = withOwnHmac(frame);
  assert.equal(datagram.length, 1242);
  assert.equal(datagram.length, fleetWire.FLEET_MAX_DATAGRAM_BYTES);
  const got = await parse(datagram);
  assert.deepEqual({ ...got, messages: undefined }, { ...clean, messages: undefined });
  assert.equal(got.messages.length, 1);
  assert.deepEqual(got.messages[0].players, ['4242']);
  assert.equal(got.messages[0].notification.__typename, 'ClientVideoNotification');
  assert.equal(Buffer.from(got.messages[0].notification.videoData, 'base64').length, 1123);
  assert.equal(got.messages[0].notification.sequenceNumber, 7);

  const over = withOwnHmac(delivery([PLAYER_ID], Buffer.concat([video.subarray(0, 1191), Buffer.from([0]), video.subarray(1191)])));
  assert.equal(over.length, 1243);
  assert.deepEqual(await parse(over), { messages: [], ...clean, malformed: 1 });
});

test('a frame whose HMAC fails is dropped and counted, never returned', async () => {
  const frames = {
    51: carryResult(PLAYER_ID, USER_ID, 0),
    52: released(PLAYER_ID, 1),
    53: delivery([PLAYER_ID], TEXT),
  };
  for (const [type, frame] of Object.entries(frames)) {
    // Its own HMAC: a changed byte of the frame, a changed byte of the tag, another key.
    const flippedBody = Buffer.from(withOwnHmac(frame));
    flippedBody[1] ^= 0x01;
    const flippedTag = Buffer.from(withOwnHmac(frame));
    flippedTag[flippedTag.length - 1] ^= 0x80;
    for (const forged of [flippedBody, flippedTag, withOwnHmac(frame, PLAYER_TOKEN)]) {
      assert.deepEqual(await parse(forged), { messages: [], ...clean, hmacFailures: 1 }, `${type} alone`);
    }
    // The frame with no HMAC at all, outside a signed bundle: the last 32 bytes are not a tag.
    const bare = await parse(frame);
    assert.equal(bare.messages.length, 0, `${type} bare`);
    assert.equal(bare.hmacFailures + bare.malformed, 1, `${type} bare`);
    // A signed bundle: one HMAC over the datagram, so one failure drops every member.
    const forgedBundle = Buffer.from(signedBundle([frame, frame]));
    forgedBundle[5] ^= 0x01;
    assert.deepEqual(await parse(forgedBundle), { messages: [], ...clean, hmacFailures: 1 }, `${type} bundled`);
    assert.deepEqual(await parse(signedBundle([frame], PLAYER_TOKEN)), { messages: [], ...clean, hmacFailures: 1 });
  }
});

test('members of a MESSAGE_BUNDLE (2) each carry their own HMAC, and one forged member costs only itself', async () => {
  const a = withOwnHmac(carryResult(PLAYER_ID, USER_ID, 0));
  const b = withOwnHmac(released(OTHER_PLAYER_ID, 5));
  const c = withOwnHmac(delivery([PLAYER_ID], TEXT));
  // The length prefix counts the frame and its HMAC.
  const datagram = bundle(2, [a, b, c]);
  assert.equal(datagram.readUInt16LE(1), 50);
  assert.deepEqual(await parse(datagram), {
    messages: [
      { kind: 'carryResult', playerGameTokenId: '4242', userId: '77', status: 0 },
      { kind: 'released', playerGameTokenId: '4243', reason: 5 },
      { kind: 'delivery', players: ['4242'], notification: TEXT_OBJECT },
    ],
    ...clean,
  });
  const forged = Buffer.from(b);
  forged[9] = 1; // rewrite the reason
  assert.deepEqual(await parse(bundle(2, [a, forged, c])), {
    messages: [
      { kind: 'carryResult', playerGameTokenId: '4242', userId: '77', status: 0 },
      { kind: 'delivery', players: ['4242'], notification: TEXT_OBJECT },
    ],
    ...clean,
    hmacFailures: 1,
  });
  // A truncated bundle keeps what came before the cut.
  const cut = datagram.subarray(0, datagram.length - 10);
  const got = await parse(cut);
  assert.equal(got.messages.length, 2);
  assert.equal(got.malformed, 1);
});

test('plain state is taken signed: in a signed bundle, or with its own HMAC', async () => {
  const fields = { type: 130, chunk: [1, -2, 3], distance: 8, decay: 1, uuid: UUID, payload: Buffer.from([1, 2, 3]) };
  const tail = { epochMs: 1795000000999n, seq: 8 };
  const plain = plainNotification(fields, tail);
  const expected = wire.parseRelayFrame(new Uint8Array(plain))[0];
  assert.equal(expected.__typename, 'ActorUpdateNotification');

  // Inside a signed bundle, beside a 51: the bundle's HMAC covers both.
  assert.deepEqual(await parse(signedBundle([plain, carryResult(PLAYER_ID, USER_ID, 0)])), {
    messages: [
      { kind: 'notification', notification: expected, verified: true },
      { kind: 'carryResult', playerGameTokenId: '4242', userId: '77', status: 0 },
    ],
    ...clean,
  });
  // Alone, or in a MESSAGE_BUNDLE (2), with its own HMAC before the 9-byte tail.
  const signed = signedNotification(fields, tail);
  const signedObject = { kind: 'notification', notification: expected, verified: true };
  assert.deepEqual(await parse(signed), { messages: [signedObject], ...clean });
  assert.deepEqual(await parse(bundle(2, [signed, signed])), { messages: [signedObject, signedObject], ...clean });
  const forged = Buffer.from(signed);
  forged[70] ^= 0xff;
  assert.deepEqual(await parse(forged), { messages: [], ...clean, hmacFailures: 1 });
  assert.deepEqual(await parse(signedNotification(fields, { ...tail, token: PLAYER_TOKEN })), {
    messages: [],
    ...clean,
    hmacFailures: 1,
  });
  // With no HMAC and no signed bundle it did not come from the realtime servers: dropped,
  // unless the caller asks for it, and then it is marked.
  assert.deepEqual(await parse(plain), { messages: [], ...clean, unsigned: 1 });
  assert.deepEqual(await parse(bundle(2, [plain])), { messages: [], ...clean, unsigned: 1 });
  assert.deepEqual(await parse(plain, { acceptUnsigned: true }), {
    messages: [{ kind: 'notification', notification: expected, verified: false }],
    ...clean,
  });
  // An error frame has no room for an HMAC: it is delivered, marked by where it came from.
  const refusal = { __typename: 'GenericErrorResponse', sequenceNumber: 4, errorCode: 'UNAUTHORIZED' };
  assert.deepEqual(await parse(Buffer.from([3, 4, 7])), {
    messages: [{ kind: 'notification', notification: refusal, verified: false }],
    ...clean,
  });
  assert.deepEqual(await parse(signedBundle([Buffer.from([3, 4, 7])])), {
    messages: [{ kind: 'notification', notification: refusal, verified: true }],
    ...clean,
  });
});

test('control frames verify over their leading bytes, and a bound one only with this connection\u2019s nonce', async () => {
  // The vectors the public wire-format page publishes.
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const ctx = await fleetWire.createFleetSignContext(1, token);
  const nonce = fromHex('0102030405060708');
  const read = (h, options) => fleetWire.parseFleetDatagram(ctx, fromHex(h), options);
  const reconnect = '16c80d2cee8977578129f7295001cd1bea65dd11be3f518560529cb298ce5fc42b';
  const reconnectBound = '2c010203040506070801da5c2e0f16ec592bd41e81286527373b1ecabb591bcc7f6481dfdb6ed2a5c2';
  const releasedBound = '2d050102030405060708fae450e083640dfdf23fd6cd963aef35d6f50be32304624468258dc7d8c18edf';
  const ack = '2e0102030405060708a2587a4b9f7b7a617387df74f45b78ace492b99e376dedff75f88956dbf62f85';
  // Each is HMAC-SHA256(token, the leading bytes), with no token appended.
  assert.equal(reconnect, hex(Buffer.concat([Buffer.from([22]), rawHmac(token, Buffer.from([22]))])));
  assert.equal(reconnectBound.slice(18), hex(rawHmac(token, Buffer.concat([Buffer.from([44]), Buffer.from(nonce)]))));

  assert.deepEqual(await read(reconnect), { messages: [{ kind: 'reconnect', bound: false }], ...clean });
  assert.deepEqual(await read(reconnectBound, { controlNonce: nonce }), { messages: [{ kind: 'reconnect', bound: true }], ...clean });
  assert.deepEqual(await read(releasedBound, { controlNonce: nonce }), {
    messages: [{ kind: 'sessionReleased', reason: 5, bound: true }],
    ...clean,
  });
  assert.deepEqual(await read(ack, { controlNonce: nonce }), { messages: [{ kind: 'controlBoundAck' }], ...clean });
  // The legacy release: [28][reason][HMAC over the two leading bytes].
  const legacyRelease = Buffer.concat([Buffer.from([28, 4]), rawHmac(token, Buffer.from([28, 4]))]);
  assert.deepEqual(await fleetWire.parseFleetDatagram(ctx, new Uint8Array(legacyRelease)), {
    messages: [{ kind: 'sessionReleased', reason: 4, bound: false }],
    ...clean,
  });

  // Another connection's nonce, or none: a frame captured earlier and sent again.
  for (const h of [reconnectBound, releasedBound, ack]) {
    assert.deepEqual(await read(h, { controlNonce: fromHex('0807060504030201') }), { messages: [], ...clean, staleControl: 1 });
    assert.deepEqual(await read(h), { messages: [], ...clean, staleControl: 1 });
  }
  // A rewritten reason, a rewritten tag, another token.
  const rewritten = Buffer.from(releasedBound, 'hex');
  rewritten[1] = 3;
  assert.deepEqual(await fleetWire.parseFleetDatagram(ctx, new Uint8Array(rewritten), { controlNonce: nonce }), {
    messages: [],
    ...clean,
    hmacFailures: 1,
  });
  assert.deepEqual(await parse(fromHex(reconnect)), { messages: [], ...clean, hmacFailures: 1 });
  // The token appended to the message is the notifications' scheme and no control frame's.
  const appended = Buffer.concat([Buffer.from([22]), tokenHmac(token, Buffer.from([22]))]);
  assert.deepEqual(await fleetWire.parseFleetDatagram(ctx, new Uint8Array(appended)), { messages: [], ...clean, hmacFailures: 1 });
  // A wrong length is not a control frame.
  assert.deepEqual(await read(reconnect + '00'), { messages: [], ...clean, malformed: 1 });
  // A control frame is always its own datagram: inside a bundle it is not read.
  const inBundle = signedBundle([Buffer.from(reconnect, 'hex')], token);
  assert.deepEqual(await fleetWire.parseFleetDatagram(ctx, new Uint8Array(inBundle)), { messages: [], ...clean });
});

test('what a session never reads is skipped: its own kinds of message, unknown types, nothing at all', async () => {
  const own = await wire.serializeClientCapabilities(fleet, '7', 1, 0);
  assert.deepEqual(await parse(own), { messages: [], ...clean });
  assert.deepEqual(await parse(await fleetWire.serializeFleetRelease(fleet, { appId: 7, playerGameTokenId: 1 })), { messages: [], ...clean });
  assert.deepEqual(await parse(Buffer.from([99, 1, 2, 3])), { messages: [], ...clean });
  assert.deepEqual(await parse(Buffer.alloc(0)), { messages: [], ...clean, malformed: 1 });
  assert.deepEqual(await parse(Buffer.from([30])), { messages: [], ...clean, malformed: 1 });
  await assert.rejects(fleetWire.createFleetSignContext(9001, 'not-64-characters'), RangeError);
  await assert.rejects(fleetWire.createFleetSignContext('nine', FLEET_TOKEN), RangeError);
});
