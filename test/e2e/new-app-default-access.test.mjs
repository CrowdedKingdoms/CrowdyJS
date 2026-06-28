/**
 * New-app open-by-default access e2e.
 *
 * Verifies the business rule that a freshly created app is usable by ANY
 * authenticated player with **no explicit access grant**: createApp provisions a
 * free, open-by-default "Default" tier (full runtime permissions), and on connect
 * the game-api pulls that access from the management API (s2s
 * ensureDefaultAppAccess) and auto-grants it, which replica-syncs the grid
 * permissions. So two players who were only *registered* (never granted) can do
 * spatial replication on the brand-new app.
 *
 * Black-box: the app + its default tier + the players are all created through the
 * public management API; the test never calls grantAppAccess. Point it at an env:
 *
 *   CROWDY_MANAGEMENT_URL='https://api.dev-1.dev.cks-env.com' \
 *   CROWDY_HTTP_URL='https://game.dev-1.dev.cks-env.com/graphql' \
 *   CROWDY_WS_URL='wss://game.dev-1.dev.cks-env.com/graphql' \
 *   CROWDY_OWNER_EMAIL='admin@dev-1.dev.cks-env.com' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionNewAppWithPlayers, mintAppToken } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_MANAGEMENT_URL',
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
// Open-by-default access is granted lazily on first connect, so give it a bit
// longer than the already-entitled flow.
const ACCESS_TIMEOUT_MS = Number(process.env.CROWDY_TEST_SYNC_TIMEOUT_MS ?? 25000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clientConfig() {
  return {
    managementUrl: process.env.CROWDY_MANAGEMENT_URL,
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: { retryAttempts: 4, retryInitialDelayMs: 250, retryMaxDelayMs: 2000, waitTimeoutMs: 5000 },
  };
}

function randomBase64ActorState(byteCount = 96) {
  const buf = new Uint8Array(byteCount);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

test(
  'a brand-new app is usable via the open-by-default tier with no explicit grant',
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');

    // 1. Owner creates a NEW app (auto-gets the free open-by-default tier). Two
    //    players are registered but NEVER granted access.
    const { appId, players } = await provisionNewAppWithPlayers(2);

    const clientA = createCrowdyClient(clientConfig());
    const clientB = createCrowdyClient(clientConfig());
    // Open-by-default: minting an app token for an ungranted player auto-grants
    // the free default tier (no explicit grantAppAccess) — the rule under test.
    clientA.setToken(await mintAppToken(appId, players[0].token));
    clientB.setToken(await mintAppToken(appId, players[1].token));
    const cleanup = [];

    try {
      // 2. Connect each player. With no explicit grant, access must be granted
      //    automatically server-side (game-api -> s2s ensureDefaultAppAccess ->
      //    free default tier -> replica-synced grid permissions).
      //    gameClientBootstrap throws FORBIDDEN until that lands, so a successful
      //    call is precise proof the open-by-default rule entitled the player.
      const deadline = Date.now() + ACCESS_TIMEOUT_MS;
      for (const [i, c] of [clientA, clientB].entries()) {
        let lastErr = new Error('not attempted');
        while (Date.now() < deadline) {
          try {
            await c.serverStatus.gameClientBootstrap(appId);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            await sleep(300);
          }
        }
        assert.equal(
          lastErr,
          null,
          `open-by-default access never landed for player ${i} on new app ${appId}: ${lastErr?.message ?? lastErr}`,
        );
      }

      // 3. Subscribe B, register both actors in the same chunk, then A bursts
      //    updates and B must receive them — full spatial loop on the new app.
      const receivedByB = { actorUpdates: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe(
          {
            actorUpdate: (n) => receivedByB.actorUpdates.push(n),
            genericError: (e) => receivedByB.genericErrors.push(e),
          },
          appId,
        ),
      );
      await sleep(2000);

      const registerBoth = async () => {
        assert.ok(
          await clientA.udp.sendActorUpdate({ appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1 }),
          'Client A registered in chunk',
        );
        assert.ok(
          await clientB.udp.sendActorUpdate({ appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1 }),
          'Client B registered in chunk',
        );
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      let sendSuccessCount = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A, state: randomBase64ActorState(), sequenceNumber: i + 2,
        });
        if (ok) sendSuccessCount++;
        await sleep(200);
      }
      assert.equal(sendSuccessCount, SEND_COUNT, `all ${SEND_COUNT} sends succeeded on the new app`);

      await sleep(NOTIFY_WAIT_MS);

      const updatesFromA = receivedByB.actorUpdates.filter((n) => n.uuid === TEST_UUID_A);
      assert.ok(
        updatesFromA.length > 0,
        `Client B should receive A's updates on the new app purely via open-by-default access (no grant). diagnostics=${JSON.stringify(
          { appId, sent: sendSuccessCount, receivedByB: receivedByB.actorUpdates.length, updatesFromA: updatesFromA.length, genericErrors: receivedByB.genericErrors },
        )}`,
      );
      assert.equal(updatesFromA[0].__typename, 'ActorUpdateNotification');
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
