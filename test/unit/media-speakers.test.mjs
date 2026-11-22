/**
 * Buddy v0.49.0 delivers a player's spatial voice and video only from the speakers its
 * `CLIENT_MEDIA_SPEAKERS` names. The relay sends a changed list at once and every list again on
 * each capabilities tick (every `ready`, and the interval), and a relay opened later starts with
 * the lists.
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
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);

/** The app payload of every CLIENT_MEDIA_SPEAKERS sent so far: [modes and counts, names]. */
function speakerFrames(ws) {
  return ws.sent
    .filter((d) => typeof d !== 'string')
    .map((d) => new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer ?? d))
    .filter((b) => b[0] === wire.WireMessageType.CLIENT_MEDIA_SPEAKERS)
    .map((b) => {
      const body = b.subarray(68, b.length - 41);
      const names = [];
      for (let off = 4; off < body.length; off += 32) {
        names.push(new TextDecoder().decode(body.subarray(off, off + 32)));
      }
      return { header: [...body.subarray(0, 4)], names };
    });
}

async function readyRelay(realtime) {
  const off = realtime.subscribe({}, '42');
  await settle(5);
  const ws = FakeWebSocket.instances.at(-1);
  ws.readyState = FakeWebSocket.OPEN;
  ws.onopen?.({});
  ws.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId: '5' }) });
  await settle();
  return { ws, off };
}

function client() {
  return new RealtimeClient(
    { wsUrl: 'wss://ck-api.example.test/graphql', binaryTransport: true },
    { getToken: () => 'a'.repeat(64), onChange: () => () => {} },
    new RealtimeMetrics(),
  );
}

test('CLIENT_MEDIA_SPEAKERS is opcode 47 with three modes', () => {
  assert.equal(wire.WireMessageType.CLIENT_MEDIA_SPEAKERS, 47);
  assert.deepEqual(wire.SpeakerListMode, { KEEP: 0, ONLY: 1, EVERYONE: 2 });
  assert.equal(wire.MAX_MEDIA_SPEAKERS, 32);
});

test('a changed kind goes at once; the other kind is kept', async (t) => {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => (globalThis.WebSocket = previous));
  const realtime = client();
  const { ws, off } = await readyRelay(realtime);
  t.after(off);
  assert.deepEqual(speakerFrames(ws), [], 'no list, nothing sent');

  realtime.setSpeakers({ voice: [A, B] });
  await settle();
  assert.deepEqual(speakerFrames(ws), [{ header: [1, 2, 0, 0], names: [A, B] }]);

  realtime.setSpeakers({ video: [] });
  await settle();
  assert.deepEqual(speakerFrames(ws).at(-1), { header: [0, 0, 1, 0], names: [] });

  realtime.setSpeakers({ voice: null });
  await settle();
  assert.deepEqual(speakerFrames(ws).at(-1), { header: [2, 0, 0, 0], names: [] });
});

test('every list goes again on ready, and a relay opened later starts with them', async (t) => {
  FakeWebSocket.instances = [];
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => (globalThis.WebSocket = previous));
  const realtime = client();
  realtime.setSpeakers({ voice: [A], video: [B] });
  const { ws, off } = await readyRelay(realtime);
  t.after(off);
  const first = speakerFrames(ws);
  assert.deepEqual(first, [
    { header: [1, 1, 0, 0], names: [A] },
    { header: [0, 0, 1, 1], names: [B] },
  ]);
  ws.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId: '5' }) });
  await settle();
  assert.deepEqual(speakerFrames(ws).slice(first.length), first);
});

test('a list over 32 is refused before anything is sent', () => {
  const realtime = client();
  assert.throws(
    () => realtime.setSpeakers({ video: Array.from({ length: 33 }, () => A) }),
    (error) => error.code === 'SPEAKER_LIST_TOO_LONG',
  );
});
