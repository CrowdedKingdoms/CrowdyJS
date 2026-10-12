/**
 * The server delivers every accepted voxel edit back to its sender (Buddy v0.37.0). ChunkStore
 * matches that echo to the edit it sent (sender uuid + sequence number + voxel): an edit applied
 * optimistically fires one change event, an older echo never rolls back a newer local edit, and
 * the echo is applied when another client's edit of the voxel arrived in between.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStores } from '../helpers.mjs';

const ME = 'm'.repeat(32);
const OTHER = 'o'.repeat(32);

async function setup() {
  const { createWorldSession, manualTicker, CHUNK_VOLUME } = await loadStores();
  let handlers = null;
  const sent = [];
  let clock = 1_000;
  const client = {
    udp: {
      subscribe(h) {
        handlers = h;
        return () => {};
      },
      sendVoxelUpdate: async (input) => (sent.push(input), true),
    },
    chunks: {
      async byDistance() {
        return {
          chunks: [
            {
              coordinates: { x: '0', y: '0', z: '0' },
              voxels: Buffer.alloc(CHUNK_VOLUME).toString('base64'),
              chunkState: null,
            },
          ],
        };
      },
      async get() {
        return null;
      },
      async update(input) {
        return input;
      },
    },
    state: {},
    avatars: {},
    host: {},
  };
  const session = createWorldSession(client, '42', {
    ticker: manualTicker(),
    chunks: { writeBackIntervalMs: false, actorUuid: ME, now: () => clock },
  });
  const store = session.chunks;
  const at = { x: 0, y: 0, z: 0 };
  await store.ensureAround(at, 0);
  let events = 0;
  store.onChunkChanged(() => (events += 1));
  const deliver = (fields) =>
    handlers.voxelUpdate({
      chunkX: '0', chunkY: '0', chunkZ: '0',
      voxelX: 1, voxelY: 2, voxelZ: 3,
      voxelState: '', epochMillis: '1',
      ...fields,
    });
  const echo = (edit) =>
    deliver({
      uuid: edit.uuid,
      sequenceNumber: edit.sequenceNumber,
      voxelX: edit.voxel.x,
      voxelY: edit.voxel.y,
      voxelZ: edit.voxel.z,
      voxelType: edit.voxelType,
    });
  return {
    store,
    at,
    sent,
    deliver,
    echo,
    events: () => events,
    advance: (ms) => (clock += ms),
  };
}

test('the echo of an optimistic edit is not applied again', async () => {
  const t = await setup();
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 7 });
  assert.equal(t.events(), 1);
  const revision = t.store.revision;
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 7);
  assert.equal(t.events(), 1);
  assert.equal(t.store.revision, revision);
  // A second copy of the same echo is a foreign-looking edit with the same values: applied once.
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 7);
});

test('an older echo never rolls back a newer local edit', async () => {
  const t = await setup();
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 7 });
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 8 });
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 8);
  t.echo(t.sent[1]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 8);
  assert.equal(t.events(), 2);
});

test('an echo after another client edited the voxel restores the local edit', async () => {
  const t = await setup();
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 7 });
  t.deliver({ uuid: OTHER, sequenceNumber: t.sent[0].sequenceNumber, voxelType: 5 });
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 5);
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 7);
  // Ours then theirs: the later foreign edit stands.
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 9 });
  t.echo(t.sent[1]);
  t.deliver({ uuid: OTHER, sequenceNumber: 77, voxelType: 4 });
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 4);
});

test('a non-optimistic edit is applied when its echo arrives', async () => {
  const t = await setup();
  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 6, optimistic: false });
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 0);
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 6);
  assert.equal(t.events(), 1);
});

test('wide edits echo idempotently too, and an unanswered edit is forgotten', async () => {
  const t = await setup();
  await t.store.setVoxel({ chunk: t.at, x: 300, y: -2, z: 16, voxelType: 1200 });
  t.echo(t.sent[0]);
  assert.equal(t.store.voxelTypeAt(t.at, 300, -2, 16), 1200);
  assert.equal(t.events(), 1);

  await t.store.setVoxel({ chunk: t.at, x: 1, y: 2, z: 3, voxelType: 7 });
  t.advance(60_000);
  // Long after the send, a matching uuid + sequence is treated like any other edit.
  t.echo({ ...t.sent[1], voxelType: 2 });
  assert.equal(t.store.voxelTypeAt(t.at, 1, 2, 3), 2);
});

test('setVoxel refuses an edit that does not fit before applying it', async () => {
  const t = await setup();
  await assert.rejects(
    t.store.setVoxel({ chunk: t.at, x: 40000, y: 0, z: 0, voxelType: 1 }),
    RangeError,
  );
  assert.equal(t.events(), 0);
  assert.equal(t.sent.length, 0);
});
