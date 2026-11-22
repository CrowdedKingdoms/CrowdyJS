/**
 * Buddy v0.48.0 does not send a speaker its own spatial voice and video unless the session asks
 * with `ClientCapability.OWN_MEDIA_ECHO`. The relay's `CLIENT_CAPABILITIES` carries the bit when
 * `realtime.ownMediaEcho` is true, and `setOwnMediaEcho` changes it on a live session.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const wire = await import('../../dist/binary-wire.js');
const { RealtimeClient } = await import('../../dist/realtime.js');
const { RealtimeMetrics } = await import('../../dist/metrics.js');

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

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** A ready relay session; `flags()` is every CLIENT_CAPABILITIES flags word sent so far. */
async function readySession(config) {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  const realtime = new RealtimeClient(
    { wsUrl: 'wss://ck-api.example.test/graphql', binaryTransport: true, ...config },
    { getToken: () => 'a'.repeat(64), onChange: () => () => {} },
    new RealtimeMetrics(),
  );
  const off = realtime.subscribe({}, '42');
  await settle(5);
  const ws = FakeWebSocket.instances.at(-1);
  ws.readyState = FakeWebSocket.OPEN;
  ws.onopen?.({});
  ws.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId: '5' }) });
  await settle();
  const flags = () =>
    ws.sent
      .filter((d) => typeof d !== 'string')
      .map((d) => new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ?? d))
      .filter((b) => b[0] === wire.WireMessageType.CLIENT_CAPABILITIES)
      .map((b) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(68, true));
  const close = () => {
    off();
    globalThis.WebSocket = previous;
  };
  return { realtime, flags, close };
}

test('OWN_MEDIA_ECHO is bit 2 of the capabilities word', () => {
  assert.equal(wire.ClientCapability.OWN_MEDIA_ECHO, 4);
  assert.equal(wire.SDK_CAPABILITIES & wire.ClientCapability.OWN_MEDIA_ECHO, 0);
});

test('by default the relay does not ask for the sender copy', async () => {
  const s = await readySession({});
  try {
    const flags = s.flags();
    assert.ok(flags.length >= 1, 'capabilities were advertised on ready');
    for (const f of flags) {
      assert.equal(f & wire.ClientCapability.OWN_MEDIA_ECHO, 0);
      assert.equal(f & wire.ClientCapability.BUNDLE_SIGNED, wire.ClientCapability.BUNDLE_SIGNED);
    }
  } finally {
    s.close();
  }
});

test('ownMediaEcho: true asks for it, beside what the SDK reads', async () => {
  const s = await readySession({ ownMediaEcho: true });
  try {
    const flags = s.flags();
    assert.ok(flags.length >= 1, 'capabilities were advertised on ready');
    for (const f of flags) {
      assert.equal(f, wire.SDK_CAPABILITIES | wire.ClientCapability.OWN_MEDIA_ECHO);
    }
  } finally {
    s.close();
  }
});

test('setOwnMediaEcho re-advertises at once, and only on a change', async () => {
  const s = await readySession({});
  try {
    const before = s.flags().length;
    s.realtime.setOwnMediaEcho(true);
    await settle();
    assert.deepEqual(s.flags().slice(before), [
      wire.SDK_CAPABILITIES | wire.ClientCapability.OWN_MEDIA_ECHO,
    ]);
    s.realtime.setOwnMediaEcho(true);
    await settle();
    assert.equal(s.flags().length, before + 1, 'the same value sends nothing');
    s.realtime.setOwnMediaEcho(false);
    await settle();
    assert.deepEqual(s.flags().slice(before + 1), [wire.SDK_CAPABILITIES]);
  } finally {
    s.close();
  }
});
