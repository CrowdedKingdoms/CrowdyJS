/**
 * The Game Kit against real ck-exec starter hubs on a local cluster (ck-exec
 * `scripts/local-cluster.sh up 1`, then `ckx deploy --project starters/ckx.json` to an app):
 * the kit connects straight to the gateway with connect tokens `ckx token` mints, as the game
 * API would. Skipped unless these are set:
 *
 *   CROWDY_KIT_LOCAL_GATEWAY  ws://127.0.0.1:7721
 *   CROWDY_KIT_LOCAL_APP      the app the starters are deployed to
 *   CKX_BIN                   the `ckx` binary (ck-exec target/release/ckx)
 *   CKX_CONNECT_SEED          the cluster's connect seed (target/local/connect.seed)
 *
 * The cluster has no game API, so hubs' node API calls fail: an area sees no players, and the
 * test checks that the kit reads those refusals as codes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { WebSocket } from 'ws';

import { ExecConnection, GameKitClient, KitError } from '../../dist/index.js';

const GATEWAY = process.env.CROWDY_KIT_LOCAL_GATEWAY;
const APP = process.env.CROWDY_KIT_LOCAL_APP;
const CKX = process.env.CKX_BIN;
const skip = !GATEWAY || !APP || !CKX || !process.env.CKX_CONNECT_SEED;

function token(player, developer = false) {
  const args = ['token', '--app', APP, '--player', String(player), '--ttl', '900', ...(developer ? ['--developer'] : [])];
  return execFileSync(CKX, args, { env: process.env }).toString().trim();
}

async function kit(player, developer = false) {
  const connection = await ExecConnection.open(GATEWAY, token(player, developer), { WebSocket, callTimeoutMs: 15_000 });
  return new GameKitClient(APP, {}, { connection, playerId: player }, {});
}

const until = async (what, check, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const code = async (promise) => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof KitError) return e.code;
    throw e;
  }
  assert.fail('expected a refusal');
};

test('the kit plays the starter pack on a local cluster', { skip, timeout: 180_000 }, async (t) => {
  const [p1, p2, dev] = await Promise.all([kit(1), kit(2), kit(9, true)]);
  t.after(() => [p1, p2, dev].forEach((k) => k.runtime.connection().then((c) => c.close())));

  // The root world: mirrors, a harvest, the same harvest resent, liveops for developers.
  const conditions = await p1.world.conditions.start();
  assert.equal(typeof conditions.night, 'boolean');
  await p1.world.nodes.start();
  const nodes = p1.world.nodes.list('Node');
  assert.ok(nodes.length > 0, 'the world has resource nodes');
  const node = nodes.find((n) => n.props.amount > 1) ?? nodes[0];
  const left = await p1.runtime.call('world', '', 'harvest', { node: node.id }, { action: 'local-h1' });
  const again = await p1.runtime.call('world', '', 'harvest', { node: node.id }, { action: 'local-h1' });
  assert.equal(again, left, 'answered from the receipt, not harvested twice');
  await until('the depletion on the nodes topic', () => p1.world.nodes.member(node.id)?.props.amount === left);
  assert.equal(await code(p2.world.harvest(99_999)), 'not_found');
  assert.equal(await code(p1.world.schedule({ name: 'x', start_ms: Date.now(), end_ms: Date.now() + 1 })), 'forbidden');
  const name = `kit-local-${Date.now()}`;
  assert.equal(await dev.world.schedule({ name, start_ms: Date.now(), end_ms: Date.now() + 120_000, modifiers: { aggro: 2 } }), true);
  await until('the event in the conditions', () => (p1.world.conditions.get()?.modifiers.aggro ?? 0) >= 2);
  assert.equal(await dev.world.cancel(name), true);

  // Two players matched into a session they play out.
  const queueName = `kit-${Date.now()}`;
  const [q1, q2] = [p1.matchmaking.queue(queueName), p2.matchmaking.queue(queueName)];
  await q1.counts.start();
  assert.equal((await q1.join({ rating: 1000 })).state, 'queued');
  assert.equal((await q2.join({ rating: 1010 })).state, 'queued');
  q1.watch(500);
  q2.watch(500);
  await until('a proposal', () => q1.place.get().state === 'proposed' && q2.place.get().state === 'proposed');
  await q1.accept();
  const matched = await q2.accept();
  assert.equal(matched.state, 'matched');
  q1.unwatch();
  q2.unwatch();
  const key = matched.session;
  assert.equal((await q1.status()).session, key);

  const [s1, s2] = [p1.sessions.open(key), p2.sessions.open(key)];
  const lobby = await s1.watch();
  assert.deepEqual([...lobby.reserved].sort(), [1, 2]);
  await s1.join();
  await s2.join();
  await s1.ready();
  await s2.ready();
  assert.equal(await code(s2.startGame()), 'forbidden', 'the first to join hosts');
  await s1.startGame();
  await until('playing', () => s1.state.get()?.phase === 'playing');
  assert.equal(await code(s2.act({ points: 1 })), 'not_your_turn');
  for (let i = 0; i < 20 && s1.state.get()?.phase === 'playing'; i++) {
    const mine = (await s1.isMyTurn()) ? s1 : s2;
    await mine.act({ points: 3 });
    await until('the move in the mirror', () => s1.state.get()?.moves.length > i || s1.state.get()?.phase === 'finished', 5_000);
  }
  await until('the result', () => s1.state.get()?.phase === 'finished');
  assert.equal(s1.state.get().winner, 1, 'the host moves first and reaches the target first');
  assert.deepEqual(await s2.watch(), s1.state.get());

  // An area: its members mirrored; with no game API it sees no players, so hits are refused.
  const area = p1.npcs.area('0,0');
  await area.watch();
  assert.equal(area.mobs().length, 6);
  assert.equal(area.npcs().length, 2);
  assert.equal(await code(area.attack(area.mobs()[0].id)), 'not_in_area');
  assert.equal(await code(area.adopt('cat', 'Mog')), 'not_in_area');
  assert.equal((await area.talk(area.npcs()[0].id)).name, 'Warden');
});
