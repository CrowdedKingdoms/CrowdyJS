/**
 * Two-client messaging smoke tests (text chat + client events).
 *
 * Two players register actors in a shared chunk, then player A sends a text-chat
 * packet (and, in a second test, a client event) and player B must receive the
 * corresponding notification via the game-api + UDP-proxy + buddy chain.
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

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
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

/** Provision 2 players, subscribe B with handlers, register both actors in chunk. */
async function setupPair(createCrowdyClient, handlers, chunk) {
  const { appId, clients } = await provisionClients(createCrowdyClient, clientConfig(), 2);
  const [clientA, clientB] = clients;
  const cleanup = [];
  cleanup.push(clientB.udp.subscribe(handlers, appId));
  await sleep(2000);

  const registerBoth = async () => {
    assert.ok(await clientA.udp.sendActorUpdate({
      appId, chunk, distance: 8, uuid: UUID_A, state: 'AA==', sequenceNumber: 1,
    }), 'A registered');
    assert.ok(await clientB.udp.sendActorUpdate({
      appId, chunk, distance: 8, uuid: UUID_B, state: 'AA==', sequenceNumber: 1,
    }), 'B registered');
  };
  await registerBoth();
  await sleep(1000);
  await registerBoth();
  await sleep(1000);

  return { appId, clientA, clientB, clients, cleanup };
}

async function teardown(ctx) {
  for (const unsub of ctx.cleanup) { try { unsub(); } catch { /* swallow */ } }
  for (const c of ctx.clients) {
    try { await c.udp.disconnect(); } catch { /* swallow */ }
    c.close();
  }
}

test(
  'two-client text-chat replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const received = { text: [], genericErrors: [] };
    const chunk = { x: '10', y: '0', z: '0' };
    const ctx = await setupPair(createCrowdyClient, {
      text: (n) => received.text.push(n),
      genericError: (e) => received.genericErrors.push(e),
    }, chunk);
    try {
      const MSG = `chat-from-A-${Math.random().toString(36).slice(2, 10)}`;
      let sent = 0;
      for (let i = 0; i < 5; i++) {
        if (await ctx.clientA.udp.sendTextPacket({
          appId: ctx.appId, chunk, distance: 8, uuid: UUID_A, text: MSG, sequenceNumber: i + 2,
        })) sent++;
        await sleep(200);
      }
      assert.equal(sent, 5, 'All sendTextPacket mutations returned truthy');

      await sleep(NOTIFY_WAIT_MS);
      const fromA = received.text.filter((n) => n.text === MSG);
      const diag = { rx: received.text.length, fromA: fromA.length, errs: received.genericErrors };
      assert.ok(fromA.length > 0, `B should receive A's chat message. diag=${JSON.stringify(diag)}`);
      assert.equal(fromA[0].__typename, 'ClientTextNotification', 'expected ClientTextNotification');
      assert.equal(fromA[0].uuid, UUID_A, 'chat carries sender uuid');
    } finally {
      await teardown(ctx);
    }
  },
);

test(
  'two-client client-event replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const received = { clientEvent: [], genericErrors: [] };
    const chunk = { x: '20', y: '0', z: '0' };
    const EVENT_TYPE = 4242;
    const ctx = await setupPair(createCrowdyClient, {
      clientEvent: (n) => received.clientEvent.push(n),
      genericError: (e) => received.genericErrors.push(e),
    }, chunk);
    try {
      let sent = 0;
      for (let i = 0; i < 5; i++) {
        if (await ctx.clientA.udp.sendClientEvent({
          appId: ctx.appId, chunk, distance: 8, uuid: UUID_A,
          eventType: EVENT_TYPE, state: b64('evt-payload'), sequenceNumber: i + 2,
        })) sent++;
        await sleep(200);
      }
      assert.equal(sent, 5, 'All sendClientEvent mutations returned truthy');

      await sleep(NOTIFY_WAIT_MS);
      const fromA = received.clientEvent.filter((n) => n.uuid === UUID_A && Number(n.eventType) === EVENT_TYPE);
      const diag = { rx: received.clientEvent.length, fromA: fromA.length, errs: received.genericErrors };
      assert.ok(fromA.length > 0, `B should receive A's client event. diag=${JSON.stringify(diag)}`);
      assert.equal(fromA[0].__typename, 'ClientEventNotification', 'expected ClientEventNotification');
    } finally {
      await teardown(ctx);
    }
  },
);
