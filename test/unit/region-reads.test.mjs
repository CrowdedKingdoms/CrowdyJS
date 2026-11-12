import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Region reads (ck-api v2.67.0): a box instead of a cube on the two by-distance reads, `since` on
 * the chunk read, paging on `listVoxels`, and the caller's own keys on `nearbyGrids`. The
 * wrappers pass their input through, so the checks are that what goes on the wire is what the
 * caller asked for and that the new selections come back.
 */

const ENDPOINT = 'https://ck.example/graphql';

function stubFetch(payload) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: () => {} },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

async function makeClient() {
  const { createCrowdyClient } = await import('../../dist/index.js');
  return createCrowdyClient({ httpUrl: ENDPOINT, wsUrl: 'wss://ck.example/graphql' });
}

const low = { x: '10', y: '0', z: '-4' };
const high = { x: '10', y: '2', z: '4' };

test('chunks.byDistance sends a box and since, and returns the paging applied', async () => {
  const stub = stubFetch({
    data: { getChunksByDistance: { limit: 1000, skip: 0, chunks: [] } },
  });
  try {
    const client = await makeClient();
    const since = '2026-11-11T00:00:00.000Z';
    const page = await client.chunks.byDistance({
      appId: '7',
      lowChunk: low,
      highChunk: high,
      since,
    });
    assert.deepEqual(page, { limit: 1000, skip: 0, chunks: [] });
    const { query, variables } = stub.calls[0].body;
    assert.match(query, /getChunksByDistance\(input: \$input\)/);
    assert.deepEqual(variables.input, { appId: '7', lowChunk: low, highChunk: high, since });
  } finally {
    stub.restore();
  }
});

test('voxels.listByDistance sends a box', async () => {
  const stub = stubFetch({
    data: {
      listVoxelUpdatesByDistance: {
        chunks: [],
        centerCoordinate: { x: '10', y: '1', z: '0' },
        limit: 1000,
        skip: 0,
      },
    },
  });
  try {
    const client = await makeClient();
    const page = await client.voxels.listByDistance({ appId: '7', lowChunk: low, highChunk: high });
    assert.deepEqual(page.centerCoordinate, { x: '10', y: '1', z: '0' });
    assert.deepEqual(stub.calls[0].body.variables.input, {
      appId: '7',
      lowChunk: low,
      highChunk: high,
    });
  } finally {
    stub.restore();
  }
});

test('voxels.list pages with limit and skip', async () => {
  const stub = stubFetch({ data: { listVoxels: [] } });
  try {
    const client = await makeClient();
    await client.voxels.list({
      appId: '7',
      coordinates: { x: '1', y: '2', z: '3' },
      limit: 500,
      skip: 1000,
    });
    assert.deepEqual(stub.calls[0].body.variables.input, {
      appId: '7',
      coordinates: { x: '1', y: '2', z: '3' },
      limit: 500,
      skip: 1000,
    });
  } finally {
    stub.restore();
  }
});

test("gameApps.nearbyGrids selects and returns the caller's permissionKeys", async () => {
  const grid = {
    appId: '7',
    gridId: '42',
    lowChunk: low,
    highChunk: high,
    permissionKeys: ['update_voxel_data'],
  };
  const stub = stubFetch({ data: { nearbyGrids: [grid] } });
  try {
    const client = await makeClient();
    const grids = await client.gameApps.nearbyGrids({ appId: '7', lowChunk: low, highChunk: high });
    assert.deepEqual(grids, [grid]);
    assert.match(stub.calls[0].body.query, /permissionKeys/);
  } finally {
    stub.restore();
  }
});
