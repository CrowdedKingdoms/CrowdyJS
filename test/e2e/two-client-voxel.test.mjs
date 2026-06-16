/**
 * Two-client voxel replication smoke test for a CKS environment.
 *
 * Two players register actors in a shared chunk, player A edits a voxel, and
 * player B must receive the VoxelUpdateNotification via the game-api + UDP-proxy
 * + buddy chain (cross-server when the two proxy sessions land on different
 * Buddies).
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
const VOXEL = { x: 5, y: 5, z: 5 };
const VOXEL_TYPE = 42;
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
const VOXEL_UUID = 'voxel-aaaa-bbbb-cccc-dddd-eeeeee';

function randomBase64(byteCount = 8) {
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
  'two-client voxel replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, clientConfig(), 2);
    const [clientA, clientB] = clients;
    const cleanup = [];

    try {
      const receivedByB = { voxelUpdates: [], genericErrors: [] };
      cleanup.push(clientB.udp.subscribe({
        voxelUpdate: (n) => receivedByB.voxelUpdates.push(n),
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

      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendVoxelUpdate({
          appId, chunk: CHUNK, voxel: VOXEL, voxelType: VOXEL_TYPE,
          voxelState: randomBase64(), distance: 8, uuid: VOXEL_UUID, sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(sendSuccessCount, SEND_COUNT, `All ${SEND_COUNT} sendVoxelUpdate mutations returned truthy`);

      await sleep(NOTIFY_WAIT_MS);

      const voxelFromA = receivedByB.voxelUpdates.filter((n) => n.uuid === VOXEL_UUID);
      const diagnostics = {
        appId, sent: sendSuccessCount, receivedByB: receivedByB.voxelUpdates.length,
        voxelFromA: voxelFromA.length, genericErrors: receivedByB.genericErrors,
      };
      assert.ok(voxelFromA.length > 0, `Client B should receive at least one voxel update from A. diagnostics=${JSON.stringify(diagnostics)}`);

      const sample = voxelFromA[0];
      assert.equal(sample.__typename, 'VoxelUpdateNotification', 'expected VoxelUpdateNotification');
      assert.equal(sample.voxelType, VOXEL_TYPE, 'Voxel type matches what A sent');
      assert.equal(Number(sample.voxelX), VOXEL.x, 'Voxel X matches');
      assert.equal(Number(sample.voxelY), VOXEL.y, 'Voxel Y matches');
      assert.equal(Number(sample.voxelZ), VOXEL.z, 'Voxel Z matches');
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
