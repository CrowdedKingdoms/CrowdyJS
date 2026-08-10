/**
 * Two-client actor replication smoke test for a CKS environment.
 *
 * This test exercises the full client-server loop a real game has to walk
 * through: provision an app + two entitled players entirely through the PUBLIC
 * management API (no DB access), open the WS subscription, register each
 * player's actor in a chunk, and then verify that one player's actor updates
 * are fanned out to the other by the deployed game-api + UDP-proxy + buddy chain.
 *
 * The test auto-skips when the required env vars aren't present, so it's safe to
 * leave in the default `npm test` matrix. To run it against an env, point it at
 * the URLs the management UI returned for that env after the deploy completed:
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   npm test
 *
 * Everything is black-box: the owner, org, app, access tier, and players are all
 * created through the API (see provision.mjs). Granting a player access
 * auto-provisions the grid permissions server-side, so no MGMT_DB_* /
 * DB_WRITER_* credentials are needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionAppWithPlayers, mintAppAccess } from '../provision.mjs';
import { gameClientConfig } from '../helpers.mjs';

// CrowdyJS realtime depends on a global `WebSocket`; node doesn't have one.
globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  // App owner that owns CROWDY_TEST_APP_ID (default app 1); entitles players via
  // the management API. No DB credentials.
  'CROWDY_OWNER_EMAIL',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const SEND_COUNT = Number(process.env.CROWDY_TEST_SEND_COUNT ?? 5);
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
// Time for the management->game-api replica-sync to mirror access + grid grants.
const SYNC_WAIT_MS = Number(process.env.CROWDY_TEST_SYNC_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';

function randomBase64ActorState(byteCount = 96) {
  const buf = new Uint8Array(byteCount);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test(
  'two-client actor replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    // Import lazily so the test file can be evaluated even when dist isn't
    // built (the unit test suite still passes).
    const { createCrowdyClient } = await import('../../dist/index.js');

    // 1. Provision an app + two entitled players via the management API only.
    const { appId, players } = await provisionAppWithPlayers(2);
    await sleep(SYNC_WAIT_MS); // let replica-sync mirror access + grid grants

    // Gameplay requires an app-scoped token; the identity session token is
    // rejected by game-api/Buddy with SCOPE_MISSING. The mint also names the
    // datacenter the app is resident in, and both clients are built there —
    // sending gameplay to the shared entry origin is not something the SDK is
    // ever used to do, and it puts the two clients on different instances.
    const accessA = await mintAppAccess(appId, players[0].token);
    const accessB = await mintAppAccess(appId, players[1].token);
    const clientA = createCrowdyClient(gameClientConfig(accessA));
    const clientB = createCrowdyClient(gameClientConfig(accessB));
    clientA.setToken(accessA.token);
    clientB.setToken(accessB.token);
    const cleanup = [];

    try {
      // 2. Subscribe (opens UDP proxy implicitly via WS). Handler names match
      //    the SDK's UdpNotificationHandlers (actorUpdate / genericError).
      const receivedByB = { actorUpdates: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe({
          actorUpdate: (n) => receivedByB.actorUpdates.push(n),
          genericError: (e) => receivedByB.genericErrors.push(e),
        }, appId),
      );

      // Give the WS time to connect + subscribe before we send anything
      await sleep(2000);

      // 3. Register both clients in the same chunk so distance-based fanout
      //    includes both of them. The first spatial message to a new chunk is
      //    dropped while the server loads grid permissions, so register, wait,
      //    register again.
      const registerBoth = async () => {
        const regA = await clientA.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1,
        });
        assert.ok(regA, 'Client A registered in chunk');
        const regB = await clientB.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1,
        });
        assert.ok(regB, 'Client B registered in chunk');
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      // 4. A sends a burst of actor updates
      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A,
          state: randomBase64ActorState(), sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(sendSuccessCount, SEND_COUNT, `All ${SEND_COUNT} sendActorUpdate mutations returned truthy`);

      // 5. Wait for fanout, then check that B received at least one update from A.
      await sleep(NOTIFY_WAIT_MS);

      const updatesFromA = receivedByB.actorUpdates.filter((n) => n.uuid === TEST_UUID_A);
      const diagnostics = {
        appId,
        sent: sendSuccessCount,
        receivedByB: receivedByB.actorUpdates.length,
        updatesFromA: updatesFromA.length,
        genericErrors: receivedByB.genericErrors,
      };

      assert.ok(
        updatesFromA.length > 0,
        `Client B should receive at least one actor update from A. diagnostics=${JSON.stringify(diagnostics)}`,
      );

      const sample = updatesFromA[0];
      assert.equal(sample.__typename, 'ActorUpdateNotification', 'Notification has expected __typename');
      assert.ok(sample.distance != null, 'Notification includes distance');
      assert.ok(sample.decayRate != null, 'Notification includes decayRate');
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
