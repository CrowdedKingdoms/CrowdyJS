/**
 * Two-client voice-chat (audio) replication smoke test for a CKS environment.
 *
 * Companion to two-client-actor / two-client-voxel / two-client-messaging: two
 * players register actors in a shared chunk, then player A sends voice/audio
 * packets and player B must receive the ClientAudioNotification via the
 * game-api + UDP-proxy + Buddy chain (cross-server when the two proxy sessions
 * land on different Buddies).
 *
 * Auto-skips unless the integration env vars are present (same set as the other
 * two-client tests). Run via `npm test` with the CROWDY_* + *_DB_PASSWORD env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { entitleUserForApp } from './entitle.mjs';

// CrowdyJS realtime depends on a global `WebSocket`; node doesn't have one.
globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_MANAGEMENT_URL',
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_TEST_EMAIL_1',
  'CROWDY_TEST_PASSWORD_1',
  'CROWDY_TEST_EMAIL_2',
  'CROWDY_TEST_PASSWORD_2',
  'MGMT_DB_PASSWORD',
  'DB_WRITER_PASSWORD',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const APP_ID = process.env.CROWDY_TEST_APP_ID ?? '1';
const SEND_COUNT = Number(process.env.CROWDY_TEST_SEND_COUNT ?? 5);
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
// 32-byte UTF-8 identifier carried on each audio packet (the voice source).
const AUDIO_UUID = 'audio-aaaa-bbbb-cccc-dddd-eeeeee';

function randomBase64(byteCount = 64) {
  const buf = new Uint8Array(byteCount);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function registerOrLogin(client, email, password) {
  try {
    const reg = await client.auth.register({ email, password });
    if (reg?.token) return reg;
  } catch {
    /* already registered - fall through to login */
  }
  return client.auth.login({ email, password });
}

test(
  'two-client voice-chat (audio) replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../dist/index.js');

    const config = {
      managementUrl: process.env.CROWDY_MANAGEMENT_URL,
      httpUrl: process.env.CROWDY_HTTP_URL,
      wsUrl: process.env.CROWDY_WS_URL,
      realtime: {
        retryAttempts: 4,
        retryInitialDelayMs: 250,
        retryMaxDelayMs: 2000,
        waitTimeoutMs: 5000,
      },
    };

    const clientA = createCrowdyClient(config);
    const clientB = createCrowdyClient(config);
    const cleanup = [];

    try {
      // 1. Provision + authenticate both players via the public management-api.
      const authA = await registerOrLogin(
        clientA,
        process.env.CROWDY_TEST_EMAIL_1,
        process.env.CROWDY_TEST_PASSWORD_1,
      );
      assert.ok(authA?.token, 'Client A authenticated and returned a token');

      const authB = await registerOrLogin(
        clientB,
        process.env.CROWDY_TEST_EMAIL_2,
        process.env.CROWDY_TEST_PASSWORD_2,
      );
      assert.ok(authB?.token, 'Client B authenticated and returned a token');

      // Always-on enforcement: entitle both players (app access + world grid).
      await entitleUserForApp(APP_ID, authA.user.userId);
      await entitleUserForApp(APP_ID, authB.user.userId);

      // 2. B subscribes; collect audio notifications.
      const receivedByB = { audio: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe({
          audio: (n) => receivedByB.audio.push(n),
          genericError: (e) => receivedByB.genericErrors.push(e),
        }),
      );

      await sleep(2000);

      // 3. Register both actors in the same chunk so voice fan-out includes B.
      //    The first spatial message to a new chunk is dropped while the server
      //    loads grid permissions, so register, wait, register again.
      const registerBoth = async () => {
        const regA = await clientA.udp.sendActorUpdate({
          appId: APP_ID, chunk: CHUNK, distance: 8,
          uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1,
        });
        assert.ok(regA, 'Client A registered in chunk');
        const regB = await clientB.udp.sendActorUpdate({
          appId: APP_ID, chunk: CHUNK, distance: 8,
          uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1,
        });
        assert.ok(regB, 'Client B registered in chunk');
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      // 4. A streams a few voice packets. Audio defaults to distance=1, but A and
      //    B share a chunk (distance 0), so set distance=8 to be explicit.
      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendAudioPacket({
          appId: APP_ID,
          chunk: CHUNK,
          audioData: randomBase64(),
          distance: 8,
          uuid: AUDIO_UUID,
          sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(
        sendSuccessCount,
        SEND_COUNT,
        `All ${SEND_COUNT} sendAudioPacket mutations returned truthy`,
      );

      // 5. Wait for fanout, then check B received at least one audio packet.
      await sleep(NOTIFY_WAIT_MS);

      const audioFromA = receivedByB.audio.filter((n) => n.uuid === AUDIO_UUID);
      const diagnostics = {
        sent: sendSuccessCount,
        receivedByB: receivedByB.audio.length,
        audioFromA: audioFromA.length,
        genericErrors: receivedByB.genericErrors,
      };

      assert.ok(
        audioFromA.length > 0,
        `Client B should receive at least one voice packet from A. diagnostics=${JSON.stringify(diagnostics)}`,
      );

      const sample = audioFromA[0];
      assert.equal(
        sample.__typename,
        'ClientAudioNotification',
        'Notification has expected __typename',
      );
      assert.ok(
        typeof sample.audioData === 'string' && sample.audioData.length > 0,
        'Voice notification carries audioData',
      );
      assert.ok(sample.sequenceNumber != null, 'Notification includes sequenceNumber');
      assert.ok(sample.epochMillis != null, 'Notification includes epochMillis');
    } finally {
      for (const unsub of cleanup) {
        try { unsub(); } catch { /* swallow */ }
      }
      try { await clientA.udp.disconnect(); } catch { /* swallow */ }
      try { await clientB.udp.disconnect(); } catch { /* swallow */ }
      clientA.close();
      clientB.close();
    }
  },
);
