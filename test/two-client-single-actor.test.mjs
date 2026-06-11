/**
 * Actor-to-actor (SINGLE_ACTOR_MESSAGE) targeted-delivery test for a CKS env.
 *
 * Exercises the full SDK -> game-api UDP proxy -> buddy chain for a direct
 * message addressed to one actor: client A sends a single-actor message to
 * client B's UUID; B must receive it and a bystander C (in the same chunk)
 * must NOT. This proves the message is delivered only to the target actor.
 *
 * Fully black-box: the app owner, tier, and three players are created/entitled
 * through the management API (see provision.mjs). No database credentials.
 * Auto-skips unless the integration env vars are present:
 *
 *   CROWDY_MANAGEMENT_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' CROWDY_OWNER_PASSWORD='...' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients } from './provision.mjs';

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

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '7', y: '1', z: '2' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
const TEST_UUID_C = 'ccccccccddddeeeeffff000011112222';

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
  'single-actor message reaches only the target actor',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, clientConfig(), 3);
    const [clientA, clientB, clientC] = clients;
    const cleanup = [];

    try {
      // B (target) and C (bystander) both subscribe and record single-actor messages.
      const receivedByB = { single: [], errors: [] };
      const receivedByC = { single: [], errors: [] };
      cleanup.push(clientB.udp.subscribe({
        singleActorMessage: (n) => receivedByB.single.push(n),
        genericError: (e) => receivedByB.errors.push(e),
      }, appId));
      cleanup.push(clientC.udp.subscribe({
        singleActorMessage: (n) => receivedByC.single.push(n),
        genericError: (e) => receivedByC.errors.push(e),
      }, appId));

      await sleep(2000);

      // All three register in the same chunk (register-twice clears the grid
      // lazy-load drop on the first message to a new chunk region).
      const registerAll = async () => {
        for (const [client, uuid] of [
          [clientA, TEST_UUID_A], [clientB, TEST_UUID_B], [clientC, TEST_UUID_C],
        ]) {
          await client.udp.sendActorUpdate({ appId, chunk: CHUNK, distance: 8, uuid, state: 'AA==', sequenceNumber: 1 });
        }
      };
      await registerAll();
      await sleep(1000);
      await registerAll();
      await sleep(1000);

      // A sends a direct message addressed to B's UUID (in B's chunk).
      const payloadText = `a2a-${Date.now()}`;
      const payloadB64 = Buffer.from(payloadText).toString('base64');
      const sent = await clientA.udp.sendSingleActorMessage({
        appId, chunk: CHUNK, targetUuid: TEST_UUID_B, payload: payloadB64, sequenceNumber: 2,
      });
      assert.ok(sent, 'sendSingleActorMessage returned truthy');

      await sleep(NOTIFY_WAIT_MS);

      const diagnostics = {
        appId,
        receivedByB: receivedByB.single.length,
        receivedByC: receivedByC.single.length,
        errorsB: receivedByB.errors,
        errorsC: receivedByC.errors,
      };

      const matchB = receivedByB.single.find((n) => n.payload === payloadB64);
      assert.ok(matchB, `Client B should receive the single-actor message. diagnostics=${JSON.stringify(diagnostics)}`);
      assert.equal(matchB.__typename, 'SingleActorMessageNotification');
      assert.equal(matchB.uuid, TEST_UUID_B, 'target uuid echoed');
      assert.equal(Buffer.from(matchB.payload, 'base64').toString(), payloadText);

      const leakedToC = receivedByC.single.find((n) => n.payload === payloadB64);
      assert.ok(!leakedToC, `Bystander C must NOT receive the single-actor message. diagnostics=${JSON.stringify(diagnostics)}`);
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);
