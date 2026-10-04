/**
 * Open grids and the ck-exec gateway, against a tier, as a THROWAWAY org admin: this suite
 * registers its own owner, org and app, and a second account as the player, so it needs no
 * credential of anyone's and never signs in as an existing account.
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com CROWDY_E2E_THROWAWAY_OWNER=1 \
 *   node --test test/e2e/open-grid-and-exec-gateway.test.mjs
 *
 * It registers two accounts per run and leaves an org behind (orgs are not deleted; the app is
 * archived), so it runs only when asked to.
 *
 * 1. Open grids (cks-game-api #436): the owner opens a grid nested in the world grid, reads its
 *    open keys back, sees the player get them, has a player-code key refused, and closes it.
 * 2. The gateway `execConnect` names passes `execGatewayRefusal`, a connection to it works, and
 *    a tampered connect token is `Denied` with the gateway's reason (ck-exec 0.10.0+, Node `ws`).
 *    Skipped where the tier has no ck-exec.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { entryClientConfig, gameClientConfig, sleep } from '../helpers.mjs';

const skip =
  !process.env.CROWDY_HTTP_URL || process.env.CROWDY_E2E_THROWAWAY_OWNER !== '1'
    ? 'set CROWDY_HTTP_URL and CROWDY_E2E_THROWAWAY_OWNER=1 (registers throwaway accounts)'
    : undefined;

const rid = () => randomBytes(4).toString('hex');
const chunk = (x, y, z) => ({ x: String(x), y: String(y), z: String(z) });

/** PLATFORM_BUSY is the tier asking for a moment; anything else is the answer. */
async function patiently(work, attempts = 6) {
  for (let i = 1; ; i++) {
    try {
      return await work();
    } catch (error) {
      if (error?.code !== 'PLATFORM_BUSY' || i >= attempts) throw error;
      await sleep(500 * i);
    }
  }
}

let world = null;

/** One throwaway owner, org and app (and player) for both tests: sign-up is rate-limited. */
async function throwawayWorld() {
  if (world) return world;
  const { createCrowdyClient } = await import('../../dist/index.js');
  const account = async (kind) => {
    const client = createCrowdyClient(entryClientConfig());
    const email = `crowdy-e2e-${kind}-${rid()}@test.invalid`;
    const password = `Aa1!e2e-${rid()}${rid()}`;
    const session = await patiently(() => client.auth.register({ email, password }));
    return { client, userId: String(session.user.userId) };
  };
  const owner = await account('owner');
  const tag = rid();
  const org = await owner.client.organizations.create({ name: `e2e open grids ${tag}`, slug: `e2e-open-grids-${tag}` });
  const placeable = await owner.client.apps.placeableDatacenters();
  const datacenter = placeable.datacenters.find((d) => d.placeable)?.code;
  assert.ok(datacenter, 'the tier can place an app');
  const app = await owner.client.apps.create({
    orgId: String(org.orgId),
    name: `e2e-open-grids-${tag}`,
    slug: `e2e-open-grids-${tag}`,
    datacenter,
  });
  const appId = String(app.appId);
  const game = async (who) => {
    const access = await patiently(() => who.client.portal.mintAppToken(appId));
    const client = createCrowdyClient(gameClientConfig(access));
    client.setToken(access.token);
    return { client, access };
  };
  const ownerGame = await game(owner);
  const player = await account('player');
  const playerGame = await game(player);
  world = { appId, owner, ownerGame, player, playerGame };
  return world;
}

test.after(async () => {
  if (!world) return;
  try {
    await world.owner.client.apps.archive(world.appId);
  } catch (error) {
    console.warn(`[e2e] could not archive app ${world.appId}: ${error?.message ?? error}`);
  }
  for (const c of [world.owner.client, world.ownerGame.client, world.player.client, world.playerGame.client]) c.close();
});

/** Polls `read` until `ok` holds of its answer, and returns the last answer. */
async function until(read, ok, ms = 30_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await read();
    if (ok(last)) return last;
    await sleep(500);
  }
  return last;
}

test('an org admin opens a grid to every player, reads it back and closes it', { skip, timeout: 180_000 }, async (t) => {
  const { appId, ownerGame, player, playerGame } = await throwawayWorld();
  const grids = ownerGame.client.gameApps;

  // The world grid and its assignment land on the app's first gameplay touch.
  await until(
    () => playerGame.client.serverStatus.gameClientBootstrap(appId).then(() => true, () => false),
    Boolean,
  );
  const x = 200 + Math.floor(Math.random() * 1000);
  const created = await until(
    () => grids.createGrid({ appId, corner1: chunk(x, 0, x), corner2: chunk(x + 3, 0, x + 3) }),
    (r) => r.error !== 'NO_MATCHING_GRID_ASSIGNMENT',
  );
  assert.equal(created.error, 'NO_ERROR', JSON.stringify(created));
  const gridId = String(created.grid.grid_id);
  t.diagnostic(`app ${appId}, grid ${gridId}, player ${player.userId}`);

  assert.deepEqual((await grids.openPermissions(appId, gridId)).permissionKeys, [], 'a new grid is not open');
  const opened = await grids.setOpenPermissions({ appId, gridId, permissionKeys: ['update_voxel_data', 'access'] });
  assert.equal(String(opened.gridId), gridId);
  assert.deepEqual(opened.permissionKeys, ['access', 'update_voxel_data']);
  assert.deepEqual((await grids.openPermissions(appId, gridId)).permissionKeys, ['access', 'update_voxel_data']);

  // Every player with access holds them on the grid, without a grant of their own.
  const held = await until(
    () => grids.userPermissions(appId, gridId, player.userId),
    (p) => ['access', 'update_voxel_data'].every((k) => p.permissionKeys.includes(k)),
  );
  assert.ok(held.permissionKeys.includes('update_voxel_data'), JSON.stringify(held));

  await assert.rejects(
    grids.setOpenPermissions({ appId, gridId, permissionKeys: ['write_server_code'] }),
    (e) => e.code === 'BAD_REQUEST' && /player-code keys/.test(e.message),
  );
  assert.deepEqual((await grids.openPermissions(appId, gridId)).permissionKeys, ['access', 'update_voxel_data'], 'a refusal changes nothing');

  const closed = await grids.setOpenPermissions({ appId, gridId, permissionKeys: [] });
  assert.deepEqual(closed.permissionKeys, []);
  const after = await until(
    () => grids.userPermissions(appId, gridId, player.userId),
    (p) => !p.permissionKeys.includes('update_voxel_data'),
  );
  assert.ok(!after.permissionKeys.includes('update_voxel_data'), JSON.stringify(after));
});

test('the tier\'s gateway passes the pin, and refuses a tampered connect token as Denied', { skip, timeout: 120_000 }, async (t) => {
  const { ExecConnection, execGatewayRefusal } = await import('../../dist/index.js');
  const { appId, playerGame } = await throwawayWorld();
  const { exec } = playerGame.client;
  let endpoint;
  try {
    endpoint = await exec.endpoint(appId);
  } catch (error) {
    if (/not configured on this tier|Cannot query field/.test(error?.message ?? '')) {
      t.skip(`no ck-exec here: ${error.message}`);
      return;
    }
    throw error;
  }
  assert.equal(execGatewayRefusal(playerGame.client.graphql.endpoint, endpoint.gatewayUrl), null, endpoint.gatewayUrl);
  assert.match(endpoint.gatewayUrl, /^wss:\/\//);
  t.diagnostic(`game API ${playerGame.client.graphql.endpoint}, gateway ${endpoint.gatewayUrl}`);

  const connection = await exec.connect(appId, { WebSocket });
  assert.ok((await connection.ping()) >= 0);
  connection.close();

  const tampered = `${endpoint.token.slice(0, -4)}AAAA`;
  await assert.rejects(ExecConnection.open(endpoint.gatewayUrl, tampered, { WebSocket }), (e) => {
    assert.equal(e.status, 'Denied', e.message);
    assert.match(e.message, /the gateway refused the connection \(HTTP 401: .+\)/);
    t.diagnostic(e.message);
    return true;
  });
});
