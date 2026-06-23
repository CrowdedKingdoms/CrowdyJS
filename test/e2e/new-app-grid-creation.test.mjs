/**
 * New-app grid creation e2e — regression guard for the June 2026 grid bug.
 *
 * A freshly created app's open-by-default world grid must come with a matching
 * `app_grid_assignments` row (game-api replica-sync `ensureDefaultGrid`), and
 * `createGrid` must let a studio nest a narrower grid INSIDE that world grid.
 * Before the fix, createGrid returned NO_MATCHING_GRID_ASSIGNMENT (no assignment
 * existed) and then GRID_OVERLAPS_EXISTING (the overlap check treated the world
 * grid as a conflict) for every normally-provisioned app — so studios could not
 * create any grid. This guards both halves, plus that a true peer overlap is
 * still rejected.
 *
 * Black-box: the app is created through the public management API; the owner
 * (an app admin with `manage_apps`) drives `createGrid` against the game-api.
 * Point it at an env:
 *
 *   CROWDY_MANAGEMENT_URL='https://api.dev-2.dev.cks-env.com' \
 *   CROWDY_HTTP_URL='https://game.dev-2.dev.cks-env.com/graphql' \
 *   CROWDY_WS_URL='wss://game.dev-2.dev.cks-env.com/graphql' \
 *   CROWDY_OWNER_EMAIL='admin@dev-2.dev.cks-env.com' CROWDY_OWNER_PASSWORD='...' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { provisionNewAppWithPlayers } from '../provision.mjs';

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

// The world grid + its assignment are created asynchronously by replica-sync
// after createApp, so give it time to land before giving up.
const ASSIGNMENT_TIMEOUT_MS = Number(process.env.CROWDY_TEST_SYNC_TIMEOUT_MS ?? 25000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (x, y, z) => ({ x: String(x), y: String(y), z: String(z) });

function clientConfig() {
  return {
    managementUrl: process.env.CROWDY_MANAGEMENT_URL,
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: { retryAttempts: 4, retryInitialDelayMs: 250, retryMaxDelayMs: 2000, waitTimeoutMs: 5000 },
  };
}

test(
  'a new app can create a grid nested in its open-by-default world grid; peer overlaps are rejected',
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');

    // 1. Owner creates a NEW app. createApp provisions the open default tier; the
    //    `apps` replica-notify drives game-api ensureDefaultGrid, which creates
    //    the world grid AND its matching app_grid_assignments row.
    const { appId, owner } = await provisionNewAppWithPlayers(0);

    const client = createCrowdyClient(clientConfig());
    client.setToken(owner.token);

    try {
      // 2. Create a grid nested inside the world grid (the reported scenario).
      //    The assignment lands asynchronously, so poll: NO_MATCHING_GRID_ASSIGNMENT
      //    means "replica-sync hasn't created it yet", retry; any other result is
      //    terminal (and stops us re-creating the same box).
      const deadline = Date.now() + ASSIGNMENT_TIMEOUT_MS;
      let created = null;
      let last = null;
      while (Date.now() < deadline) {
        const res = await client.admin.grids.createGrid({
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
        `createGrid never got past NO_MATCHING_GRID_ASSIGNMENT within ${ASSIGNMENT_TIMEOUT_MS}ms — the world grid's app_grid_assignments row was never created (last=${JSON.stringify(last)})`,
      );
      assert.equal(
        created.error,
        'NO_ERROR',
        `nested grid creation should succeed on a brand-new app (got ${created.error})`,
      );
      assert.ok(created.grid, 'created grid payload should be populated');

      // 3. A true peer/partial overlap with the grid we just made must still be
      //    rejected — the fix only relaxes nesting inside a containing parent grid.
      const overlap = await client.admin.grids.createGrid({
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
      client.close();
    }
  },
);
