/**
 * Cross-app fence regression test.
 *
 * A game token is app-agnostic and a single UDP proxy socket/Subject is shared
 * by every subscription on that token, so a token reused across apps used to
 * cross-deliver: a client "in" app A received app B's spatial fan-out. The fix
 * requires every udpNotifications subscription to declare its appId and filters
 * delivery by it; app-agnostic subscriptions are rejected.
 *
 * This exercises the deployed game-api + UDP-proxy chain black-box (provisioning
 * is entirely through the management API — see provision.mjs). One entitled
 * player's single token is shared by three clients:
 *
 *   clientApp  -> subscribe(appId)        + sends actor updates -> sees its own
 *   clientOther-> subscribe(OTHER_APP_ID) (never sends)         -> sees nothing
 *   clientNone -> subscribe() with NO appId                     -> rejected
 *
 * Auto-skips unless the integration env is set (same vars as the other
 * two-client suites).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionAppWithPlayers } from './provision.mjs';

// CrowdyJS realtime depends on a global `WebSocket`; node doesn't have one.
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
const SYNC_WAIT_MS = Number(process.env.CROWDY_TEST_SYNC_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';

function randomBase64ActorState(byteCount = 96) {
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
    realtime: {
      retryAttempts: 4,
      retryInitialDelayMs: 250,
      retryMaxDelayMs: 2000,
      waitTimeoutMs: 5000,
    },
  };
}

test(
  'udpNotifications is fenced by appId and rejects app-agnostic subscriptions',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../dist/index.js');

    // One app + one entitled player; all three clients share the ONE token,
    // mirroring a single user opening the world in several tabs/apps.
    const { appId, players } = await provisionAppWithPlayers(1);
    await sleep(SYNC_WAIT_MS);
    const token = players[0].token;
    // An app the player is NOT operating in (subscription is still accepted,
    // but must not receive `appId`'s spatial traffic).
    const OTHER_APP_ID = String(BigInt(appId) + 7919n);

    const clientApp = createCrowdyClient(clientConfig());
    const clientOther = createCrowdyClient(clientConfig());
    const clientNone = createCrowdyClient(clientConfig());
    for (const c of [clientApp, clientOther, clientNone]) c.setToken(token);

    const recvApp = [];
    const recvOther = [];
    const recvNone = [];
    const connNone = [];
    const cleanup = [];

    try {
      cleanup.push(
        clientApp.udp.subscribe({ actorUpdate: (n) => recvApp.push(n), genericError: () => {} }, appId),
      );
      cleanup.push(
        clientOther.udp.subscribe({ actorUpdate: (n) => recvOther.push(n), genericError: () => {} }, OTHER_APP_ID),
      );
      // No appId on purpose — the game-api must reject this subscription.
      cleanup.push(
        clientNone.udp.subscribe({
          actorUpdate: (n) => recvNone.push(n),
          connectionEvent: (e) => connNone.push(e),
          error: () => {},
        }),
      );

      await sleep(2000); // let the WS subscriptions open

      // Register + warm the grid-permission window (first message to a new chunk
      // is dropped while it loads), then send a burst as the app-scoped client.
      const register = async () => {
        await clientApp.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID, state: 'AA==', sequenceNumber: 1,
        });
      };
      await register();
      await sleep(1000);
      await register();
      await sleep(800);

      recvApp.length = 0;
      recvOther.length = 0;
      recvNone.length = 0;

      let sent = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientApp.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID,
          state: randomBase64ActorState(), sequenceNumber: i + 2,
        });
        if (ok) sent++;
        await sleep(200);
      }
      assert.equal(sent, SEND_COUNT, `all ${SEND_COUNT} sends returned truthy`);

      await sleep(NOTIFY_WAIT_MS);

      const ownByApp = recvApp.filter((n) => n.uuid === TEST_UUID);
      const leakToOther = recvOther.filter(
        (n) => n.uuid === TEST_UUID || String(n.appId) === String(appId),
      );
      const rejectedNone = connNone.some((e) => e.code === 'APP_ID_REQUIRED');

      const diagnostics = {
        appId, otherAppId: OTHER_APP_ID, sent,
        ownByApp: ownByApp.length, leakToOther: leakToOther.length,
        recvNone: recvNone.length, connNoneCodes: connNone.map((e) => e.code).slice(0, 3),
      };

      // Positive control: the app-scoped client receives its own app's stream.
      assert.ok(ownByApp.length > 0, `app-scoped client should receive its own updates. ${JSON.stringify(diagnostics)}`);
      // The fence: a subscription scoped to a different app gets none of it.
      assert.equal(leakToOther.length, 0, `cross-app leak to OTHER app subscription. ${JSON.stringify(diagnostics)}`);
      // Breaking change: an app-agnostic subscription is rejected and gets no data.
      assert.equal(recvNone.length, 0, `app-agnostic subscription received spatial data. ${JSON.stringify(diagnostics)}`);
      assert.ok(rejectedNone, `app-agnostic subscription should be rejected with APP_ID_REQUIRED. ${JSON.stringify(diagnostics)}`);
    } finally {
      for (const unsub of cleanup) {
        try { unsub(); } catch { /* swallow */ }
      }
      for (const c of [clientApp, clientOther, clientNone]) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        try { c.close(); } catch { /* swallow */ }
      }
    }
  },
);
