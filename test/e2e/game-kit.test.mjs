/**
 * The Game Kit against the starter hubs on a tier, as a THROWAWAY org admin: the suite registers
 * its own owner, who makes an org and an app, composes the starters with `kit.topology` and
 * builds and deploys them on the platform (the world, matchmaking and sessions, npcs, a duel, a
 * private run and the leaderboard it posts to, each player's own hub and a market), and two
 * players who play them. It needs nobody's
 * credential and never signs in as an existing account.
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com CROWDY_E2E_THROWAWAY_OWNER=1 \
 *   CROWDY_PROVISIONING_TOKEN=<infra-cp/<tier>/loadtest/provisioning-token-harness, .token> \
 *   npm run build && node --test test/e2e/game-kit.test.mjs
 *
 * Dev and test are staff-only, so the provisioning token is what lets it register its accounts
 * there (sent on `register` only). It leaves an org behind (orgs are not deleted; the app is
 * archived), so it runs only when asked to.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { entryClientConfig, gameClientConfig, sleep } from '../helpers.mjs';
import { registerUser } from '../provision.mjs';

const skip =
  !process.env.CROWDY_HTTP_URL || process.env.CROWDY_E2E_THROWAWAY_OWNER !== '1'
    ? 'set CROWDY_HTTP_URL and CROWDY_E2E_THROWAWAY_OWNER=1 (registers throwaway accounts)'
    : undefined;

const rid = () => randomBytes(4).toString('hex');

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

const until = async (what, check, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(200);
  }
  assert.fail(`timed out waiting for ${what}`);
};

let world = null;
const closers = [];

test.after(async () => {
  for (const close of closers.reverse()) {
    try {
      await close();
    } catch {
      // best effort
    }
  }
});

test('the kit composes, deploys and plays the starter pack on a tier', { skip, timeout: 1_200_000 }, async (t) => {
  const { createCrowdyClient, KitError } = await import('../../dist/index.js');
  const code = async (promise) => {
    try {
      await promise;
    } catch (e) {
      if (e instanceof KitError) return e.code;
      throw e;
    }
    assert.fail('expected a refusal');
  };
  const identity = async () => {
    const account = await registerUser();
    const client = createCrowdyClient(entryClientConfig());
    client.setToken(account.token);
    closers.push(() => client.close());
    return { client, userId: String(account.userId) };
  };

  // The owner's org and app.
  const owner = await identity();
  const tag = rid();
  const org = await owner.client.organizations.create({ name: `e2e game kit ${tag}`, slug: `e2e-game-kit-${tag}` });
  const placeable = await owner.client.apps.placeableDatacenters();
  const datacenter = placeable.datacenters.find((d) => d.placeable)?.code;
  assert.ok(datacenter, 'the tier can place an app');
  const app = await owner.client.apps.create({ orgId: String(org.orgId), name: `e2e-game-kit-${tag}`, slug: `e2e-game-kit-${tag}`, datacenter });
  const appId = String(app.appId);
  closers.push(() => owner.client.apps.archive(appId));
  t.diagnostic(`org ${org.orgId}, app ${appId} in ${datacenter}`);

  // The topology: the session, the npcs, a duel and a private run bring the hubs they hang under
  // and call (the run posts to a leaderboard, named in its seed).
  const dev = owner.client.kit(appId, { developer: true, connect: { WebSocket, callTimeoutMs: 15_000 } });
  closers.push(() => dev.close());
  const offered = await dev.topology.types();
  t.diagnostic(`the toolchain's starters: ${offered.join(', ')}`);
  const runConfig = { floors: 1, rooms_per_floor: 2, start_hp: 500, start_power: 40, board: 'deepest' };
  const plan = await dev.topology.plan(['session', 'npcs', 'minigame', 'instance', 'market'], {
    overrides: { instance: { seed_b64: Buffer.from(JSON.stringify(runConfig)).toString('base64') } },
  });
  assert.deepEqual(
    [...plan.crates].sort(),
    ['instance', 'leaderboard', 'market', 'matchmaker', 'minigame', 'npc-mobs', 'player', 'session', 'world-tick'],
  );
  assert.deepEqual(
    Object.keys(plan.types).sort(),
    ['instance', 'leaderboard', 'market', 'matchmaker', 'minigame', 'npcs', 'player', 'session', 'world'],
  );
  const started = Date.now();
  const deployed = await dev.topology.deploy(plan, { timeoutMs: 900_000, onBuild: (b) => t.diagnostic(`build ${b.buildId}: ${b.status}`) });
  t.diagnostic(`deployed version ${deployed.version} (build ${deployed.buildId}) in ${Math.round((Date.now() - started) / 1000)} s`);

  // Two players, each with an app token and a kit of their own.
  const player = async () => {
    const who = await identity();
    const access = await patiently(() => who.client.portal.mintAppToken(appId));
    const game = createCrowdyClient(gameClientConfig(access));
    game.setToken(access.token);
    const kit = game.kit(appId, { connect: { WebSocket, callTimeoutMs: 15_000 }, playerId: who.userId });
    closers.push(() => kit.close(), () => game.close());
    return { ...who, kit };
  };
  const [a, b] = [await player(), await player()];
  world = { appId, a, b };

  // The root world: its mirrors, a harvest and the same harvest resent, liveops for developers.
  const conditions = await a.kit.world.conditions.start();
  assert.equal(typeof conditions.night, 'boolean');
  await a.kit.world.nodes.start();
  const nodes = a.kit.world.nodes.list('Node');
  assert.ok(nodes.length > 0, 'the world has resource nodes');
  const node = nodes.find((n) => n.props.amount > 1) ?? nodes[0];
  const action = `e2e-${tag}`;
  const left = await a.kit.runtime.call('world', '', 'harvest', { node: node.id }, { action });
  assert.equal(await a.kit.runtime.call('world', '', 'harvest', { node: node.id }, { action }), left, 'answered from the receipt');
  await until('the depletion on the nodes topic', () => a.kit.world.nodes.member(node.id)?.props.amount === left);
  assert.equal(await code(a.kit.world.schedule({ name: 'x', start_ms: Date.now(), end_ms: Date.now() + 1 })), 'forbidden');
  const name = `e2e-${tag}`;
  assert.equal(await dev.world.schedule({ name, start_ms: Date.now(), end_ms: Date.now() + 120_000, modifiers: { aggro: 2 } }), true);
  await until('the event in the conditions', () => (a.kit.world.conditions.get()?.modifiers.aggro ?? 0) >= 2);
  assert.equal(await dev.world.cancel(name), true);

  // Matched into a session they play to a winner.
  const queue = `e2e-${tag}`;
  const [qa, qb] = [a.kit.matchmaking.queue(queue), b.kit.matchmaking.queue(queue)];
  await qa.counts.start();
  assert.equal((await qa.join({ rating: 1000 })).state, 'queued');
  assert.equal((await qb.join({ rating: 1010 })).state, 'queued');
  qa.watch(1_000);
  qb.watch(1_000);
  await until('a proposal', () => qa.place.get().state === 'proposed' && qb.place.get().state === 'proposed');
  await qa.accept();
  const matched = await qb.accept();
  assert.equal(matched.state, 'matched');
  qa.unwatch();
  qb.unwatch();
  const [sa, sb] = [a.kit.sessions.open(matched.session), b.kit.sessions.open(matched.session)];
  const lobby = await sa.watch();
  assert.deepEqual([...lobby.reserved].map(String).sort(), [a.userId, b.userId].sort());
  await sa.join();
  await sb.join();
  await sa.ready();
  await sb.ready();
  assert.equal(await code(sb.startGame()), 'forbidden', 'the first to join hosts');
  await sa.startGame();
  await until('playing', () => sa.state.get()?.phase === 'playing');
  for (let i = 0; i < 20 && sa.state.get()?.phase === 'playing'; i++) {
    const mine = (await sa.isMyTurn()) ? sa : sb;
    await mine.act({ points: 3 });
    await until('the move in the mirror', () => sa.state.get()?.moves.length > i || sa.state.get()?.phase === 'finished', 10_000);
  }
  await until('the result', () => sa.state.get()?.phase === 'finished');
  assert.equal(String(sa.state.get().winner), a.userId, 'the host moves first and reaches the target first');

  // An area: its members mirrored, and refusals with their codes for players it does not see.
  const area = a.kit.npcs.area('0,0');
  await area.watch();
  assert.ok(area.mobs().length > 0 && area.npcs().length > 0);
  assert.equal(await code(area.attack(area.mobs()[0].id)), 'not_in_area', 'the area reads where players are; this one is not there');
  assert.equal((await area.talk(area.npcs()[0].id)).name, 'Warden');

  // A duel: each throw hidden until both are in, two rounds of three won.
  const [da, db] = [a.kit.minigames.duel(`e2e-${tag}`), b.kit.minigames.duel(`e2e-${tag}`)];
  assert.equal((await da.watch()).phase, 'waiting');
  assert.equal(await da.join(), false);
  assert.equal(await db.join(), true, 'the second seat starts the first round');
  for (let round = 1; round <= 2; round++) {
    assert.equal(await da.throw('rock'), false);
    assert.equal(da.view.get()?.last?.round ?? 0, round - 1, 'nothing is revealed with one throw in');
    assert.equal(await db.throw('scissors'), true);
    await until(`round ${round} revealed`, () => (da.view.get()?.last?.round ?? 0) >= round);
  }
  await until('the duel won', () => da.view.get()?.phase === 'finished');
  assert.equal(String(da.view.get().winner), a.userId);

  // A private run: the owner opens and invites; cleared, it posts each member's depth to the
  // board, a hub calling a hub.
  const runKey = `e2e-${tag}`;
  const [ra, rb] = [a.kit.instances.run(runKey), b.kit.instances.run(runKey)];
  assert.equal((await ra.watch()).phase, 'unopened');
  assert.equal(await ra.open({ seed: 7 }), 7);
  assert.equal(await code(rb.join()), 'forbidden', 'not invited yet');
  assert.equal(await ra.invite(b.userId), true);
  assert.equal(await rb.join(), true);
  await until('the run open', () => ra.view.get()?.phase === 'running');
  for (let i = 0; i < 6 && ra.view.get()?.phase === 'running'; i++) {
    const before = ra.view.get().log.length;
    t.diagnostic(`room: ${await ra.enter()}`);
    await until('the room in the mirror', () => ra.view.get()?.log.length > before);
  }
  await until('the run cleared', () => ra.view.get()?.phase === 'cleared');
  const board = a.kit.leaderboards.board('deepest');
  await until('both depths on the board', async () => (await board.top()).length === 2);
  assert.deepEqual((await board.top()).map((r) => String(r.player)).sort(), [a.userId, b.userId].sort());
  assert.equal(await code(board.submit(a.userId, 99)), 'forbidden', 'a player never submits a score');

  // The economy: each player's own hub, and a market between them. Not a ledger.
  await a.kit.player.watch();
  assert.equal(a.kit.wallet.balance('gold'), 100, 'what a new player starts with');
  assert.deepEqual((await a.kit.quests.step('tutorial:inventory')).quests, []);
  const { roll } = await a.kit.loot.open('chest');
  assert.ok(roll.count > 0);
  await until('the gems spent', () => a.kit.wallet.balance('gems') === 10);
  assert.deepEqual(await b.kit.shops.at('town').buy('smith', 'potion'), { items: { potion: 1 }, currency: {} });
  await b.kit.player.watch('inventory', 'wallet');
  const desk = a.kit.trades.at('town');
  const trade = await desk.open(b.userId);
  assert.equal(await desk.offer(trade, { currency: { gold: 10 } }), true);
  assert.equal(await b.kit.trades.at('town').offer(trade, { items: { potion: 1 } }), true);
  assert.equal(await desk.accept(trade), 'open');
  assert.equal(await b.kit.trades.at('town').accept(trade), 'settling');
  await until('the potion in a\'s bag', () => a.kit.inventory.count('potion') >= 1);
  await until('the gold in b\'s wallet', () => b.kit.wallet.balance('gold') === 105);
  assert.equal(await code(a.kit.runtime.call('player', b.userId, 'me')), 'forbidden', 'only its player reads it');
});
