/**
 * New-app grid creation e2e — regression guard for the June 2026 grid bug.
 *
 * A normally-provisioned app's open-by-default world grid must come with a
 * matching `app_grid_assignments` row (game-api replica-sync `ensureDefaultGrid`),
 * and `createGrid` must let a studio nest a narrower grid INSIDE that world grid.
 * Before the fix, createGrid returned NO_MATCHING_GRID_ASSIGNMENT (no assignment
 * existed) and then GRID_OVERLAPS_EXISTING (the overlap check treated the world
 * grid as a conflict) for every normally-provisioned app — so studios could not
 * create any grid. This guards both halves, plus that a true peer overlap is
 * still rejected.
 *
 * The world grid + its assignment are provisioned server-side the first time a
 * client touches the app over UDP (ensureAppEntitlementsForUdp -> ensureDefaultGrid),
 * NOT on createApp. So the test registers a player, connects + sends one actor
 * update to drive that provisioning, then the owner (app admin) creates a grid.
 *
 * Black-box: app + player created through the public management API. Point at an env:
 *   CROWDY_HTTP_URL='https://api.dev-2.dev.cks-env.com' \
 *   CROWDY_HTTP_URL='https://game.dev-2.dev.cks-env.com/graphql' \
 *   CROWDY_WS_URL='wss://game.dev-2.dev.cks-env.com/graphql' \
 *   CROWDY_OWNER_EMAIL='admin@dev-2.dev.cks-env.com' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { provisionNewAppWithPlayers, mintAppToken } from '../provision.mjs';

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

// Open-by-default provisioning + the assignment land lazily on first UDP touch.
const PROVISION_TIMEOUT_MS = Number(process.env.CROWDY_TEST_SYNC_TIMEOUT_MS ?? 25000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (x, y, z) => ({ x: String(x), y: String(y), z: String(z) });
const TEST_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';

function clientConfig() {
  return {
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: { retryAttempts: 4, retryInitialDelayMs: 250, retryMaxDelayMs: 2000, waitTimeoutMs: 5000 },
  };
}

test(
  'a normally-provisioned app can create a grid nested in its world grid; peer overlaps are rejected',
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');

    // 1. Owner creates a NEW app + one registered player (no explicit grant).
    const { appId, owner, players } = await provisionNewAppWithPlayers(1);

    const player = createCrowdyClient(clientConfig());
    // Gameplay (gameClientBootstrap + UDP) needs an APP-scoped token; the identity
    // session token is rejected. Minting for the open-by-default app auto-grants
    // the free default tier, just like the first-UDP-touch path it stands in for.
    const playerAppToken = await mintAppToken(appId, players[0].token);
    player.setToken(playerAppToken);
    const owner_ = createCrowdyClient(clientConfig());
    // createGrid is a game-api grid op that requires an app-scoped token (a studio
    // admin may mint one for their own app); the identity session token is rejected
    // (SCOPE_MISSING). Mint the owner an app token for this app.
    const ownerAppToken = await mintAppToken(appId, owner.token);
    owner_.setToken(ownerAppToken);
    const cleanup = [];

    try {
      // 2. Drive server-side open-by-default provisioning: the player connects and
      //    sends actor updates over UDP, which runs ensureAppEntitlementsForUdp ->
      //    ensureDefaultGrid (creating the world grid AND its app_grid_assignments
      //    row). gameClientBootstrap succeeding is the access-landed signal.
      const deadline = Date.now() + PROVISION_TIMEOUT_MS;
      let lastErr = new Error('not attempted');
      while (Date.now() < deadline) {
        try {
          await player.serverStatus.gameClientBootstrap(appId);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await sleep(300);
        }
      }
      assert.equal(lastErr, null, `open-by-default access never landed for the player on app ${appId}: ${lastErr?.message ?? lastErr}`);

      cleanup.push(player.udp.subscribe({ actorUpdate() {}, genericError() {} }, appId));
      for (let i = 0; i < 3; i++) {
        await player.udp.sendActorUpdate({ appId, chunk: chunk(0, 0, 0), distance: 8, uuid: TEST_UUID, state: 'AA==', sequenceNumber: i + 1 });
        await sleep(500);
      }

      // 3. Owner createGrid nested inside the world grid (the reported scenario).
      //    Poll while the assignment finishes landing: NO_MATCHING_GRID_ASSIGNMENT
      //    means "not provisioned yet", retry; any other result is terminal.
      const gridDeadline = Date.now() + PROVISION_TIMEOUT_MS;
      let created = null;
      let last = null;
      while (Date.now() < gridDeadline) {
        const res = await owner_.admin.grids.createGrid({
          appId,
          corner1: chunk(100, 0, 100),
          corner2: chunk(110, 0, 110),
        });
        last = res;
        if (res.error !== 'NO_MATCHING_GRID_ASSIGNMENT') {
          created = res;
          break;
        }
        await sleep(500);
      }
      assert.ok(
        created,
        `createGrid never got past NO_MATCHING_GRID_ASSIGNMENT within ${PROVISION_TIMEOUT_MS}ms — the world grid's app_grid_assignments row was never created (last=${JSON.stringify(last)})`,
      );
      assert.equal(
        created.error,
        'NO_ERROR',
        `nested grid creation should succeed (got ${created.error})`,
      );
      assert.ok(created.grid, 'created grid payload should be populated');

      // 4. A true peer/partial overlap with the grid we just made must still be
      //    rejected — the fix only relaxes nesting inside a containing parent grid.
      const overlap = await owner_.admin.grids.createGrid({
        appId,
        corner1: chunk(105, 0, 105),
        corner2: chunk(115, 0, 115),
      });
      assert.equal(
        overlap.error,
        'GRID_OVERLAPS_EXISTING',
        `a peer-overlapping grid must be rejected (got ${overlap.error})`,
      );
      assert.equal(overlap.grid, null, 'rejected overlap must not return a grid');
    } finally {
      for (const unsub of cleanup) {
        try { unsub(); } catch { /* swallow */ }
      }
      try { await player.udp.disconnect(); } catch { /* swallow */ }
      player.close();
      owner_.close();
    }
  },
);
