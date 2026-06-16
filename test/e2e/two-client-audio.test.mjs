/**
 * Two-client voice-chat (audio) replication smoke test for a CKS environment.
 *
 * Two players register actors in a shared chunk, player A streams voice/audio
 * packets, and player B must receive the ClientAudioNotification via the
 * game-api + UDP-proxy + buddy chain.
 *
 * Fully black-box: owner, tier, and players are created/entitled through the
 * management API (provision.mjs). No database credentials. Auto-skips unless the
 * integration env vars are present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_MANAGEMENT_URL',
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
  'CROWDY_OWNER_PASSWORD',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const SEND_COUNT = Number(process.env.CROWDY_TEST_SEND_COUNT ?? 5);
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
const AUDIO_UUID = 'audio-aaaa-bbbb-cccc-dddd-eeeeee';

function randomBase64(byteCount = 64) {
  const buf = new Uint8Array(byteCount);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clientConfig() {
  return {
    managementUrl: process.env.CROWDY_MANAGEMENT_URL,
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: { retryAttempts: 4, retryInitialDelayMs: 250, retryMaxDelayMs: 2000, waitTimeoutMs: 5000 },
  };
}

test(
  'two-client voice-chat (audio) replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, clientConfig(), 2);
    const [clientA, clientB] = clients;
    const cleanup = [];

    try {
      const receivedByB = { audio: [], genericErrors: [] };
      cleanup.push(clientB.udp.subscribe({
        audio: (n) => receivedByB.audio.push(n),
        genericError: (e) => receivedByB.genericErrors.push(e),
      }, appId));

      await sleep(2000);

      const registerBoth = async () => {
        assert.ok(await clientA.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1,
        }), 'Client A registered in chunk');
        assert.ok(await clientB.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1,
        }), 'Client B registered in chunk');
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      // Audio defaults to distance=1; A and B share a chunk (distance 0), but set
      // distance=8 explicitly to be safe.
      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendAudioPacket({
          appId, chunk: CHUNK, audioData: randomBase64(), distance: 8, uuid: AUDIO_UUID, sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(sendSuccessCount, SEND_COUNT, `All ${SEND_COUNT} sendAudioPacket mutations returned truthy`);

      await sleep(NOTIFY_WAIT_MS);

      const audioFromA = receivedByB.audio.filter((n) => n.uuid === AUDIO_UUID);
      const diagnostics = {
        appId, sent: sendSuccessCount, receivedByB: receivedByB.audio.length,
        audioFromA: audioFromA.length, genericErrors: receivedByB.genericErrors,
      };
      assert.ok(audioFromA.length > 0, `Client B should receive at least one voice packet from A. diagnostics=${JSON.stringify(diagnostics)}`);

      const sample = audioFromA[0];
      assert.equal(sample.__typename, 'ClientAudioNotification', 'expected ClientAudioNotification');
      assert.ok(typeof sample.audioData === 'string' && sample.audioData.length > 0, 'Voice notification carries audioData');
      assert.ok(sample.sequenceNumber != null, 'Notification includes sequenceNumber');
      assert.ok(sample.epochMillis != null, 'Notification includes epochMillis');
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);
