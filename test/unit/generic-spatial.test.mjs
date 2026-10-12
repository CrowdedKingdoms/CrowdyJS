/**
 * Opcode 140 (GENERIC_SPATIAL_1), an app-defined spatial payload, reaches the app on the binary
 * relay: parseRelayFrame reads it, RealtimeClient dispatches it to `genericSpatial` (and `any`),
 * and the World Stores bus carries it. The GraphQL `udpNotifications` union has no member for it,
 * so the GraphQL transport cannot deliver one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const wire = await import('../../dist/binary-wire.js');
const { RealtimeClient } = await import('../../dist/realtime.js');
const { RealtimeMetrics } = await import('../../dist/metrics.js');
const { WorldSessionCore } = await import('../../dist/stores/session.js');

// CrowdyCPP's golden GENERIC_SPATIAL_1 datagram (tests/wire_test.cpp, computed independently from
// the public wire-format and HMAC docs): appId 7, chunk (1,-2,3), distance 8, decay 1, uuid
// "0123456789abcdef0123456789abcdef", payload de:ad:be:ef, gameTokenId 123456789, seq 42.
const GOLDEN = Uint8Array.from(
  Buffer.from(
    '8c07000000000000000100000000000000feffffffffffffff03000000000000000801013031323334353637' +
      '383961626364656630313233343536373839616263646566deadbeef43ecd468d2593f17f3fb06368a2b6f47' +
      '32fc2da165acf4ca2bfe16396c43362a15cd5b07000000002a',
    'hex',
  ),
);

/** A server->client 140 with no per-member HMAC (a MESSAGE_BUNDLE_SIGNED member). */
function unsignedGenericSpatial(payload, seq = 3) {
  const out = new Uint8Array(68 + payload.length + 9);
  const view = new DataView(out.buffer);
  out[0] = wire.WireMessageType.GENERIC_SPATIAL_1;
  view.setBigInt64(1, 42n, true);
  view.setBigInt64(9, -4n, true);
  view.setBigInt64(17, 0n, true);
  view.setBigInt64(25, 9n, true);
  out[33] = 2;
  out[34] = 0;
  out[35] = 0;
  out.set(new TextEncoder().encode('h'.repeat(32)), 36);
  out.set(payload, 68);
  view.setBigInt64(68 + payload.length, 1700000000123n, true);
  out[68 + payload.length + 8] = seq;
  return out;
}

test('GENERIC_SPATIAL_1 is opcode 140', () => {
  assert.equal(wire.WireMessageType.GENERIC_SPATIAL_1, 140);
  assert.equal(GOLDEN[0], 140);
});

test('parseRelayFrame reads a 140 as a GenericSpatialNotification', () => {
  assert.deepEqual(wire.parseRelayFrame(GOLDEN), [
    {
      __typename: 'GenericSpatialNotification',
      appId: '7',
      chunkX: '1',
      chunkY: '-2',
      chunkZ: '3',
      distance: 8,
      decayRate: 1,
      uuid: '0123456789abcdef0123456789abcdef',
      sequenceNumber: 42,
      epochMillis: '123456789',
      payload: Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64'),
    },
  ]);
  const member = unsignedGenericSpatial(Uint8Array.from([1, 2, 3]));
  const signedBundle = Buffer.concat([
    Buffer.from([wire.WireMessageType.MESSAGE_BUNDLE_SIGNED]),
    Buffer.from([member.length & 0xff, member.length >> 8]),
    Buffer.from(member),
    Buffer.alloc(32, 0xee),
  ]);
  const [parsed] = wire.parseRelayFrame(Uint8Array.from(signedBundle));
  assert.equal(parsed.__typename, 'GenericSpatialNotification');
  assert.equal(parsed.chunkX, '-4');
  assert.equal(parsed.payload, 'AQID');
  assert.equal(parsed.epochMillis, '1700000000123');
  assert.equal(parsed.sequenceNumber, 3);
});

test('the GraphQL union has no member for opcode 140, so only the relay delivers it', () => {
  const schema = readFileSync(new URL('../../schema.gql', import.meta.url), 'utf8');
  const union = schema.match(/^union UdpNotification = (.*)$/m)?.[1] ?? '';
  assert.ok(union.includes('ClientAudioNotification'), 'the union was found');
  assert.ok(!/Generic(Spatial)?Notification/.test(union));
});

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

test('RealtimeClient hands a relayed 140 to genericSpatial and any', async () => {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  try {
    const metrics = new RealtimeMetrics();
    const realtime = new RealtimeClient(
      {
        wsUrl: 'wss://ck-api.example.test/graphql',
        binaryTransport: true,
        advertiseCapabilities: false,
      },
      { getToken: () => 'a'.repeat(64), onChange: () => () => {} },
      metrics,
    );
    const seen = { generic: [], any: [] };
    const off = realtime.subscribe(
      {
        genericSpatial: (n) => seen.generic.push(n),
        any: (n) => seen.any.push(n.__typename),
      },
      '42',
    );
    await settle();
    const ws = FakeWebSocket.instances.at(-1);
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
    ws.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId: '5' }) });
    await settle();
    const frame = unsignedGenericSpatial(Uint8Array.from([9, 8]));
    ws.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
    assert.equal(seen.generic.length, 1);
    assert.equal(seen.generic[0].payload, 'CQg=');
    assert.equal(seen.generic[0].uuid, 'h'.repeat(32));
    assert.deepEqual(seen.any, ['GenericSpatialNotification']);
    assert.equal(metrics.snapshot().perKind.genericSpatial.received.messages, 1);
    off();
  } finally {
    globalThis.WebSocket = previous;
  }
});

test('the World Stores bus carries genericSpatial', () => {
  let handlers;
  const client = {
    udp: {
      subscribe: (h) => {
        handlers = h;
        return () => {};
      },
    },
  };
  const session = new WorldSessionCore(client, '42', {
    every: () => () => {},
    dispose: () => {},
  });
  const heard = [];
  session.on('genericSpatial', (n) => heard.push(n.payload));
  assert.equal(typeof handlers.genericSpatial, 'function');
  handlers.genericSpatial({ __typename: 'GenericSpatialNotification', payload: 'AA==' });
  assert.deepEqual(heard, ['AA==']);
  session.dispose();
});
