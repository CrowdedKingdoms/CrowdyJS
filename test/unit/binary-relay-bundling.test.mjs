/**
 * Outbound MESSAGE_BUNDLE on the binary relay (realtime.bundleSends, 17.1).
 *
 * Messages sent within bundleWindowMs share one BINARY frame; a lone message
 * goes out unwrapped; capacity, flushSends(), disconnect() and the opt-out
 * behave as documented; the counters agree with the frames the socket saw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BinaryRelayTransport } from '../../dist/binary-relay.js';
import {
  RELAY_MAX_BUNDLE_MEMBER_BYTES,
  RELAY_MAX_DATAGRAM_BYTES,
  RELAY_MAX_BUNDLE_MEMBERS,
} from '../../dist/binary-wire.js';

const TOKEN = 'a'.repeat(64);

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
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  ready(gameTokenId = '123') {
    this.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId }) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: false });
  }
}

const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function readyTransport(config = {}) {
  const transport = new BinaryRelayTransport(
    {
      url: 'wss://ck-api.example.test/realtime',
      retryInitialDelayMs: 0,
      retryMaxDelayMs: 0,
      logger: { warn: () => {}, error: () => {}, debug: () => {}, info: () => {} },
      ...config,
    },
    {
      getToken: () => TOKEN,
      onNotification: () => {},
      onError: () => {},
      onStatus: () => {},
      onUnavailable: () => {},
    },
  );
  transport.connect('7');
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.open();
  ws.ready();
  await settle();
  assert.equal(transport.isReady(), true);
  return { transport, ws };
}

/** A fake signed message: opcode byte then filler, `len` bytes total. */
const msg = (opcode, len = 109) => {
  const m = new Uint8Array(len);
  m[0] = opcode;
  return m;
};

/** Split a type-2 frame into its members (the downlink walker's framing). */
function members(frame) {
  assert.equal(frame[0], 2, 'expected a MESSAGE_BUNDLE frame');
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const out = [];
  let off = 1;
  while (off < frame.length) {
    const len = view.getUint16(off, true);
    off += 2;
    out.push(frame.subarray(off, off + len));
    off += len;
  }
  assert.equal(off, frame.length, 'bundle must be fully consumed');
  return out;
}

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
});

test('defaults: bundling on, 1 ms window; two sends inside it share one frame', async () => {
  const { transport, ws } = await readyTransport();
  transport.sendFrame(msg(128));
  transport.sendFrame(msg(26));
  assert.equal(ws.sent.length, 0, 'nothing leaves before the window closes');
  assert.deepEqual(transport.stats(), {
    messagesSent: 2,
    framesSent: 0,
    bundlesSent: 0,
    bytesSent: 0,
    messagesDropped: 0,
  });
  await settle();
  assert.equal(ws.sent.length, 1);
  const parts = members(ws.sent[0]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0][0], 128);
  assert.equal(parts[1][0], 26);
  assert.equal(ws.sent[0].length, 1 + 2 * (2 + 109));
  const s = transport.stats();
  assert.equal(s.framesSent, 1);
  assert.equal(s.bundlesSent, 1);
  assert.equal(s.bytesSent, ws.sent[0].length);
  transport.disconnect();
});

test('a lone message is flushed unwrapped: same bytes as an unbundled send', async () => {
  const { transport, ws } = await readyTransport();
  const one = msg(128);
  transport.sendFrame(one);
  await settle();
  assert.equal(ws.sent.length, 1);
  assert.equal(ws.sent[0], one);
  assert.equal(transport.stats().bundlesSent, 0);
  transport.disconnect();
});

test('flushSends() puts the pending bundle out immediately and is a no-op when empty', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  transport.sendFrame(msg(128));
  transport.sendFrame(msg(131));
  assert.equal(ws.sent.length, 0);
  transport.flushSends();
  assert.equal(ws.sent.length, 1);
  assert.equal(members(ws.sent[0]).length, 2);
  transport.flushSends();
  assert.equal(ws.sent.length, 1);
  await settle(); // the cancelled window timer must not send anything more
  assert.equal(ws.sent.length, 1);
  transport.disconnect();
});

test('capacity: a message that would push the frame past 1232 bytes flushes first', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  // 1 + 11 * (2 + 109) = 1222 fits; a twelfth would make 1333.
  for (let i = 0; i < 12; i += 1) transport.sendFrame(msg(26));
  assert.equal(ws.sent.length, 1);
  assert.equal(members(ws.sent[0]).length, 11);
  assert.equal(ws.sent[0].length, 1222);
  transport.flushSends();
  assert.equal(ws.sent.length, 2);
  assert.equal(ws.sent[1][0], 26, 'the twelfth went alone, unwrapped');
  transport.disconnect();
});

test('member cap: the 33rd tiny message opens a new frame', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  for (let i = 0; i < RELAY_MAX_BUNDLE_MEMBERS + 1; i += 1) transport.sendFrame(msg(3, 3));
  assert.equal(ws.sent.length, 1);
  assert.equal(members(ws.sent[0]).length, RELAY_MAX_BUNDLE_MEMBERS);
  transport.flushSends();
  assert.equal(ws.sent.length, 2);
  transport.disconnect();
});

test('an oversize message flushes what is pending and travels alone', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  transport.sendFrame(msg(26));
  const huge = msg(128, RELAY_MAX_DATAGRAM_BYTES);
  assert.ok(huge.length > RELAY_MAX_BUNDLE_MEMBER_BYTES);
  transport.sendFrame(huge);
  assert.equal(ws.sent.length, 2);
  assert.equal(ws.sent[0][0], 26);
  assert.equal(ws.sent[1], huge);
  assert.equal(transport.stats().bundlesSent, 0);
  transport.disconnect();
});

test('disconnect() flushes what the last frame queued', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  transport.sendFrame(msg(128));
  transport.sendFrame(msg(26));
  transport.disconnect();
  assert.equal(ws.sent.length, 1);
  assert.equal(members(ws.sent[0]).length, 2);
});

test('a socket lost inside the window drops the pending members and counts them', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000, retryAttempts: 0 });
  transport.sendFrame(msg(128));
  transport.sendFrame(msg(26));
  ws.drop();
  transport.flushSends();
  assert.equal(ws.sent.length, 0);
  const s = transport.stats();
  assert.equal(s.messagesDropped, 2);
  assert.equal(s.framesSent, 0);
  transport.disconnect();
});

test('window 0 flushes on the next macrotask, still one frame for a synchronous burst', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 0 });
  transport.sendFrame(msg(128));
  transport.sendFrame(msg(26));
  transport.sendFrame(msg(131));
  assert.equal(ws.sent.length, 0);
  await settle(1);
  assert.equal(ws.sent.length, 1);
  assert.equal(members(ws.sent[0]).length, 3);
  transport.disconnect();
});

test('a hidden document flushes every send at once (throttled timers cannot keep the window)', async () => {
  const { transport, ws } = await readyTransport({ bundleWindowMs: 1000 });
  globalThis.document = { visibilityState: 'hidden' };
  try {
    const a = msg(26);
    transport.sendFrame(a);
    assert.equal(ws.sent.length, 1, 'left immediately, no window wait');
    assert.equal(ws.sent[0], a, 'a lone member goes unwrapped');
    transport.sendFrame(msg(128));
    assert.equal(ws.sent.length, 2);
    assert.equal(transport.stats().bundlesSent, 0);

    // Back in the foreground the window applies again.
    globalThis.document = { visibilityState: 'visible' };
    transport.sendFrame(msg(128));
    transport.sendFrame(msg(26));
    assert.equal(ws.sent.length, 2, 'pending until the window or a flush');
    transport.flushSends();
    assert.equal(ws.sent.length, 3);
    assert.equal(members(ws.sent[2]).length, 2);
  } finally {
    delete globalThis.document;
    transport.disconnect();
  }
});

test('bundleSends: false is one frame per message, immediately, bundlesSent stays 0', async () => {
  const { transport, ws } = await readyTransport({ bundleSends: false });
  const a = msg(128);
  const b = msg(26);
  transport.sendFrame(a);
  transport.sendFrame(b);
  assert.equal(ws.sent.length, 2);
  assert.equal(ws.sent[0], a);
  assert.equal(ws.sent[1], b);
  const s = transport.stats();
  assert.equal(s.messagesSent, 2);
  assert.equal(s.framesSent, 2);
  assert.equal(s.bundlesSent, 0);
  transport.flushSends(); // no-op
  assert.equal(ws.sent.length, 2);
  transport.disconnect();
});

test('sendFrame still refuses when the relay is not ready', async () => {
  const transport = new BinaryRelayTransport(
    { url: 'wss://ck-api.example.test/realtime' },
    {
      getToken: () => TOKEN,
      onNotification: () => {},
      onError: () => {},
      onStatus: () => {},
      onUnavailable: () => {},
    },
  );
  assert.throws(() => transport.sendFrame(msg(128)), /not connected/);
  assert.equal(transport.stats().messagesSent, 0);
});
