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
