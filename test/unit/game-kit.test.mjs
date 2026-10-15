/**
 * The Game Kit against ck-exec's golden record of its starter hubs
 * (`fixtures/kit-protocol.json`, a copy of ck-exec `crates/ckx-kit-protocol/kit-protocol.json`).
 *
 * - The protocol's own cases: kit messages, refusal codes, shard keys, realtime events and
 *   actor states read as ck-exec wrote them.
 * - Each starter's script replayed through a gateway that answers only the next recorded
 *   step: every call a kit module makes must be that step's method and arguments, from that
 *   step's player, and it gets the hub's real reply; the hub's real topic messages are pushed
 *   to whoever subscribes. The modules' mirrors end where the hub's state did.
 * - The runtime's pacing and resends, the mirrors' resyncs, private state, the topology's
 *   checks, emotes and spectating, against scripted fakes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { WebSocket, WebSocketServer } from 'ws';
import { decode, encode } from '@msgpack/msgpack';

import {
  CollectionMirror,
  CrowdyExecError,
  EVENT_EMOTE,
  ExecAPI,
  GameKitClient,
  HubState,
  KIT_SUBSCRIPTIONS_MAX,
  KitError,
  KitRuntime,
  KitTopology,
  PrivateState,
  decodeKitActorState,
  isKitPlayerActor,
  kitActorCodec,
  kitActorLanes,
  kitErrorCode,
  kitManifestProblems,
  parseAbilityEvent,
  parseContactDamage,
  parseControlPointEvent,
  parseEmoteEvent,
  parseEncounterEvent,
  parseEngineEvent,
  parseKitRefusal,
  parseKitServerEvent,
  parseMovementViolation,
  parsePossessionEvent,
  parseProposalEvent,
  parseRaceTimingEvent,
  parseScoreEvent,
  parseShardKey,
  parseTurnEvent,
  parseWeatherEvent,
  parseZoneChangeEvent,
  sessionTurn,
  shardKey,
  shardKeysAround,
  splitKitMessage,
  withActionId,
  withKitActors,
} from '../../dist/index.js';
import { encodeBase64, decodeBase64 } from '../../dist/utils.js';
import { textCodec } from '../../dist/stores/codec.js';

const record = JSON.parse(readFileSync(new URL('./fixtures/kit-protocol.json', import.meta.url), 'utf8'));
const hex = (h) => Buffer.from(h, 'hex');
const starter = (crate) => record.starters.find((s) => s.crate === crate);

// ---- the gateway's frames (ck-exec ckx-proto client.rs) ----

function readClientFrame(buf) {
  const b = new Uint8Array(buf);
  let at = 0;
  const u8 = () => b[at++];
  const u16 = () => ((at += 2), b[at - 2] | (b[at - 1] << 8));
  const u32 = () => ((at += 4), (b[at - 4] | (b[at - 3] << 8) | (b[at - 2] << 16) | (b[at - 1] << 24)) >>> 0);
  const str = (n) => Buffer.from(b.subarray(at, (at += n))).toString('utf8');
  const tag = u8();
  if (tag === 0x04) return { kind: 'ping', nonce: u32() };
  const rid = u32();
  const nodeType = str(u8());
  const key = str(u16());
  if (tag === 0x01) return { kind: 'call', rid, nodeType, key, method: str(u8()), payload: b.slice(at) };
  return { kind: tag === 0x02 ? 'subscribe' : 'unsubscribe', rid, nodeType, key, topic: str(u8()) };
}
const u32le = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
};
const s8 = (s) => Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)]);
const s16 = (s) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(Buffer.byteLength(s));
  return Buffer.concat([b, Buffer.from(s)]);
};
const reply = (rid, status, payload = new Uint8Array()) =>
  Buffer.concat([Buffer.from([0x81]), u32le(rid), Buffer.from([status]), Buffer.from(payload)]);
const push = (nodeType, key, topic, payload) =>
  Buffer.concat([Buffer.from([0x82]), s8(nodeType), s16(key), s8(topic), Buffer.from(payload)]);
const pong = (nonce) => Buffer.concat([Buffer.from([0x84]), u32le(nonce)]);
const STATUS = { Ok: 0, AppError: 1, Busy: 2, Moved: 3, NotFound: 4, DeadlineExceeded: 5, Denied: 6, RateLimited: 7, Unavailable: 8 };

const LOCAL_API = 'http://127.0.0.1:3000/graphql';

/** An ExecAPI whose execConnect (and execConnectAsDeveloper) hand out `gw` with a token naming the caller. */
function execFor(gw, caller) {
  const token = 'developer' in caller ? `developer-${caller.developer}` : `player-${caller.player}`;
  const endpoint = { gatewayUrl: gw.url, token, host: 'h1', expiresAt: new Date(Date.now() + 60_000).toISOString() };
  return new ExecAPI({ endpoint: LOCAL_API, request: async () => ({ execConnect: endpoint, execConnectAsDeveloper: endpoint }) });
}

/** A kit for one caller of a replay gateway. */
function kitFor(gw, caller, extra = {}) {
  const developer = 'developer' in caller;
  const id = developer ? caller.developer : caller.player;
  return new GameKitClient('77', {}, { connect: { WebSocket, callTimeoutMs: 3_000 }, developer, playerId: id, ...extra }, { exec: execFor(gw, caller) });
}

const withoutActionId = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const { action_id: _ignored, ...rest } = v;
  return Object.keys(rest).length ? rest : null;
};

/**
 * A gateway that plays one starter's recorded script: it answers a call only when it is the
 * next step (method, arguments without the action id, caller), with the recorded reply, and
 * pushes the step's published messages to the topics callers subscribe to. `serverStep()`
 * plays a step no client makes (an instance's call, a timer advance).
 */
async function replayGateway(script) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const gw = { wss, url: `ws://127.0.0.1:${wss.address().port}`, at: 0, conns: [], refused: [] };
  const topicKey = (t) => `${script.node_type}\u0000${script.key}\u0000${t}`;
  const publish = (list) => {
    for (const p of list) {
      for (const c of gw.conns) {
        if (c.subs.has(topicKey(p.topic))) c.ws.send(push(script.node_type, script.key, p.topic, hex(p.msgpack)));
      }
    }
  };
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const [kind, id] = token.split('-');
    const conn = { ws, caller: { [kind]: Number(id) }, subs: new Set() };
    gw.conns.push(conn);
    ws.on('message', (data) => {
      const f = readClientFrame(data);
      if (f.kind === 'ping') return void ws.send(pong(f.nonce));
      if (f.kind === 'subscribe') {
        conn.subs.add(`${f.nodeType}\u0000${f.key}\u0000${f.topic}`);
        return void ws.send(reply(f.rid, 0));
      }
      if (f.kind === 'unsubscribe') {
        conn.subs.delete(`${f.nodeType}\u0000${f.key}\u0000${f.topic}`);
        return void ws.send(reply(f.rid, 0));
      }
      const step = script.steps[gw.at];
      const args = withoutActionId(f.payload.length ? decode(f.payload) : null);
      const fits =
        step &&
        step.call === f.method &&
        f.nodeType === script.node_type &&
        f.key === script.key &&
        isDeepStrictEqual(step.caller, conn.caller) &&
        isDeepStrictEqual(withoutActionId(step.args), args);
      if (!fits) {
        const why = `step ${gw.at} is ${JSON.stringify(step && { call: step.call, caller: step.caller, args: step.args })}, not ${f.method} ${JSON.stringify(args)} from ${JSON.stringify(conn.caller)}`;
        gw.refused.push(why);
        return void ws.send(reply(f.rid, 11, Buffer.from(why)));
      }
      gw.at += 1;
      ws.send(step.ok ? reply(f.rid, 0, hex(step.reply_msgpack)) : reply(f.rid, STATUS[step.status] ?? 1, Buffer.from(step.error)));
      publish(step.published);
    });
  });
  gw.serverStep = () => {
    const step = script.steps[gw.at];
    assert.ok(step && ('advance_ms' in step || 'instance' in (step.caller ?? {})), `step ${gw.at} is a client's: ${JSON.stringify(step)}`);
    gw.at += 1;
    publish(step.published);
  };
  gw.done = () => {
    assert.deepEqual(gw.refused, []);
    assert.equal(gw.at, script.steps.length, `the script ran to its end (at ${gw.at} of ${script.steps.length})`);
  };
  return gw;
}

const until = async (what, check, ms = 3_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
};

const rejectsWithCode = async (promise, code) => {
  await assert.rejects(promise, (e) => {
    assert.ok(e instanceof KitError, `a KitError, got ${e}`);
    assert.equal(e.code, code);
    assert.ok(e instanceof CrowdyExecError && e.status === 'AppError');
    return true;
  });
};

/** The body a recorded published (or replied) kit message carries. */
const bodyOf = (value) => splitKitMessage(value).body;

// ---- the protocol's own cases ----

test('kit messages read as ck-exec writes them: the header beside the body', () => {
  for (const m of record.messages) {
    const value = decode(hex(m.msgpack));
    assert.deepEqual(value, m.value, m.name);
    const split = splitKitMessage(value);
    assert.equal(split.header.v, record.protocol);
    assert.equal(split.header.kind, m.name === 'removal' ? 'delta' : m.name);
    for (const k of ['v', 'epoch', 'seq', 'kind']) assert.ok(!(k in split.body));
  }
  assert.equal(splitKitMessage({ cells: [1] }), null, 'a map without the header is not a kit message');
});

test('refusal codes read back from the message, and anything else has none', () => {
  for (const e of record.errors) {
    const parsed = parseKitRefusal(e.message);
    assert.deepEqual(parsed, e.code === null ? null : { code: e.code, text: e.text }, e.message);
  }
  const err = KitError.from(new CrowdyExecError('AppError', 'kit:cooldown: attacking too fast'));
  assert.ok(err instanceof KitError);
  assert.equal(kitErrorCode(err), 'cooldown');
  assert.equal(kitErrorCode(new CrowdyExecError('Denied', 'kit:cooldown: x')), null, 'only an AppError is a hub refusal');
});

test('shard keys are the hubs\' own: the same centre chunk on every side', () => {
  for (const k of record.shards.keys) assert.equal(shardKey(k.x, k.z, k.size), k.key, JSON.stringify(k));
  for (const a of record.shards.around) assert.deepEqual(shardKeysAround(a.x, a.z, a.size, a.radius), a.keys);
  assert.deepEqual(parseShardKey('12,-4'), [12, -4]);
  assert.equal(parseShardKey('x'), null);
});

test('realtime events parse as the registry writes them', () => {
  const parsers = new Map([
    [77, parseContactDamage],
    [90, parseWeatherEvent],
    [91, parseTurnEvent],
    [92, parseScoreEvent],
    [93, parseProposalEvent],
    [94, parseAbilityEvent],
    [95, parseMovementViolation],
    [96, parseControlPointEvent],
    [97, parseRaceTimingEvent],
    [98, parseZoneChangeEvent],
    [99, parseEncounterEvent],
    [100, parsePossessionEvent],
    [101, parseEmoteEvent],
  ]);
  assert.equal(record.events.length, parsers.size);
  for (const e of record.events) {
    const bytes = hex(e.bytes);
    assert.deepEqual(parseEngineEvent(bytes), { eventType: e.event_type, body: e.body });
    const typed = parsers.get(e.event_type)(bytes);
    assert.ok(typed, `type ${e.event_type} parses`);
    for (const [k, v] of Object.entries(typed)) {
      if (k === 'body' || k === 'standings') continue;
      if (e.body[k] !== undefined) assert.equal(String(v), String(e.body[k]), `${e.event_type}.${k}`);
    }
    const asNotification = { eventType: e.event_type, state: encodeBase64(bytes.subarray(2)) };
    assert.deepEqual(parseKitServerEvent(asNotification), { eventType: e.event_type, body: e.body });
  }
  assert.equal(parseScoreEvent(hex(record.events.find((e) => e.event_type === 92).bytes)).standings[0].score, 12);
});

test('server-driven actors decode for World Stores, beside players with the game\'s own codec', () => {
  for (const a of record.actor_states) {
    const state = decodeKitActorState(hex(a.msgpack));
    assert.deepEqual({ ...state }, { ...a.value, hp: a.value.hp ?? null });
    assert.deepEqual(kitActorCodec.decode(encodeBase64(hex(a.msgpack))), state);
  }
  const mixed = withKitActors(textCodec);
  const mob = mixed.decode(encodeBase64(hex(record.actor_states[0].msgpack)));
  const player = mixed.decode(textCodec.encode('pose:1,2'));
  assert.ok(!isKitPlayerActor(mob) && mob.kind === 'mob');
  assert.ok(isKitPlayerActor(player) && player.player === 'pose:1,2');
  const lanes = kitActorLanes();
  assert.deepEqual(
    Object.entries(lanes).filter(([, f]) => f(mob)).map(([n]) => n),
    ['mobs'],
  );
  assert.ok(lanes.players(player) && !lanes.others(player));
  assert.equal(kitActorCodec.decode(textCodec.encode('not msgpack')), null);
});

// ---- the starters' scripts, replayed ----

test('world: conditions and nodes mirror the hub, harvests are retry-safe, liveops is for developers', async (t) => {
  const script = starter('world-tick');
  const gw = await replayGateway(script);
  t.after(() => gw.wss.close());
  const p1 = kitFor(gw, { player: 1 });
  const p2 = kitFor(gw, { player: 2 });
  const dev = kitFor(gw, { developer: 9 });
  t.after(() => [p1, p2, dev].forEach((k) => k.close()));

  await p1.world.conditions.start();
  await p1.world.nodes.start();
  assert.equal(p1.world.nodes.list('Node').length, 2);
  const view = await p1.world.state();
  assert.equal(view.nodes.length, 2);
  assert.equal(await p1.world.harvest(0), 1);
  await until('the depletion delta', () => p1.world.nodes.member(0)?.props.amount === 1);
  // The script's resend of the same action: answered from the hub's receipt.
  assert.equal(await p1.runtime.call('world', '', 'harvest', { node: 0 }, { action: 'resent' }), 1);
  await rejectsWithCode(p1.world.harvest(0), 'cooldown');
  await rejectsWithCode(p2.world.harvest(7), 'not_found');
  gw.serverStep();
  await until('the conditions snapshot', () => p1.world.conditions.position.seq === 1);
  assert.equal(typeof p1.world.conditions.get().night, 'boolean');
  await p1.world.conditions.resync();
  await p1.world.nodes.resync();
  const { start_ms, end_ms } = script.steps.find((s) => s.call === 'schedule').args;
  await rejectsWithCode(p1.world.schedule({ name: 'blood-moon', start_ms, end_ms }), 'forbidden');
  assert.equal(await dev.world.schedule({ name: 'blood-moon', start_ms, end_ms, modifiers: { aggro: 2 } }), true);
  await until('the event in the conditions', () => p1.world.conditions.get()?.modifiers.aggro === 2);
  gw.done();
});

test('matchmaking: queue, propose, accept into a session, and a party matched whole', async (t) => {
  const script = starter('matchmaker');
  const gw = await replayGateway(script);
  t.after(() => gw.wss.close());
  const kits = Object.fromEntries([1, 2, 3, 4, 5].map((p) => [p, kitFor(gw, { player: p })]));
  t.after(() => Object.values(kits).forEach((k) => k.close()));
  const q = (p) => kits[p].matchmaking.queue('ranked');

  await q(1).counts.start();
  assert.deepEqual(q(1).counts.get(), { waiting: 0, proposals: 0, forming: 0 });
  assert.equal((await q(1).join({ rating: 1000 })).state, 'queued');
  assert.equal((await q(2).join({ rating: 1020 })).state, 'queued');
  assert.equal((await q(1).status()).state, 'queued');
  gw.serverStep();
  await until('the counts', () => q(1).counts.get()?.waiting === 0 && q(1).counts.position.seq === 1);
  assert.equal((await q(1).status()).state, 'proposed');
  assert.equal((await q(1).accept()).state, 'proposed');
  let matched = null;
  q(2).onMatched((s) => (matched = s));
  const done = await q(2).accept();
  assert.deepEqual(done, { state: 'matched', session: 'ranked-1-1' });
  assert.equal(matched, 'ranked-1-1');
  assert.equal((await q(2).status()).state, 'matched');
  await rejectsWithCode(q(3).accept(), 'not_found');
  const forming = await q(3).join({ rating: 900, party: [4] });
  assert.deepEqual([forming.state, forming.members], ['party', [3, 4]]);
  assert.equal((await q(4).status()).state, 'party');
  await rejectsWithCode(q(5).join({ rating: 900, leader: 3 }), 'forbidden');
  assert.equal((await q(4).join({ rating: 950, leader: '3' })).state, 'queued');
  assert.equal(q(4).place.get().state, 'queued', 'the place follows every answer');
  assert.equal((await q(4).status()).state, 'queued');
  assert.equal((await q(1).counts.resync()).waiting, 2);
  gw.done();
});

test('sessions: the mirror follows every change, a resent move plays once, refusals carry codes', async (t) => {
  const script = starter('session');
  const gw = await replayGateway(script);
  t.after(() => gw.wss.close());
  const k1 = kitFor(gw, { player: 1 });
  const k2 = kitFor(gw, { player: 2 });
  const k3 = kitFor(gw, { player: 3 });
  t.after(() => [k1, k2, k3].forEach((k) => k.close()));
  const s = (k) => k.sessions.open('ranked-1-1');

  const first = await s(k1).watch();
  assert.equal(first.phase, 'lobby');
  gw.serverStep(); // the matchmaker reserves it
  await until('the reservation', () => s(k1).state.get()?.reserved.length === 2);
  await rejectsWithCode(s(k3).join(), 'reserved');
  assert.equal(await s(k1).join(), true);
  assert.equal(await s(k2).join(), true);
  assert.equal(await s(k1).ready(), true);
  await rejectsWithCode(s(k2).startGame(), 'forbidden');
  assert.equal(await s(k2).ready(true), true);
  assert.equal(await s(k1).startGame(), true);
  await until('playing', () => s(k1).state.get()?.phase === 'playing');
  assert.equal(s(k1).currentTurn(), 1);
  assert.equal(await s(k1).isMyTurn(), true);
  await rejectsWithCode(s(k2).act({ points: 1 }), 'not_your_turn');
  assert.equal(await s(k1).act({ points: 3 }), true);
  // The same move sent again (the reply was lost): the hub answers from its receipt.
  assert.equal(await k1.runtime.call('session', 'ranked-1-1', 'act', { points: 3 }, { action: 'resent' }), true);
  await rejectsWithCode(s(k2).act({ points: 9 }), 'invalid_move');
  gw.serverStep(); // player 2's turn times out
  const lastPublished = script.steps.filter((x) => x.published?.length).at(-1).published.at(-1).value;
  await until('the timeout', () => s(k1).state.position.seq === lastPublished.seq);
  assert.deepEqual(s(k1).state.get(), bodyOf(lastPublished));
  assert.equal(sessionTurn(s(k1).state.get()), 1);
  const resynced = await s(k1).state.resync();
  assert.deepEqual(resynced, bodyOf(lastPublished));
  assert.equal((await k1.runtime.call('session', 'ranked-1-1', 'state')).phase, 'playing');
  gw.done();
});

test('npcs: the area mirror holds mobs, NPCs and pets; pets are the owner\'s; hits are refused with codes', async (t) => {
  const script = starter('npc-mobs');
  const gw = await replayGateway(script);
  t.after(() => gw.wss.close());
  const k1 = kitFor(gw, { player: 1 });
  const k2 = kitFor(gw, { player: 2 });
  t.after(() => [k1, k2].forEach((k) => k.close()));
  assert.equal(k1.npcs.keyAt(1, 2), '4,4');
  const area = k1.npcs.area('0,0');
  await area.watch();
  assert.equal(area.mobs().length, 6);
  assert.equal(area.npcs().length, 2);
  gw.serverStep();
  await until('the first deltas', () => area.members.position.seq === 8);
  await area.members.resync();
  await rejectsWithCode(area.attack(1), 'out_of_reach');
  assert.equal((await area.talk(7)).name, 'Warden');
  const pet = await area.adopt('cat', 'Mog');
  assert.equal(pet, 9);
  assert.equal(await area.summon(pet), true);
  await rejectsWithCode(k2.npcs.area('0,0').summon(pet), 'forbidden');
  const mine = await area.myPets();
  assert.deepEqual([mine[0].name, mine[0].bond, mine[0].mode], ['Mog', 1, 'follow']);
  gw.serverStep();
  await until('the pet in the mirror', () => area.pets().length === 1);
  assert.equal(area.pets()[0].props.bond, undefined, 'the bond is never published');
  gw.done();
});

// ---- the runtime ----

/** A gateway a test scripts call by call. */
async function scriptedGateway(onCall) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const gw = { wss, url: `ws://127.0.0.1:${wss.address().port}`, calls: [], conns: [] };
  wss.on('connection', (ws) => {
    gw.conns.push(ws);
    ws.on('message', (data) => {
      const f = readClientFrame(data);
      if (f.kind === 'ping') return void ws.send(pong(f.nonce));
      if (f.kind !== 'call') return void ws.send(reply(f.rid, 0));
      const args = f.payload.length ? decode(f.payload) : null;
      gw.calls.push({ method: f.method, args, nodeType: f.nodeType, key: f.key, topic: args?.topic });
      const out = onCall(f, args, gw.calls.length, ws);
      if (out) ws.send(out);
    });
  });
  gw.push = (nodeType, key, topic, value) => {
    for (const ws of gw.conns) ws.send(push(nodeType, key, topic, encode(value)));
  };
  return gw;
}

const runtimeFor = (gw, options = {}) =>
  new KitRuntime('77', execFor(gw, { player: 1 }), { connect: { WebSocket, callTimeoutMs: 400 }, ...options });

test('a call with an action id is sent again with the same id after an unknown outcome; one without is not', async (t) => {
  const gw = await scriptedGateway((f, args, n) => {
    if (f.method === 'flaky' && n === 1) return reply(f.rid, STATUS.DeadlineExceeded, Buffer.from('handler exceeded its deadline'));
    return reply(f.rid, 0, encode(args));
  });
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw);
  t.after(() => rt.close());
  const out = await rt.call('h', 'k', 'flaky', { x: 1 }, { action: true });
  assert.equal(gw.calls.length, 2);
  assert.equal(gw.calls[0].args.action_id, gw.calls[1].args.action_id, 'the resend carries the same id');
  assert.equal(out.x, 1);
  gw.calls.length = 0;
  const once = await scriptedGateway((f) => reply(f.rid, STATUS.DeadlineExceeded, Buffer.from('no reply')));
  t.after(() => once.wss.close());
  const rt2 = runtimeFor(once);
  t.after(() => rt2.close());
  await assert.rejects(rt2.call('h', 'k', 'plain', { x: 1 }), (e) => e.status === 'DeadlineExceeded');
  assert.equal(once.calls.length, 1, 'no id, no resend: it may have run');
});

test('a rate-limited call waits as the gateway says and goes through; busy refusals are retried', async (t) => {
  let refusedAt = 0;
  const gw = await scriptedGateway((f, _args, n) => {
    if (n === 1) {
      refusedAt = Date.now();
      return reply(f.rid, STATUS.Busy, Buffer.from('rate limited: 120 calls per 10 s; retry in 150 ms'));
    }
    if (n === 2) return reply(f.rid, STATUS.Busy, Buffer.from('mailbox full'));
    return reply(f.rid, 0, encode(true));
  });
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw);
  t.after(() => rt.close());
  assert.equal(await rt.call('h', 'k', 'm'), true);
  assert.equal(gw.calls.length, 3);
  assert.ok(Date.now() - refusedAt >= 140, 'waited out the gateway\'s retry-after');
});

test('the call budget paces a burst below the gateway limit', async (t) => {
  const gw = await scriptedGateway((f) => reply(f.rid, 0, encode(1)));
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw, { callBudget: 4, budgetWindowMs: 400 });
  t.after(() => rt.close());
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 8 }, () => rt.call('h', 'k', 'm')));
  assert.ok(Date.now() - t0 >= 350, 'the second four waited for the bucket');
});

test('a hub\'s coded refusal is a KitError; subscriptions stop at the gateway\'s cap', async (t) => {
  const gw = await scriptedGateway((f) => reply(f.rid, STATUS.AppError, Buffer.from('kit:full: the session is full')));
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw, { callBudget: 1_000 });
  t.after(() => rt.close());
  await rejectsWithCode(rt.call('session', 's', 'join'), 'full');
  for (let i = 0; i < KIT_SUBSCRIPTIONS_MAX; i++) await rt.subscribe('h', String(i), 't', () => {});
  assert.equal(rt.subscriptions, KIT_SUBSCRIPTIONS_MAX);
  await rejectsWithCode(rt.subscribe('h', 'over', 't', () => {}), 'limit');
  const stop = await rt.subscribe('h', '0', 't', () => {});
  await stop();
  assert.equal(rt.subscriptions, KIT_SUBSCRIPTIONS_MAX, 'one handler of a topic held twice leaves it held');
});

test('withActionId rides beside the arguments, or becomes them', () => {
  assert.deepEqual(withActionId({ a: 1 }, 'x'), { a: 1, action_id: 'x' });
  assert.deepEqual(withActionId(undefined, 'x'), { action_id: 'x' });
  assert.deepEqual(withActionId([1], 'x'), [1]);
});

// ---- mirrors ----

const msg = (kind, epoch, seq, body) => ({ v: 1, epoch, seq, kind, ...body });

test('a collection mirror applies deltas in order and resyncs on a gap and on a new epoch', async (t) => {
  let snapshot = msg('snapshot', 1, 2, { containers: [{ id: 1, type_name: 'Mob', props: { hp: 10 } }] });
  const gw = await scriptedGateway((f) => (f.method === 'snapshot' ? reply(f.rid, 0, encode(snapshot)) : reply(f.rid, 0)));
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw);
  t.after(() => rt.close());
  const m = new CollectionMirror(rt, 'npcs', '0,0', 'area');
  await m.start();
  assert.equal(m.member(1).props.hp, 10);
  gw.push('npcs', '0,0', 'area', msg('delta', 1, 2, { id: 1, type_name: 'Mob', props: { hp: 99 } }));
  gw.push('npcs', '0,0', 'area', msg('delta', 1, 3, { id: 1, type_name: 'Mob', props: { hp: 5 } }));
  gw.push('npcs', '0,0', 'area', msg('delta', 1, 4, { id: 2, type_name: 'Npc', props: { name: 'W' } }));
  await until('deltas', () => m.position.seq === 4);
  assert.deepEqual([m.member(1).props.hp, m.list('Npc').length], [5, 1], 'the old seq 2 was ignored');
  snapshot = msg('snapshot', 1, 9, { containers: [{ id: 3, type_name: 'Pet', props: {} }] });
  gw.push('npcs', '0,0', 'area', msg('delta', 1, 7, { id: 1, removed: true }));
  await until('a resync after the gap', () => m.position.seq === 9);
  assert.deepEqual(m.list().map((c) => c.id), [3]);
  snapshot = msg('snapshot', 2, 1, { containers: [] });
  gw.push('npcs', '0,0', 'area', msg('delta', 2, 1, { id: 4, type_name: 'Mob', props: {} }));
  await until('a resync on the new epoch', () => m.position.epoch === 2);
  assert.equal(m.list().length, 0);
  assert.equal(gw.calls.filter((c) => c.method === 'snapshot').length, 3);
});

test('a hub state mirror takes newer snapshots, lets gaps pass, and hears events and changed pings', async (t) => {
  const gw = await scriptedGateway((f) => reply(f.rid, 0, encode(msg('snapshot', 1, 0, { turn: 0 }))));
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw);
  t.after(() => rt.close());
  const s = new HubState(rt, 'session', 's', 'session');
  const events = [];
  const changed = [];
  s.onEvent((b) => events.push(b));
  s.onChanged((c) => changed.push(c));
  const seen = [];
  s.subscribe((v) => seen.push(v.turn));
  await s.start();
  gw.push('session', 's', 'session', msg('snapshot', 1, 3, { turn: 3 }));
  gw.push('session', 's', 'session', msg('event', 1, 4, { type: 'finished' }));
  gw.push('session', 's', 'session', msg('changed', 1, 5, { who: [1], what: 'hand' }));
  await until('all three', () => s.position.seq === 5);
  assert.deepEqual(seen, [0, 3]);
  assert.deepEqual(events, [{ type: 'finished' }]);
  assert.deepEqual(changed, [{ who: [1], what: 'hand' }]);
  assert.equal(gw.calls.length, 1, 'a gap in a snapshot topic costs no resync');
  await s.stop();
});

test('private state is read again when a changed message names the player, and only then', async (t) => {
  let reads = 0;
  const gw = await scriptedGateway((f) => reply(f.rid, 0, encode({ cards: [++reads] })));
  t.after(() => gw.wss.close());
  const rt = runtimeFor(gw, { playerId: 7 });
  t.after(() => rt.close());
  const hand = new PrivateState(rt, {
    nodeType: 'deck',
    key: 't1',
    topic: 'table',
    what: 'hand',
    read: () => rt.call('deck', 't1', 'hand'),
  });
  assert.deepEqual((await hand.start()).cards, [1]);
  gw.push('deck', 't1', 'table', msg('changed', 1, 1, { who: [8], what: 'hand' }));
  gw.push('deck', 't1', 'table', msg('changed', 1, 2, { who: [7], what: 'score' }));
  gw.push('deck', 't1', 'table', msg('changed', 1, 3, { who: [7, 8], what: 'hand' }));
  await until('the reread', () => hand.get()?.cards[0] === 2);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reads, 2, 'another player\'s hand and another what were not this one');
  await hand.stop();
});

// ---- topology ----

const pack = {
  manifest: {
    root: 'world',
    types: {
      world: { kind: 'hub', crate: 'world-tick', client: true },
      matchmaker: { kind: 'hub', parent: 'world', crate: 'matchmaker', client: true, calls: ['session'] },
      session: { kind: 'hub', parent: 'matchmaker', crate: 'session', client: true },
      npcs: { kind: 'hub', parent: 'world', crate: 'npc-mobs', client: true, calls: ['world'], scopes: ['world.read'] },
    },
  },
  starters: ['world-tick', 'matchmaker', 'session', 'npc-mobs'].map((crate) => ({
    crate,
    nodeType: crate,
    description: '',
    files: [{ path: 'Cargo.toml', content: '' }, { path: 'src/lib.rs', content: '' }],
  })),
};

function fakeExec() {
  const log = [];
  return {
    log,
    starters: async () => pack,
    build: async (_app, crates) => (log.push(['build', crates.map((c) => c.name)]), { buildId: 'b1', status: 'queued' }),
    waitForBuild: async () => ({ buildId: 'b1', status: 'succeeded', log: '' }),
    deploy: async (o) => (log.push(['deploy', o.root, Object.keys(o.types).sort(), o.buildId]), { version: 4 }),
  };
}

test('the topology adds what selected types hang under and call, checks the tree, then builds and deploys', async () => {
  const exec = fakeExec();
  const topo = new KitTopology('77', exec);
  const plan = await topo.plan(['session']);
  assert.deepEqual(Object.keys(plan.types).sort(), ['matchmaker', 'session', 'world']);
  assert.deepEqual([...plan.crates].sort(), ['matchmaker', 'session', 'world-tick']);
  const npcs = await topo.plan(['npcs'], { overrides: { npcs: { memory_mb: 128 } } });
  assert.deepEqual(Object.keys(npcs.types).sort(), ['npcs', 'world']);
  assert.equal(npcs.types.npcs.memory_mb, 128);
  await assert.rejects(topo.plan(['dragons']), /no node type 'dragons'/);
  const done = await topo.deploy(plan);
  assert.deepEqual(done, { version: 4, buildId: 'b1' });
  assert.deepEqual(exec.log, [
    ['build', plan.crates],
    ['deploy', 'world', ['matchmaker', 'session', 'world'], 'b1'],
  ]);
  assert.deepEqual(kitManifestProblems(pack.manifest), []);
  const bad = kitManifestProblems({
    root: 'a',
    types: { a: { kind: 'spoke' }, b: { kind: 'hub', parent: 'zz', calls: ['q'], replicas: 2, scopes: ['nope'] } },
  });
  assert.equal(bad.length, 5, bad.join('\n'));
});

// ---- emotes and spectating ----

function fakeUdp() {
  const sent = [];
  return {
    sent,
    sendClientEvent: async (input) => (sent.push(['event', input]), true),
    sendActorUpdate: async (input) => (sent.push(['actor', input]), true),
  };
}

test('emotes go out as client events every kit client reads', async () => {
  const udp = fakeUdp();
  const kit = new GameKitClient('77', {}, {}, { udp });
  assert.equal(await kit.emotes.send({ uuid: 'u'.repeat(32), chunk: { x: 1, y: 0, z: -2 }, emote: 'wave' }), true);
  const [[kind, input]] = udp.sent;
  assert.equal(kind, 'event');
  assert.equal(input.eventType, EVENT_EMOTE);
  assert.deepEqual(input.chunk, { x: '1', y: '0', z: '-2' });
  const emote = kit.emotes.parse({ eventType: input.eventType, state: input.state });
  assert.deepEqual([emote.emote, emote.targetUuid], ['wave', null]);
  const recorded = record.events.find((e) => e.event_type === EVENT_EMOTE);
  assert.deepEqual(JSON.parse(Buffer.from(decodeBase64(input.state)).toString()), recorded.body, 'the registry\'s body');
  assert.equal(kit.emotes.parse({ eventType: 5, state: '' }), null);
});

test('a spectator heartbeat keeps sending its actor until stopped, from where it watches', async () => {
  const udp = fakeUdp();
  const kit = new GameKitClient('77', {}, {}, { udp });
  const beat = kit.spectate.observe({ uuid: 's'.repeat(32), chunk: { x: 0, y: 0, z: 0 }, intervalMs: 250 });
  await new Promise((r) => setTimeout(r, 600));
  beat.moveTo({ x: 3, y: 0, z: 3 });
  beat.stop();
  const n = udp.sent.length;
  assert.ok(n >= 3, `sent ${n}`);
  assert.deepEqual(udp.sent.at(-1)[1].chunk, { x: '3', y: '0', z: '3' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(udp.sent.length, n, 'stopped');
  assert.equal(kit.shards.key(10, -4, 8), '12,-4');
});
