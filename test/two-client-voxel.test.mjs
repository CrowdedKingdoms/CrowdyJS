/**
 * Two-client voxel replication smoke test for a CKS environment.
 *
 * Companion to two-client-actor.test.mjs, exercising the voxel-edit path of the
 * full client-server loop: log in two players, open the WS subscription, register
 * each player's actor in a chunk, then have player A edit a voxel and verify the
 * VoxelUpdateNotification is fanned out to player B by the deployed
 * game-api + UDP-proxy + buddy chain (cross-server when the two proxy sessions
 * land on different Buddies).
 *
 * Auto-skips unless the integration env vars are present, so it is safe in the
 * default `npm test` matrix. Run it the same way as the actor test:
 *
 *   CROWDY_MANAGEMENT_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_TEST_APP_ID='1' \
 *   CROWDY_TEST_EMAIL_1='player-a@example.com' CROWDY_TEST_PASSWORD_1='...' \
 *   CROWDY_TEST_EMAIL_2='player-b@example.com' CROWDY_TEST_PASSWORD_2='...' \
 *   MGMT_DB_PASSWORD='...' DB_WRITER_PASSWORD='...' \
 *   npm test
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
  // Always-on enforcement: registered users are entitled via DB (mirrors the
  // open-by-default provisioning). Same vars as the buddy python tests.
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
const VOXEL = { x: 5, y: 5, z: 5 };
const VOXEL_TYPE = 42;
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
// 32-byte UTF-8 identifier carried on each voxel update (distinct from actor uuids).
const VOXEL_UUID = 'voxel-aaaa-bbbb-cccc-dddd-eeeeee';

function randomBase64(byteCount = 8) {
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
  'two-client voxel replication against a deployed env',
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

      // 2. B subscribes; collect voxel-update notifications.
      const receivedByB = { voxelUpdates: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe({
          voxelUpdate: (n) => receivedByB.voxelUpdates.push(n),
          genericError: (e) => receivedByB.genericErrors.push(e),
        }),
      );

      await sleep(2000);

      // 3. Register both actors in the same chunk so voxel fan-out includes B.
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

      // 4. A edits a voxel in the shared chunk a few times.
      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendVoxelUpdate({
          appId: APP_ID,
          chunk: CHUNK,
          voxel: VOXEL,
          voxelType: VOXEL_TYPE,
          voxelState: randomBase64(),
          distance: 8,
          uuid: VOXEL_UUID,
          sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(
        sendSuccessCount,
        SEND_COUNT,
        `All ${SEND_COUNT} sendVoxelUpdate mutations returned truthy`,
      );

      // 5. Wait for fanout, then check B received at least one voxel update.
      await sleep(NOTIFY_WAIT_MS);

      const voxelFromA = receivedByB.voxelUpdates.filter(
        (n) => n.uuid === VOXEL_UUID,
      );
      const diagnostics = {
        sent: sendSuccessCount,
        receivedByB: receivedByB.voxelUpdates.length,
        voxelFromA: voxelFromA.length,
        genericErrors: receivedByB.genericErrors,
      };

      assert.ok(
        voxelFromA.length > 0,
        `Client B should receive at least one voxel update from A. diagnostics=${JSON.stringify(diagnostics)}`,
      );

      const sample = voxelFromA[0];
      assert.equal(
        sample.__typename,
        'VoxelUpdateNotification',
        'Notification has expected __typename',
      );
      assert.equal(sample.voxelType, VOXEL_TYPE, 'Voxel type matches what A sent');
      assert.equal(Number(sample.voxelX), VOXEL.x, 'Voxel X matches');
      assert.equal(Number(sample.voxelY), VOXEL.y, 'Voxel Y matches');
      assert.equal(Number(sample.voxelZ), VOXEL.z, 'Voxel Z matches');
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
