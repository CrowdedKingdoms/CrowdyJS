/**
 * Actor-to-actor (SINGLE_ACTOR_MESSAGE) targeted-delivery test for a CKS env.
 *
 * Exercises the full SDK -> game-api UDP proxy -> buddy chain for a direct
 * message addressed to one actor: client A sends a single-actor message to
 * client B's UUID; B must receive it and a bystander C (in the same chunk)
 * must NOT. This proves the message is delivered only to the target actor, not
 * fanned out to nearby actors.
 *
 * Auto-skips unless the integration env vars are present, so it is safe in the
 * default `npm test` matrix. Provide three accounts:
 *
 *   CROWDY_MANAGEMENT_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_TEST_APP_ID='1' \
 *   CROWDY_TEST_EMAIL_1='player-a@example.com' CROWDY_TEST_PASSWORD_1='...' \
 *   CROWDY_TEST_EMAIL_2='player-b@example.com' CROWDY_TEST_PASSWORD_2='...' \
 *   CROWDY_TEST_EMAIL_3='player-c@example.com' CROWDY_TEST_PASSWORD_3='...' \
 *   npm test
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
  'CROWDY_TEST_EMAIL_3',
  'CROWDY_TEST_PASSWORD_3',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const APP_ID = process.env.CROWDY_TEST_APP_ID ?? '1';
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '7', y: '1', z: '2' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
const TEST_UUID_C = 'ccccccccddddeeeeffff000011112222';

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
  'single-actor message reaches only the target actor',
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
    const clientC = createCrowdyClient(config);
    const cleanup = [];

    try {
      const authA = await registerOrLogin(
        clientA,
        process.env.CROWDY_TEST_EMAIL_1,
        process.env.CROWDY_TEST_PASSWORD_1,
      );
      assert.ok(authA?.token, 'Client A authenticated');
      const authB = await registerOrLogin(
        clientB,
        process.env.CROWDY_TEST_EMAIL_2,
        process.env.CROWDY_TEST_PASSWORD_2,
      );
      assert.ok(authB?.token, 'Client B authenticated');
      const authC = await registerOrLogin(
        clientC,
        process.env.CROWDY_TEST_EMAIL_3,
        process.env.CROWDY_TEST_PASSWORD_3,
      );
      assert.ok(authC?.token, 'Client C authenticated');

      // B (target) and C (bystander) both subscribe and record single-actor messages.
      const receivedByB = { single: [], errors: [] };
      const receivedByC = { single: [], errors: [] };
      cleanup.push(
        clientB.udp.subscribe({
          singleActorMessage: (n) => receivedByB.single.push(n),
          genericError: (e) => receivedByB.errors.push(e),
        }),
      );
      cleanup.push(
        clientC.udp.subscribe({
          singleActorMessage: (n) => receivedByC.single.push(n),
          genericError: (e) => receivedByC.errors.push(e),
        }),
      );

      await sleep(2000);

      // All three register their actors in the same chunk.
      for (const [client, uuid] of [
        [clientA, TEST_UUID_A],
        [clientB, TEST_UUID_B],
        [clientC, TEST_UUID_C],
      ]) {
        const ok = await client.udp.sendActorUpdate({
          appId: APP_ID,
          chunk: CHUNK,
          distance: 8,
          uuid,
          state: 'AA==',
          sequenceNumber: 1,
        });
        assert.ok(ok, `actor ${uuid} registered`);
      }

      await sleep(1000);

      // A sends a direct message addressed to B's UUID (in B's chunk).
      const payloadText = `a2a-${Date.now()}`;
      const payloadB64 = Buffer.from(payloadText).toString('base64');
      const sent = await clientA.udp.sendSingleActorMessage({
        appId: APP_ID,
        chunk: CHUNK,
        targetUuid: TEST_UUID_B,
        payload: payloadB64,
        sequenceNumber: 2,
      });
      assert.ok(sent, 'sendSingleActorMessage returned truthy');

      await sleep(NOTIFY_WAIT_MS);

      const diagnostics = {
        receivedByB: receivedByB.single.length,
        receivedByC: receivedByC.single.length,
        errorsB: receivedByB.errors,
        errorsC: receivedByC.errors,
      };

      // B (the target) must receive exactly the payload A sent.
      const matchB = receivedByB.single.find((n) => n.payload === payloadB64);
      assert.ok(
        matchB,
        `Client B should receive the single-actor message. diagnostics=${JSON.stringify(diagnostics)}`,
      );
      assert.equal(matchB.__typename, 'SingleActorMessageNotification');
      assert.equal(matchB.uuid, TEST_UUID_B, 'target uuid echoed');
      assert.equal(
        Buffer.from(matchB.payload, 'base64').toString(),
        payloadText,
      );

      // C (a bystander in the same chunk) must NOT receive it.
      const leakedToC = receivedByC.single.find(
        (n) => n.payload === payloadB64,
      );
      assert.ok(
        !leakedToC,
        `Bystander C must NOT receive the single-actor message. diagnostics=${JSON.stringify(diagnostics)}`,
      );
    } finally {
      for (const unsub of cleanup) {
        try {
          unsub();
        } catch {
          /* swallow */
        }
      }
      for (const c of [clientA, clientB, clientC]) {
        try {
          await c.udp.disconnect();
        } catch {
          /* swallow */
        }
        c.close();
      }
    }
  },
);
