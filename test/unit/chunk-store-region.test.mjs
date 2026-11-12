/**
 * ChunkStore's region loads, paced realtime edits and catch-up (18.30.0): it reads only the chunks
 * it does not hold, as boxes and pages; it undoes and reports an edit the server refuses or never
 * echoes; it keeps at most 128 edits unanswered and paces them; and it reads a chunk again when the
 * server says it was replaced, or what changed while the connection was down.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from '../helpers.mjs';

const ME = 'm'.repeat(32);
const OTHER = 'o'.repeat(32);

/** A server of stored chunks keyed "x:y:z", answering box reads in x, y, z order, paged. */
function fakeServer(initial = {}) {
  const stored = new Map(Object.entries(initial));
  const reads = [];
  let gets = 0;
  const edits = [];
  const n = (c) => ({ x: Number(c.x), y: Number(c.y), z: Number(c.z) });
  const chunks = {
    async byDistance(input) {
      reads.push(input);
      const lo = n(input.lowChunk);
      const hi = n(input.highChunk);
      const out = [];
      for (const [k, entry] of stored) {
        const [x, y, z] = k.split(':').map(Number);
        if (x < lo.x || x > hi.x || y < lo.y || y > hi.y || z < lo.z || z > hi.z) continue;
        if (input.since && !(entry.updatedAt >= input.since)) continue;
        out.push({
          coordinates: { x: String(x), y: String(y), z: String(z) },
          voxels: entry.voxels ?? null,
          chunkState: null,
          updatedAt: entry.updatedAt ?? null,
        });
      }
      out.sort(
        (a, b) =>
          a.coordinates.x - b.coordinates.x ||
          a.coordinates.y - b.coordinates.y ||
          a.coordinates.z - b.coordinates.z,
      );
      const limit = input.limit || 1000;
      const skip = input.skip || 0;
      return { chunks: out.slice(skip, skip + limit), limit, skip };
    },
    async get({ coordinates }) {
      gets += 1;
      const entry = stored.get(`${coordinates.x}:${coordinates.y}:${coordinates.z}`);
      if (!entry) return null;
      return {
        coordinates,
        voxels: entry.voxels ?? null,
        chunkState: null,
        voxelStates: entry.voxelStates ?? [],
        voxelStatesTruncated: entry.truncated ?? false,
        updatedAt: entry.updatedAt ?? null,
      };
    },
    async update(input) {
      return input;
    },
  };
  const voxels = {
    async listByDistance(input) {
      reads.push({ edits: input });
      return { chunks: edits.splice(0), limit: input.limit, skip: input.skip ?? 0 };
    },
  };
  return { chunks, voxels, stored, reads, edits, gets: () => gets };
}

async function setup({ server = fakeServer(), config = {}, send } = {}) {
  const { createWorldSession, manualTicker } = await loadStores();
  let handlers = null;
  const sent = [];
  let status = null;
  const ticker = manualTicker();
  const client = {
    udp: {
      subscribe(h) {
        handlers = h;
        return () => {};
      },
      sendVoxelUpdate: send ?? (async (input) => (sent.push(input), true)),
    },
    chunks: server.chunks,
    voxels: server.voxels,
    realtime: {
      onStatus(listener) {
        status = listener;
        listener('connected');
        return () => {};
      },
    },
    state: {},
    avatars: {},
    host: {},
  };
  const session = createWorldSession(client, '42', {
    ticker,
    chunks: { writeBackIntervalMs: false, actorUuid: ME, now: () => ticker.now, ...config },
  });
  const store = session.chunks;
  const refusals = [];
  store.onEditRefused((r) => refusals.push(r));
  return {
    store,
    session,
    server,
    sent,
    refusals,
    ticker,
    handlers: () => handlers,
    setStatus: (s) => status(s),
    echo: (edit) =>
      handlers.voxelUpdate({
        chunkX: edit.chunk.x, chunkY: edit.chunk.y, chunkZ: edit.chunk.z,
        voxelX: edit.voxel.x, voxelY: edit.voxel.y, voxelZ: edit.voxel.z,
        voxelType: edit.voxelType, voxelState: edit.voxelState ?? '',
        uuid: edit.uuid, sequenceNumber: edit.sequenceNumber, epochMillis: '1',
      }),
    refuse: (edit, errorCode = 'UNAUTHORIZED') =>
      handlers.genericError({ sequenceNumber: edit.sequenceNumber, errorCode }),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a step reads only the slab it uncovers, as one box', async () => {
  const t = await setup();
  await t.store.ensureAround({ x: 0, y: 0, z: 0 }, 8);
  assert.equal(t.server.reads.length, 1);
  assert.deepEqual(t.server.reads[0].lowChunk, { x: '-8', y: '-8', z: '-8' });
  assert.deepEqual(t.server.reads[0].highChunk, { x: '8', y: '8', z: '8' });
  assert.equal(t.store.list().length, 17 ** 3);

  await t.store.ensureAround({ x: 1, y: 0, z: 0 }, 8);
  assert.equal(t.server.reads.length, 2);
  assert.deepEqual(t.server.reads[1].lowChunk, { x: '9', y: '-8', z: '-8' });
  assert.deepEqual(t.server.reads[1].highChunk, { x: '9', y: '8', z: '8' });

  // A diagonal step uncovers two slabs: a few boxes, none larger than twice what it holds.
  const before = t.server.reads.length;
  await t.store.ensureAround({ x: 2, y: 0, z: 1 }, 8);
  const boxes = t.server.reads.slice(before);
  assert.ok(boxes.length >= 2 && boxes.length <= 4, `${boxes.length} boxes`);
  const volume = (r) =>
    (r.highChunk.x - r.lowChunk.x + 1) * (r.highChunk.y - r.lowChunk.y + 1) * (r.highChunk.z - r.lowChunk.z + 1);
  const read = boxes.reduce((sum, r) => sum + volume(r), 0);
  assert.ok(read <= 2 * 2 * 289, `read ${read} chunks for about 561 new ones`);
  assert.equal(t.store.list().length, 17 ** 3 + 289 + 561);
  t.session.dispose();
});

test('a box is read in pages that follow the size the server applied; a repeat is counted once', async () => {
  const initial = {};
  for (let x = 0; x < 15; x++) for (let y = 0; y < 15; y++) for (let z = 0; z < 15; z++) initial[`${x}:${y}:${z}`] = {};
  const server = fakeServer(initial);
  const byDistance = server.chunks.byDistance;
  server.chunks.byDistance = async (input) => {
    // The server applies 500 a page, and repeats a chunk across pages once.
    const answer = await byDistance({ ...input, limit: 500 });
    if (answer.skip === 500) answer.chunks.unshift(answer.chunks[0]);
    return answer;
  };
  const t = await setup({ server });
  await t.store.ensureAround({ x: 7, y: 7, z: 7 }, 7);
  assert.deepEqual(
    t.server.reads.map((r) => r.skip),
    [0, 500, 1000, 1500, 2000, 2500, 3000],
  );
  assert.equal(t.store.duplicatePageChunks, 1);
  assert.equal(t.store.list().filter((c) => c.loadState === 'loaded').length, 15 ** 3);
  t.session.dispose();
});

test('an edit the server refuses is undone and reported; a newer edit undoes to the original', async () => {
  const t = await setup({ server: fakeServer({ '0:0:0': {} }) });
  const at = { x: 0, y: 0, z: 0 };
  await t.store.ensureAround(at, 0);
  await t.store.setVoxel({ chunk: at, x: 1, y: 1, z: 1, voxelType: 5 });
  t.refuse(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(at, 1, 1, 1), 0);
  assert.deepEqual(
    { reason: t.refusals[0].reason, restored: t.refusals[0].restored, voxelType: t.refusals[0].voxelType },
    { reason: 'UNAUTHORIZED', restored: true, voxelType: 5 },
  );
  assert.equal(t.store.editsInFlight, 0);

  // Two edits of one voxel; the first is refused while the second shows, then the second too.
  await t.store.setVoxel({ chunk: at, x: 2, y: 2, z: 2, voxelType: 3 });
  await t.store.setVoxel({ chunk: at, x: 2, y: 2, z: 2, voxelType: 4 });
  t.refuse(t.sent[1]);
  assert.equal(t.store.voxelTypeAt(at, 2, 2, 2), 4, 'the newer edit still shows');
  assert.equal(t.refusals[1].restored, false);
  t.refuse(t.sent[2]);
  assert.equal(t.store.voxelTypeAt(at, 2, 2, 2), 0, 'back to what the voxel held before both');

  // A refusal after another client's edit leaves theirs.
  await t.store.setVoxel({ chunk: at, x: 3, y: 3, z: 3, voxelType: 8 });
  t.handlers().voxelUpdate({
    chunkX: '0', chunkY: '0', chunkZ: '0', voxelX: 3, voxelY: 3, voxelZ: 3, voxelType: 9,
    voxelState: '', uuid: OTHER, sequenceNumber: 200, epochMillis: '1',
  });
  t.refuse(t.sent[3]);
  assert.equal(t.store.voxelTypeAt(at, 3, 3, 3), 9);
  assert.equal(t.refusals[3].restored, false);
  t.session.dispose();
});

test('an edit whose echo never comes is undone after editTimeoutMs; an echoed one is kept', async () => {
  const t = await setup({ server: fakeServer({ '0:0:0': {} }), config: { editTimeoutMs: 1_000 } });
  const at = { x: 0, y: 0, z: 0 };
  await t.store.ensureAround(at, 0);
  await t.store.setVoxel({ chunk: at, x: 1, y: 1, z: 1, voxelType: 5 });
  await t.store.setVoxel({ chunk: at, x: 2, y: 2, z: 2, voxelType: 6 });
  t.echo(t.sent[1]);
  t.ticker.advance(1_100);
  assert.equal(t.store.voxelTypeAt(at, 1, 1, 1), 0);
  assert.equal(t.store.voxelTypeAt(at, 2, 2, 2), 6);
  assert.deepEqual(t.refusals.map((r) => r.reason), ['TIMEOUT']);
  t.session.dispose();
});

test('an edit the transport does not take is undone at once', async () => {
  const t = await setup({ server: fakeServer({ '0:0:0': {} }), send: async () => false });
  const at = { x: 0, y: 0, z: 0 };
  await t.store.ensureAround(at, 0);
  assert.equal(await t.store.setVoxel({ chunk: at, x: 1, y: 1, z: 1, voxelType: 5 }), false);
  assert.equal(t.store.voxelTypeAt(at, 1, 1, 1), 0);
  assert.equal(t.refusals[0].reason, 'NOT_SENT');
  t.session.dispose();
});

test('sends are paced: at most maxEditsInFlight unanswered, maxEditsPerSecond a second', async () => {
  const t = await setup({
    server: fakeServer({ '0:0:0': {} }),
    config: { maxEditsInFlight: 2, maxEditsPerSecond: 1_000 },
  });
  const at = { x: 0, y: 0, z: 0 };
  await t.store.ensureAround(at, 0);
  const results = [];
  for (let i = 0; i < 4; i++) {
    void t.store.setVoxel({ chunk: at, x: i, y: 0, z: 0, voxelType: 1 }).then((ok) => results.push(ok));
  }
  await flush();
  assert.equal(t.sent.length, 2, 'two unanswered at once');
  assert.equal(t.store.queuedEdits, 2);
  assert.equal(t.store.voxelTypeAt(at, 3, 0, 0), 1, 'a queued edit already shows');
  t.echo(t.sent[0]);
  await flush();
  assert.equal(t.sent.length, 3);
  t.refuse(t.sent[1]);
  await flush();
  assert.equal(t.sent.length, 4);
  assert.equal(results.length, 4);
  assert.equal(new Set(t.sent.map((s) => s.sequenceNumber)).size, 4);
  t.session.dispose();

  // At 8 a second, two may go at once, then one each 125 ms.
  const p = await setup({ server: fakeServer({ '0:0:0': {} }), config: { maxEditsPerSecond: 8 } });
  await p.store.ensureAround(at, 0);
  for (let i = 0; i < 5; i++) void p.store.setVoxel({ chunk: at, x: i, y: 1, z: 0, voxelType: 1 });
  await flush();
  assert.equal(p.sent.length, 2);
  p.ticker.advance(150);
  assert.equal(p.sent.length, 3);
  p.ticker.advance(250);
  assert.equal(p.sent.length, 5);
  p.session.dispose();
});

test('chunkChanged reads the chunk again and replaces a queued write-back of a seed', async () => {
  const { CHUNK_VOLUME } = await loadStores();
  const server = fakeServer({ '0:0:0': {} });
  const t = await setup({
    server,
    config: { hydrateVoxelStates: true, onMissing: () => new Uint8Array(CHUNK_VOLUME) },
  });
  await t.store.ensureAround({ x: 0, y: 0, z: 0 }, 1);
  assert.equal(t.store.pendingWriteBacks, 26);
  const gets = server.gets();

  // A hub's world.set_chunk replaced 1:0:0 (seeded here) and 0:0:0 (loaded).
  const grid = new Uint8Array(CHUNK_VOLUME);
  grid[0] = 4;
  server.stored.set('1:0:0', { voxels: Buffer.from(grid).toString('base64'), updatedAt: '2026-11-11T20:00:00.000Z' });
  server.stored.set('0:0:0', {
    voxels: Buffer.from(grid).toString('base64'),
    voxelStates: [{ voxelCoord: { x: 1, y: 1, z: 1 }, voxelType: 7, state: null }],
    updatedAt: '2026-11-11T20:00:00.000Z',
  });
  const changed = (x) =>
    t.handlers().chunkChanged({
      appId: '42', chunkX: String(x), chunkY: '0', chunkZ: '0', distance: 8,
      updatedAtMs: String(Date.parse('2026-11-11T20:00:00.000Z')), sequenceNumber: 0,
    });
  changed(1);
  changed(0);
  await flush();
  await flush();
  assert.equal(server.gets(), gets + 2);
  assert.equal(t.store.pendingWriteBacks, 25, 'the replaced seed is not written back over it');
  assert.equal(t.store.voxelTypeAt({ x: 1, y: 0, z: 0 }, 0, 0, 0), 4);
  assert.equal(t.store.voxelTypeAt({ x: 0, y: 0, z: 0 }, 1, 1, 1), 7);

  // The same notice again is already applied; an untracked chunk is ignored.
  changed(0);
  changed(40);
  await flush();
  assert.equal(server.gets(), gets + 2);
  t.session.dispose();
});

test('after a reconnect it reads what changed since 30 s before the connection dropped', async () => {
  const { CHUNK_VOLUME } = await loadStores();
  const grid = Buffer.from(new Uint8Array(CHUNK_VOLUME)).toString('base64');
  const server = fakeServer({ '0:0:0': { voxels: grid }, '1:0:0': { voxels: grid } });
  const t = await setup({ server, config: { hydrateVoxelStates: true } });
  await t.store.ensureAround({ x: 0, y: 0, z: 0 }, 1);
  t.ticker.advance(60_000);
  t.setStatus('reconnecting');
  t.ticker.advance(5_000);

  // Meanwhile another player placed a block in 0:0:0 and a hub rewrote 1:0:0.
  server.edits.push({
    coordinates: { x: '0', y: '0', z: '0' },
    voxels: [{ location: { x: 4, y: 4, z: 4 }, voxelType: 3, state: null }],
  });
  const rewritten = new Uint8Array(CHUNK_VOLUME);
  rewritten[5] = 2;
  server.stored.set('1:0:0', { voxels: Buffer.from(rewritten).toString('base64'), updatedAt: new Date(62_000).toISOString() });
  const reads = server.reads.length;
  const gets = server.gets();
  t.setStatus('connected');
  for (let i = 0; i < 4; i++) await flush();
  const [chunkRead, editRead] = server.reads.slice(reads);
  assert.equal(chunkRead.since, new Date(60_000 - 30_000).toISOString());
  assert.equal(editRead.edits.since, new Date(60_000 - 30_000).toISOString());
  assert.equal(t.store.voxelTypeAt({ x: 0, y: 0, z: 0 }, 4, 4, 4), 3);
  assert.equal(server.gets(), gets + 1, 'the rewritten chunk is read again');
  assert.equal(t.store.voxelTypeAt({ x: 1, y: 0, z: 0 }, 5, 0, 0), 2);
  t.session.dispose();
});

test('hydration surfaces voxelStatesTruncated', async () => {
  const t = await setup({ server: fakeServer({ '0:0:0': { truncated: true } }), config: { hydrateVoxelStates: true } });
  await t.store.ensureAround({ x: 0, y: 0, z: 0 }, 0);
  assert.equal(t.store.get({ x: 0, y: 0, z: 0 }).voxelStatesTruncated, true);
  t.session.dispose();
});
