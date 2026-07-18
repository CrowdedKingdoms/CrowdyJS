/**
 * Offline unit tests for `client.metrics` (RealtimeMetrics): counters,
 * per-kind breakdown, sliding-window rates with a fake clock, reset, and the
 * payload-size helper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

test('RealtimeMetrics counts sent/received totals and per-kind payload bytes', async () => {
  const { RealtimeMetrics } = await loadSdk();
  let nowMs = 1_000_000;
  const metrics = new RealtimeMetrics(() => nowMs);

  metrics.recordSent('actorUpdate', 48);
  metrics.recordSent('actorUpdate', 48);
  metrics.recordSent('audio', 640);
  metrics.recordReceived('voxelUpdate', 4);
  metrics.recordReceived('audio', 640);

  const snap = metrics.snapshot();
  assert.equal(snap.totals.sent, 3);
  assert.equal(snap.totals.received, 2);
  assert.equal(snap.totals.bytesSent, 48 + 48 + 640);
  assert.equal(snap.totals.bytesReceived, 4 + 640);
  assert.equal(snap.perKind.actorUpdate.sent.messages, 2);
  assert.equal(snap.perKind.actorUpdate.sent.bytes, 96);
  assert.equal(snap.perKind.audio.sent.messages, 1);
  assert.equal(snap.perKind.audio.received.messages, 1);
  assert.equal(snap.perKind.voxelUpdate.received.bytes, 4);
  assert.equal(snap.startedAt, 1_000_000);
});

test('RealtimeMetrics rates use the sliding window and expire old buckets', async () => {
  const { RealtimeMetrics } = await loadSdk();
  let nowMs = 50_000;
  const metrics = new RealtimeMetrics(() => nowMs);

  // 10 messages of 100 bytes in the first second.
  for (let i = 0; i < 10; i++) metrics.recordSent('actorUpdate', 100);

  // 5 seconds in: 10 messages over a 5-second lifetime -> 2/s.
  nowMs += 5_000;
  let snap = metrics.snapshot();
  assert.equal(snap.rates.sentPerSecond, 2);
  assert.equal(snap.rates.bytesSentPerSecond, 200);

  // 20 seconds in: the burst has left the ~10 s window entirely.
  nowMs += 15_000;
  snap = metrics.snapshot();
  assert.equal(snap.rates.sentPerSecond, 0);
  assert.equal(snap.rates.bytesSentPerSecond, 0);
  // Totals are cumulative and unaffected by the window.
  assert.equal(snap.totals.sent, 10);

  // New traffic shows up again.
  metrics.recordReceived('text', 50);
  snap = metrics.snapshot();
  assert.ok(snap.rates.receivedPerSecond > 0);
});

test('RealtimeMetrics.reset zeroes counters and restarts the window', async () => {
  const { RealtimeMetrics } = await loadSdk();
  let nowMs = 7_000;
  const metrics = new RealtimeMetrics(() => nowMs);
  metrics.recordSent('audio', 640);
  metrics.recordReceived('audio', 640);

  nowMs += 3_000;
  metrics.reset();
  const snap = metrics.snapshot();
  assert.equal(snap.totals.sent, 0);
  assert.equal(snap.totals.received, 0);
  assert.equal(snap.totals.bytesSent, 0);
  assert.equal(snap.totals.bytesReceived, 0);
  assert.deepEqual(snap.perKind, {});
  assert.equal(snap.rates.sentPerSecond, 0);
  assert.equal(snap.startedAt, 10_000);
});

test('payloadBytesOf measures the first app-defined payload field', async () => {
  const { payloadBytesOf } = await loadSdk();
  assert.equal(payloadBytesOf({ state: 'AAAA', uuid: 'x'.repeat(32) }), 4);
  assert.equal(payloadBytesOf({ audioData: 'A'.repeat(640) }), 640);
  assert.equal(payloadBytesOf({ text: 'hello' }), 5);
  assert.equal(payloadBytesOf({ payload: 'AA==' }), 4);
  assert.equal(payloadBytesOf({ voxelState: '' }), 0);
  assert.equal(payloadBytesOf({ sequenceNumber: 3 }), 0);
});

test('client exposes metrics wired into udp and realtime', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    managementUrl: 'https://management.invalid',
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });
  assert.ok(client.metrics, 'client.metrics should exist');
  assert.equal(typeof client.metrics.snapshot, 'function');
  assert.equal(typeof client.metrics.reset, 'function');
  const snap = client.metrics.snapshot();
  assert.equal(snap.totals.sent, 0);
  assert.equal(snap.totals.received, 0);
});
