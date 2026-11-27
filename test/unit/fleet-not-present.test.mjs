/**
 * A carried player's refused keepalive (18.41.0, realtime servers v0.51.0).
 *
 * From v0.51.0 a keepalive (`CLIENT_ACTOR_HEARTBEAT`, 26) is accepted only where the player's
 * actor update would be. Where the player has no access the server answers every keepalive
 * `[3][seq][7]`, `UNAUTHORIZED`, inside the fleet session's signed bundle. The session must:
 *   - keep its keepalive cadence: never faster, never stop;
 *   - change no state: the same socket, the same status, the player still carried;
 *   - tell the game once for the player, the actor and the place (`notPresent`), and once
 *     when that ends (`notPresentEnded`), while `genericError` still gets every refusal.
 *
 * An in-memory socket and a clock the test moves, as in fleet-session.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { FLEET_TOKEN, PLAYER_TOKEN, FLEET_ID, PLAYER_ID, USER_ID, UUID, CHUNK, rawHmac, carryResult, released, signedBundle } from './fleet-frames.mjs';

const { FleetSession, KEEPALIVE_ANSWER_WAIT_MS, NOT_PRESENT_IDLE_MS } = await import('../../dist/fleet/index.js');

const START = 1795000000000;
const SERVER = { ip4: '203.0.113.7', ip6: '', clientPort: 9000 };
const OTHER_SERVER = { ip4: '203.0.113.9', ip6: '', clientPort: 9001 };
const ME = { token: PLAYER_TOKEN, gameTokenId: String(PLAYER_ID) };
const ELSEWHERE = { x: '40', y: '0', z: '-7' };
const UNAUTHORIZED = 7;

const grant = (over = {}) => ({
  token: FLEET_TOKEN,
  gameTokenId: String(FLEET_ID),
  appId: '7',
  expiresAt: new Date(START + 24 * 3600_000).toISOString(),
  maxPlayers: 256,
  server: SERVER,
  ...over,
});

function read(datagram) {
  const b = Buffer.from(datagram);
  return {
    type: b[0],
    tailId: b.readBigInt64LE(b.length - 9),
    seq: b[b.length - 1],
    uuid: b.subarray(36, 68).toString('latin1').replace(/\0+$/, ''),
    chunk: { x: String(b.readBigInt64LE(9)), y: String(b.readBigInt64LE(17)), z: String(b.readBigInt64LE(25)) },
  };
}

function harness(config = {}) {
  let now = START;
  const sockets = [];
  const events = { errors: [], notPresent: [], ended: [], statuses: [], carryResults: [], released: [], failures: [] };
  const fleet = new FleetSession({
    session: grant(),
    tickIntervalMs: 0,
    silenceTimeoutMs: 0,
    now: () => now,
    socket: (server, on) => {
      const socket = { server, on, sent: [], closed: false };
      sockets.push(socket);
      return { send: (d) => socket.sent.push(Buffer.from(d)), close: () => (socket.closed = true) };
    },
    handlers: {
      genericError: (n, verified, keepalive) => events.errors.push({ seq: n.sequenceNumber, code: n.errorCode, verified, keepalive }),
      notPresent: (report) => events.notPresent.push(report),
      notPresentEnded: (report, end) => events.ended.push({ report, end }),
      status: (s) => events.statuses.push(s),
      carryResult: (r) => events.carryResults.push(r),
      released: (r) => events.released.push(r),
      error: (e) => events.failures.push(e),
    },
    ...config,
  });
  const h = {
    fleet,
    sockets,
    events,
    get socket() {
      return sockets.at(-1);
    },
    async advance(ms = 0) {
      now += ms;
      await fleet.tick();
    },
    async receive(datagram, socket = sockets.at(-1)) {
      socket.on.onDatagram(new Uint8Array(datagram));
      await fleet.settled();
    },
    async connect() {
      await fleet.connect();
      const caps = h.socket.sent.find((d) => d[0] === 29);
      const lead = Buffer.concat([Buffer.from([46]), caps.subarray(72, 80)]);
      await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
    },
    async carry(player = ME, userId = USER_ID) {
      const pending = fleet.carry(player);
      await h.advance();
      await h.receive(signedBundle([carryResult(player.gameTokenId, userId, 0)]));
      return pending;
    },
    /** The player's keepalives sent so far (26 under the player's id), in order. */
    keepalives(socket = sockets.at(-1), player = PLAYER_ID) {
      return socket.sent.map(read).filter((m) => m.type === 26 && m.tailId === BigInt(player));
    },
    /** The server refuses a send, inside the session's signed bundle. */
    async refuse(seq, code = UNAUTHORIZED) {
      await h.receive(signedBundle([Buffer.from([3, seq, code])]));
    },
    /** Move the clock to the next keepalive and return it. */
    async nextKeepalive(ms = 2_000) {
      const before = h.keepalives().length;
      await h.advance(ms);
      const all = h.keepalives();
      assert.equal(all.length, before + 1, 'one keepalive for the actor in this interval');
      return all.at(-1);
    },
  };
  return h;
}

/** A connected session that carries ME, whose actor stands at CHUNK. */
async function carrying(config) {
  const h = harness(config);
  await h.connect();
  await h.carry();
  await h.fleet.sendActorUpdate(ME.gameTokenId, { chunk: CHUNK, uuid: UUID, state: 'AQID' });
  return h;
}

test('a refused keepalive is reported once, and the keepalives keep their rate', async () => {
  const h = await carrying();
  assert.equal(h.fleet.notPresent(ME.gameTokenId, UUID), null);

  const first = await h.nextKeepalive();
  assert.deepEqual([first.uuid, first.chunk], [UUID, CHUNK]);
  await h.refuse(first.seq);

  const report = { uuid: UUID, chunk: CHUNK, sequence: first.seq, verified: true, playerGameTokenId: ME.gameTokenId };
  assert.deepEqual(h.events.notPresent, [report]);
  assert.deepEqual(h.fleet.notPresent(ME.gameTokenId, UUID), report);
  assert.deepEqual(h.events.errors, [{ seq: first.seq, code: 'UNAUTHORIZED', verified: true, keepalive: true }]);

  // The server refuses every keepalive there. The session sends one every 2 seconds, as
  // before: not one more, and it does not stop.
  for (let i = 0; i < 20; i += 1) {
    const before = h.keepalives().length;
    await h.advance(1_000);
    assert.equal(h.keepalives().length, before, 'no keepalive before its interval');
    const next = await h.nextKeepalive(1_000);
    await h.refuse(next.seq);
  }
  assert.equal(h.keepalives().length, 21);
  assert.equal(h.events.notPresent.length, 1, 'told once for the player, the actor and the place');
  assert.equal(h.events.ended.length, 0);
  assert.equal(h.events.errors.length, 21, 'genericError still gets every refusal');
  assert.ok(h.events.errors.every((e) => e.keepalive && e.verified));
  assert.deepEqual(h.fleet.notPresent(ME.gameTokenId, UUID), report);

  // Nothing else changed: the same socket, connected, the player carried, nothing carried
  // again and nobody released.
  assert.equal(h.sockets.length, 1);
  assert.equal(h.fleet.status, 'connected');
  assert.equal(h.fleet.carries(ME.gameTokenId), true);
  assert.equal(h.socket.sent.filter((d) => d[0] === 49).length, 1, 'no carry sent again');
  assert.equal(h.socket.sent.filter((d) => d[0] === 50).length, 0, 'no release');
  assert.equal(h.fleet.refreshDue(), false);
  assert.deepEqual(h.events.released, []);
  assert.deepEqual(h.events.failures, []);
  const stats = h.fleet.stats();
  assert.equal(stats.keepalivesRefused, 21);
  assert.equal(stats.notPresentReports, 1);
  assert.equal(stats.unauthorizedReceived, 21);
});

test('the report ends `accepted` when a keepalive there goes 3 seconds without a refusal', async () => {
  const h = await carrying();
  const first = await h.nextKeepalive();
  await h.refuse(first.seq);
  const report = h.events.notPresent[0];

  // One refusal is lost: the next keepalive is refused in time, so the report stands.
  await h.nextKeepalive(); // no answer
  const third = await h.nextKeepalive();
  await h.refuse(third.seq);
  await h.advance(1_500);
  assert.equal(h.events.ended.length, 0, 'a lost refusal does not read as acceptance');

  // Access is granted: the keepalives are answered with nothing.
  await h.nextKeepalive(500); // 2 s after the third
  await h.advance(KEEPALIVE_ANSWER_WAIT_MS - 1);
  assert.equal(h.events.ended.length, 0);
  await h.advance(1);
  assert.deepEqual(h.events.ended, [{ report, end: 'accepted' }]);
  assert.equal(h.fleet.notPresent(ME.gameTokenId, UUID), null);

  // Refused again later: a new report, told again.
  const later = await h.nextKeepalive(2_000);
  await h.refuse(later.seq);
  assert.equal(h.events.notPresent.length, 2);
  assert.equal(h.events.notPresent[1].sequence, later.seq);
  assert.equal(h.fleet.stats().notPresentReports, 2);
});

test('the report ends `moved` when the actor\u2019s next update or keepalive names another chunk', async () => {
  const h = await carrying();
  const first = await h.nextKeepalive();
  await h.refuse(first.seq);
  const report = h.events.notPresent[0];

  await h.fleet.sendActorUpdate(ME.gameTokenId, { chunk: ELSEWHERE, uuid: UUID, state: 'AQID' });
  assert.deepEqual(h.events.ended, [{ report, end: 'moved' }]);
  assert.equal(h.fleet.notPresent(ME.gameTokenId, UUID), null);

  // Refused in the new place too: a new report, for that place.
  const there = await h.nextKeepalive();
  assert.deepEqual(there.chunk, ELSEWHERE);
  await h.refuse(there.seq);
  assert.deepEqual(h.events.notPresent[1], { ...report, chunk: ELSEWHERE, sequence: there.seq });

  // A keepalive the game sends for another chunk ends that one the same way.
  await h.fleet.sendHeartbeat(ME.gameTokenId, { chunk: CHUNK, uuid: UUID });
  assert.equal(h.events.ended.length, 2);
  assert.equal(h.events.ended[1].end, 'moved');
});

test('the report ends `stopped` when the keepalives stop, the actor is forgotten, or the player is gone', async () => {
  // The game sends the keepalives itself, and stops.
  const manual = harness({ actorHeartbeatMs: 0 });
  await manual.connect();
  await manual.carry();
  const seq = await manual.fleet.sendHeartbeat(ME.gameTokenId, { chunk: CHUNK, uuid: UUID });
  await manual.refuse(seq);
  assert.equal(manual.events.notPresent.length, 1);
  await manual.advance(NOT_PRESENT_IDLE_MS - 1);
  assert.equal(manual.events.ended.length, 0);
  await manual.advance(1);
  assert.deepEqual(manual.events.ended.map((e) => e.end), ['stopped']);

  // The game tells the session to forget the actor: at once.
  const forgotten = await carrying();
  await forgotten.refuse((await forgotten.nextKeepalive()).seq);
  forgotten.fleet.forgetActor(ME.gameTokenId, UUID);
  assert.deepEqual(forgotten.events.ended.map((e) => e.end), ['stopped']);
  assert.equal(forgotten.fleet.notPresent(ME.gameTokenId, UUID), null);

  // The server ends the carry: the report ends at the session's next pass.
  const gone = await carrying();
  await gone.refuse((await gone.nextKeepalive()).seq);
  await gone.receive(signedBundle([released(PLAYER_ID, 2)]));
  await gone.advance(100);
  assert.deepEqual(gone.events.ended.map((e) => e.end), ['stopped']);
});

test('only a verified UNAUTHORIZED for a player\u2019s own keepalive makes a report', async () => {
  const h = await carrying();

  // Unverified (three bytes alone): counted, handed to genericError, and nothing more.
  const first = await h.nextKeepalive();
  await h.receive(Buffer.from([3, first.seq, UNAUTHORIZED]));
  assert.deepEqual(h.events.errors.at(-1), { seq: first.seq, code: 'UNAUTHORIZED', verified: false, keepalive: true });
  assert.equal(h.events.notPresent.length, 0);
  assert.equal(h.fleet.stats().keepalivesRefused, 1);

  // Another code for a keepalive: a keepalive's refusal, and no report.
  const second = await h.nextKeepalive();
  await h.refuse(second.seq, 33);
  assert.deepEqual(h.events.errors.at(-1), { seq: second.seq, code: 'APP_PAUSED', verified: true, keepalive: true });
  assert.equal(h.fleet.stats().keepalivesRefused, 1);

  // The refusal of an update, under a number no keepalive used: not a keepalive's.
  const update = await h.fleet.sendActorUpdate(ME.gameTokenId, { chunk: CHUNK, uuid: UUID, state: 'AQID' });
  await h.refuse(update);
  assert.deepEqual(h.events.errors.at(-1), { seq: update, code: 'UNAUTHORIZED', verified: true, keepalive: false });

  // The session's own keepalive names no actor: a keepalive's refusal, and no report.
  const own = h.socket.sent.map(read).filter((m) => m.type === 26 && m.tailId === FLEET_ID).at(-1);
  await h.refuse(own.seq);
  assert.equal(h.events.errors.at(-1).keepalive, true);

  // A refusal that comes later than a keepalive's answer can: not taken for one.
  const late = await h.nextKeepalive();
  await h.advance(KEEPALIVE_ANSWER_WAIT_MS + 1);
  const lateSeq = late.seq;
  // (the next keepalive has left meanwhile under another number)
  await h.refuse(lateSeq);
  assert.equal(h.events.errors.at(-1).keepalive, false);

  assert.equal(h.events.notPresent.length, 0);
  assert.equal(h.fleet.stats().notPresentReports, 0);
});

test('a first report needs a sequence number only that keepalive used in the last 3 seconds', async () => {
  const h = await carrying();
  // 255 other sends in the same instant: the next number was used a moment ago.
  for (let i = 0; i < 255; i += 1) {
    await h.fleet.sendTextPacket(ME.gameTokenId, { chunk: CHUNK, uuid: UUID, text: 'x' });
  }
  const crowded = await h.nextKeepalive();
  await h.refuse(crowded.seq);
  assert.equal(h.events.errors.at(-1).keepalive, true);
  assert.equal(h.fleet.stats().keepalivesRefused, 1);
  assert.equal(h.events.notPresent.length, 0, 'the number could have been another message\u2019s');

  // Two seconds on the same number has not been used again: the next refusal reports.
  const clear = await h.nextKeepalive();
  await h.refuse(clear.seq);
  assert.equal(h.events.notPresent.length, 1);
  assert.equal(h.events.notPresent[0].sequence, clear.seq);
});

test('what was sent to the server the session left is answered by nothing on the next one', async () => {
  const h = await carrying();
  const first = await h.nextKeepalive();
  await h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  assert.equal(h.sockets.length, 2);
  // The old keepalive's number, signed, on the new connection: it answers nothing sent here.
  await h.refuse(first.seq);
  assert.equal(h.events.errors.at(-1).keepalive, false);
  assert.equal(h.events.notPresent.length, 0);
});
