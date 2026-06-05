/**
 * Two-client actor replication smoke test for a CKS environment.
 *
 * This test exercises the full client-server loop a real game has to walk
 * through: log in two players, open the WS subscription, register each
 * player's actor in a chunk, and then verify that one player's actor updates
 * are fanned out to the other player by the deployed game-api + UDP-proxy +
 * buddy chain.
 *
 * The test auto-skips when the required env vars aren't present, so it's
 * safe to leave in the default `npm test` matrix. To run it against an env,
 * point it at the URLs the management UI returned for that env after the
 * deploy completed:
 *
 *   CROWDY_MANAGEMENT_URL='http://40.160.10.31:3001/graphql' \
 *   CROWDY_HTTP_URL='https://game.<handle>.cks-env.com/graphql' \
 *   CROWDY_WS_URL='wss://game.<handle>.cks-env.com/graphql' \
 *   CROWDY_TEST_APP_ID='1' \
 *   CROWDY_TEST_EMAIL_1='player-a@cks-env.com' \
 *   CROWDY_TEST_PASSWORD_1='...' \
 *   CROWDY_TEST_EMAIL_2='player-b@cks-env.com' \
 *   CROWDY_TEST_PASSWORD_2='...' \
 *   npm test
 *
 * Required env vars (all of them or skip):
 *   CROWDY_MANAGEMENT_URL  full mgmt-api GraphQL endpoint (incl. /graphql)
 *   CROWDY_HTTP_URL        full game-api GraphQL endpoint (incl. /graphql)
 *   CROWDY_WS_URL          full game-api WS endpoint (wss://.../graphql)
 *   CROWDY_TEST_EMAIL_1, CROWDY_TEST_PASSWORD_1
 *   CROWDY_TEST_EMAIL_2, CROWDY_TEST_PASSWORD_2
 *
 * Optional:
 *   CROWDY_TEST_APP_ID     defaults to '1'
 *   CROWDY_TEST_SEND_COUNT defaults to 5 actor updates
 *   CROWDY_TEST_NOTIFY_WAIT_MS  defaults to 3000ms post-send wait
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';

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
      // 1. Login
      const authA = await clientA.auth.login({
        email: process.env.CROWDY_TEST_EMAIL_1,
        password: process.env.CROWDY_TEST_PASSWORD_1,
      });
      assert.ok(authA?.token, 'Client A login returned a token');

      const authB = await clientB.auth.login({
        email: process.env.CROWDY_TEST_EMAIL_2,
        password: process.env.CROWDY_TEST_PASSWORD_2,
      });
      assert.ok(authB?.token, 'Client B login returned a token');

      // 2. Subscribe (opens UDP proxy implicitly via WS)
      const receivedByB = { actorUpdates: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe({
          onActorUpdate: (n) => receivedByB.actorUpdates.push(n),
          onGenericError: (e) => receivedByB.genericErrors.push(e),
        }),
      );

      // Give the WS time to connect + subscribe before we send anything
      await sleep(2000);

      // 3. Register both clients in the same chunk so distance-based fanout
      //    includes both of them.
      const regA = await clientA.udp.sendActorUpdate({
        appId: APP_ID,
        chunk: CHUNK,
        distance: 8,
        uuid: TEST_UUID_A,
        state: 'AA==',
        sequenceNumber: 1,
      });
      assert.ok(regA, 'Client A registered in chunk');

      const regB = await clientB.udp.sendActorUpdate({
        appId: APP_ID,
        chunk: CHUNK,
        distance: 8,
        uuid: TEST_UUID_B,
        state: 'AA==',
        sequenceNumber: 1,
      });
      assert.ok(regB, 'Client B registered in chunk');

      await sleep(1000);

      // 4. A sends a burst of actor updates
      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendActorUpdate({
          appId: APP_ID,
          chunk: CHUNK,
          distance: 8,
          uuid: TEST_UUID_A,
          state: randomBase64ActorState(),
          sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(
        sendSuccessCount,
        SEND_COUNT,
        `All ${SEND_COUNT} sendActorUpdate mutations returned truthy`,
      );

      // 5. Wait for fanout, then check that B received at least one update
      //    with A's uuid.
      await sleep(NOTIFY_WAIT_MS);

      const updatesFromA = receivedByB.actorUpdates.filter(
        (n) => n.uuid === TEST_UUID_A,
      );
      const diagnostics = {
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
      assert.equal(
        sample.__typename,
        'ActorUpdateNotification',
        'Notification has expected __typename',
      );
      assert.ok(sample.distance != null, 'Notification includes distance');
      assert.ok(sample.decayRate != null, 'Notification includes decayRate');
      assert.ok(
        sample.sequenceNumber != null,
        'Notification includes sequenceNumber',
      );
      assert.ok(sample.epochMillis != null, 'Notification includes epochMillis');
    } finally {
      for (const unsub of cleanup) {
        try {
          unsub();
        } catch {
          /* swallow */
        }
      }
      try {
        await clientA.udp.disconnect();
      } catch {
        /* swallow */
      }
      try {
        await clientB.udp.disconnect();
      } catch {
        /* swallow */
      }
      clientA.close();
      clientB.close();
    }
  },
);
