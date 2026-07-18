/**
 * Offline unit tests for the World Stores layer
 * (`@crowdedkingdoms/crowdyjs/stores`). Stores are wired against mock domain
 * objects (captured subscribe handlers, recorded sends), so notification
 * flows are tested without a server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStores, sleep } from '../helpers.mjs';

/** A fake UdpAPI capturing the single subscription + outbound sends. */
export function fakeUdp() {
  const sent = [];
  const state = {
    handlers: null,
    appId: null,
    subscribeCalls: 0,
    unsubscribeCalls: 0,
    sent,
  };
  const record = (kind) => async (input) => {
    sent.push({ kind, input });
    return true;
  };
  const udp = {
    subscribe(handlers, appId) {
      state.subscribeCalls += 1;
      state.handlers = handlers;
      state.appId = appId;
      return () => {
        state.unsubscribeCalls += 1;
        state.handlers = null;
      };
    },
    sendActorUpdate: record('actorUpdate'),
    sendVoxelUpdate: record('voxelUpdate'),
    sendTextPacket: record('text'),
    sendClientEvent: record('clientEvent'),
    sendAudioPacket: record('audio'),
    sendSingleActorMessage: record('singleActorMessage'),
    sendChannelMessage: record('channelMessage'),
  };
  return { udp, state };
}

/** A minimal WorldStoresClient with only the udp domain live. */
export function fakeClient(extra = {}) {
  const { udp, state } = fakeUdp();
  return {
    client: { udp, chunks: {}, state: {}, avatars: {}, host: {}, gameModel: {}, ...extra },
    net: state,
  };
}

test('codecs: json, text, raw round-trips', async () => {
  const { jsonCodec, textCodec, rawCodec } = await loadStores();

  const json = jsonCodec();
  const value = { hp: 10, name: 'zoë', tags: ['a', 'b'] };
  assert.deepEqual(json.decode(json.encode(value)), value);

  assert.equal(textCodec.decode(textCodec.encode('hello world ✓')), 'hello world ✓');
  assert.equal(rawCodec.encode('AA=='), 'AA==');
  assert.equal(rawCodec.decode('AA=='), 'AA==');
});

test('structCodec reproduces the 48-byte BWF pose layout declaratively', async () => {
  const { structCodec, f32, f64, u8, reserved } = await loadStores();

  const poseCodec = structCodec({
    x: f32(), y: f32(), z: f32(),
    yaw: f32(), pitch: f32(),
    vx: f32(), vy: f32(), vz: f32(),
    flags: u8(), heldBlockId: u8(), _r0: reserved(2),
    updatedAt: f64(), _r1: reserved(4),
  });
  assert.equal(poseCodec.byteLength, 48);

  const pose = {
    x: 1.5, y: -64, z: 1024.25,
    yaw: 3.140000104904175, pitch: -0.5,
    vx: 0.25, vy: 0, vz: -0.125,
    flags: 0b11, heldBlockId: 42,
    updatedAt: 1752787200123,
  };
  const encoded = poseCodec.encode(pose);
  // Base64 of exactly 48 bytes.
  assert.equal(Buffer.from(encoded, 'base64').length, 48);
  assert.deepEqual(poseCodec.decode(encoded), pose);

  // Short payloads are rejected, not silently misread.
  assert.throws(() => poseCodec.decode('AA=='), /48/);
});

test('structCodec field kinds round-trip (ints, bool, bytes, endianness)', async () => {
  const { structCodec, u16, u32, i8, i16, i32, bool8, bytes } = await loadStores();

  const codec = structCodec({
    a: u16(), b: u32(), c: i8(), d: i16(), e: i32(), f: bool8(), g: bytes(3),
  });
  const value = {
    a: 65535, b: 4294967295, c: -128, d: -32768, e: -2147483648,
    f: true, g: new Uint8Array([1, 2, 250]),
  };
  const out = codec.decode(codec.encode(value));
  assert.deepEqual({ ...out, g: [...out.g] }, { ...value, g: [1, 2, 250] });

  // Big-endian option changes the wire bytes but still round-trips.
  const be = structCodec({ a: u16() }, { littleEndian: false });
  const le = structCodec({ a: u16() });
  assert.notEqual(be.encode({ a: 0x0102 }), le.encode({ a: 0x0102 }));
  assert.equal(be.decode(be.encode({ a: 0x0102 })).a, 0x0102);
});

test('chunk key math: keys, world mapping, voxel indexing, neighborhoods', async () => {
  const {
    CHUNK_VOLUME, chunkKey, parseChunkKey, toChunkInput, fromChunkInput,
    worldToChunk, worldToLocalVoxel, voxelIndex, voxelCoordFromIndex,
    chunksAround, chunkDistance,
  } = await loadStores();

  assert.equal(CHUNK_VOLUME, 4096);
  assert.equal(chunkKey({ x: -1, y: 0, z: 7 }), '-1:0:7');
  assert.deepEqual(parseChunkKey('-1:0:7'), { x: -1, y: 0, z: 7 });
  assert.deepEqual(toChunkInput({ x: -1, y: 0, z: 7 }), { x: '-1', y: '0', z: '7' });
  assert.deepEqual(fromChunkInput({ x: '-1', y: '0', z: '7' }), { x: -1, y: 0, z: 7 });

  // Negative world coords floor toward -inf; locals stay 0-15.
  assert.deepEqual(worldToChunk(-1, 16, 31.9), { x: -1, y: 1, z: 1 });
  assert.deepEqual(worldToLocalVoxel(-1, 16, 31.9), { x: 15, y: 0, z: 15 });

  // Dense index layout x + y*16 + z*256, invertible.
  assert.equal(voxelIndex(1, 2, 3), 1 + 32 + 768);
  assert.deepEqual(voxelCoordFromIndex(voxelIndex(15, 0, 7)), { x: 15, y: 0, z: 7 });

  const around = chunksAround({ x: 0, y: 0, z: 0 }, 1);
  assert.equal(around.length, 27);
  assert.deepEqual(around[0], { x: 0, y: 0, z: 0 }); // center first
  assert.equal(chunkDistance({ x: 0, y: 0, z: 0 }, { x: 2, y: -1, z: 1 }), 2);
});

test('manualTicker fires due callbacks in order; interval/worker tickers schedule', async () => {
  const { manualTicker, intervalTicker, workerTicker } = await loadStores();

  const ticker = manualTicker();
  const fired = [];
  ticker.every(100, () => fired.push(`a@${ticker.now}`));
  const cancelB = ticker.every(250, () => fired.push(`b@${ticker.now}`));
  ticker.advance(500);
  // Simultaneously-due tasks fire in registration order (a before b at 500).
  assert.deepEqual(fired, ['a@100', 'a@200', 'b@250', 'a@300', 'a@400', 'a@500', 'b@500']);
  cancelB();
  fired.length = 0;
  ticker.advance(250);
  assert.deepEqual(fired, ['a@600', 'a@700']);
  ticker.dispose();
  fired.length = 0;
  ticker.advance(1000);
  assert.deepEqual(fired, []);

  // Real interval ticker fires and cancels.
  const real = intervalTicker();
  let ticks = 0;
  const cancel = real.every(5, () => (ticks += 1));
  await sleep(40);
  cancel();
  const settled = ticks;
  assert.ok(ticks >= 2, `interval ticker fired (${ticks})`);
  await sleep(20);
  assert.equal(ticks, settled, 'cancelled schedule stops firing');
  real.dispose();

  // In Node (no Worker/Blob), workerTicker falls back to a working interval ticker.
  const worker = workerTicker();
  let workerTicks = 0;
  const cancelWorker = worker.every(5, () => (workerTicks += 1));
  await sleep(40);
  cancelWorker();
  assert.ok(workerTicks >= 2, `workerTicker fallback fired (${workerTicks})`);
  worker.dispose();
});

test('world session: one lazy subscription, fan-out, isolation, dispose', async () => {
  const { createWorldSession } = await loadStores();
  const { client, net } = fakeClient();

  const session = createWorldSession(client, '42');
  // No listeners yet → no subscription.
  assert.equal(net.subscribeCalls, 0);

  const seen = [];
  const offA = session.context.on('actorUpdate', (n) => seen.push(['a', n.uuid]));
  session.context.on('actorUpdate', () => {
    throw new Error('listener throws must not starve others');
  });
  session.context.on('voxelUpdate', (n) => seen.push(['v', n.voxelType]));
  assert.equal(net.subscribeCalls, 1, 'first listener opens ONE subscription');
  assert.equal(net.appId, '42');

  // Fan-out dispatches to the right listener sets, isolating throwers.
  net.handlers.actorUpdate({ uuid: 'u1' });
  net.handlers.actorUpdate({ uuid: 'u2' });
  net.handlers.voxelUpdate({ voxelType: 7 });
  assert.deepEqual(seen, [['a', 'u1'], ['a', 'u2'], ['v', 7]]);

  // Off detaches just that listener.
  offA();
  net.handlers.actorUpdate({ uuid: 'u3' });
  assert.deepEqual(seen.filter(([k]) => k === 'a').length, 2);

  // trackSend is a no-op until a sink registers, then routes.
  session.context.trackSend({ kind: 'actorUpdate', sequenceNumber: 1, sentAt: 0 });
  const tracked = [];
  session.context.setSendTracker((r) => tracked.push(r));
  session.context.trackSend({ kind: 'voxelUpdate', sequenceNumber: 2, sentAt: 1 });
  assert.equal(tracked.length, 1);

  // Dispose closes the subscription and runs cleanups once.
  let cleanups = 0;
  session.context.onDispose(() => (cleanups += 1));
  session.dispose();
  session.dispose();
  assert.equal(net.unsubscribeCalls, 1);
  assert.equal(cleanups, 1);
});

test('LocalActorStore: identity, send loop with dedup + keyframe, ack/error records', async () => {
  const { createWorldSession, manualTicker, structCodec, f32, u8 } = await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  let wallClock = 0;
  const codec = structCodec({ x: f32(), y: f32(), flags: u8() });
  const session = createWorldSession(client, '42', {
    ticker,
    self: {
      codec,
      initialState: { x: 0, y: 0, flags: 0 },
      now: () => wallClock,
      keyframeEveryMs: 1000,
    },
  });
  const self = session.self;
  assert.equal(self.uuid.length, 32, 'uuid minted');
  assert.equal(self.status, 'idle');
  assert.equal(self.chunk, null);

  // Loop ticks before join are no-ops.
  ticker.advance(1000);
  assert.equal(net.sent.length, 0);

  // join records the chunk and sends immediately.
  await self.join({ x: '0', y: '1', z: '0' });
  assert.equal(net.sent.length, 1);
  assert.equal(net.sent[0].kind, 'actorUpdate');
  assert.equal(net.sent[0].input.uuid, self.uuid);
  assert.deepEqual(net.sent[0].input.chunk, { x: '0', y: '1', z: '0' });
  assert.equal(self.status, 'pending');
  assert.equal(self.lastSent.reason, 'join');
  assert.equal(codec.decode(self.lastSent.encoded).x, 0);

  // Unchanged state dedups on loop ticks (within the keyframe window).
  wallClock = 100;
  ticker.advance(200);
  assert.equal(net.sent.length, 1, 'identical state deduped');

  // Changed state replicates on the next tick.
  self.patchState({ x: 12.5 });
  wallClock = 300;
  ticker.advance(200);
  assert.equal(net.sent.length, 2);
  assert.equal(net.sent[1].input.sequenceNumber, self.lastSent.sequenceNumber);
  assert.equal(self.lastSent.reason, 'interval');
  assert.equal(self.lastSent.state.x, 12.5);

  // After keyframeEveryMs of dedup silence, a keyframe goes out anyway.
  wallClock = 1400;
  ticker.advance(200);
  assert.equal(net.sent.length, 3);
  assert.equal(self.lastSent.reason, 'keyframe');

  // The self-echo (server fan-out includes the sender) acks the send.
  net.handlers.actorUpdate({
    uuid: self.uuid,
    state: self.lastSent.encoded,
    sequenceNumber: self.lastSent.sequenceNumber,
    epochMillis: '1',
  });
  assert.equal(self.status, 'acked');
  assert.equal(self.lastAck.state.x, 12.5);

  // Other actors' updates never touch our ack record.
  net.handlers.actorUpdate({ uuid: 'x'.repeat(32), state: 'AA==', sequenceNumber: 9 });
  assert.equal(self.lastAck.state.x, 12.5);

  // A GenericErrorResponse for one of OUR sequence numbers flips status.
  wallClock = 1500;
  await self.moveTo({ x: '1', y: '1', z: '0' });
  assert.equal(self.lastSent.reason, 'move');
  net.handlers.genericError({
    sequenceNumber: self.lastSent.sequenceNumber,
    errorCode: 'UNAUTHORIZED',
  });
  assert.equal(self.status, 'error');
  assert.equal(self.lastError.errorCode, 'UNAUTHORIZED');

  // Unrelated sequence numbers are ignored.
  net.handlers.genericError({ sequenceNumber: 250, errorCode: 'INTERNAL' });
  assert.equal(self.lastError.sequenceNumber, self.lastSent.sequenceNumber);

  // Dispose stops the loop.
  session.dispose();
  self.patchState({ y: 9 });
  ticker.advance(2000);
  assert.equal(net.sent.length, 4);
});

test('LocalActorStore: uuid persistence, explicit uuid, manual-send mode', async () => {
  const { createWorldSession, memoryUuidStore, jsonCodec, manualTicker } =
    await loadStores();

  // A shared UuidStore keeps the identity stable across sessions.
  const uuidStore = memoryUuidStore();
  const mk = () => {
    const { client, net } = fakeClient();
    const session = createWorldSession(client, '1', {
      ticker: manualTicker(),
      self: { codec: jsonCodec(), initialState: { hp: 1 }, uuidStore },
    });
    return { session, net };
  };
  const first = mk();
  const second = mk();
  assert.equal(second.session.self.uuid, first.session.self.uuid);
  first.session.dispose();
  second.session.dispose();

  // Explicit uuid wins; invalid uuids are rejected.
  const { client, net } = fakeClient();
  const explicit = 'a'.repeat(32);
  const ticker = manualTicker();
  const session = createWorldSession(client, '1', {
    ticker,
    self: {
      codec: jsonCodec(),
      initialState: { hp: 1 },
      uuid: explicit,
      sendIntervalMs: false, // manual mode: no loop
    },
  });
  assert.equal(session.self.uuid, explicit);

  await session.self.join({ x: '0', y: '0', z: '0' });
  ticker.advance(5000);
  assert.equal(net.sent.length, 1, 'no loop sends in manual mode');
  session.self.setState({ hp: 5 });
  await session.self.sendNow();
  assert.equal(net.sent.length, 2);
  assert.equal(session.self.lastSent.reason, 'manual');
  assert.equal(session.self.lastSent.state.hp, 5);
  session.dispose();

  const bad = () =>
    createWorldSession(fakeClient().client, '1', {
      self: { codec: jsonCodec(), initialState: {}, uuid: 'short' },
    });
  assert.throws(bad, /32/);
});

/** Build an actorUpdate notification for tests. */
function actorNote(uuid, state, extra = {}) {
  return {
    uuid,
    state,
    chunkX: '0',
    chunkY: '0',
    chunkZ: '0',
    distance: 8,
    decayRate: 1,
    sequenceNumber: 0,
    epochMillis: '1000',
    ...extra,
  };
}

test('RemoteActorStore: registry, self-echo filter, history, staleness, events', async () => {
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  const codec = jsonCodec();
  const session = createWorldSession(client, '42', {
    ticker,
    self: { codec, initialState: { x: 0 }, sendIntervalMs: false, now: () => ticker.now },
    actors: { codec, staleAfterMs: 1000, reapIntervalMs: 500, historySize: 3, now: () => ticker.now },
  });
  const actors = session.actors;

  const events = [];
  actors.onJoin((a) => events.push(['join', a.uuid]));
  actors.onUpdate((a) => events.push(['update', a.uuid, a.state.x]));
  actors.onLeave((a) => events.push(['leave', a.uuid]));

  const u1 = 'b'.repeat(32);
  const u2 = 'c'.repeat(32);

  // Self-echo is filtered out of the registry.
  net.handlers.actorUpdate(actorNote(session.self.uuid, codec.encode({ x: 99 })));
  assert.equal(actors.count, 0);

  // First update joins; identity is stable across updates; samples accumulate.
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 1 })));
  const ref = actors.get(u1);
  assert.equal(actors.count, 1);
  ticker.advance(100);
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 2 }), { chunkX: '5' }));
  assert.equal(actors.get(u1), ref, 'record identity is stable');
  assert.equal(ref.state.x, 2);
  assert.equal(ref.chunk.x, '5');
  assert.deepEqual(ref.samples.map((s) => s.state.x), [2, 1], 'newest first');
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 3 })));
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 4 })));
  assert.deepEqual(ref.samples.map((s) => s.state.x), [4, 3, 2], 'history capped at 3');

  net.handlers.actorUpdate(actorNote(u2, codec.encode({ x: 10 })));
  assert.equal(actors.count, 2);
  assert.deepEqual(events.filter(([k]) => k === 'join').map(([, u]) => u), [u1, u2]);

  // Undecodable payloads are counted, not thrown.
  net.handlers.actorUpdate(actorNote('d'.repeat(32), '!!!not-base64-json!!!'));
  assert.equal(actors.decodeFailures, 1);
  assert.equal(actors.count, 2);

  // Staleness: u2 goes quiet after its t=100 update. Read-time filtering
  // hides it BEFORE the reap timer catches up; the reap then fires onLeave.
  const rev = actors.revision;
  ticker.advance(400); // t=500
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 5 })));
  ticker.advance(700); // t=1200: last reap ran at t=1000 (u2 only 900ms quiet)
  assert.equal(actors.get(u2), undefined, 'read-time filter hides the stale actor');
  assert.deepEqual(actors.list().map((a) => a.uuid), [u1]);
  assert.ok(!events.some(([k]) => k === 'leave'), 'not physically reaped yet');
  net.handlers.actorUpdate(actorNote(u1, codec.encode({ x: 6 }))); // keep u1 fresh
  ticker.advance(300); // t=1500: reap sees u2 1400ms quiet → deletes + onLeave
  assert.ok(events.some(([k, u]) => k === 'leave' && u === u2), 'reap fired onLeave');
  assert.deepEqual(actors.list().map((a) => a.uuid), [u1]);
  assert.ok(actors.revision > rev);

  session.dispose();
});

test('RemoteActorStore lanes: decode once, route to first match', async () => {
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  const codec = jsonCodec();
  const session = createWorldSession(client, '1', {
    ticker,
    actors: {
      codec,
      now: () => ticker.now,
      staleAfterMs: false,
      lanes: {
        mobs: (state) => (state.flags & 2) !== 0,
        players: () => true,
      },
    },
  });
  const actors = session.actors;

  const player = 'p'.repeat(32);
  const mob = 'm'.repeat(32);
  net.handlers.actorUpdate(actorNote(player, codec.encode({ flags: 0, x: 1 })));
  net.handlers.actorUpdate(actorNote(mob, codec.encode({ flags: 2, x: 2 })));

  // First matching lane wins: the mob never lands in players.
  assert.deepEqual(actors.lane('mobs').list().map((a) => a.uuid), [mob]);
  assert.deepEqual(actors.lane('players').list().map((a) => a.uuid), [player]);
  assert.equal(actors.count, 2);
  assert.equal(actors.get(mob).state.x, 2, 'store-level get searches lanes');

  assert.throws(() => actors.lane('npcs'), /Unknown actor lane 'npcs'/);

  // clear() empties every lane and fires leave events.
  let leaves = 0;
  actors.onLeave(() => (leaves += 1));
  actors.clear();
  assert.equal(actors.count, 0);
  assert.equal(leaves, 2);

  session.dispose();
});

test('caller-supplied tickers are not disposed with the session', async () => {
  const { createWorldSession, manualTicker } = await loadStores();
  const { client } = fakeClient();

  const ticker = manualTicker();
  let ticks = 0;
  ticker.every(10, () => (ticks += 1));
  const session = createWorldSession(client, '1', { ticker });
  session.dispose();
  ticker.advance(20);
  assert.equal(ticks, 2, 'shared ticker survives session dispose');
});
