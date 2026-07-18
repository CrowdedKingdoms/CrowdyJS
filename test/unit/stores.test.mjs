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

test('ErrorStore: attributes GenericErrorResponse to tracked sends, ring buffer, per-actor', async () => {
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  const codec = jsonCodec();
  const session = createWorldSession(client, '42', {
    ticker,
    errors: { capacity: 3, now: () => ticker.now },
    self: {
      codec,
      initialState: { x: 0 },
      sendIntervalMs: false,
      now: () => ticker.now,
    },
  });

  const seen = [];
  session.errors.onError((e) => seen.push(e));

  // A send made through a store is tracked; its error is attributed.
  await session.self.join({ x: '0', y: '0', z: '0' });
  const seq = session.self.lastSent.sequenceNumber;
  net.handlers.genericError({ sequenceNumber: seq, errorCode: 'UNAUTHORIZED' });

  assert.equal(session.errors.total, 1);
  assert.equal(session.errors.last.errorCode, 'UNAUTHORIZED');
  assert.equal(session.errors.last.send.kind, 'actorUpdate');
  assert.equal(session.errors.last.send.uuid, session.self.uuid);
  assert.equal(seen.length, 1);

  // Per-actor lookup uses the send's uuid.
  assert.equal(session.errors.lastFor(session.self.uuid).errorCode, 'UNAUTHORIZED');
  assert.equal(session.errors.lastFor('unknown'), undefined);

  // Untracked sequence numbers still record, just unattributed.
  net.handlers.genericError({ sequenceNumber: 200, errorCode: 'RATE_LIMITED' });
  assert.equal(session.errors.last.send, undefined);

  // Ring buffer caps at capacity, newest first; total keeps counting.
  net.handlers.genericError({ sequenceNumber: 201, errorCode: 'E3' });
  net.handlers.genericError({ sequenceNumber: 202, errorCode: 'E4' });
  assert.equal(session.errors.total, 4);
  assert.deepEqual(
    session.errors.recent().map((e) => e.errorCode),
    ['E4', 'E3', 'RATE_LIMITED'],
  );
  assert.deepEqual(session.errors.recent(1).map((e) => e.errorCode), ['E4']);

  session.errors.clear();
  assert.equal(session.errors.recent().length, 0);
  assert.equal(session.errors.lastFor(session.self.uuid), undefined);
  assert.equal(session.errors.total, 4, 'total survives clear');

  session.dispose();
});

/** A fake ChunksAPI backed by an in-memory map keyed "x:y:z". */
function fakeChunks(initial = {}) {
  const server = new Map(Object.entries(initial));
  const calls = { byDistance: 0, get: 0, update: [] };
  const key = (c) => `${c.x}:${c.y}:${c.z}`;
  const api = {
    async byDistance({ centerCoordinate, maxDistance }) {
      calls.byDistance += 1;
      const center = {
        x: Number(centerCoordinate.x),
        y: Number(centerCoordinate.y),
        z: Number(centerCoordinate.z),
      };
      const chunks = [];
      for (const [k, entry] of server) {
        const [x, y, z] = k.split(':').map(Number);
        const dist = Math.max(
          Math.abs(x - center.x),
          Math.abs(y - center.y),
          Math.abs(z - center.z),
        );
        if (dist <= maxDistance) {
          chunks.push({
            coordinates: { x: String(x), y: String(y), z: String(z) },
            voxels: entry.voxels ?? null,
            chunkState: entry.chunkState ?? null,
          });
        }
      }
      return { chunks };
    },
    async get({ coordinates }) {
      calls.get += 1;
      const entry = server.get(key(coordinates));
      if (!entry) return null;
      return {
        coordinates,
        voxels: entry.voxels ?? null,
        chunkState: entry.chunkState ?? null,
        voxelStates: entry.voxelStates ?? [],
      };
    },
    async update(input) {
      calls.update.push(input);
      server.set(key(input.coordinates), { voxels: input.voxels });
      return { coordinates: input.coordinates, voxels: input.voxels };
    },
  };
  return { api, calls, server };
}

test('ChunkStore: bulk load + hydration, realtime merge, optimistic edits, worldgen write-back', async () => {
  const { createWorldSession, manualTicker, jsonCodec, CHUNK_VOLUME, voxelIndex } =
    await loadStores();

  // Server knows chunk 0:0:0 (a stone block at (1,2,3) + a sparse state).
  const dense = new Uint8Array(CHUNK_VOLUME);
  dense[voxelIndex(1, 2, 3)] = 7;
  const voxelStateCodec = jsonCodec();
  const { api: chunksApi, calls, server } = fakeChunks({
    '0:0:0': {
      voxels: Buffer.from(dense).toString('base64'),
      chunkState: Buffer.from(JSON.stringify({ biome: 'forest' })).toString('base64'),
      voxelStates: [
        {
          voxelCoord: { x: 1, y: 2, z: 3 },
          voxelType: 7,
          state: voxelStateCodec.encode({ growth: 2 }),
        },
      ],
    },
  });
  const { client, net } = fakeClient({ chunks: chunksApi });

  const ticker = manualTicker();
  const generated = [];
  const session = createWorldSession(client, '42', {
    ticker,
    chunks: {
      voxelStateCodec,
      chunkStateCodec: jsonCodec(),
      writeBackIntervalMs: 100,
      now: () => ticker.now,
      onMissing: (coord) => {
        generated.push(coord);
        const grid = new Uint8Array(CHUNK_VOLUME);
        grid[0] = 9;
        return grid;
      },
    },
  });
  const store = session.chunks;

  await store.ensureAround({ x: 0, y: 0, z: 0 }, 1);
  // Known chunk: loaded + hydrated with typed states.
  const loaded = store.get({ x: 0, y: 0, z: 0 });
  assert.equal(loaded.loadState, 'loaded');
  assert.equal(loaded.hydrated, true);
  assert.equal(store.voxelTypeAt({ x: 0, y: 0, z: 0 }, 1, 2, 3), 7);
  assert.deepEqual(store.voxelStateAt({ x: 0, y: 0, z: 0 }, 1, 2, 3), { growth: 2 });
  assert.deepEqual(loaded.chunkState, { biome: 'forest' });

  // The other 26 chunks were missing → worldgen seeded them all.
  assert.equal(generated.length, 26);
  const seeded = store.get({ x: 1, y: 0, z: 0 });
  assert.equal(seeded.loadState, 'seeded');
  assert.equal(seeded.voxels[0], 9);
  assert.equal(store.pendingWriteBacks, 26);

  // Repeat calls dedupe (nothing new requested).
  const before = calls.byDistance;
  await store.ensureAround({ x: 0, y: 0, z: 0 }, 1);
  assert.equal(calls.byDistance, before);

  // Realtime merge into a tracked chunk (typed state decoded).
  const rev = store.revision;
  net.handlers.voxelUpdate({
    chunkX: '0', chunkY: '0', chunkZ: '0',
    voxelX: 5, voxelY: 5, voxelZ: 5,
    voxelType: 3,
    voxelState: voxelStateCodec.encode({ growth: 1 }),
    uuid: 'w'.repeat(32),
    sequenceNumber: 1,
    epochMillis: '2',
  });
  assert.equal(store.voxelTypeAt({ x: 0, y: 0, z: 0 }, 5, 5, 5), 3);
  assert.deepEqual(store.voxelStateAt({ x: 0, y: 0, z: 0 }, 5, 5, 5), { growth: 1 });
  assert.ok(store.revision > rev);

  // Untracked chunks are ignored by realtime merge.
  net.handlers.voxelUpdate({
    chunkX: '99', chunkY: '0', chunkZ: '0',
    voxelX: 0, voxelY: 0, voxelZ: 0, voxelType: 1, voxelState: '',
    uuid: 'w'.repeat(32), sequenceNumber: 2, epochMillis: '3',
  });
  assert.equal(store.get({ x: 99, y: 0, z: 0 }), undefined);

  // Optimistic setVoxel applies locally AND replicates with a typed state.
  await store.setVoxel({
    chunk: { x: 0, y: 0, z: 0 }, x: 9, y: 9, z: 9, voxelType: 4,
    state: { growth: 0 },
  });
  assert.equal(store.voxelTypeAt({ x: 0, y: 0, z: 0 }, 9, 9, 9), 4);
  const sent = net.sent.find((s) => s.kind === 'voxelUpdate');
  assert.equal(sent.input.voxelType, 4);
  assert.deepEqual(voxelStateCodec.decode(sent.input.voxelState), { growth: 0 });

  // Write-back: one throttled chunk per tick, then flush drains the rest.
  ticker.advance(100);
  await Promise.resolve();
  assert.equal(calls.update.length >= 1, true, 'one chunk persisted per tick');
  await store.flush();
  assert.equal(store.pendingWriteBacks, 0);
  assert.equal(calls.update.length, 26);
  assert.equal(store.get({ x: 1, y: 0, z: 0 }).loadState, 'loaded');
  assert.equal(server.size, 27, 'worldgen persisted server-side');

  // Prune drops far, clean chunks.
  store.pruneBeyond({ x: 10, y: 0, z: 0 }, 1);
  assert.equal(store.get({ x: 0, y: 0, z: 0 }), undefined);

  session.dispose();
});

test('ChunkStore: custom voxelIndex layout routes every read/merge/edit', async () => {
  const { createWorldSession, manualTicker, CHUNK_VOLUME } = await loadStores();
  // Blocks-with-Friends layout: y*256 + z*16 + x.
  const bwfIndex = (x, y, z) => y * 256 + z * 16 + x;
  const dense = new Uint8Array(CHUNK_VOLUME);
  dense[bwfIndex(1, 2, 3)] = 7;
  const { api: chunksApi } = fakeChunks({
    '0:0:0': { voxels: Buffer.from(dense).toString('base64') },
  });
  const { client, net } = fakeClient({ chunks: chunksApi });
  const session = createWorldSession(client, '42', {
    ticker: manualTicker(),
    chunks: { voxelIndex: bwfIndex, writeBackIntervalMs: false },
  });
  await session.chunks.ensureAround({ x: 0, y: 0, z: 0 }, 1);
  // Read resolves through the custom layout (default layout would miss).
  assert.equal(session.chunks.voxelTypeAt({ x: 0, y: 0, z: 0 }, 1, 2, 3), 7);
  // Realtime merge writes at the custom offset.
  net.handlers.voxelUpdate({
    chunkX: '0', chunkY: '0', chunkZ: '0',
    voxelX: 5, voxelY: 6, voxelZ: 7, voxelType: 3, voxelState: '',
    uuid: 'w'.repeat(32), sequenceNumber: 1, epochMillis: '2',
  });
  assert.equal(session.chunks.get({ x: 0, y: 0, z: 0 }).voxels[bwfIndex(5, 6, 7)], 3);
  // Local edits too.
  await session.chunks.setVoxel({
    chunk: { x: 0, y: 0, z: 0 }, x: 9, y: 8, z: 7, voxelType: 4,
  });
  assert.equal(session.chunks.get({ x: 0, y: 0, z: 0 }).voxels[bwfIndex(9, 8, 7)], 4);
  session.dispose();
});

test('ChunkStore: change events fire and seed validates the grid size', async () => {
  const { createWorldSession, manualTicker, CHUNK_VOLUME } = await loadStores();
  const { api: chunksApi } = fakeChunks();
  const { client } = fakeClient({ chunks: chunksApi });
  const session = createWorldSession(client, '1', {
    ticker: manualTicker(),
    chunks: { writeBackIntervalMs: false },
  });

  const changed = [];
  session.chunks.onChunkChanged((c) => changed.push(c.key));
  session.chunks.seed({ x: 2, y: 0, z: 0 }, new Uint8Array(CHUNK_VOLUME));
  assert.deepEqual(changed, ['2:0:0']);
  assert.throws(
    () => session.chunks.seed({ x: 0, y: 0, z: 0 }, new Uint8Array(10)),
    /4096/,
  );
  session.dispose();
});

test('ChannelInbox: per-channel typed history, filtered subscribe, typed send', async () => {
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  const codec = jsonCodec();
  const session = createWorldSession(client, '42', {
    ticker,
    channelInbox: { codec, capacity: 2, now: () => ticker.now },
  });
  const inbox = session.channelInbox;

  const all = [];
  const only7 = [];
  inbox.onMessage((m) => all.push(m.payload.text));
  inbox.onMessage((m) => only7.push(m.payload.text), '7');

  const note = (channelId, payload) => ({
    channelId,
    uuid: 's'.repeat(32),
    payload: codec.encode(payload),
    sequenceNumber: 0,
    epochMillis: '5',
  });
  net.handlers.channelMessage(note('7', { text: 'hi' }));
  net.handlers.channelMessage(note('8', { text: 'other room' }));
  net.handlers.channelMessage(note('7', { text: 'again' }));
  net.handlers.channelMessage(note('7', { text: 'third' }));

  assert.deepEqual(all, ['hi', 'other room', 'again', 'third']);
  assert.deepEqual(only7, ['hi', 'again', 'third']);
  // Capacity 2: oldest dropped, chronological order kept.
  assert.deepEqual(inbox.messages('7').map((m) => m.payload.text), ['again', 'third']);
  assert.deepEqual(inbox.channels().sort(), ['7', '8']);

  // Undecodable payloads count, not crash.
  net.handlers.channelMessage({ channelId: '7', uuid: 'x'.repeat(32), payload: '###', epochMillis: '6' });
  assert.equal(inbox.decodeFailures, 1);

  // Typed send encodes and tracks.
  await inbox.send('7', { text: 'outbound' });
  const sent = net.sent.find((s) => s.kind === 'channelMessage');
  assert.deepEqual(codec.decode(sent.input.payload), { text: 'outbound' });

  inbox.clear('7');
  assert.deepEqual(inbox.messages('7'), []);
  session.dispose();
});

test('ActorInbox + EventRouter: typed direct messages and per-eventType routing', async () => {
  const { createWorldSession, manualTicker, jsonCodec, structCodec, u16 } =
    await loadStores();
  const { client, net } = fakeClient();

  const ticker = manualTicker();
  const dmCodec = jsonCodec();
  const session = createWorldSession(client, '42', {
    ticker,
    actorInbox: { codec: dmCodec, capacity: 10, now: () => ticker.now },
    events: { now: () => ticker.now },
  });

  // Direct messages: decode + history + subscribe + typed send.
  const dms = [];
  session.actorInbox.onMessage((m) => dms.push(m.payload));
  net.handlers.singleActorMessage({
    uuid: 't'.repeat(32),
    payload: dmCodec.encode({ t: 'attack', d: 5 }),
    sequenceNumber: 1,
    epochMillis: '9',
  });
  assert.deepEqual(dms, [{ t: 'attack', d: 5 }]);
  assert.equal(session.actorInbox.messages().length, 1);
  await session.actorInbox.send('r'.repeat(32), { t: 'heal', d: 2 }, { x: '0', y: '0', z: '0' });
  const dmSent = net.sent.find((s) => s.kind === 'singleActorMessage');
  assert.equal(dmSent.input.targetUuid, 'r'.repeat(32));
  assert.deepEqual(dmCodec.decode(dmSent.input.payload), { t: 'heal', d: 2 });

  // Events: per-type codec + handler, client AND server origins, lastEvent.
  const boomCodec = structCodec({ power: u16() });
  const booms = [];
  const off = session.events.on(7, boomCodec, (e) => booms.push([e.origin, e.value.power]));
  const eventNote = (eventType, state) => ({
    eventType,
    state,
    uuid: 'e'.repeat(32),
    chunkX: '1', chunkY: '2', chunkZ: '3',
    sequenceNumber: 0,
    epochMillis: '11',
  });
  net.handlers.clientEvent(eventNote(7, boomCodec.encode({ power: 300 })));
  net.handlers.serverEvent(eventNote(7, boomCodec.encode({ power: 12 })));
  net.handlers.clientEvent(eventNote(9, 'AA==')); // unregistered type → ignored
  assert.deepEqual(booms, [['client', 300], ['server', 12]]);
  assert.equal(session.events.lastEvent(7).value.power, 12);
  assert.equal(session.events.lastEvent(9), undefined);

  // Typed event send.
  await session.events.send(7, boomCodec, { power: 55 }, { x: '0', y: '0', z: '0' });
  const evSent = net.sent.find((s) => s.kind === 'clientEvent');
  assert.equal(evSent.input.eventType, 7);
  assert.equal(boomCodec.decode(evSent.input.state).power, 55);

  // Off detaches.
  off();
  net.handlers.clientEvent(eventNote(7, boomCodec.encode({ power: 1 })));
  assert.equal(booms.length, 2);

  session.dispose();
});

test('HostTracker: heartbeat loop, isHost, host-change events, transient failures', async () => {
  const { createWorldSession, manualTicker } = await loadStores();

  let hostUserId = '10';
  let fail = false;
  let beats = 0;
  const hostApi = {
    async heartbeat() {
      beats += 1;
      if (fail) throw new Error('transient');
      return hostUserId === null ? null : { hostUserId, actorCount: 2 };
    },
  };
  const { client } = fakeClient({ host: hostApi });
  const ticker = manualTicker();
  const session = createWorldSession(client, '42', {
    ticker,
    host: { myUserId: '10', intervalMs: 3000, heartbeatImmediately: false },
  });

  const changes = [];
  session.host.onHostChanged((h) => changes.push(h));
  assert.equal(session.host.hostUserId, null);
  assert.equal(session.host.isHost, false);

  ticker.advance(3000);
  await sleep(0); // let the async beat settle
  assert.equal(beats, 1);
  assert.equal(session.host.hostUserId, '10');
  assert.equal(session.host.isHost, true);
  assert.deepEqual(changes, ['10']);

  // Transient failure keeps the last known host.
  fail = true;
  ticker.advance(3000);
  await sleep(0);
  assert.equal(session.host.hostUserId, '10');

  // A new host fires the change event and flips isHost.
  fail = false;
  hostUserId = '99';
  ticker.advance(3000);
  await sleep(0);
  assert.equal(session.host.hostUserId, '99');
  assert.equal(session.host.isHost, false);
  assert.deepEqual(changes, ['10', '99']);

  session.dispose();
});

test('SaveStateStore: typed load/set/save cache with debounced autosave', async () => {
  const { createWorldSession, manualTicker } = await loadStores();

  let serverBlob = Buffer.from(JSON.stringify({ level: 3 })).toString('base64');
  const updates = [];
  const stateApi = {
    async getOne() {
      return serverBlob === null ? null : { state: serverBlob };
    },
    async update(input) {
      updates.push(input);
      serverBlob = input.state;
      return { state: input.state };
    },
  };
  const { client } = fakeClient({ state: stateApi });
  const ticker = manualTicker();
  const session = createWorldSession(client, '42', {
    ticker,
    save: { autosaveMs: 500, now: () => ticker.now },
  });
  const save = session.save;

  // Hydrate from the server copy.
  assert.deepEqual(await save.load(), { level: 3 });
  assert.equal(save.dirty, false);

  // set() caches + marks dirty; autosave persists on the next tick.
  save.patch({ level: 4 });
  assert.equal(save.dirty, true);
  assert.equal(updates.length, 0);
  ticker.advance(500);
  await sleep(0);
  assert.equal(updates.length, 1);
  assert.equal(save.dirty, false);
  assert.equal(save.lastSavedAt, 500);
  assert.deepEqual(JSON.parse(Buffer.from(updates[0].state, 'base64').toString()), {
    level: 4,
  });

  // Clean cache → autosave does nothing.
  ticker.advance(2000);
  await sleep(0);
  assert.equal(updates.length, 1);

  // Manual save works without autosave pressure.
  save.set({ level: 9 });
  await save.save();
  assert.equal(updates.length, 2);
  session.dispose();
});

test('AvatarStateStore: binds an avatar and round-trips typed public/private/app state', async () => {
  const { createWorldSession, manualTicker } = await loadStores();

  const j = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
  const writes = { identity: [], app: [] };
  const avatarsApi = {
    async mine() {
      return [{ avatarId: '5', name: 'Hero' }];
    },
    async get(id) {
      return {
        avatarId: id,
        publicState: j({ title: 'Knight' }),
        privateState: j({ secrets: 1 }),
      };
    },
    async appState() {
      return { state: j({ progress: 2 }) };
    },
    async updateState(id, input) {
      writes.identity.push([id, input]);
      return { avatarId: id };
    },
    async updateAppState(input) {
      writes.app.push(input);
      return { state: input.state };
    },
  };
  const { client } = fakeClient({ avatars: avatarsApi });
  const session = createWorldSession(client, '42', {
    ticker: manualTicker(),
    avatar: true,
  });
  const store = session.avatar;

  // Unbound writes are rejected clearly.
  await assert.rejects(() => store.setAppState({ progress: 3 }), /unbound/i);

  await store.load();
  assert.equal(store.avatarId, '5', 'bound to the first avatar');
  assert.deepEqual(store.publicState, { title: 'Knight' });
  assert.deepEqual(store.privateState, { secrets: 1 });
  assert.deepEqual(store.appState, { progress: 2 });

  await store.setIdentityState({ publicState: { title: 'Baron' } });
  assert.deepEqual(store.publicState, { title: 'Baron' });
  assert.deepEqual(store.privateState, { secrets: 1 }, 'untouched field kept');
  const [id, identityInput] = writes.identity[0];
  assert.equal(id, '5');
  assert.equal(identityInput.privateState, undefined, 'only the given blob written');

  await store.setAppState({ progress: 3 });
  assert.deepEqual(store.appState, { progress: 3 });
  assert.equal(writes.app[0].appId, '42');

  session.dispose();
});

test('ContainerMirror: typed snapshots, change-only events, channel-ping refresh', async () => {
  const { createWorldSession, manualTicker } = await loadStores();

  const containers = new Map([
    ['c-1', { typeName: 'MatchMeta', displayName: 'Match', ownerUserId: '7', props: { state: 'lobby', round: 0 } }],
    ['c-2', { typeName: 'Score', displayName: 'Score', ownerUserId: '8', props: { points: 0 } }],
  ]);
  let pulls = 0;
  const gameModelApi = {
    async containerState({ containerId }) {
      pulls += 1;
      const entry = containers.get(containerId);
      return {
        containerId,
        typeName: entry.typeName,
        displayName: entry.displayName,
        ownerUserId: entry.ownerUserId,
        propertiesJson: JSON.stringify(entry.props),
      };
    },
  };
  const { client, net } = fakeClient({ gameModel: gameModelApi });
  const ticker = manualTicker();
  const session = createWorldSession(client, '42', {
    ticker,
    model: { now: () => ticker.now },
  });
  const mirror = session.model;

  const changes = [];
  mirror.onChange((c) => changes.push([c.containerId, c.revision]));

  // watch() fetches the initial typed snapshot.
  const match = await mirror.watch('c-1', (props) => ({
    state: String(props.state),
    round: Number(props.round),
  }));
  await mirror.watch('c-2');
  assert.deepEqual(match.value, { state: 'lobby', round: 0 });
  assert.equal(mirror.get('c-1').revision, 1);
  assert.equal(mirror.list().length, 2);
  assert.deepEqual(changes, [['c-1', 1], ['c-2', 1]]);

  // Unchanged refreshes bump nothing and fire nothing.
  await mirror.refresh('c-1');
  assert.equal(mirror.get('c-1').revision, 1);
  assert.equal(changes.length, 2);

  // A bound channel ping re-pulls everything; only changed snapshots fire.
  const off = mirror.bindToChannel('77');
  containers.get('c-1').props = { state: 'active', round: 1 };
  net.handlers.channelMessage({ channelId: '77', uuid: 'u'.repeat(32), payload: 'AA==', epochMillis: '1' });
  await sleep(0);
  assert.equal(mirror.get('c-1').value.state, 'active');
  assert.equal(mirror.get('c-1').revision, 2);
  assert.equal(mirror.get('c-2').revision, 1, 'unchanged container did not bump');
  assert.deepEqual(changes[2], ['c-1', 2]);

  // Snapshot identity is stable across refreshes.
  assert.equal(mirror.get('c-1'), match);

  // Pings on unbound channels do nothing; unbinding stops refreshes.
  const before = pulls;
  net.handlers.channelMessage({ channelId: '99', uuid: 'u'.repeat(32), payload: 'AA==', epochMillis: '2' });
  await sleep(0);
  assert.equal(pulls, before);
  off();
  net.handlers.channelMessage({ channelId: '77', uuid: 'u'.repeat(32), payload: 'AA==', epochMillis: '3' });
  await sleep(0);
  assert.equal(pulls, before);

  // unwatch drops the snapshot.
  mirror.unwatch('c-2');
  assert.equal(mirror.get('c-2'), undefined);

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
