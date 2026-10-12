/**
 * ChunkStore is a helper for 16×16×16 chunks with one byte per voxel, and voxel positions and
 * types are the app's signed 16-bit values. An edit the dense grid cannot hold (a type outside
 * 0-255, a position outside 0-15) is kept in the chunk's overlay instead of being truncated into
 * the grid, and reads of that voxel return it; nothing is ever written at an out-of-range position.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from '../helpers.mjs';

function harness(stored, chunkConfig = {}) {
  let handlers = null;
  const sent = [];
  const client = {
    udp: {
      subscribe(h) {
        handlers = h;
        return () => {};
      },
      sendVoxelUpdate: async (input) => {
        sent.push(input);
        return true;
      },
    },
    chunks: {
      async byDistance() {
        return {
          chunks: Object.entries(stored).map(([key, entry]) => {
            const [x, y, z] = key.split(':');
            return { coordinates: { x, y, z }, voxels: entry.voxels ?? null, chunkState: null };
          }),
        };
      },
      async get({ coordinates }) {
        const entry = stored[`${coordinates.x}:${coordinates.y}:${coordinates.z}`];
        return entry
          ? { coordinates, voxels: entry.voxels ?? null, chunkState: null, voxelStates: entry.voxelStates ?? [] }
          : null;
      },
      async update(input) {
        return input;
      },
    },
    state: {},
    avatars: {},
    host: {},
  };
  return {
    client,
    sent,
    merge: (fields) =>
      handlers.voxelUpdate({
        chunkX: '0', chunkY: '0', chunkZ: '0',
        uuid: 'w'.repeat(32), sequenceNumber: 1, epochMillis: '2', voxelState: '',
        ...fields,
      }),
    config: { hydrateVoxelStates: true, writeBackIntervalMs: false, ...chunkConfig },
  };
}

test('a realtime edit with a wide type or another address goes to the overlay, never the grid', async () => {
  const { createWorldSession, manualTicker, jsonCodec, CHUNK_VOLUME, voxelIndex, voxelKey } =
    await loadStores();
  const grid = new Uint8Array(CHUNK_VOLUME);
  grid[voxelIndex(1, 2, 3)] = 9;
  grid[voxelIndex(0, 1, 0)] = 6; // where (16, 0, 0) would land unchecked
  const codec = jsonCodec();
  const h = harness({ '0:0:0': { voxels: Buffer.from(grid).toString('base64') } });
  const session = createWorldSession(h.client, '42', {
    ticker: manualTicker(),
    chunks: { ...h.config, voxelStateCodec: codec },
  });
  const store = session.chunks;
  const at = { x: 0, y: 0, z: 0 };
  await store.ensureAround(at, 1);

  // Type 300 at (1,2,3): the overlay keeps it whole, the grid holds 0 there.
  h.merge({ voxelX: 1, voxelY: 2, voxelZ: 3, voxelType: 300, voxelState: codec.encode({ id: 'minecraft:oak_log' }) });
  assert.equal(store.voxelTypeAt(at, 1, 2, 3), 300);
  assert.deepEqual(store.voxelStateAt(at, 1, 2, 3), { id: 'minecraft:oak_log' });
  const chunk = store.get(at);
  assert.equal(chunk.voxels[voxelIndex(1, 2, 3)], 0, 'not truncated to 300 & 0xff');
  assert.equal(chunk.voxelStates.has(voxelIndex(1, 2, 3)), false);
  assert.deepEqual(chunk.overlay.get(voxelKey(1, 2, 3)), {
    x: 1, y: 2, z: 3, voxelType: 300, state: { id: 'minecraft:oak_log' },
  });

  // Negative types and positions outside 0-15 too; nothing aliases into the grid.
  h.merge({ voxelX: 16, voxelY: 0, voxelZ: 0, voxelType: 5 });
  h.merge({ voxelX: 0, voxelY: -1, voxelZ: 0, voxelType: 4 });
  h.merge({ voxelX: 2, voxelY: 2, voxelZ: 2, voxelType: -1 });
  assert.equal(store.voxelTypeAt(at, 16, 0, 0), 5);
  assert.equal(store.voxelTypeAt(at, 0, -1, 0), 4);
  assert.equal(store.voxelTypeAt(at, 2, 2, 2), -1);
  assert.equal(store.voxelTypeAt(at, 0, 1, 0), 6, '(16,0,0) did not land on (0,1,0)');
  assert.equal(store.voxelTypeAt(at, 17, 0, 0), 0, 'an address with no edit reads 0');
  const unchanged = new Uint8Array(grid);
  unchanged[voxelIndex(1, 2, 3)] = 0;
  unchanged[voxelIndex(2, 2, 2)] = 0;
  assert.deepEqual([...chunk.voxels], [...unchanged]);
  assert.equal(chunk.overlay.size, 4);

  // A later edit the grid can hold takes the voxel back out of the overlay.
  h.merge({ voxelX: 1, voxelY: 2, voxelZ: 3, voxelType: 7 });
  assert.equal(store.voxelTypeAt(at, 1, 2, 3), 7);
  assert.equal(chunk.voxels[voxelIndex(1, 2, 3)], 7);
  assert.equal(chunk.overlay.has(voxelKey(1, 2, 3)), false);
  session.dispose();
});

test('hydrated voxelStates entries with wide types or other addresses go to the overlay', async () => {
  const { createWorldSession, manualTicker, jsonCodec, CHUNK_VOLUME, voxelIndex } = await loadStores();
  const codec = jsonCodec();
  const grid = new Uint8Array(CHUNK_VOLUME).fill(9);
  const h = harness({
    '0:0:0': {
      voxels: Buffer.from(grid).toString('base64'),
      voxelStates: [
        { voxelCoord: { x: 1, y: 2, z: 3 }, voxelType: 7, state: codec.encode({ ok: true }) },
        { voxelCoord: { x: 4, y: 5, z: 6 }, voxelType: 1024, state: codec.encode({ wide: 1 }) },
        { voxelCoord: { x: 16, y: 0, z: 0 }, voxelType: 5, state: codec.encode({ far: 1 }) },
        { voxelCoord: { x: 0, y: -1, z: 0 }, voxelType: 5, state: null },
      ],
    },
  });
  const session = createWorldSession(h.client, '42', {
    ticker: manualTicker(),
    chunks: { ...h.config, voxelStateCodec: codec },
  });
  const store = session.chunks;
  const at = { x: 0, y: 0, z: 0 };
  await store.ensureAround(at, 1);

  assert.equal(store.voxelTypeAt(at, 1, 2, 3), 7);
  assert.deepEqual(store.voxelStateAt(at, 1, 2, 3), { ok: true });
  assert.equal(store.voxelTypeAt(at, 4, 5, 6), 1024);
  assert.deepEqual(store.voxelStateAt(at, 4, 5, 6), { wide: 1 });
  assert.equal(store.voxelTypeAt(at, 16, 0, 0), 5);
  assert.deepEqual(store.voxelStateAt(at, 16, 0, 0), { far: 1 });
  assert.equal(store.voxelTypeAt(at, 0, -1, 0), 5);
  assert.equal(store.voxelStateAt(at, 0, -1, 0), undefined);
  const chunk = store.get(at);
  assert.equal(chunk.voxels[voxelIndex(0, 1, 0)], 9, 'the grid under (16,0,0) is untouched');
  assert.equal(chunk.voxels[voxelIndex(4, 5, 6)], 0);
  assert.equal(chunk.voxelStates.size, 1);
  assert.equal(chunk.overlay.size, 3);
  for (let i = 0; i < CHUNK_VOLUME; i += 1) {
    if (i === voxelIndex(1, 2, 3) || i === voxelIndex(4, 5, 6)) continue;
    assert.equal(chunk.voxels[i], 9);
  }
  session.dispose();
});

test('setVoxel keeps a wide type locally and sends it whole', async () => {
  const { createWorldSession, manualTicker, CHUNK_VOLUME } = await loadStores();
  const h = harness({ '0:0:0': { voxels: Buffer.from(new Uint8Array(CHUNK_VOLUME)).toString('base64') } });
  const session = createWorldSession(h.client, '42', { ticker: manualTicker(), chunks: h.config });
  const store = session.chunks;
  const at = { x: 0, y: 0, z: 0 };
  await store.ensureAround(at, 1);
  await store.setVoxel({ chunk: at, x: 3, y: 3, z: 3, voxelType: 2000 });
  assert.equal(store.voxelTypeAt(at, 3, 3, 3), 2000);
  assert.equal(h.sent.at(-1).voxelType, 2000);
  await store.setVoxel({ chunk: at, x: 3, y: 3, z: 3, voxelType: 12 });
  assert.equal(store.voxelTypeAt(at, 3, 3, 3), 12);
  assert.equal(store.get(at).overlay.size, 0);
  session.dispose();
});
