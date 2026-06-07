/**
 * Two-client messaging smoke tests (text chat + client events).
 *
 * Companion to two-client-actor / two-client-voxel: two players register actors
 * in a shared chunk, then player A sends a text-chat packet (and, in a second
 * test, a client event) and player B must receive the corresponding
 * notification via the game-api + UDP-proxy + Buddy chain (cross-server when the
 * two proxy sessions land on different Buddies).
 *
 * Auto-skips unless the integration env vars are present (same set as the other
 * two-client tests). Run via `npm test` with the CROWDY_* + *_DB_PASSWORD env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { entitleUserForApp } from './entitle.mjs';

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
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
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

/**
 * Provision two players, subscribe B with the given handlers, and register both
 * actors in `chunk` (double-register to clear the grid lazy-load drop).
 */
async function connectPair(createCrowdyClient, handlers, chunk) {
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

  const authA = await registerOrLogin(
    clientA, process.env.CROWDY_TEST_EMAIL_1, process.env.CROWDY_TEST_PASSWORD_1);
  assert.ok(authA?.token, 'Client A authenticated');
  const authB = await registerOrLogin(
    clientB, process.env.CROWDY_TEST_EMAIL_2, process.env.CROWDY_TEST_PASSWORD_2);
  assert.ok(authB?.token, 'Client B authenticated');

  await entitleUserForApp(APP_ID, authA.user.userId);
  await entitleUserForApp(APP_ID, authB.user.userId);

  cleanup.push(clientB.udp.subscribe(handlers));
  await sleep(2000);

  const registerBoth = async () => {
    assert.ok(await clientA.udp.sendActorUpdate({
      appId: APP_ID, chunk, distance: 8, uuid: UUID_A, state: 'AA==', sequenceNumber: 1,
    }), 'A registered');
    assert.ok(await clientB.udp.sendActorUpdate({
      appId: APP_ID, chunk, distance: 8, uuid: UUID_B, state: 'AA==', sequenceNumber: 1,
    }), 'B registered');
  };
  await registerBoth();
  await sleep(1000);
  await registerBoth();
  await sleep(1000);

  return { clientA, clientB, cleanup };
}

async function teardown(ctx) {
  for (const unsub of ctx.cleanup) {
    try { unsub(); } catch { /* swallow */ }
  }
  try { await ctx.clientA.udp.disconnect(); } catch { /* swallow */ }
  try { await ctx.clientB.udp.disconnect(); } catch { /* swallow */ }
  ctx.clientA.close();
  ctx.clientB.close();
}

test(
  'two-client text-chat replication against a deployed env',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../dist/index.js');
    const received = { text: [], genericErrors: [] };
    const chunk = { x: '10', y: '0', z: '0' };
    const ctx = await connectPair(
      createCrowdyClient,
      {
        text: (n) => received.text.push(n),
        genericError: (e) => received.genericErrors.push(e),
      },
      chunk,
    );
    try {
      const MSG = `chat-from-A-${Math.random().toString(36).slice(2, 10)}`;
      let sent = 0;
      for (let i = 0; i < 5; i++) {
        if (await ctx.clientA.udp.sendTextPacket({
          appId: APP_ID, chunk, distance: 8, uuid: UUID_A, text: MSG, sequenceNumber: i + 2,
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
    const { createCrowdyClient } = await import('../dist/index.js');
    const received = { clientEvent: [], genericErrors: [] };
    const chunk = { x: '20', y: '0', z: '0' };
    const EVENT_TYPE = 4242;
    const ctx = await connectPair(
      createCrowdyClient,
      {
        clientEvent: (n) => received.clientEvent.push(n),
        genericError: (e) => received.genericErrors.push(e),
      },
      chunk,
    );
    try {
      let sent = 0;
      for (let i = 0; i < 5; i++) {
        if (await ctx.clientA.udp.sendClientEvent({
          appId: APP_ID, chunk, distance: 8, uuid: UUID_A,
          eventType: EVENT_TYPE, state: b64('evt-payload'), sequenceNumber: i + 2,
        })) sent++;
        await sleep(200);
      }
      assert.equal(sent, 5, 'All sendClientEvent mutations returned truthy');

      await sleep(NOTIFY_WAIT_MS);
      const fromA = received.clientEvent.filter(
        (n) => n.uuid === UUID_A && Number(n.eventType) === EVENT_TYPE,
      );
      const diag = { rx: received.clientEvent.length, fromA: fromA.length, errs: received.genericErrors };
      assert.ok(fromA.length > 0, `B should receive A's client event. diag=${JSON.stringify(diag)}`);
      assert.equal(fromA[0].__typename, 'ClientEventNotification', 'expected ClientEventNotification');
    } finally {
      await teardown(ctx);
    }
  },
);
