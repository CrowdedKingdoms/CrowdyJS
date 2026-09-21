/**
 * Byte-exact tests for the binary relay codec (crowdy-relay-v1).
 *
 * Fixtures are generated from the game-api's UdpMessageParserService — the
 * on-wire source of truth — by cks-game-api/scripts/generate-binary-wire-fixtures.mjs.
 * Uplink: our client-side serializers must produce the exact bytes the
 * GraphQL proxy would have produced (including the token-keyed HMAC).
 * Downlink: parseRelayFrame must produce the exact notification objects the
 * GraphQL udpNotifications subscription delivers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/binary-wire-fixtures.json', import.meta.url)),
    'utf8',
  ),
);

const wire = await import('../../dist/binary-wire.js');

const ctx = await wire.createSignContext(
  BigInt(fixtures.gameTokenId),
  fixtures.gameToken,
);

const SERIALIZERS = {
  actorUpdate: wire.serializeActorUpdate,
  actorUpdateDefaults: wire.serializeActorUpdate,
  voxelUpdate: wire.serializeVoxelUpdate,
  audioPacket: wire.serializeAudioPacket,
  videoPacket: wire.serializeVideoPacket,
  textPacket: wire.serializeTextPacket,
  clientEvent: wire.serializeClientEvent,
  singleActorMessage: wire.serializeSingleActorMessage,
  channelMessage: wire.serializeChannelMessage,
};

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

for (const fixture of fixtures.uplink) {
  test(`uplink ${fixture.kind}: serializer matches server bytes`, async () => {
    const serialize = SERIALIZERS[fixture.kind];
    assert.ok(serialize, `no serializer for ${fixture.kind}`);
    const bytes = await serialize(ctx, fixture.input);
    assert.equal(toHex(bytes), fixture.bytesHex);
  });
}

for (const fixture of fixtures.downlink) {
  test(`downlink ${fixture.kind}: parseRelayFrame matches server parse`, () => {
    const bytes = Uint8Array.from(Buffer.from(fixture.bytesHex, 'hex'));
    const parsed = wire.parseRelayFrame(bytes);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), fixture.expected);
  });
}

test('parseRelayFrame skips unparseable bundle members and unknown types', () => {
  // bundle with one valid generic error and one garbage member
  const error = Buffer.from([3, 5, 7]);
  const garbage = Buffer.from([200, 1, 2]); // spatial bit set but too short
  const bundle = Buffer.concat([
    Buffer.from([2]),
    Buffer.from([error.length, 0]),
    error,
    Buffer.from([garbage.length, 0]),
    garbage,
  ]);
  const parsed = wire.parseRelayFrame(Uint8Array.from(bundle));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].__typename, 'GenericErrorResponse');
  assert.equal(parsed[0].errorCode, 'UNAUTHORIZED');
  assert.equal(parsed[0].sequenceNumber, 5);
});

test('serializers reject oversized datagrams', async () => {
  await assert.rejects(
    wire.serializeActorUpdate(ctx, {
      appId: '1',
      chunk: { x: '0', y: '0', z: '0' },
      uuid: 'u'.repeat(32),
      state: Buffer.alloc(1300).toString('base64'),
    }),
    /exceeds maximum size/,
  );
});

test('packMessageBundle: lone member unwrapped, many wrapped as type 2', async () => {
  assert.equal(wire.BUNDLE_HEADER_BYTES, 1);
  assert.equal(wire.BUNDLE_LENGTH_PREFIX_BYTES, 2);
  assert.equal(wire.RELAY_MAX_BUNDLE_MEMBERS, 32);
  assert.equal(wire.RELAY_MAX_BUNDLE_MEMBER_BYTES, 1229);

  const a = await wire.serializeActorUpdate(ctx, {
    appId: '1',
    chunk: { x: '0', y: '0', z: '0' },
    uuid: 'u'.repeat(32),
    state: Buffer.from('one').toString('base64'),
    sequenceNumber: 1,
  });
  const b = Uint8Array.from([3, 9, 7]);

  // One member: exactly the member, no wrapper.
  assert.equal(wire.packMessageBundle([a]), a);

  // Two members: [2][len a][a][len b][b], little-endian lengths.
  const packed = wire.packMessageBundle([a, b]);
  assert.equal(packed[0], 2);
  assert.equal(packed.length, 1 + 2 + a.length + 2 + b.length);
  assert.equal(wire.bundleSizeOf([a, b]), packed.length);
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  assert.equal(view.getUint16(1, true), a.length);
  assert.deepEqual(packed.subarray(3, 3 + a.length), a);
  assert.equal(view.getUint16(3 + a.length, true), b.length);
  assert.deepEqual(packed.subarray(5 + a.length), b);

  // The downlink parser walks the same framing: the error member parses, the
  // request member (an uplink opcode) is skipped, and nothing else is lost.
  const parsed = wire.parseRelayFrame(packed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].__typename, 'GenericErrorResponse');
  assert.equal(parsed[0].sequenceNumber, 9);

  // Limits.
  assert.throws(() => wire.packMessageBundle([]), /at least one/);
  assert.throws(() => wire.packMessageBundle([a, new Uint8Array(0)]), /cannot be empty/);
  const many = Array.from({ length: 33 }, () => b);
  assert.throws(() => wire.packMessageBundle(many), /at most 32/);
  assert.equal(wire.packMessageBundle(many.slice(0, 32)).length, 1 + 32 * (2 + 3));
  const big = new Uint8Array(wire.RELAY_MAX_BUNDLE_MEMBER_BYTES);
  big[0] = 128;
  assert.equal(wire.packMessageBundle([big]), big); // alone: fine, unwrapped
  assert.throws(() => wire.packMessageBundle([big, b]), /exceeds 1232/);
  // Exactly 1232 is legal: 1 + (2 + 1229 - 5) + (2 + 3) = 1232.
  const fill = new Uint8Array(wire.RELAY_MAX_BUNDLE_MEMBER_BYTES - 5);
  fill[0] = 128;
  assert.equal(wire.packMessageBundle([fill, b]).length, wire.RELAY_MAX_DATAGRAM_BYTES);
});

// ---------------------------------------------------------------------------
// Buddy v0.30.0: CLIENT_CAPABILITIES and MESSAGE_BUNDLE_SIGNED
// ---------------------------------------------------------------------------

test('serializeClientCapabilities: long-spatial layout, flags at offset 68, signed tail', async () => {
  const bytes = await wire.serializeClientCapabilities(ctx, '7', wire.ClientCapability.BUNDLE_SIGNED, 9);
  assert.equal(bytes[0], wire.WireMessageType.CLIENT_CAPABILITIES);
  assert.equal(bytes[0], 29);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getBigInt64(1, true), 7n); // appId
  assert.equal(bytes[33], 0); // distance
  assert.equal(bytes[34], 0); // decay
  assert.equal(bytes[35], 1); // containsAuth
  assert.equal(view.getUint32(68, true), 1); // flags word = BUNDLE_SIGNED
  // 68 header + 4 flags + 32 HMAC + 8 gameTokenId + 1 seq
  assert.equal(bytes.length, 68 + 4 + 32 + 8 + 1);
  assert.equal(bytes[bytes.length - 1], 9);
  // The HMAC is the same scheme as every client request: HMAC(token, prefix || token).
  const tokenBytes = ctx.tokenBytes;
  const prefix = bytes.subarray(0, 72);
  const signed = new Uint8Array(prefix.length + tokenBytes.length);
  signed.set(prefix, 0);
  signed.set(tokenBytes, prefix.length);
  const mac = new Uint8Array(await webcrypto.subtle.sign('HMAC', ctx.key, signed));
  assert.deepEqual(Array.from(bytes.subarray(72, 104)), Array.from(mac));
});

test('parseRelayFrame: MESSAGE_BUNDLE_SIGNED strips the trailing HMAC and walks unsigned members', () => {
  // Two GENERIC_ERROR_MESSAGE members (small, unsigned) plus 32 HMAC bytes.
  const a = Buffer.from([3, 5, 7]);
  const b = Buffer.from([3, 6, 7]);
  const body = Buffer.concat([
    Buffer.from([30]),
    Buffer.from([a.length, 0]), a,
    Buffer.from([b.length, 0]), b,
  ]);
  const mac = Buffer.alloc(32, 0xab);
  const parsed = wire.parseRelayFrame(Uint8Array.from(Buffer.concat([body, mac])));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].__typename, 'GenericErrorResponse');
  assert.equal(parsed[1].__typename, 'GenericErrorResponse');
  // The tail is never read as a member: a short signed bundle yields nothing.
  assert.deepEqual(wire.parseRelayFrame(Uint8Array.from([30, 1, 2, 3])), []);
  // And a plain MESSAGE_BUNDLE of the same members parses identically.
  const plain = Buffer.concat([Buffer.from([2]), body.subarray(1)]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(wire.parseRelayFrame(Uint8Array.from(plain)))),
    JSON.parse(JSON.stringify(parsed)),
  );
});

test('parseRelayFrame: a signed bundle member with containsAuth = 0 parses as a notification', async () => {
  // Build a signed actor update, then strip its per-member HMAC and clear
  // containsAuth: that is exactly what a MESSAGE_BUNDLE_SIGNED member looks like.
  const signedMsg = await wire.serializeActorUpdate(ctx, {
    appId: '7', chunk: { x: '1', y: '2', z: '3' }, uuid: 'u', distance: 8,
    sequenceNumber: 4, state: Buffer.alloc(88).toString('base64'),
  });
  const prefixLen = signedMsg.length - (32 + 8 + 1);
  const member = new Uint8Array(prefixLen + 9);
  member.set(signedMsg.subarray(0, prefixLen), 0);
  member.set(signedMsg.subarray(prefixLen + 32), prefixLen);
  member[0] = wire.WireMessageType.ACTOR_UPDATE_NOTIFICATION_2;
  member[35] = 0;
  const dg = Buffer.concat([
    Buffer.from([30]), Buffer.from([member.length & 0xff, member.length >> 8]), Buffer.from(member),
    Buffer.alloc(32, 0xcd),
  ]);
  const parsed = wire.parseRelayFrame(Uint8Array.from(dg));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].__typename, 'ActorUpdateNotification');
  assert.equal(parsed[0].sequenceNumber, 4);
});
