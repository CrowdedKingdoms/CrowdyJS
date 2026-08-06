/**
 * Cross-app fence regression test.
 *
 * App-scoped tokens + a per-subscription appId fence the realtime fan-out. A
 * single UDP proxy socket/Subject is shared by every subscription on a token, so
 * without a fence a client "in" app A could receive app B's spatial fan-out. Now
 * every udpNotifications subscription must declare its appId (app-agnostic
 * subscriptions are rejected with APP_ID_REQUIRED), and a token minted for app A
 * cannot subscribe to app B, so cross-app delivery is impossible.
 *
 * This exercises the deployed game-api + UDP-proxy chain black-box (provisioning
 * is entirely through the management API -- see provision.mjs). player[0]'s ONE
 * token is shared by three clients, mirroring a single user opening the world in
 * several tabs/apps:
 *
 *   clientApp  -> subscribe(appId)          -> receives the app's fan-out
 *   clientOther-> subscribe(OTHER_APP_ID)   -> sees nothing (fenced)
 *   clientNone -> subscribe() with NO appId -> rejected (APP_ID_REQUIRED)
 *
 * player[1] is a separate peer (its own token) that registers an actor in the
 * same chunk and sends the updates. The game server excludes a sender from its
 * own fan-out, so the positive control needs a distinct peer to receive from.
 *
 * Auto-skips unless the integration env is set (same vars as the other
 * two-client suites).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionAppWithPlayers, mintAppToken } from '../provision.mjs';

// CrowdyJS realtime depends on a global `WebSocket`; node doesn't have one.
globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
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
// clientApp's own actor, registered so it is an in-range recipient.
const OBSERVER_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
// The peer (player[1]) that sends; clientApp must receive these.
const SENDER_UUID = 'ddddddddccccbbbbaaaaeeeeeeeeeeee';

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
    const { createCrowdyClient } = await import('../../dist/index.js');

    // Two entitled players. player[0]'s single token is shared by the three
    // observer clients (the cross-app reuse scenario); player[1] is the peer
    // that actually sends, since a sender never receives its own fan-out.
    const { appId, players } = await provisionAppWithPlayers(2);
    await sleep(SYNC_WAIT_MS);
    // Gameplay needs APP-scoped tokens. player[0]'s ONE app token (for `appId`) is
    // shared by the three observer clients; an app-scoped token can only subscribe
    // to its own app, so the OTHER_APP_ID subscription is fenced/rejected, not fed.
    const token = await mintAppToken(appId, players[0].token);
    const senderToken = await mintAppToken(appId, players[1].token);
    // An app the observers are NOT scoped to; its subscription is still opened
    // but must not receive `appId`'s spatial traffic.
    const OTHER_APP_ID = String(BigInt(appId) + 7919n);

    const clientApp = createCrowdyClient(clientConfig());
    const clientOther = createCrowdyClient(clientConfig());
    const clientNone = createCrowdyClient(clientConfig());
    for (const c of [clientApp, clientOther, clientNone]) c.setToken(token);
    const clientSender = createCrowdyClient(clientConfig());
    clientSender.setToken(senderToken);

    const recvApp = [];
    const recvOther = [];
    const recvNone = [];
    const connNone = [];
    const cleanup = [];

    // clientApp registers an actor so its (player[0]) session is an in-range
    // recipient; the peer (player[1]) registers + sends. Defined here so we can
    // pre-open both sessions before the subscriptions attach.
    const register = async () => {
      await clientApp.udp.sendActorUpdate({
        appId, chunk: CHUNK, distance: 8, uuid: OBSERVER_UUID, state: 'AA==', sequenceNumber: 1,
      });
      await clientSender.udp.sendActorUpdate({
        appId, chunk: CHUNK, distance: 8, uuid: SENDER_UUID, state: 'AA==', sequenceNumber: 1,
      });
    };

    try {
      // Pre-open both UDP proxy sessions with one connect each BEFORE attaching
      // subscriptions. connect() is idempotent but only stores the session after
      // an async server-selection + socket bind, so letting the three
      // subscriptions on player[0]'s token race to create it would orphan the
      // first subscriber's stream. Opening each session once up front makes every
      // later subscribe reuse the one session.
      await register();
      await sleep(800);

      cleanup.push(
        clientApp.udp.subscribe({ actorUpdate: (n) => recvApp.push(n), genericError: () => {} }, appId),
      );
      cleanup.push(
        clientOther.udp.subscribe({ actorUpdate: (n) => recvOther.push(n), genericError: () => {} }, OTHER_APP_ID),
      );
      // No appId on purpose -- the game-api must reject this subscription.
      cleanup.push(
        clientNone.udp.subscribe({
          actorUpdate: (n) => recvNone.push(n),
          connectionEvent: (e) => connNone.push(e),
          error: () => {},
        }),
      );

      await sleep(2000); // let the WS subscriptions open

      // Warm the grid-permission window (the first message to a new chunk is
      // dropped while it loads) by re-registering both actors, then send a burst
      // from the peer.
      await register();
      await sleep(1000);
      await register();
      await sleep(800);

      recvApp.length = 0;
      recvOther.length = 0;
      recvNone.length = 0;

      let sent = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientSender.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: SENDER_UUID,
          state: randomBase64ActorState(), sequenceNumber: i + 2,
        });
        if (ok) sent++;
        await sleep(200);
      }
      assert.equal(sent, SEND_COUNT, `all ${SEND_COUNT} sends returned truthy`);

      await sleep(NOTIFY_WAIT_MS);

      const recvByApp = recvApp.filter((n) => n.uuid === SENDER_UUID);
      const leakToOther = recvOther.filter(
        (n) => n.uuid === SENDER_UUID || String(n.appId) === String(appId),
      );
      const rejectedNone = connNone.some((e) => e.code === 'APP_ID_REQUIRED');

      const diagnostics = {
        appId, otherAppId: OTHER_APP_ID, sent,
        recvByApp: recvByApp.length, leakToOther: leakToOther.length,
        recvNone: recvNone.length, connNoneCodes: connNone.map((e) => e.code).slice(0, 3),
      };

      // Positive control: the app-scoped client receives the peer's app stream.
      assert.ok(recvByApp.length > 0, `app-scoped client should receive the peer's updates. ${JSON.stringify(diagnostics)}`);
      // The fence: a subscription scoped to a different app (same token) gets none of it.
      assert.equal(leakToOther.length, 0, `cross-app leak to OTHER app subscription. ${JSON.stringify(diagnostics)}`);
      // Breaking change: an app-agnostic subscription is rejected and gets no data.
      assert.equal(recvNone.length, 0, `app-agnostic subscription received spatial data. ${JSON.stringify(diagnostics)}`);
      assert.ok(rejectedNone, `app-agnostic subscription should be rejected with APP_ID_REQUIRED. ${JSON.stringify(diagnostics)}`);
    } finally {
      for (const unsub of cleanup) {
        try { unsub(); } catch { /* swallow */ }
      }
      for (const c of [clientApp, clientOther, clientNone, clientSender]) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        try { c.close(); } catch { /* swallow */ }
      }
    }
  },
);
