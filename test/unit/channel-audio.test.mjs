/**
 * Channel audio (Buddy v0.37.0): opcode 35 is opcode 17's layout and signing with its own type
 * byte, opcode 36 is opcode 18's layout. The relay parses 36 (standalone or in a bundle) into a
 * ChannelAudioNotification, RealtimeClient hands it to `channelAudio`, the World Stores bus
 * carries it, and `udp.sendChannelAudio` falls back to the `sendChannelAudio` mutation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const wire = await import('../../dist/binary-wire.js');
const { RealtimeClient } = await import('../../dist/realtime.js');
const { RealtimeMetrics } = await import('../../dist/metrics.js');
const { WorldSessionCore } = await import('../../dist/stores/session.js');
const { UdpAPI } = await import('../../dist/domains/udp.js');
const voice = await import('../../dist/media/voice-frames.js');

const TOKEN = 'T'.repeat(64);
const UUID = 'v'.repeat(32);

test('opcodes 35 and 36 and UDP error 33', () => {
  assert.equal(wire.WireMessageType.CHANNEL_AUDIO_REQUEST, 35);
  assert.equal(wire.WireMessageType.CHANNEL_AUDIO_NOTIFICATION, 36);
  assert.deepEqual(wire.parseRelayFrame(Uint8Array.from([3, 9, 33])), [
    { __typename: 'GenericErrorResponse', sequenceNumber: 9, errorCode: 'APP_PAUSED' },
  ]);
});

test('serializeChannelAudio is opcode 17 with type byte 35, signed over its own bytes', async () => {
  const ctx = await wire.createSignContext(777n, TOKEN);
  const input = {
    channelId: '4242',
    uuid: UUID,
    payload: Buffer.from([1, 2, 3, 4, 5]).toString('base64'),
    sequenceNumber: 200,
  };
  const audio = Buffer.from(await wire.serializeChannelAudio(ctx, input));
  const message = Buffer.from(await wire.serializeChannelMessage(ctx, input));
  assert.equal(audio.length, message.length);
  assert.equal(audio[0], 35);
  assert.equal(message[0], 17);

  // [type][8B channelId][32B uuid][2B len][payload][containsAuth] | HMAC | gameTokenId | seq
  const prefixLen = 1 + 8 + 32 + 2 + 5 + 1;
  assert.deepEqual(audio.subarray(1, prefixLen), message.subarray(1, prefixLen));
  assert.equal(audio.readBigUInt64LE(1), 4242n);
  assert.equal(audio.subarray(9, 41).toString(), UUID);
  assert.equal(audio.readUInt16LE(41), 5);
  assert.equal(audio[prefixLen - 1], 1);
  const expectedMac = createHmac('sha256', Buffer.from(TOKEN, 'latin1'))
    .update(Buffer.concat([audio.subarray(0, prefixLen), Buffer.from(TOKEN, 'latin1')]))
    .digest();
  assert.deepEqual(audio.subarray(prefixLen, prefixLen + 32), expectedMac);
  assert.equal(audio.readBigUInt64LE(prefixLen + 32), 777n);
  assert.equal(audio[prefixLen + 40], 200);

  // The vector CrowdyCPP's wire_test pins for encodeChannelAudio.
  assert.equal(
    audio.toString('hex'),
    '23921000000000000076767676767676767676767676767676767676767676767676767676767676' +
      '760500010203040501f7c505bbdfc07169f661cb3e3c8d061bbf0065ef4bdc239df40c77112ff8' +
      '85150903000000000000c8',
  );

  await assert.rejects(
    wire.serializeChannelAudio(ctx, { ...input, payload: Buffer.alloc(1025).toString('base64') }),
    /exceeds 1024/,
  );
  await assert.rejects(wire.serializeChannelAudio(ctx, { ...input, uuid: 'short' }));
});

/** A server->client 36: [36][8B channelId][32B uuid][2B len][payload][8B epochMillis][1B seq]. */
function channelAudioNotification(payload, { channelId = 9n, seq = 4, epoch = 1700000000555n } = {}) {
  const out = Buffer.alloc(1 + 8 + 32 + 2 + payload.length + 8 + 1);
  out[0] = 36;
  out.writeBigUInt64LE(channelId, 1);
  out.write(UUID, 9, 'latin1');
  out.writeUInt16LE(payload.length, 41);
  Buffer.from(payload).copy(out, 43);
  out.writeBigUInt64LE(epoch, 43 + payload.length);
  out[43 + payload.length + 8] = seq;
  return Uint8Array.from(out);
}

test('parseRelayFrame reads a 36 standalone and inside both bundle kinds', () => {
  const packetizer = new voice.VoicePacketizer({ codec: voice.VoiceCodec.OPUS, frameMs: 20, seq: 7 });
  const frame = packetizer.packetize(Uint8Array.from([0xaa, 0xbb]));
  const bytes = channelAudioNotification(frame);
  const expected = {
    __typename: 'ChannelAudioNotification',
    channelId: '9',
    uuid: UUID,
    audioData: Buffer.from(frame).toString('base64'),
    sequenceNumber: 4,
    epochMillis: '1700000000555',
  };
  assert.deepEqual(wire.parseRelayFrame(bytes), [expected]);

  const len = Buffer.from([bytes.length & 0xff, bytes.length >> 8]);
  const bundle = Buffer.concat([Buffer.from([2]), len, bytes, len, bytes]);
  assert.deepEqual(wire.parseRelayFrame(Uint8Array.from(bundle)), [expected, expected]);
  const signed = Buffer.concat([Buffer.from([30]), len, bytes, Buffer.alloc(32, 0xee)]);
  assert.deepEqual(wire.parseRelayFrame(Uint8Array.from(signed)), [expected]);

  const decoded = voice.decodeVoicePacket(Buffer.from(expected.audioData, 'base64'));
  assert.equal(decoded.header.seq, 7);
  assert.equal(decoded.header.codec, voice.VoiceCodec.OPUS);
  assert.equal(decoded.header.flags, voice.VoiceFlag.SPURT_START);

  assert.deepEqual(wire.parseRelayFrame(bytes.subarray(0, 30)), []);
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

test('RealtimeClient hands a relayed 36 to channelAudio and any, and counts it', async () => {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  try {
    const metrics = new RealtimeMetrics();
    const realtime = new RealtimeClient(
      { wsUrl: 'wss://ck-api.example.test/graphql', binaryTransport: true, advertiseCapabilities: false },
      { getToken: () => 'a'.repeat(64), onChange: () => () => {} },
      metrics,
    );
    const seen = { audio: [], message: 0, any: [] };
    const off = realtime.subscribe(
      {
        channelAudio: (n) => seen.audio.push(n),
        channelMessage: () => (seen.message += 1),
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
    const frame = channelAudioNotification(Uint8Array.from([1, 2]));
    ws.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
    assert.equal(seen.audio.length, 1);
    assert.equal(seen.audio[0].audioData, 'AQI=');
    assert.equal(seen.audio[0].channelId, '9');
    assert.equal(seen.message, 0);
    assert.deepEqual(seen.any, ['ChannelAudioNotification']);
    assert.equal(metrics.snapshot().perKind.channelAudio.received.messages, 1);
    off();
  } finally {
    globalThis.WebSocket = previous;
  }
});

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

test('the GraphQL transport selects ChannelAudioNotification and hands it to channelAudio', async () => {
  FakeGraphqlSocket.instances = [];
  const metrics = new RealtimeMetrics();
  const realtime = new RealtimeClient(
    { wsUrl: 'wss://ck-api.example.test/graphql', webSocketImpl: FakeGraphqlSocket },
    { getToken: () => 'a'.repeat(64), onChange: () => () => {} },
    metrics,
  );
  const seen = { audio: [], message: 0 };
  const off = realtime.subscribe(
    { channelAudio: (n) => seen.audio.push(n), channelMessage: () => (seen.message += 1) },
    '42',
  );
  let subscribe;
  for (let i = 0; i < 50 && !subscribe; i += 1) {
    await settle();
    subscribe = FakeGraphqlSocket.instances.at(-1)?.sent.find((m) => m.type === 'subscribe');
  }
  assert.ok(subscribe, 'the udpNotifications subscription was sent');
  assert.match(
    subscribe.payload.query,
    /\.\.\. on ChannelAudioNotification \{\s*channelId\s+uuid\s+audioData\s+sequenceNumber\s+epochMillis\s*\}/,
  );
  FakeGraphqlSocket.instances.at(-1).reply({
    id: subscribe.id,
    type: 'next',
    payload: {
      data: {
        udpNotifications: {
          __typename: 'ChannelAudioNotification',
          channelId: '9',
          uuid: UUID,
          audioData: 'AQI=',
          sequenceNumber: 4,
          epochMillis: '1700000000000',
        },
      },
    },
  });
  assert.equal(seen.audio.length, 1);
  assert.equal(seen.audio[0].channelId, '9');
  assert.equal(seen.audio[0].audioData, 'AQI=');
  assert.equal(seen.message, 0);
  assert.equal(metrics.snapshot().perKind.channelAudio.received.messages, 1);
  off();
});

test('the World Stores bus carries channelAudio', () => {
  let handlers;
  const client = { udp: { subscribe: (h) => ((handlers = h), () => {}) } };
  const session = new WorldSessionCore(client, '42', { every: () => () => {}, dispose: () => {} });
  const heard = [];
  session.on('channelAudio', (n) => heard.push(n.audioData));
  assert.equal(typeof handlers.channelAudio, 'function');
  handlers.channelAudio({ __typename: 'ChannelAudioNotification', audioData: 'AA==' });
  assert.deepEqual(heard, ['AA==']);
  session.dispose();
});

test('udp.sendChannelAudio falls back to the sendChannelAudio mutation off the relay', async () => {
  const requests = [];
  const gql = {
    request: async (document, variables) => {
      requests.push({ name: document.definitions[0].name.value, variables });
      return { sendChannelAudio: true };
    },
  };
  const subs = { usingBinaryTransport: () => false };
  const metrics = new RealtimeMetrics();
  const udp = new UdpAPI(gql, subs, metrics);
  const input = { channelId: '7', uuid: UUID, payload: 'AQID', sequenceNumber: 3 };
  assert.equal(await udp.sendChannelAudio(input), true);
  assert.deepEqual(requests, [{ name: 'SendChannelAudio', variables: { input } }]);
  assert.equal(metrics.snapshot().perKind.channelAudio.sent.messages, 1);
});

test('udp.sendChannelAudio sends opcode 35 on the relay', async () => {
  const ctx = await wire.createSignContext(1n, TOKEN);
  const frames = [];
  const subs = {
    usingBinaryTransport: () => true,
    binarySendReady: () => true,
    sendBinaryFrame: async (serialize) => (frames.push(await serialize(ctx)), true),
  };
  const gql = { request: async () => assert.fail('no GraphQL on the relay path') };
  const udp = new UdpAPI(gql, subs);
  assert.equal(await udp.sendChannelAudio({ channelId: '7', uuid: UUID, payload: 'AQID' }), true);
  assert.equal(frames.length, 1);
  assert.equal(frames[0][0], 35);
});
