/**
 * `FleetSession` (`@crowdedkingdoms/crowdyjs/fleet`) against an in-memory socket: this file
 * plays the realtime server with the frames fleet-frames.mjs writes out with `node:crypto`.
 * No network, and a clock the test moves, so every timed thing (carry retries and pacing,
 * keepalives, the capabilities) is exact.
 *
 * What a fleet session must hold to (the build contract's section 8):
 *   - it binds with its capabilities first, under its own game token id;
 *   - under its own id it sends only 29, 49, 50 and 26; everything else carries a carried
 *     player's id in the tail, with the HMAC keyed with the fleet token;
 *   - an unanswered carry is sent again with a new time and proof, and carries are paced
 *     under 64 a second;
 *   - what it receives is verified before a handler sees it;
 *   - after a refresh on the same server it sends capabilities only; on another server,
 *     capabilities and then a new carry for every player.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  FLEET_TOKEN,
  PLAYER_TOKEN,
  FLEET_ID,
  PLAYER_ID,
  OTHER_PLAYER_ID,
  USER_ID,
  UUID,
  CHUNK,
  hex,
  i64,
  rawHmac,
  tokenHmac,
  plainNotification,
  signedNotification,
  channelNotification,
  carryResult,
  released,
  delivery,
  withOwnHmac,
  signedBundle,
} from './fleet-frames.mjs';

const { FleetSession, FleetNotCarriedError } = await import('../../dist/fleet/index.js');

const START = 1795000000000;
const SERVER = { ip4: '203.0.113.7', ip6: '', clientPort: 9000 };
const OTHER_SERVER = { ip4: '203.0.113.9', ip6: '', clientPort: 9001 };
const OWN_TYPES = [26, 29, 49, 50];
const B64 = Buffer.from([1, 2, 3]).toString('base64');

const grant = (over = {}) => ({
  token: FLEET_TOKEN,
  gameTokenId: String(FLEET_ID),
  appId: '7',
  expiresAt: new Date(START + 24 * 3600_000).toISOString(),
  maxPlayers: 256,
  server: SERVER,
  ...over,
});

/** A player's 64-character token and id, by number. */
const playerToken = (n) => ({
  token: `player-${String(n).padStart(4, '0')}-`.padEnd(64, 'x'),
  gameTokenId: String(10_000 + n),
});

/** What one client datagram says: its type, the id and sequence in its tail, and its HMAC. */
function read(datagram) {
  const b = Buffer.from(datagram);
  const hmacAt = b.length - 41;
  return {
    type: b[0],
    tailId: b.readBigInt64LE(b.length - 9),
    seq: b[b.length - 1],
    payload: b.subarray(68, hmacAt),
    uuid: b.subarray(36, 68).toString('latin1').replace(/\0+$/, ''),
    chunk: [b.readBigInt64LE(9), b.readBigInt64LE(17), b.readBigInt64LE(25)].map(String),
    signedByFleet: hex(b.subarray(hmacAt, hmacAt + 32)) === hex(tokenHmac(FLEET_TOKEN, b.subarray(0, hmacAt))),
  };
}

/** A FLEET_CARRY's app payload: the player, the time, and whether the proof holds for `token`. */
function readCarry(datagram, token) {
  const { payload } = read(datagram);
  const player = payload.readBigInt64LE(0);
  const epoch = payload.readBigInt64LE(8);
  const proof = hex(payload.subarray(16, 48));
  const expected = rawHmac(token, Buffer.concat([Buffer.from('ck-fleet-carry', 'ascii'), i64(FLEET_ID), i64(player), i64(epoch)]));
  return { player, epoch, proof, proofHolds: proof === hex(expected) };
}

/** The in-memory network: every socket the session opened, and what it sent on each. */
function harness(config = {}) {
  let now = START;
  const sockets = [];
  const events = { carryResults: [], released: [], statuses: [], errors: [], moves: 0, sessionReleased: [], notifications: [] };
  const record = (name) => (n, players) => events.notifications.push({ name, n, players });
  const fleet = new FleetSession({
    session: grant(config.grant),
    tickIntervalMs: 0,
    // This server answers only what a test makes it answer, so the silence watchdog is off
    // except where a test is about it.
    silenceTimeoutMs: 0,
    now: () => now,
    socket: (server, on) => {
      const socket = { server, on, sent: [], closed: false };
      sockets.push(socket);
      return {
        send: (d) => {
          assert.equal(socket.closed, false, 'nothing is sent on a closed socket');
          socket.sent.push(Buffer.from(d));
        },
        close: () => {
          socket.closed = true;
        },
      };
    },
    handlers: {
      actorUpdate: record('actorUpdate'),
      voxelUpdate: record('voxelUpdate'),
      text: record('text'),
      audio: record('audio'),
      video: record('video'),
      channelMessage: record('channelMessage'),
      genericError: (n, verified) => events.notifications.push({ name: 'genericError', n, verified }),
      carryResult: (r) => events.carryResults.push(r),
      released: (r) => events.released.push(r),
      moveOrdered: () => {
        events.moves += 1;
      },
      sessionReleased: (reason) => events.sessionReleased.push(reason),
      status: (s) => events.statuses.push(s),
      error: (e) => events.errors.push(e),
    },
    ...config.session,
  });
  const h = {
    fleet,
    sockets,
    events,
    get socket() {
      return sockets.at(-1);
    },
    get now() {
      return now;
    },
    /** Move the clock and do the timed work once. */
    async advance(ms = 0) {
      now += ms;
      await fleet.tick();
    },
    /** One datagram from the realtime server, handled before this returns. */
    async receive(datagram, socket = sockets.at(-1)) {
      socket.on.onDatagram(new Uint8Array(datagram));
      await fleet.settled();
    },
    /** The nonce this connection sent in its capabilities. */
    nonce(socket = sockets.at(-1)) {
      const caps = socket.sent.map(read).find((m) => m.type === 29);
      return caps.payload.subarray(4, 12);
    },
    /** CONTROL_BOUND_ACK (46): the server accepted the capabilities. */
    async acknowledge(socket = sockets.at(-1)) {
      const lead = Buffer.concat([Buffer.from([46]), h.nonce(socket)]);
      await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]), socket);
    },
    /** Connect, and have the server acknowledge. */
    async connect() {
      await fleet.connect();
      await h.acknowledge();
    },
    /** Carry a player all the way: the 49, and the server's 51 with status 0. */
    async carry(player, userId) {
      const pending = fleet.carry(player);
      await h.advance();
      await h.receive(signedBundle([carryResult(player.gameTokenId, userId, 0)]));
      return pending;
    },
    sentOfType(type, socket = sockets.at(-1)) {
      return socket.sent.filter((d) => d[0] === type);
    },
  };
  return h;
}

const ME = { token: PLAYER_TOKEN, gameTokenId: String(PLAYER_ID) };

test('connect binds with the capabilities first, under the session\u2019s own id', async () => {
  const h = harness({ session: { fleetOwnState: true } });
  assert.equal(h.fleet.status, 'idle');
  await h.fleet.connect();
  assert.equal(h.sockets.length, 1);
  assert.deepEqual(h.socket.server, SERVER, 'the server the open answer named');
  assert.equal(h.socket.sent.length, 1);
  const caps = read(h.socket.sent[0]);
  assert.equal(caps.type, 29);
  assert.equal(caps.tailId, FLEET_ID);
  assert.equal(caps.signedByFleet, true);
  assert.deepEqual(caps.chunk, ['0', '0', '0']);
  assert.equal(caps.uuid, '');
  // [u32 flags][8B nonce]: signed bundles, bound control frames, and its own players' state.
  assert.equal(caps.payload.length, 12);
  assert.equal(caps.payload.readUInt32LE(0), 1 | 2 | 8);
  assert.notEqual(hex(caps.payload.subarray(4)), '0000000000000000');
  assert.equal(h.fleet.status, 'connecting');

  // Until the server answers, the capabilities go again every 500 ms: the session's token
  // may reach the realtime server a moment after openFleetSession returns.
  await h.advance(499);
  assert.equal(h.sentOfType(29).length, 1);
  await h.advance(1);
  assert.equal(h.sentOfType(29).length, 2);
  assert.equal(h.fleet.stats().boundControlAcks, 0);
  await h.acknowledge();
  assert.equal(h.fleet.status, 'connected');
  assert.deepEqual(h.events.statuses, ['connecting', 'connected']);
  assert.equal(h.fleet.stats().boundControlAcks, 1);
  // Once it has, every 15 seconds.
  await h.advance(14_999);
  assert.equal(h.sentOfType(29).length, 2);
  await h.advance(1);
  assert.equal(h.sentOfType(29).length, 3);
  // A second connect() opens nothing more.
  await h.fleet.connect();
  assert.equal(h.sockets.length, 1);
  assert.deepEqual(h.events.errors, []);
});

test('carry sends FLEET_CARRY with the proof, and the result names the user', async () => {
  const h = harness();
  await h.connect();
  const pending = h.fleet.carry(ME);
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4242', userId: null, carried: false, pending: true }]);
  // Not carried yet: a send for the player is refused here, and nothing leaves.
  await assert.rejects(h.fleet.sendTextPacket(PLAYER_ID, { chunk: CHUNK, uuid: UUID, text: 'early' }), FleetNotCarriedError);
  await h.advance();
  const carries = h.sentOfType(49);
  assert.equal(carries.length, 1);
  assert.equal(carries[0].length, 157);
  const frame = read(carries[0]);
  assert.equal(frame.tailId, FLEET_ID, 'a carry is the session\u2019s own message');
  assert.equal(frame.signedByFleet, true);
  const carry = readCarry(carries[0], PLAYER_TOKEN);
  assert.equal(carry.player, PLAYER_ID);
  assert.equal(carry.epoch, BigInt(START));
  assert.equal(carry.proofHolds, true);

  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  const result = await pending;
  assert.deepEqual(result, { playerGameTokenId: '4242', userId: '77', status: 'carried', wireStatus: 0, carried: true });
  assert.deepEqual(h.events.carryResults, [result]);
  assert.equal(h.fleet.carries(PLAYER_ID), true);
  assert.equal(h.fleet.carries('4242'), true);
  assert.equal(h.fleet.carriedCount, 1);
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4242', userId: '77', carried: true, pending: false }]);
  // Answered: it is not sent again.
  await h.advance(1_000);
  assert.equal(h.sentOfType(49).length, 1);
  // The same answer again (the server answers a repeated carry as it was) changes nothing.
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal(h.events.carryResults.length, 1);
  assert.equal(h.fleet.stats().unmatchedCarryResults, 0);
});

test('an unanswered carry is sent again with a new time and a new proof, then times out', async () => {
  const h = harness();
  await h.connect();
  const pending = h.fleet.carry(ME);
  await h.advance();
  await h.advance(249);
  assert.equal(h.sentOfType(49).length, 1, 'not before carryRetryMs');
  await h.advance(1);
  await h.advance(250);
  const sent = h.sentOfType(49).map((d) => readCarry(d, PLAYER_TOKEN));
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((c) => c.epoch), [BigInt(START), BigInt(START + 250), BigInt(START + 500)]);
  assert.equal(new Set(sent.map((c) => c.proof)).size, 3, 'each send has its own proof');
  for (const c of sent) {
    assert.equal(c.player, PLAYER_ID);
    assert.equal(c.proofHolds, true, 'and each proof holds for its own time');
  }
  // Two sends within the same millisecond still carry different, increasing times.
  const quick = harness({ session: { carryRetryMs: 1 } });
  await quick.connect();
  void quick.fleet.carry(ME);
  await quick.advance();
  await quick.advance(1);
  await quick.advance(1);
  const epochs = quick.sentOfType(49).map((d) => readCarry(d, PLAYER_TOKEN).epoch);
  assert.deepEqual(epochs, [...epochs].sort((a, b) => (a < b ? -1 : 1)));
  assert.equal(new Set(epochs).size, epochs.length);

  // No answer within carryTimeoutMs of the first send: it ends, and the player is not carried.
  await h.advance(4_499);
  assert.equal(h.fleet.players().length, 1);
  await h.advance(1);
  assert.deepEqual(await pending, { playerGameTokenId: '4242', userId: null, status: 'timedOut', wireStatus: null, carried: false });
  assert.deepEqual(h.fleet.players(), []);
  // The server may hold a carry whose answers were all lost: a FLEET_RELEASE makes both
  // sides agree that it ended.
  assert.equal(h.sentOfType(50).length, 1);
  assert.equal(read(h.sentOfType(50)[0]).payload.readBigInt64LE(0), PLAYER_ID);
  const before = h.sentOfType(49).length;
  await h.advance(1_000);
  assert.equal(h.sentOfType(49).length, before, 'and it is sent no more');
  // A late answer finds no carry waiting. The server holds one the session let go: release it.
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal(h.fleet.stats().unmatchedCarryResults, 1);
  assert.equal(h.fleet.carries(PLAYER_ID), false);
  const release = h.sentOfType(50).map(read);
  assert.equal(release.length, 2);
  assert.equal(release[1].payload.readBigInt64LE(0), PLAYER_ID);
});

test('each refusal of a carry reads as itself and leaves the player not carried', async () => {
  // Status 1 is asked about once more before it settles: its own test is below.
  const outcomes = { 2: 'otherOrganization', 3: 'proofFailed', 4: 'sessionFull', 9: 'refused' };
  for (const [status, name] of Object.entries(outcomes)) {
    const h = harness();
    await h.connect();
    const pending = h.fleet.carry(ME);
    await h.advance();
    await h.receive(withOwnHmac(carryResult(PLAYER_ID, 0, Number(status))));
    assert.deepEqual(await pending, {
      playerGameTokenId: '4242',
      userId: null,
      status: name,
      wireStatus: Number(status),
      carried: false,
    });
    assert.equal(h.fleet.carries(PLAYER_ID), false);
    assert.deepEqual(h.fleet.players(), []);
    assert.equal(h.events.carryResults.length, 1);
  }
  // A carried player carried again (a refreshed token, say) and refused: the carry that
  // stood is let go with a FLEET_RELEASE, so the server and the session agree.
  const again = harness();
  await again.connect();
  await again.carry(ME, USER_ID);
  const refused = again.fleet.carry(ME);
  await again.advance();
  await again.receive(signedBundle([carryResult(PLAYER_ID, 0, 2)]));
  assert.equal((await refused).status, 'otherOrganization');
  assert.equal(again.fleet.carries(PLAYER_ID), false);
  assert.deepEqual(again.sentOfType(50).map((d) => read(d).payload.readBigInt64LE(0)), [PLAYER_ID]);

  const h = harness();
  await h.connect();
  await assert.rejects(h.fleet.carry({ token: 'short', gameTokenId: '1' }), RangeError);
  await assert.rejects(h.fleet.carry({ token: PLAYER_TOKEN, gameTokenId: 'p-1' }), RangeError);
  await assert.rejects(h.fleet.carry({ token: PLAYER_TOKEN, gameTokenId: String(FLEET_ID) }), /own gameTokenId/);
  assert.equal(h.sentOfType(49).length, 0);
});

test('a token given where an id belongs is refused and never shown in the error', async () => {
  // Messages are logged. A game server that passes a player's token, or the fleet token, where
  // the game token id belongs must not find the token in what it logs.
  const h = harness();
  await h.connect();
  const attempts = [
    () => h.fleet.carry({ token: PLAYER_TOKEN, gameTokenId: PLAYER_TOKEN }),
    () => h.fleet.carry({ token: PLAYER_TOKEN, gameTokenId: String(PLAYER_ID), replaces: FLEET_TOKEN }),
    () => h.fleet.release(PLAYER_TOKEN),
    async () => h.fleet.carries(FLEET_TOKEN),
    () => h.fleet.sendActorUpdate(PLAYER_TOKEN, { chunk: { x: 1, y: 2, z: 3 }, uuid: UUID, state: 'AA==' }),
  ];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (error) => {
      assert.ok(error instanceof RangeError);
      assert.match(error.message, /must be a whole 64-bit number, and was a string of 64 characters$/);
      for (const secret of [PLAYER_TOKEN, FLEET_TOKEN]) {
        assert.ok(!error.message.includes(secret));
        assert.ok(!String(error.stack).includes(secret));
      }
      return true;
    });
  }
  await assert.rejects(h.fleet.release(1.5), /and was a number that is not a safe integer$/);
  await assert.rejects(h.fleet.release(null), /and was null$/);
  assert.equal(h.sentOfType(49).length, 0);
  assert.equal(h.sentOfType(50).length, 0);
});

test('carries are paced under 64 a second, first sends and retries together', async () => {
  const h = harness();
  await h.connect();
  const players = Array.from({ length: 200 }, (_, i) => playerToken(i));
  const results = players.map((p) => h.fleet.carry(p));
  // Nothing is answered for six seconds: every tick has more carries due than may go.
  const times = [];
  const firstSendAt = new Map();
  let retries = 0;
  let seen = 0;
  for (let ms = 0; ms <= 6_000; ms += 20) {
    await h.advance(ms === 0 ? 0 : 20);
    const carries = h.sentOfType(49);
    for (let i = seen; i < carries.length; i += 1) {
      times.push(h.now);
      const player = String(readCarry(carries[i], '').player);
      if (firstSendAt.has(player)) retries += 1;
      else firstSendAt.set(player, h.now);
    }
    seen = carries.length;
  }
  assert.ok(times.length >= 300, `the queue moved (${times.length} carries sent)`);
  for (const t of new Set(times)) {
    const within = times.filter((x) => x >= t && x < t + 1_000).length;
    assert.ok(within < 64, `${within} carries in the second from ${t - START} ms`);
    assert.ok(within <= 60, 'the default pace is 60 a second');
  }
  // Retries and first sends share the pace: a server that answers nothing does not keep new
  // players from being asked for, and a lost answer is asked for again before it times out.
  assert.equal(firstSendAt.size, 200, 'every player was asked for at least once');
  assert.ok(retries >= 100, `${retries} retries went out beside them`);
  // Each times out five seconds after its own first send, and is then released.
  await h.advance(10_000);
  const done = await Promise.all(results);
  assert.ok(done.every((r) => r.status === 'timedOut'));
  assert.equal(new Set(h.sentOfType(50).map((d) => String(read(d).payload.readBigInt64LE(0)))).size, 200);

  // With every carry answered at once, 200 players are carried in a little over three seconds.
  const quick = harness();
  await quick.connect();
  const pending = players.map((p) => quick.fleet.carry(p));
  let answered = 0;
  for (let ms = 0; ms <= 3_400 && quick.fleet.carriedCount < 200; ms += 20) {
    await quick.advance(ms === 0 ? 0 : 20);
    const carries = quick.sentOfType(49);
    const members = [];
    for (; answered < carries.length; answered += 1) {
      const { player } = readCarry(carries[answered], '');
      members.push(carryResult(player, 500_000n + player, 0));
    }
    for (let i = 0; i < members.length; i += 32) await quick.receive(signedBundle(members.slice(i, i + 32)));
  }
  assert.equal(quick.fleet.carriedCount, 200);
  assert.equal(quick.sentOfType(49).length, 200, 'no retry was needed');
  assert.ok((await Promise.all(pending)).every((r) => r.carried));

  // One answer is lost while 150 players wait their turn. The first second's 60 carries are
  // spent, so its retry goes with the next carry the pace allows, ahead of the 90 first
  // sends still waiting, and long before its own five seconds are up.
  const lossy = harness();
  await lossy.connect();
  const many = players.slice(0, 150);
  const lost = BigInt(many[0].gameTokenId);
  const waiting = many.map((p) => lossy.fleet.carry(p));
  let read49 = 0;
  let retriedAt = null;
  for (let ms = 0; ms <= 3_000 && lossy.fleet.carriedCount < 150; ms += 20) {
    await lossy.advance(ms === 0 ? 0 : 20);
    const carries = lossy.sentOfType(49);
    const members = [];
    for (; read49 < carries.length; read49 += 1) {
      const { player } = readCarry(carries[read49], '');
      if (player !== lost) members.push(carryResult(player, 500_000n + player, 0));
      else if (read49 > 0) {
        retriedAt ??= lossy.now - START;
        members.push(carryResult(player, 500_000n + player, 0));
      }
    }
    for (let i = 0; i < members.length; i += 32) await lossy.receive(signedBundle(members.slice(i, i + 32)));
  }
  assert.equal(retriedAt, 1_020, 'the first carry of the second second');
  assert.equal(lossy.fleet.carriedCount, 150);
  assert.ok((await Promise.all(waiting)).every((r) => r.carried));
});

test('a send for a carried player carries the player\u2019s id and is signed with the fleet token', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const before = h.socket.sent.length;
  const spatial = { chunk: CHUNK, uuid: UUID };
  const seqs = [
    await h.fleet.sendActorUpdate(PLAYER_ID, { ...spatial, state: B64 }),
    await h.fleet.sendVoxelUpdate(PLAYER_ID, { ...spatial, voxel: { x: 1, y: 2, z: 3 }, voxelType: 4, voxelState: B64 }),
    await h.fleet.sendClientEvent(PLAYER_ID, { ...spatial, eventType: 12, state: B64 }),
    await h.fleet.sendTextPacket(PLAYER_ID, { ...spatial, text: 'hello' }),
    await h.fleet.sendAudioPacket(PLAYER_ID, { ...spatial, audioData: B64 }),
    await h.fleet.sendVideoPacket(PLAYER_ID, { ...spatial, videoData: B64 }),
    await h.fleet.sendGenericSpatial(PLAYER_ID, { ...spatial, payload: B64 }),
    await h.fleet.sendSingleActorMessage(PLAYER_ID, { chunk: CHUNK, targetUuid: UUID, payload: B64 }),
    await h.fleet.sendChannelMessage(PLAYER_ID, { channelId: '55', uuid: UUID, payload: B64 }),
    await h.fleet.sendChannelAudio(PLAYER_ID, { channelId: '55', uuid: UUID, payload: B64 }),
    await h.fleet.sendRangedChannelMessage(PLAYER_ID, { channelId: '55', uuid: UUID, payload: B64, chunk: CHUNK, maxDistance: 4 }),
    await h.fleet.sendHeartbeat(PLAYER_ID, spatial),
  ];
  await h.fleet.setSpeakers(PLAYER_ID, { voice: [UUID], video: null });
  const sent = h.socket.sent.slice(before).map(read);
  assert.deepEqual(sent.map((m) => m.type), [128, 131, 138, 136, 134, 143, 140, 142, 17, 35, 32, 26, 47, 47]);
  for (const m of sent) {
    assert.equal(m.tailId, PLAYER_ID, `type ${m.type}: the tail names the player`);
    assert.equal(m.signedByFleet, true, `type ${m.type}: keyed with the fleet token`);
  }
  // Each send resolves with the sequence number it went out under, one byte that wraps.
  assert.deepEqual(seqs, sent.slice(0, 12).map((m) => m.seq));
  assert.equal(new Set(seqs).size, seqs.length);
  // The actor update is the message the player's own session would send, for the session's app.
  assert.equal(Buffer.from(h.socket.sent[before]).readBigInt64LE(1), 7n);
  assert.equal(sent[0].uuid, UUID);
  assert.deepEqual(sent[0].chunk, ['1', '-2', '3']);
  // One kind of speaker list a message: voice only these, then video everyone.
  assert.deepEqual([...sent[12].payload.subarray(0, 4)], [1, 1, 0, 0]);
  assert.deepEqual([...sent[13].payload.subarray(0, 4)], [0, 0, 2, 0]);

  // A player the session does not carry: refused here, with nothing sent.
  const count = h.socket.sent.length;
  for (const send of [
    () => h.fleet.sendActorUpdate(OTHER_PLAYER_ID, { ...spatial, state: B64 }),
    () => h.fleet.sendTextPacket('999', { ...spatial, text: 'x' }),
    () => h.fleet.sendChannelMessage(OTHER_PLAYER_ID, { channelId: '55', uuid: UUID, payload: B64 }),
    () => h.fleet.sendHeartbeat(OTHER_PLAYER_ID, spatial),
    () => h.fleet.setSpeakers(OTHER_PLAYER_ID, { voice: [] }),
    // The session's own id is not a player's.
    () => h.fleet.sendTextPacket(FLEET_ID, { ...spatial, text: 'x' }),
  ]) {
    await assert.rejects(send(), (e) => {
      assert.ok(e instanceof FleetNotCarriedError);
      assert.equal(e.code, 'FLEET_NOT_CARRIED');
      return true;
    });
  }
  await assert.rejects(
    h.fleet.setSpeakers(PLAYER_ID, { voice: Array.from({ length: 33 }, () => UUID) }),
    (e) => e.code === 'SPEAKER_LIST_TOO_LONG',
  );
  await assert.rejects(
    h.fleet.sendVoxelUpdate(PLAYER_ID, { ...spatial, voxel: { x: 40_000, y: 0, z: 0 }, voxelType: 1 }),
    RangeError,
  );
  assert.equal(h.socket.sent.length, count);
});

test('under its own id the session sends only 29, 49, 50 and 26, whatever it is asked to do', async () => {
  const h = harness({ session: { fleetOwnState: true } });
  await h.connect();
  const a = playerToken(1);
  const b = playerToken(2);
  await h.carry(a, 501);
  await h.carry(b, 502);
  const spatial = { chunk: CHUNK, uuid: UUID };
  await h.fleet.sendActorUpdate(a.gameTokenId, { ...spatial, state: B64 });
  await h.fleet.sendTextPacket(a.gameTokenId, { ...spatial, text: 'hi' });
  await h.fleet.sendAudioPacket(b.gameTokenId, { ...spatial, audioData: B64 });
  await h.fleet.sendVideoPacket(b.gameTokenId, { ...spatial, videoData: B64 });
  await h.fleet.sendVoxelUpdate(b.gameTokenId, { ...spatial, voxel: { x: 1, y: 1, z: 1 }, voxelType: 2 });
  await h.fleet.sendClientEvent(a.gameTokenId, { ...spatial, eventType: 3, state: B64 });
  await h.fleet.sendChannelMessage(a.gameTokenId, { channelId: '55', uuid: UUID, payload: B64 });
  await h.fleet.setSpeakers(a.gameTokenId, { voice: [UUID], video: [] });
  await h.fleet.setOwnMediaEcho(true);
  await h.fleet.setFleetOwnState(false);
  // Keepalives, actor heartbeats, the periodic capabilities and speaker lists.
  for (let i = 0; i < 20; i += 1) await h.advance(1_000);
  await h.fleet.release(b.gameTokenId);
  // A refresh on the same server, then a move to another one with a carry again.
  await h.fleet.applyRefresh(grant({ expiresAt: new Date(h.now + 24 * 3600_000).toISOString() }));
  await h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  await h.advance();
  await h.receive(signedBundle([carryResult(a.gameTokenId, 501, 0)]));
  await h.fleet.sendActorUpdate(a.gameTokenId, { ...spatial, state: B64 });
  for (let i = 0; i < 5; i += 1) await h.advance(1_000);

  const carried = new Set([BigInt(a.gameTokenId), BigInt(b.gameTokenId)]);
  const ownTypes = new Set();
  const playerTypes = new Set();
  let total = 0;
  for (const socket of h.sockets) {
    for (const datagram of socket.sent) {
      total += 1;
      const m = read(datagram);
      assert.equal(m.signedByFleet, true, `type ${m.type} is signed with the fleet token`);
      if (m.tailId === FLEET_ID) {
        assert.ok(OWN_TYPES.includes(m.type), `type ${m.type} was sent under the session's own id`);
        ownTypes.add(m.type);
        // Its own heartbeat registers no actor.
        if (m.type === 26) assert.equal(m.uuid, '');
      } else {
        assert.ok(carried.has(m.tailId), `type ${m.type} names ${m.tailId}, which is no carried player`);
        assert.ok(![29, 49, 50].includes(m.type), `type ${m.type} is never sent under a player's id`);
        playerTypes.add(m.type);
      }
    }
  }
  assert.ok(total >= 40, `${total} datagrams were checked`);
  assert.deepEqual([...ownTypes].sort((x, y) => x - y), OWN_TYPES, 'and it did send all four');
  // Under players' ids: channel, actor heartbeat, speakers, and the spatial sends.
  assert.deepEqual([...playerTypes].sort((x, y) => x - y), [17, 26, 47, 128, 131, 134, 136, 138, 143]);
  assert.deepEqual(h.events.errors, []);
});

test('state arrives once for the session; a delivery names the players it is for', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const fields = { chunk: [1, -2, 3], distance: 8, uuid: UUID };
  const actor = plainNotification({ ...fields, type: 130, decay: 1, payload: Buffer.from([1, 2, 3]) }, { epochMs: 5n, seq: 1 });
  const text = plainNotification({ ...fields, type: 137, payload: Buffer.from('hello') }, { epochMs: 6n, seq: 2 });
  const channel = channelNotification({ channelId: 55, uuid: UUID, payload: [9, 9], epochMs: 7n, seq: 3 });
  await h.receive(
    signedBundle([
      actor,
      delivery([PLAYER_ID, OTHER_PLAYER_ID], text),
      delivery([PLAYER_ID], channel),
      Buffer.from([3, 4, 7]),
    ]),
  );
  const got = h.events.notifications;
  assert.deepEqual(got.map((e) => e.name), ['actorUpdate', 'text', 'channelMessage', 'genericError']);
  // Plain: for every one of the session's players in range, so no list.
  assert.equal(got[0].players, null);
  assert.equal(got[0].n.__typename, 'ActorUpdateNotification');
  assert.equal(got[0].n.state, B64);
  // Inside a FLEET_DELIVERY: only these players.
  assert.deepEqual(got[1].players, ['4242', '4243']);
  assert.equal(got[1].n.text, 'hello');
  assert.deepEqual(got[2].players, ['4242']);
  assert.equal(got[2].n.channelId, '55');
  assert.deepEqual(got[3].n, { __typename: 'GenericErrorResponse', sequenceNumber: 4, errorCode: 'UNAUTHORIZED' });
  const stats = h.fleet.stats();
  assert.equal(stats.errorsReceived, 1);
  assert.equal(stats.unauthorizedReceived, 1);

  // A session that did not advertise signed bundles is sent each with its own HMAC.
  h.events.notifications.length = 0;
  await h.receive(signedNotification({ ...fields, type: 130, payload: Buffer.from([4]) }, { epochMs: 8n, seq: 4 }));
  await h.receive(withOwnHmac(delivery([PLAYER_ID], text)));
  assert.deepEqual(h.events.notifications.map((e) => [e.name, e.players]), [
    ['actorUpdate', null],
    ['text', ['4242']],
  ]);
  // A handler that throws is reported and stops nothing.
  h.fleet.setHandlers({
    text: () => {
      throw new Error('handler bug');
    },
    error: (e) => h.events.errors.push(e),
  });
  await h.receive(withOwnHmac(delivery([PLAYER_ID], text)));
  assert.equal(h.events.errors.length, 1);
  assert.match(h.events.errors[0].message, /handler bug/);
});

test('a frame whose HMAC fails is dropped and counted, and changes nothing', async () => {
  const h = harness();
  await h.connect();
  const pending = h.fleet.carry(ME);
  await h.advance();
  // A forged result, three ways: another key, a rewritten byte, no HMAC at all.
  await h.receive(withOwnHmac(carryResult(PLAYER_ID, USER_ID, 0), PLAYER_TOKEN));
  const rewritten = Buffer.from(signedBundle([carryResult(PLAYER_ID, 0, 3)]));
  rewritten[20] = 0;
  await h.receive(rewritten);
  await h.receive(carryResult(PLAYER_ID, USER_ID, 0));
  assert.equal(h.fleet.carries(PLAYER_ID), false);
  assert.equal(h.fleet.stats().hmacFailures, 3);
  assert.deepEqual(h.events.carryResults, []);
  // The carry is still waiting, and the true answer still lands.
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal((await pending).carried, true);

  // A forged release, delivery and notification are dropped the same way.
  const text = plainNotification({ type: 137, chunk: [1, -2, 3], distance: 8, uuid: UUID, payload: Buffer.from('x') }, { epochMs: 1n, seq: 1 });
  await h.receive(withOwnHmac(released(PLAYER_ID, 2), PLAYER_TOKEN));
  await h.receive(withOwnHmac(delivery([PLAYER_ID], text), PLAYER_TOKEN));
  await h.receive(signedNotification({ type: 130, chunk: [1, -2, 3], uuid: UUID, payload: Buffer.from([1]) }, { epochMs: 1n, seq: 1, token: PLAYER_TOKEN }));
  assert.equal(h.fleet.carries(PLAYER_ID), true);
  assert.deepEqual(h.events.released, []);
  assert.deepEqual(h.events.notifications, []);
  assert.equal(h.fleet.stats().hmacFailures, 6);
  // A notification with no signature at all did not come from the realtime servers.
  await h.receive(text);
  assert.deepEqual(h.events.notifications, []);
  assert.equal(h.fleet.stats().unsigned, 1);
  assert.deepEqual(h.events.errors, []);
});

test('no option makes a session dispatch a notification the realtime server did not sign', async () => {
  // `acceptUnsigned` was an option once. Passing it now changes nothing.
  const h = harness({ session: { acceptUnsigned: true } });
  await h.connect();
  await h.carry(ME, USER_ID);
  const fields = { chunk: [1, -2, 3], distance: 8, uuid: UUID };
  const actor = plainNotification({ ...fields, type: 130, payload: Buffer.from([1]) }, { epochMs: 1n, seq: 1 });
  const text = plainNotification({ ...fields, type: 137, payload: Buffer.from('forged') }, { epochMs: 1n, seq: 2 });
  const channel = channelNotification({ channelId: 55, uuid: UUID, payload: [1], epochMs: 1n, seq: 3 });
  const voxel = plainNotification({ ...fields, type: 133, payload: Buffer.alloc(10) }, { epochMs: 1n, seq: 4 });
  // Alone, and as members of an unsigned bundle.
  for (const datagram of [actor, text, channel, voxel, Buffer.concat([Buffer.from([2]), ...[actor, text].flatMap((m) => [Buffer.from([m.length, 0]), m])])]) {
    await h.receive(datagram);
  }
  assert.deepEqual(h.events.notifications, [], 'no handler ran');
  assert.equal(h.fleet.stats().unsigned, 6);
  // The same bytes inside a bundle the server signed do reach the handlers.
  await h.receive(signedBundle([actor, voxel]));
  assert.deepEqual(h.events.notifications.map((e) => e.name), ['actorUpdate', 'voxelUpdate']);
  // An unsigned frame is not the server speaking: it does not make a session connected.
  const quiet = harness({ session: { acceptUnsigned: true } });
  await quiet.fleet.connect();
  await quiet.receive(actor);
  assert.equal(quiet.fleet.status, 'connecting');
  // And the option is in no declaration the package ships.
  const { readFileSync } = await import('node:fs');
  for (const file of ['fleet/session.d.ts', 'fleet/index.d.ts', 'fleet-wire.d.ts', 'index.d.ts']) {
    const declarations = readFileSync(new URL(`../../dist/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(declarations, /acceptUnsigned/, file);
  }
});

test('a notification that names another app reaches no handler, however it was signed', async () => {
  // Seen on the dev tier on 2026-11-26: a session of one app was sent, inside bundles signed
  // with its own fleet token, actor updates of another app of the same organization.
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const other = (type, payload) => {
    const mine = plainNotification({ type, chunk: [-26, 43, 0], distance: 8, uuid: UUID, payload }, { epochMs: 1n, seq: 1 });
    const theirs = Buffer.from(mine);
    theirs.writeBigInt64LE(116465110449664n, 1); // [1B type][8B appId]…
    return { mine, theirs };
  };
  const actor = other(130, Buffer.from([1, 2, 3]));
  const text = other(137, Buffer.from('not yours'));
  const voxel = other(133, Buffer.alloc(10));
  // Plain in a signed bundle, with its own HMAC, and inside a delivery: all verified.
  await h.receive(signedBundle([actor.theirs, voxel.theirs]));
  const head = Buffer.from(actor.theirs.subarray(0, actor.theirs.length - 9));
  head[35] = 1;
  await h.receive(Buffer.concat([head, tokenHmac(FLEET_TOKEN, head), actor.theirs.subarray(actor.theirs.length - 9)]));
  await h.receive(signedBundle([delivery([PLAYER_ID], text.theirs)]));
  await h.receive(withOwnHmac(delivery([PLAYER_ID], text.theirs)));
  assert.deepEqual(h.events.notifications, [], 'no handler ran');
  const stats = h.fleet.stats();
  assert.equal(stats.wrongApp, 5);
  assert.equal(stats.hmacFailures, 0, 'they verified: the check is on what they say, after who sent them');
  assert.equal(stats.unsigned, 0);
  // The session's own app, in the same forms, is delivered.
  await h.receive(signedBundle([actor.mine, voxel.mine, delivery([PLAYER_ID], text.mine)]));
  assert.deepEqual(h.events.notifications.map((e) => e.name), ['actorUpdate', 'voxelUpdate', 'text']);
  assert.equal(h.fleet.stats().wrongApp, 5);
  // A channel notification names no app, so it is not judged by one.
  const channel = channelNotification({ channelId: 55, uuid: UUID, payload: [1], epochMs: 1n, seq: 2 });
  await h.receive(signedBundle([delivery([PLAYER_ID], channel)]));
  assert.equal(h.events.notifications.at(-1).name, 'channelMessage');
  // It still counts as the server speaking: the session is connected and not silent.
  assert.equal(h.fleet.status, 'connected');
});

test('a refusal reaches genericError with whether it was verified, and an unverified one changes no state', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const seq = await h.fleet.sendTextPacket(PLAYER_ID, { chunk: CHUNK, uuid: UUID, text: 'hi' });

  // [3][seq][7 UNAUTHORIZED] alone in its datagram: no HMAC, so anyone who can reach the
  // socket could have sent it. It still reaches the game server, marked.
  await h.receive(Buffer.from([3, seq, 7]));
  // The same refusal inside a bundle signed with the fleet token.
  await h.receive(signedBundle([Buffer.from([3, seq, 7])]));
  // And as a member of an unsigned bundle (2): unverified too.
  await h.receive(Buffer.concat([Buffer.from([2, 3, 0]), Buffer.from([3, seq, 7])]));
  const refusal = { __typename: 'GenericErrorResponse', sequenceNumber: seq, errorCode: 'UNAUTHORIZED' };
  assert.deepEqual(h.events.notifications, [
    { name: 'genericError', n: refusal, verified: false },
    { name: 'genericError', n: refusal, verified: true },
    { name: 'genericError', n: refusal, verified: false },
  ]);
  // Both kinds are counted, and the unverified ones are counted apart.
  const stats = h.fleet.stats();
  assert.equal(stats.errorsReceived, 3);
  assert.equal(stats.unauthorizedReceived, 3);
  assert.equal(stats.unverifiedErrorsReceived, 2);
  // The session itself acts on neither: the player is still carried until the game server
  // decides, and sends still go.
  assert.equal(h.fleet.carries(PLAYER_ID), true);
  await h.fleet.sendTextPacket(PLAYER_ID, { chunk: CHUNK, uuid: UUID, text: 'still here' });

  // TOKEN_EXPIRED (32) and every other code, unverified: handed over, and nothing changes.
  for (const code of [32, 5, 15, 33, 1]) await h.receive(Buffer.from([3, 9, code]));
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.fleet.refreshDue(), false);
  assert.equal(h.fleet.status, 'connected');
  assert.equal(h.events.moves, 0);
  assert.equal(h.fleet.carriedCount, 1);
  assert.equal(h.events.notifications.filter((e) => e.verified === false).length, 7);
  assert.equal(h.fleet.stats().unverifiedErrorsReceived, 7);
  // Inside a signed bundle it would be verified, and the handler is told so. It still changes
  // nothing: TOKEN_EXPIRED answers a send that landed just before the carried PLAYER's token
  // expired. The signed word that the session's own token expired is a session release.
  await h.receive(signedBundle([Buffer.from([3, 9, 32])]));
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.fleet.refreshDue(), false);
  assert.equal(h.fleet.status, 'connected');
  assert.equal(h.fleet.carriedCount, 1);
  assert.deepEqual(h.events.notifications.at(-1), {
    name: 'genericError',
    n: { __typename: 'GenericErrorResponse', sequenceNumber: 9, errorCode: 'TOKEN_EXPIRED' },
    verified: true,
  });
  // A session that heard nothing but unverified refusals is not connected by them.
  const unheard = harness();
  await unheard.fleet.connect();
  await unheard.receive(Buffer.from([3, 0, 7]));
  assert.equal(unheard.fleet.status, 'connecting');
  assert.equal(unheard.events.notifications.length, 1);
  assert.deepEqual(h.events.errors, []);
});

test('the table holds maxPlayers and 32 more; a carry past that is refused here with nothing sent', async () => {
  const { FLEET_TABLE_MARGIN } = await import('../../dist/fleet/index.js');
  assert.equal(FLEET_TABLE_MARGIN, 32);
  const h = harness({ grant: { maxPlayers: 4 } });
  await h.connect();
  assert.equal(h.fleet.tableLimit, 36);
  // 4 carried, then 32 more waiting: carried players and carries waiting count together.
  for (let i = 0; i < 4; i += 1) await h.carry(playerToken(i), 500 + i);
  const waiting = Array.from({ length: 32 }, (_, i) => h.fleet.carry(playerToken(100 + i)));
  await h.advance();
  assert.equal(h.fleet.players().length, 36);
  const sent = h.sentOfType(49).length;

  const refused = await h.fleet.carry(playerToken(999));
  assert.deepEqual(refused, { playerGameTokenId: '10999', userId: null, status: 'tableFull', wireStatus: null, carried: false });
  await h.advance(300);
  assert.equal(h.fleet.players().length, 36, 'no row was made');
  assert.ok(!h.sentOfType(49).some((d) => readCarry(d, '').player === 10_999n), 'and nothing was sent for it');
  assert.equal(h.fleet.stats().carriesRefusedTableFull, 1);
  assert.equal(h.events.carryResults.filter((r) => r.status === 'tableFull').length, 0);
  assert.ok(h.sentOfType(49).length >= sent);
  // A player already in the table is not a new row: carrying them again is taken.
  const again = h.fleet.carry(playerToken(0));
  await h.advance(300);
  await h.receive(signedBundle([carryResult(playerToken(0).gameTokenId, 500, 0)]));
  assert.equal((await again).carried, true);
  // A release makes room at once.
  await h.fleet.release(playerToken(100).gameTokenId);
  assert.equal((await waiting[0]).status, 'released');
  const room = h.fleet.carry(playerToken(999));
  await h.advance(300);
  await h.receive(signedBundle([carryResult(10_999, 777, 0)]));
  assert.equal((await room).carried, true);
  // A game server that never releases anyone cannot grow the table past the limit.
  const leaky = harness({ grant: { maxPlayers: 256 } });
  await leaky.connect();
  const results = await Promise.all(
    Array.from({ length: 1_000 }, (_, i) => {
      const pending = leaky.fleet.carry(playerToken(i));
      return i < 288 ? null : pending;
    }).filter(Boolean),
  );
  assert.equal(leaky.fleet.players().length, 288);
  assert.ok(results.every((r) => r.status === 'tableFull'));
  assert.equal(leaky.fleet.stats().carriesRefusedTableFull, 712);
  // A grant that names no maxPlayers is held to the most any session may carry.
  assert.equal(harness({ grant: { maxPlayers: null } }).fleet.tableLimit, 1_024 + 32);
  assert.equal(harness({ grant: { maxPlayers: 5_000 } }).fleet.tableLimit, 1_024 + 32);
  leaky.fleet.close();
});

test('an idle session hears a verified frame every 15 seconds, well inside the 45 it tolerates', async () => {
  // Defaults: capabilities every 15,000 ms once the server answered; silence 45,000 ms.
  const h = harness({ session: { silenceTimeoutMs: undefined } });
  await h.connect();
  // Ten idle minutes: nothing is sent for a player and nothing arrives but the
  // acknowledgements (46) of the session's own capabilities.
  let acknowledged = h.sentOfType(29).length;
  const gaps = [];
  let lastHeard = h.now;
  for (let ms = 0; ms < 600_000; ms += 1_000) {
    await h.advance(1_000);
    const caps = h.sentOfType(29).length;
    if (caps > acknowledged) {
      acknowledged = caps;
      await h.acknowledge();
      gaps.push(h.now - lastHeard);
      lastHeard = h.now;
    }
  }
  assert.equal(gaps.length, 40);
  assert.ok(gaps.every((g) => g === 15_000), 'a verified frame every 15 seconds');
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.events.moves, 0);
  assert.equal(h.fleet.status, 'connected');
  // Two acknowledgements in a row may be lost: the third capabilities' answer is in time.
  await h.advance(15_000);
  await h.advance(15_000);
  await h.advance(14_000);
  assert.equal(h.fleet.moveOrdered, false);
  await h.acknowledge();
  await h.advance(44_000);
  assert.equal(h.fleet.moveOrdered, false);

  // The capabilities interval is held to a third of the silence, whatever is asked for.
  for (const [config, every] of [
    [{ capabilitiesIntervalMs: 60_000, silenceTimeoutMs: 45_000 }, 15_000],
    [{ capabilitiesIntervalMs: 15_000, silenceTimeoutMs: 9_000 }, 3_000],
    [{ capabilitiesIntervalMs: 5_000, silenceTimeoutMs: 45_000 }, 5_000],
    [{ capabilitiesIntervalMs: 60_000, silenceTimeoutMs: 0 }, 60_000],
    [{ capabilitiesIntervalMs: 60_000, silenceTimeoutMs: 100 }, 1_000],
  ]) {
    const c = harness({ session: config });
    await c.connect();
    const before = c.sentOfType(29).length;
    await c.advance(every - 1);
    assert.equal(c.sentOfType(29).length, before, JSON.stringify(config));
    await c.advance(1);
    assert.equal(c.sentOfType(29).length, before + 1, JSON.stringify(config));
    assert.equal(c.fleet.moveOrdered, false, JSON.stringify(config));
  }
});

test('a 1,242-byte FLEET_DELIVERY is read, and a larger datagram is not', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const video = plainNotification(
    { type: 144, chunk: [1, -2, 3], distance: 1, uuid: UUID, payload: Buffer.alloc(1123, 0xab) },
    { epochMs: 9n, seq: 7 },
  );
  const datagram = withOwnHmac(delivery([PLAYER_ID], video));
  assert.equal(datagram.length, 1242);
  await h.receive(datagram);
  assert.equal(h.events.notifications.length, 1);
  assert.equal(h.events.notifications[0].name, 'video');
  assert.deepEqual(h.events.notifications[0].players, ['4242']);
  assert.equal(Buffer.from(h.events.notifications[0].n.videoData, 'base64').length, 1123);
  await h.receive(Buffer.concat([datagram, Buffer.from([0])]));
  assert.equal(h.events.notifications.length, 1);
  assert.equal(h.fleet.stats().oversized, 1);
  assert.equal(h.fleet.stats().hmacFailures, 0);
});

test('FLEET_RELEASED ends a carry: the handler hears why and sends for the player stop', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  // Another of the organization's servers carries the player now.
  await h.receive(signedBundle([released(PLAYER_ID, 1)]));
  assert.deepEqual(h.events.released, [{ playerGameTokenId: '4242', userId: '77', reason: 1 }]);
  assert.equal(h.fleet.carries(PLAYER_ID), false);
  assert.deepEqual(h.fleet.players(), []);
  await assert.rejects(h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 }), FleetNotCarriedError);
  // Their actor is kept present no longer.
  const heartbeats = h.sentOfType(26).length;
  await h.advance(1_999);
  assert.equal(h.sentOfType(26).filter((d) => read(d).tailId === PLAYER_ID).length, 0);
  assert.ok(h.sentOfType(26).length >= heartbeats);
  // A release for a player the session does not carry changes nothing.
  await h.receive(signedBundle([released(OTHER_PLAYER_ID, 2)]));
  assert.equal(h.events.released.length, 1);

  // The player comes back; a release that arrives while the new carry waits ends the old
  // carry and leaves the new one waiting for its own answer.
  const back = harness();
  await back.connect();
  await back.carry(ME, USER_ID);
  const again = back.fleet.carry(ME);
  await back.advance();
  await back.receive(signedBundle([released(PLAYER_ID, 5)]));
  assert.deepEqual(back.events.released, [{ playerGameTokenId: '4242', userId: '77', reason: 5 }]);
  assert.equal(back.fleet.carries(PLAYER_ID), false);
  assert.deepEqual(back.fleet.players(), [{ gameTokenId: '4242', userId: '77', carried: false, pending: true }]);
  await back.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal((await again).carried, true);
});

test('release sends FLEET_RELEASE under the session\u2019s id and forgets the player at once', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const waiting = h.fleet.carry(playerToken(5));
  await h.fleet.release(PLAYER_ID);
  await h.fleet.release(playerToken(5).gameTokenId);
  const releases = h.sentOfType(50).map(read);
  assert.equal(releases.length, 2);
  assert.equal(releases[0].tailId, FLEET_ID);
  assert.equal(releases[0].signedByFleet, true);
  assert.equal(releases[0].payload.length, 8);
  assert.equal(releases[0].payload.readBigInt64LE(0), PLAYER_ID);
  assert.deepEqual(h.fleet.players(), []);
  // A carry that was still waiting ends 'released', and is sent no more.
  assert.equal((await waiting).status, 'released');
  await h.advance(500);
  assert.equal(h.sentOfType(49).filter((d) => readCarry(d, '').player === 10_005n).length, 0);
  assert.deepEqual(h.events.released, [], 'the handler is for carries the server ended');
});

test('the session keeps itself alive, and keeps its carried players\u2019 actors present', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const own = () => h.sentOfType(26).map(read).filter((m) => m.tailId === FLEET_ID);
  const actors = () => h.sentOfType(26).map(read).filter((m) => m.tailId === PLAYER_ID);
  // Its own keepalive: every 2 seconds, with no actor, under its own id.
  await h.advance(1_999);
  assert.equal(own().length, 0);
  await h.advance(1);
  assert.equal(own().length, 1);
  assert.equal(own()[0].uuid, '');
  assert.deepEqual(own()[0].chunk, ['0', '0', '0']);
  assert.equal(own()[0].payload.length, 0);
  assert.equal(actors().length, 0, 'a player with no actor yet has nothing to keep present');

  // An actor the session sent an update for is kept present under the PLAYER's id, from 2
  // seconds after its last message.
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await h.advance(1_000);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: { x: '2', y: '-2', z: '3' }, uuid: UUID, state: B64 });
  await h.advance(1_999);
  assert.equal(actors().length, 0, 'updates keep it present by themselves');
  await h.advance(1);
  assert.equal(actors().length, 1);
  assert.equal(actors()[0].uuid, UUID);
  assert.deepEqual(actors()[0].chunk, ['2', '-2', '3'], 'in the chunk of its last update');
  assert.equal(actors()[0].signedByFleet, true);
  await h.advance(2_000);
  assert.equal(actors().length, 2);
  // Told to forget the actor, the session lets it leave.
  h.fleet.forgetActor(PLAYER_ID, UUID);
  await h.advance(4_000);
  assert.equal(actors().length, 2);
  // One keepalive a tick at most, and this test ticks only when it moves the clock.
  assert.equal(own().length, 4);

  // With actorHeartbeatMs 0 the game server sends them itself.
  const manual = harness({ session: { actorHeartbeatMs: 0 } });
  await manual.connect();
  await manual.carry(ME, USER_ID);
  await manual.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await manual.advance(10_000);
  assert.equal(manual.sentOfType(26).map(read).filter((m) => m.tailId === PLAYER_ID).length, 0);
});

test('coming back on the same server after a refresh: capabilities only, and the carries stand', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  await h.carry(playerToken(1), 501);
  // Half of the 24 hours must pass before a refresh is due.
  assert.equal(h.fleet.refreshDue(), false);
  await h.advance(12 * 3600_000 - 1);
  assert.equal(h.fleet.refreshDue(), false);
  await h.advance(1);
  assert.equal(h.fleet.refreshDue(), true);
  assert.equal(h.fleet.moveOrdered, false);
  // The refresh names the server the session is on, so it stays there.
  assert.deepEqual(h.fleet.refreshInput(), {
    appId: '7',
    gameTokenId: '9001',
    currentServer: { ip4: '203.0.113.7', clientPort: 9000 },
  });

  const caps = h.sentOfType(29).length;
  const carries = h.sentOfType(49).length;
  const newExpiry = new Date(h.now + 24 * 3600_000).toISOString();
  await h.fleet.applyRefresh(grant({ expiresAt: newExpiry }));
  assert.equal(h.sockets.length, 1, 'the same socket');
  assert.equal(h.socket.closed, false);
  assert.equal(h.sentOfType(29).length, caps + 1, 'the capabilities again');
  assert.equal(read(h.sentOfType(29).at(-1)).tailId, FLEET_ID);
  await h.advance(1_000);
  assert.equal(h.sentOfType(49).length, carries, 'and no FLEET_CARRY');
  assert.equal(h.fleet.carriedCount, 2);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  assert.equal(h.fleet.refreshDue(), false);
  assert.equal(h.fleet.expiresAt, Date.parse(newExpiry));
  assert.equal(h.fleet.status, 'connected');

  // An answer that is another session's is refused, with nothing changed.
  await assert.rejects(h.fleet.applyRefresh(grant({ gameTokenId: '9002' })), /another fleet session/);
  await assert.rejects(h.fleet.applyRefresh(grant({ appId: '8' })), /another fleet session/);
  await assert.rejects(h.fleet.applyRefresh(grant({ token: 'short' })), /64 characters/);
  await assert.rejects(h.fleet.applyRefresh(grant({ server: { ip4: '', ip6: '', clientPort: 9000 } })), /no ip4 and no ip6/);
  assert.equal(h.fleet.expiresAt, Date.parse(newExpiry));
  assert.equal(h.sockets.length, 1);
});

test('coming back on another server after COMMAND_RECONNECT: capabilities, then a new carry for every player', async () => {
  const h = harness();
  await h.connect();
  const players = [ME, playerToken(1), playerToken(2)];
  for (const [i, p] of players.entries()) await h.carry(p, 500 + i);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await h.fleet.setSpeakers(PLAYER_ID, { voice: [UUID] });
  const firstCarry = readCarry(h.sentOfType(49)[0], PLAYER_TOKEN);
  const oldNonce = hex(h.nonce());

  // The realtime server tells the session to move: COMMAND_RECONNECT_BOUND (44), signed with
  // the fleet token over [44][this connection's nonce].
  const lead = Buffer.concat([Buffer.from([44]), h.nonce()]);
  await h.advance(60_000);
  await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
  assert.equal(h.events.moves, 1);
  assert.equal(h.fleet.moveOrdered, true);
  assert.equal(h.fleet.refreshDue(), true);
  // The refresh names no server now, so the answer names the next one.
  assert.deepEqual(h.fleet.refreshInput(), { appId: '7', gameTokenId: '9001' });
  // The server keeps answering for a few seconds: the session keeps working there meanwhile.
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  assert.equal(h.fleet.status, 'connected');
  // The same order again is one move.
  await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
  assert.equal(h.events.moves, 1);

  const old = h.socket;
  await h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  assert.equal(old.closed, true, 'it left the server that asked it to go');
  assert.equal(h.sockets.length, 2);
  assert.deepEqual(h.socket.server, OTHER_SERVER);
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.fleet.refreshDue(), false);
  assert.deepEqual(h.fleet.currentServer, OTHER_SERVER);
  // Capabilities first, under its own id, with a nonce of this connection's own.
  assert.equal(h.socket.sent.length, 1);
  const caps = read(h.socket.sent[0]);
  assert.equal(caps.type, 29);
  assert.equal(caps.tailId, FLEET_ID);
  assert.notEqual(hex(h.nonce()), oldNonce);
  // The new server holds no carry: until it answers, sends for a player are refused here.
  assert.equal(h.fleet.carriedCount, 0);
  assert.ok(h.fleet.players().every((p) => !p.carried && p.pending));
  await assert.rejects(h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 }), FleetNotCarriedError);

  // Then a new FLEET_CARRY for EVERY player, each with a new time and proof.
  await h.advance();
  const carries = h.sentOfType(49);
  assert.equal(carries.length, 3);
  assert.deepEqual(carries.map((d) => String(readCarry(d, '').player)).sort(), ['10001', '10002', '4242']);
  const mine = carries.map((d) => readCarry(d, PLAYER_TOKEN)).find((c) => c.player === PLAYER_ID);
  assert.equal(mine.proofHolds, true);
  assert.ok(mine.epoch > firstCarry.epoch);
  assert.notEqual(mine.proof, firstCarry.proof);
  for (const d of carries) assert.equal(read(d).tailId, FLEET_ID);

  // Each answer reaches carryResult; a player whose sign-in ended meanwhile is dropped.
  h.events.carryResults.length = 0;
  await h.acknowledge();
  await h.receive(
    signedBundle([carryResult(PLAYER_ID, 500, 0), carryResult(10_001, 501, 0), carryResult(10_002, 0, 1)]),
  );
  // "No live token" is asked about once more, 250 ms later, before it settles.
  assert.equal(h.fleet.players().length, 3);
  await h.advance(250);
  await h.receive(signedBundle([carryResult(10_002, 0, 1)]));
  assert.deepEqual(h.events.carryResults.map((r) => [r.playerGameTokenId, r.status]), [
    ['4242', 'carried'],
    ['10001', 'carried'],
    ['10002', 'noLiveToken'],
  ]);
  assert.equal(h.fleet.carriedCount, 2);
  assert.equal(h.fleet.carries(10_002), false);
  assert.equal(h.fleet.status, 'connected');
  // The player's speaker list goes to the new server, and their actor is kept present there.
  const speakers = h.sentOfType(47).map(read);
  assert.equal(speakers.length, 1);
  assert.equal(speakers[0].tailId, PLAYER_ID);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await h.advance(2_000);
  assert.ok(h.sentOfType(26).map(read).some((m) => m.tailId === PLAYER_ID && m.uuid === UUID));

  // What the server it left still sends is not this connection's: ignored.
  const received = h.fleet.stats().datagramsReceived;
  old.on.onDatagram(new Uint8Array(signedBundle([released(PLAYER_ID, 2)])));
  await h.fleet.settled();
  assert.equal(h.fleet.stats().datagramsReceived, received);
  assert.equal(h.fleet.carries(PLAYER_ID), true);
  // A control frame bound to the earlier connection's nonce does not verify on this one.
  await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.fleet.stats().staleControl, 1);
  assert.deepEqual(h.events.errors, []);
});

test('a move of many players is paced, and a refresh answer alone can name another server', async () => {
  const h = harness();
  await h.connect();
  const players = Array.from({ length: 150 }, (_, i) => playerToken(i));
  const pending = players.map((p) => h.fleet.carry(p));
  for (let ms = 0; h.fleet.carriedCount < 150 && ms < 5_000; ms += 20) {
    await h.advance(20);
    const answered = h.sentOfType(49).map((d) => readCarry(d, '').player).filter((p) => !h.fleet.carries(p));
    for (let i = 0; i < answered.length; i += 32) {
      await h.receive(signedBundle(answered.slice(i, i + 32).map((p) => carryResult(p, 700_000n + p, 0))));
    }
  }
  assert.equal(h.fleet.carriedCount, 150);
  await Promise.all(pending);

  // No move was ordered: the Application API answered a refresh with another server.
  assert.equal(h.fleet.moveOrdered, false);
  await h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  assert.equal(h.sockets.length, 2);
  assert.equal(read(h.socket.sent[0]).type, 29);
  const times = [];
  let seen = 0;
  for (let ms = 0; ms <= 3_000; ms += 20) {
    await h.advance(ms === 0 ? 0 : 20);
    const carries = h.sentOfType(49);
    const fresh = carries.slice(seen).map((d) => readCarry(d, '').player);
    for (let i = 0; i < fresh.length; i += 1) times.push(h.now);
    seen = carries.length;
    for (let i = 0; i < fresh.length; i += 32) {
      await h.receive(signedBundle(fresh.slice(i, i + 32).map((p) => carryResult(p, 700_000n + p, 0))));
    }
  }
  assert.equal(h.fleet.carriedCount, 150, 'every player is carried again');
  assert.equal(h.sentOfType(49).length, 150);
  for (const t of new Set(times)) {
    assert.ok(times.filter((x) => x >= t && x < t + 1_000).length < 64, 'under 64 a second');
  }
  assert.ok(times.at(-1) - times[0] >= 2_000, 'so 150 players take over two seconds');
});

test('COMMAND_SESSION_RELEASED ends the carries; the next refresh carries everyone again, even on the same server', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const waiting = h.fleet.carry(playerToken(1));
  await h.advance();
  // [45][reason 4, rebalance][nonce][HMAC over the first 10 bytes]
  const lead = Buffer.concat([Buffer.from([45, 4]), h.nonce()]);
  await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
  assert.deepEqual(h.events.sessionReleased, [4]);
  assert.equal(h.fleet.status, 'released');
  assert.equal(h.fleet.refreshDue(), true);
  assert.deepEqual(h.fleet.refreshInput(), { appId: '7', gameTokenId: '9001' });
  // Its carries ended unannounced.
  assert.equal(h.fleet.carriedCount, 0);
  assert.deepEqual(h.events.released, []);
  await assert.rejects(h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 }), FleetNotCarriedError);
  // The server answers this session no more: nothing is sent to it.
  const sent = h.socket.sent.length;
  await h.advance(10_000);
  assert.equal(h.socket.sent.length, sent);

  // The refresh names the same server. It let the session go, so it holds no carry.
  await h.fleet.applyRefresh(grant());
  assert.equal(h.sockets.length, 2, 'a new connection');
  assert.equal(h.sockets[0].closed, true);
  assert.equal(read(h.socket.sent[0]).type, 29);
  assert.equal(h.fleet.status, 'connecting');
  await h.advance();
  assert.deepEqual(h.sentOfType(49).map((d) => String(readCarry(d, '').player)).sort(), ['10001', '4242']);
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0), carryResult(10_001, 501, 0)]));
  assert.equal(h.fleet.carriedCount, 2);
  assert.equal(h.fleet.status, 'connected');
  // The carry that was waiting when the session was released resolves with the new answer.
  assert.equal((await waiting).carried, true);
  assert.equal(h.fleet.refreshDue(), false);
});

test('an unbound control frame is taken until the server acknowledges the bound forms, and not after', async () => {
  const legacy = Buffer.concat([Buffer.from([22]), rawHmac(FLEET_TOKEN, Buffer.from([22]))]);
  const early = harness();
  await early.fleet.connect();
  // No acknowledgement yet: an older server would send exactly this.
  await early.receive(legacy);
  assert.equal(early.fleet.moveOrdered, true);
  assert.equal(early.events.moves, 1);

  const late = harness();
  await late.connect();
  await late.receive(legacy);
  await late.receive(Buffer.concat([Buffer.from([28, 3]), rawHmac(FLEET_TOKEN, Buffer.from([28, 3]))]));
  assert.equal(late.fleet.moveOrdered, false);
  assert.equal(late.fleet.status, 'connected');
  assert.equal(late.fleet.stats().staleControl, 2);
  // One signed with another key is a failure, not a stale frame.
  await late.receive(Buffer.concat([Buffer.from([22]), rawHmac(PLAYER_TOKEN, Buffer.from([22]))]));
  assert.equal(late.fleet.stats().hmacFailures, 1);
});

test('a server that goes quiet, or says the token expired, makes a refresh due; the refresh carries everyone again', async () => {
  const h = harness({ session: { silenceTimeoutMs: 45_000 } });
  await h.connect();
  await h.carry(ME, USER_ID);
  // A live server acknowledges the capabilities every 15 seconds: nothing is ordered.
  for (let i = 0; i < 4; i += 1) {
    await h.advance(15_000);
    await h.acknowledge();
  }
  assert.equal(h.fleet.moveOrdered, false);
  assert.equal(h.events.moves, 0);
  // Then it says nothing that verifies. Three capabilities go unanswered.
  await h.receive(Buffer.from([3, 1, 7])); // an unsigned error frame is not the server speaking
  await h.advance(44_999);
  assert.equal(h.fleet.moveOrdered, false);
  await h.advance(1);
  assert.equal(h.fleet.moveOrdered, true);
  assert.equal(h.fleet.refreshDue(), true);
  assert.equal(h.events.moves, 1);
  assert.deepEqual(h.fleet.refreshInput(), { appId: '7', gameTokenId: '9001' });
  await h.advance(60_000);
  assert.equal(h.events.moves, 1, 'said once');
  // The refresh names the same server. It may have started again and hold no carry, so the
  // session connects anew and carries its player again.
  await h.fleet.applyRefresh(grant());
  assert.equal(h.sockets.length, 2);
  assert.equal(read(h.socket.sent[0]).type, 29);
  await h.advance();
  assert.deepEqual(h.sentOfType(49).map((d) => readCarry(d, PLAYER_TOKEN).player), [PLAYER_ID]);
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal(h.fleet.carries(PLAYER_ID), true);
  assert.equal(h.fleet.moveOrdered, false);

  // A session the server never answered at all (its token never reached that server).
  const unheard = harness({ session: { silenceTimeoutMs: 45_000 } });
  await unheard.fleet.connect();
  await unheard.advance(45_000);
  assert.equal(unheard.fleet.status, 'connecting');
  assert.equal(unheard.fleet.refreshDue(), true);

  // A session closed through the Application API is sent nothing at all, and every send
  // goes unanswered: the same silence, and the same remedy. The refresh then answers
  // NOT_FOUND, and the game server opens a new session.
  const closedByApi = harness({ session: { silenceTimeoutMs: 45_000 } });
  await closedByApi.connect();
  await closedByApi.carry(ME, USER_ID);
  await closedByApi.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  for (let i = 0; i < 3; i += 1) await closedByApi.advance(15_000);
  assert.equal(closedByApi.fleet.refreshDue(), true);
  assert.equal(closedByApi.events.moves, 1);
  assert.equal(closedByApi.fleet.status, 'connected', 'nothing told it otherwise');
});

test('the signed word that a session ended is COMMAND_SESSION_RELEASED: every reason makes a refresh due', async () => {
  // [45][reason][nonce][HMAC over the first 10 bytes]. 2: the fleet token expired. 1, 3, 4:
  // stale, overload, a move. 0 and 5 are the other documented ones.
  for (const reason of [2, 1, 3, 4, 0, 5]) {
    const h = harness();
    await h.connect();
    await h.carry(ME, USER_ID);
    assert.equal(h.fleet.refreshDue(), false);
    const lead = Buffer.concat([Buffer.from([45, reason]), h.nonce()]);
    await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
    assert.deepEqual(h.events.sessionReleased, [reason], `reason ${reason}`);
    assert.equal(h.fleet.status, 'released');
    assert.equal(h.fleet.refreshDue(), true, `reason ${reason}: a refresh is due`);
    assert.equal(h.fleet.moveOrdered, true);
    // As after a move order, the refresh names no server: the answer names the next one.
    assert.deepEqual(h.fleet.refreshInput(), { appId: '7', gameTokenId: '9001' });
    assert.equal(h.fleet.carriedCount, 0, 'its carries ended with it');
    // Said once, in one frame: a second copy changes nothing more.
    await h.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
    assert.deepEqual(h.events.sessionReleased, [reason, reason]);
    assert.equal(h.fleet.status, 'released');
    // A forged one (another key, another connection's nonce, a rewritten reason) is nothing.
    const fresh = harness();
    await fresh.connect();
    const mine = Buffer.concat([Buffer.from([45, reason]), fresh.nonce()]);
    await fresh.receive(Buffer.concat([mine, rawHmac(PLAYER_TOKEN, mine)]));
    await fresh.receive(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
    const rewritten = Buffer.concat([mine, rawHmac(FLEET_TOKEN, mine)]);
    rewritten[1] ^= 0x07;
    await fresh.receive(rewritten);
    assert.equal(fresh.fleet.refreshDue(), false);
    assert.equal(fresh.fleet.status, 'connected');
    assert.deepEqual(fresh.events.sessionReleased, []);
  }
  // Without bound control acknowledged yet, the unbound form (28) says the same.
  const early = harness();
  await early.fleet.connect();
  await early.receive(Buffer.concat([Buffer.from([28, 2]), rawHmac(FLEET_TOKEN, Buffer.from([28, 2]))]));
  assert.deepEqual(early.events.sessionReleased, [2]);
  assert.equal(early.fleet.refreshDue(), true);
  // The unsigned error frame that says a token expired is a hint about a PLAYER's token, and
  // makes nothing due.
  const hint = harness();
  await hint.connect();
  await hint.receive(Buffer.from([3, 9, 32]));
  assert.equal(hint.fleet.refreshDue(), false);
  assert.deepEqual(hint.events.notifications.map((e) => [e.name, e.n.errorCode, e.verified]), [
    ['genericError', 'TOKEN_EXPIRED', false],
  ]);
});

test('a carry answered "no live token" is asked once more, 250 ms later, with a new time and proof', async () => {
  const h = harness();
  await h.connect();
  const pending = h.fleet.carry(ME);
  await h.advance();
  await h.receive(signedBundle([carryResult(PLAYER_ID, 0, 1)]));
  // Not settled: the token may not have reached the realtime server yet.
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4242', userId: null, carried: false, pending: true }]);
  assert.deepEqual(h.events.carryResults, []);
  assert.equal(h.fleet.stats().noLiveTokenRetries, 1);
  await h.advance(249);
  assert.equal(h.sentOfType(49).length, 1, 'not before 250 ms');
  // A second "no live token" that arrives before the retry went out answers the first carry
  // again (or a copy of it): it settles nothing.
  await h.receive(signedBundle([carryResult(PLAYER_ID, 0, 1)]));
  assert.equal(h.fleet.players().length, 1);
  await h.advance(1);
  const carries = h.sentOfType(49).map((d) => readCarry(d, PLAYER_TOKEN));
  assert.equal(carries.length, 2);
  assert.ok(carries[1].epoch > carries[0].epoch, 'a new time');
  assert.notEqual(carries[1].proof, carries[0].proof);
  assert.equal(carries[1].proofHolds, true, 'and a proof that holds for it');
  // Still no live token after the retry: now it is the answer.
  await h.receive(signedBundle([carryResult(PLAYER_ID, 0, 1)]));
  assert.deepEqual(await pending, { playerGameTokenId: '4242', userId: null, status: 'noLiveToken', wireStatus: 1, carried: false });
  assert.deepEqual(h.fleet.players(), []);
  assert.equal(h.fleet.stats().noLiveTokenRetries, 1, 'once');
  await h.advance(1_000);
  assert.equal(h.sentOfType(49).length, 2, 'and it is sent no more');

  // The retry is carried: the first answer was only early.
  const late = harness();
  await late.connect();
  const second = late.fleet.carry(ME);
  await late.advance();
  await late.receive(signedBundle([carryResult(PLAYER_ID, 0, 1)]));
  await late.advance(250);
  await late.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.deepEqual(await second, { playerGameTokenId: '4242', userId: '77', status: 'carried', wireStatus: 0, carried: true });
  assert.equal(late.fleet.stats().noLiveTokenRetries, 1);
  assert.equal(late.sentOfType(49).length, 2);
  // Another refusal is not asked about again.
  const other = harness();
  await other.connect();
  const third = other.fleet.carry(ME);
  await other.advance();
  await other.receive(signedBundle([carryResult(PLAYER_ID, 0, 3)]));
  assert.equal((await third).status, 'proofFailed');
  assert.equal(other.fleet.stats().noLiveTokenRetries, 0);
});

test('a refreshed token with `replaces`: the player stays carried and every send names the new id once the carry is out', async (t) => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await h.fleet.setSpeakers(PLAYER_ID, { voice: [UUID] });
  const fresh = { token: 'refreshed-'.padEnd(64, 'r'), gameTokenId: '4300', replaces: '4242' };
  const text = (id, body) => h.fleet.sendTextPacket(id, { chunk: CHUNK, uuid: UUID, text: body });
  const named = () => h.socket.sent.map(read).filter((m) => m.type === 136).map((m) => String(m.tailId));

  const pending = h.fleet.carry(fresh);
  // The row moved to the new id at once, and the player is carried throughout.
  await Promise.resolve();
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4300', userId: '77', carried: true, pending: true }]);
  assert.equal(h.fleet.carries('4300'), true);
  assert.equal(h.fleet.carries('4242'), true, 'the old id still names the player while the new carry waits');
  assert.equal(h.fleet.carriedCount, 1);
  // Until the FLEET_CARRY goes out, the old carry is the only one the server knows: sends
  // name the old id, whichever id the game server passes.
  await text('4300', 'before, by the new id');
  await text('4242', 'before, by the old id');
  assert.deepEqual(named(), ['4242', '4242']);

  // A send is being signed when the carry goes out (its HMAC takes 30 ms): it must not leave
  // under the old id after the carry.
  const subtle = globalThis.crypto.subtle;
  const sign = subtle.sign.bind(subtle);
  let slow = true;
  subtle.sign = async (...args) => {
    if (slow) {
      slow = false;
      await new Promise((r) => setTimeout(r, 30));
    }
    return sign(...args);
  };
  t.after(() => {
    delete subtle.sign;
  });
  const inFlight = text('4242', 'in flight');
  await h.advance(); // the FLEET_CARRY for the new id goes out
  await inFlight;
  delete subtle.sign;
  await text('4242', 'after, by the old id');
  await text('4300', 'after, by the new id');
  const order = h.socket.sent.map(read);
  const carryAt = order.findIndex((m) => m.type === 49 && m.payload.readBigInt64LE(0) === 4300n);
  assert.ok(carryAt > 0, 'the carry for the new id went out');
  const carry = readCarry(h.socket.sent[carryAt], fresh.token);
  assert.equal(carry.proofHolds, true, 'proved with the new token');
  assert.equal(read(h.socket.sent[carryAt]).tailId, FLEET_ID);
  assert.ok(order.slice(0, carryAt).every((m) => m.tailId !== 4300n), 'nothing names the new id before its carry');
  assert.ok(order.slice(carryAt + 1).every((m) => m.tailId !== 4242n), 'nothing names the old id after it');
  assert.deepEqual(named(), ['4242', '4242', '4300', '4300', '4300']);

  // The old id's stragglers while the new carry waits: a refusal of a send that was on its
  // way, a late copy of the old carry's answer, and the old carry's end. None drops the player.
  await h.receive(Buffer.from([3, 7, 7]));
  await h.receive(signedBundle([carryResult(4242, USER_ID, 0)]));
  await h.receive(signedBundle([released(4242, 2)]));
  assert.equal(h.fleet.carries('4300'), true);
  assert.deepEqual(h.events.released, [], 'no released event');
  assert.equal(h.sentOfType(50).length, 0, 'and no FLEET_RELEASE');
  assert.equal(h.fleet.stats().replacedIdFrames, 2);
  await text('4300', 'still carried');

  // The new carry takes effect.
  await h.receive(signedBundle([carryResult(4300, USER_ID, 0)]));
  assert.deepEqual(await pending, { playerGameTokenId: '4300', userId: '77', status: 'carried', wireStatus: 0, carried: true });
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4300', userId: '77', carried: true, pending: false }]);
  assert.deepEqual(h.events.released, []);
  // The old id names nothing in this session now.
  assert.equal(h.fleet.carries('4242'), false);
  await assert.rejects(text('4242', 'old id'), FleetNotCarriedError);
  // The player kept their actor and their speaker list, under the new id.
  assert.equal(h.sentOfType(47).map(read).at(-1).tailId, 4300n);
  await h.advance(2_000);
  const beat = h.sentOfType(26).map(read).filter((m) => m.uuid === UUID).at(-1);
  assert.equal(beat.tailId, 4300n);

  // Late frames that name the old id are ignored: they are about the token that was replaced.
  await h.receive(signedBundle([released(4242, 1), released(4242, 2), carryResult(4242, USER_ID, 0), carryResult(4242, 0, 3)]));
  await h.receive(Buffer.from([3, 9, 7]));
  assert.equal(h.fleet.carries('4300'), true);
  assert.deepEqual(h.events.released, []);
  assert.equal(h.fleet.stats().replacedIdFrames, 6);
  assert.equal(h.fleet.stats().unmatchedCarryResults, 0);
  // Nor does a release under the old id end the carry that replaced it.
  await h.fleet.release('4242');
  assert.equal(h.sentOfType(50).length, 0);
  assert.equal(h.fleet.carries('4300'), true);
  // A release under the new id is the player's.
  await h.fleet.release('4300');
  assert.deepEqual(h.sentOfType(50).map((d) => read(d).payload.readBigInt64LE(0)), [4300n]);
  assert.deepEqual(h.fleet.players(), []);
  assert.deepEqual(h.events.errors, []);
});

test('a refreshed token\u2019s carry that is refused or times out, and one that crosses a move', async () => {
  const fresh = { token: 'refreshed-'.padEnd(64, 'r'), gameTokenId: '4300', replaces: '4242' };
  const text = (h, id) => h.fleet.sendTextPacket(id, { chunk: CHUNK, uuid: UUID, text: 'x' });
  const lastTextId = (h) => String(h.socket.sent.map(read).filter((m) => m.type === 136).at(-1).tailId);

  // Refused: the carry under the old id stands, and sends name it again.
  const refused = harness();
  await refused.connect();
  await refused.carry(ME, USER_ID);
  const pending = refused.fleet.carry(fresh);
  await refused.advance();
  await text(refused, '4300');
  assert.equal(lastTextId(refused), '4300');
  await refused.receive(signedBundle([carryResult(4300, 0, 3)]));
  assert.deepEqual(await pending, { playerGameTokenId: '4300', userId: null, status: 'proofFailed', wireStatus: 3, carried: false });
  assert.deepEqual(refused.fleet.players(), [{ gameTokenId: '4242', userId: '77', carried: true, pending: false }]);
  assert.equal(refused.fleet.carries('4300'), false);
  await text(refused, '4242');
  assert.equal(lastTextId(refused), '4242');
  assert.deepEqual(refused.events.released, []);
  assert.equal(refused.sentOfType(50).length, 0, 'the old carry is not let go');
  // A late answer about the refused id changes nothing.
  await refused.receive(signedBundle([carryResult(4300, USER_ID, 0)]));
  assert.equal(refused.sentOfType(50).length, 0);
  assert.equal(refused.fleet.carries('4242'), true);

  // Refused, after the old carry ended meanwhile: the player is carried no more, and the
  // game server hears why the old carry ended.
  const ended = harness();
  await ended.connect();
  await ended.carry(ME, USER_ID);
  const lost = ended.fleet.carry(fresh);
  await ended.advance();
  await ended.receive(signedBundle([released(4242, 2)]));
  assert.deepEqual(ended.events.released, []);
  await ended.receive(signedBundle([carryResult(4300, 0, 1)]));
  await ended.advance(250);
  await ended.receive(signedBundle([carryResult(4300, 0, 1)]));
  assert.equal((await lost).status, 'noLiveToken');
  assert.deepEqual(ended.events.released, [{ playerGameTokenId: '4242', userId: '77', reason: 2 }]);
  assert.deepEqual(ended.fleet.players(), []);
  await assert.rejects(text(ended, '4242'), FleetNotCarriedError);

  // No answer at all: nothing says which carry the server holds, so neither stands.
  const silent = harness();
  await silent.connect();
  await silent.carry(ME, USER_ID);
  const unanswered = silent.fleet.carry(fresh);
  await silent.advance();
  await silent.advance(5_000);
  assert.equal((await unanswered).status, 'timedOut');
  assert.deepEqual(silent.fleet.players(), []);
  assert.deepEqual(silent.sentOfType(50).map((d) => String(read(d).payload.readBigInt64LE(0))).sort(), ['4242', '4300']);

  // A newer token again before the first replacement was answered: only the newest is asked for.
  const twice = harness();
  await twice.connect();
  await twice.carry(ME, USER_ID);
  const first = twice.fleet.carry(fresh);
  await twice.advance();
  const newest = twice.fleet.carry({ token: 'newest-'.padEnd(64, 'n'), gameTokenId: '4400', replaces: '4300' });
  await Promise.resolve();
  assert.deepEqual(twice.fleet.players(), [{ gameTokenId: '4400', userId: '77', carried: true, pending: true }]);
  await text(twice, '4400');
  assert.equal(lastTextId(twice), '4242', 'until the newest carry goes out, the carry that stands is the first one');
  await twice.advance();
  await text(twice, '4242');
  assert.equal(lastTextId(twice), '4400');
  await twice.receive(signedBundle([carryResult(4300, USER_ID, 0), carryResult(4400, USER_ID, 0)]));
  assert.equal((await first).playerGameTokenId, '4400');
  assert.equal((await newest).carried, true);
  assert.deepEqual(twice.fleet.players(), [{ gameTokenId: '4400', userId: '77', carried: true, pending: false }]);
  assert.equal(twice.sentOfType(50).length, 0);

  // The session moves while the replacement waits: the new server is asked for the newest
  // token only, since it holds no carry to stand meanwhile.
  const moved = harness();
  await moved.connect();
  await moved.carry(ME, USER_ID);
  const across = moved.fleet.carry(fresh);
  await moved.advance();
  await moved.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  await moved.advance();
  assert.deepEqual(moved.sentOfType(49).map((d) => String(readCarry(d, '').player)), ['4300']);
  await assert.rejects(text(moved, '4300'), FleetNotCarriedError);
  await moved.receive(signedBundle([carryResult(4300, USER_ID, 0)]));
  assert.equal((await across).carried, true);
  await text(moved, '4300');
  assert.equal(lastTextId(moved), '4300');
  assert.equal(moved.fleet.carries('4242'), false);

  // `replaces` that names nobody is a plain carry; one that names another player lets that
  // player go and says so.
  const plain = harness();
  await plain.connect();
  const nobody = plain.fleet.carry({ ...fresh, replaces: '999' });
  await plain.advance();
  await plain.receive(signedBundle([carryResult(4300, USER_ID, 0)]));
  assert.equal((await nobody).carried, true);
  const wrong = harness();
  await wrong.connect();
  await wrong.carry(ME, USER_ID);
  const mistaken = wrong.fleet.carry(fresh);
  await wrong.advance();
  await wrong.receive(signedBundle([carryResult(4300, 78, 0)]));
  assert.deepEqual(await mistaken, { playerGameTokenId: '4300', userId: '78', status: 'carried', wireStatus: 0, carried: true });
  assert.deepEqual(wrong.sentOfType(50).map((d) => read(d).payload.readBigInt64LE(0)), [PLAYER_ID]);
  assert.equal(wrong.events.errors.length, 1);
  assert.match(wrong.events.errors[0].message, /replaces named game token id 4242, which is another player's/);
  await assert.rejects(plain.fleet.carry({ ...fresh, replaces: 'p-1' }), RangeError);
});

test('nothing leaves a new connection before its capabilities, even when a tick runs meanwhile', async (t) => {
  const h = harness();
  const pending = h.fleet.carry(ME);
  await Promise.all([h.fleet.connect(), h.fleet.tick(), h.fleet.tick()]);
  await h.advance();
  assert.deepEqual(h.socket.sent.slice(0, 2).map((d) => d[0]), [29, 49]);
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  await pending;

  // A move, with the new connection's capabilities slow to sign: the next HMAC takes 30 ms.
  // A tick that runs meanwhile has carries due and must not send them ahead.
  const subtle = globalThis.crypto.subtle;
  const sign = subtle.sign.bind(subtle);
  let slow = true;
  subtle.sign = async (...args) => {
    if (slow) {
      slow = false;
      await new Promise((r) => setTimeout(r, 30));
    }
    return sign(...args);
  };
  t.after(() => {
    delete subtle.sign;
  });
  const moving = h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  // Let the session take the new socket and start signing its capabilities.
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
  assert.equal(h.sockets.length, 2, 'the new socket is open');
  assert.equal(h.socket.sent.length, 0, 'and its capabilities are still being signed');
  await h.fleet.tick();
  assert.equal(h.socket.sent.length, 0, 'the tick sent nothing ahead of them');
  await moving;
  assert.deepEqual(h.socket.sent.map((d) => d[0]), [29]);
  await h.advance();
  assert.deepEqual(h.socket.sent.map((d) => d[0]), [29, 49]);
});

test('a player carried again with a refreshed token replaces the row the same user had', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  await h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 });
  await h.fleet.setSpeakers(PLAYER_ID, { voice: [UUID] });
  // refreshAppToken gave the player a new token with a new id.
  const fresh = { token: 'refreshed-'.padEnd(64, 'r'), gameTokenId: '4300' };
  const result = await h.carry(fresh, USER_ID);
  assert.deepEqual(result, { playerGameTokenId: '4300', userId: '77', status: 'carried', wireStatus: 0, carried: true });
  assert.deepEqual(h.fleet.players(), [{ gameTokenId: '4300', userId: '77', carried: true, pending: false }]);
  assert.equal(h.fleet.carries(PLAYER_ID), false);
  await assert.rejects(h.fleet.sendTextPacket(PLAYER_ID, { chunk: CHUNK, uuid: UUID, text: 'old id' }), FleetNotCarriedError);
  assert.deepEqual(h.events.released, [], 'the player was not released: they continue under the new id');
  // Their speaker list is sent under the new id, and their actor is kept present under it.
  const speakers = h.sentOfType(47).map(read);
  assert.equal(speakers.at(-1).tailId, 4300n);
  await h.advance(2_000);
  const beats = h.sentOfType(26).map(read).filter((m) => m.uuid === UUID);
  assert.ok(beats.length >= 1);
  assert.equal(beats.at(-1).tailId, 4300n);
  // The proof of the new carry is keyed with the new token.
  const carry = h.sentOfType(49).map((d) => readCarry(d, fresh.token)).find((c) => c.player === 4300n);
  assert.equal(carry.proofHolds, true);
  // Without `replaces` the session learns from the answer that the two tokens are one
  // player. The old id's late frames are ignored from then on: a late copy of its carry's
  // answer must not make the session release the player.
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0), released(PLAYER_ID, 2)]));
  assert.equal(h.sentOfType(50).length, 0);
  assert.equal(h.fleet.carries('4300'), true);
  assert.deepEqual(h.events.released, []);
  assert.equal(h.fleet.stats().replacedIdFrames, 2);
});

test('close ends what waits and sends no more; the session is not ended on the platform by it', async () => {
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  const waiting = h.fleet.carry(playerToken(1));
  h.fleet.close();
  assert.equal(h.fleet.status, 'closed');
  assert.equal(h.socket.closed, true);
  assert.equal((await waiting).status, 'closed');
  assert.deepEqual(h.fleet.players(), []);
  assert.equal(h.fleet.refreshDue(), false);
  const sent = h.socket.sent.length;
  await h.advance(60_000);
  await assert.rejects(h.fleet.sendActorUpdate(PLAYER_ID, { chunk: CHUNK, uuid: UUID, state: B64 }), FleetNotCarriedError);
  assert.equal((await h.fleet.carry(playerToken(2))).status, 'closed');
  await assert.rejects(h.fleet.connect(), (e) => e.code === 'FLEET_CLOSED');
  await assert.rejects(h.fleet.applyRefresh(grant()), (e) => e.code === 'FLEET_CLOSED');
  assert.equal(h.socket.sent.length, sent);
  assert.equal(h.sentOfType(50).length, 0, 'closing the socket releases nobody: closeFleetSession does');
});

test('carries asked for before connect wait, and go after the capabilities', async () => {
  const h = harness();
  const pending = h.fleet.carry(ME);
  await h.fleet.tick();
  assert.equal(h.sockets.length, 0);
  // A refresh before connecting only changes where connect() goes.
  await h.fleet.applyRefresh(grant({ server: OTHER_SERVER }));
  await h.fleet.connect();
  assert.deepEqual(h.socket.server, OTHER_SERVER);
  await h.advance();
  assert.deepEqual(h.socket.sent.map((d) => d[0]), [29, 49]);
  await h.receive(signedBundle([carryResult(PLAYER_ID, USER_ID, 0)]));
  assert.equal((await pending).carried, true);
  // The first verified answer is what makes the session connected.
  assert.equal(h.fleet.status, 'connected');
});

test('a session shows no token when it is logged or serialized', async () => {
  const { inspect } = await import('node:util');
  const h = harness();
  await h.connect();
  await h.carry(ME, USER_ID);
  for (const text of [inspect(h.fleet), JSON.stringify(h.fleet), `${JSON.stringify({ fleet: h.fleet })}`]) {
    assert.doesNotMatch(text, /fleet-token|player-token/);
    assert.match(text, /9001/);
  }
  assert.deepEqual(h.fleet.toJSON(), {
    appId: '7',
    gameTokenId: '9001',
    status: 'connected',
    server: SERVER,
    players: 1,
    carried: 1,
  });
  assert.throws(() => new FleetSession({ session: grant({ token: 'short' }) }), /64 characters/);
  assert.throws(() => new FleetSession({ session: grant({ server: { ip4: '', clientPort: 9000 } }) }), /no ip4 and no ip6/);
  assert.throws(() => new FleetSession({ session: grant({ server: { ip4: '203.0.113.7', clientPort: 0 } }) }), /clientPort/);
});
