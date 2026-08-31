/**
 * bindGameContextShipper posts the live chunk snapshot to the sidecar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { bindGameContextShipper, GAME_CONTEXT_HEARTBEAT_MS } = await import(
  '../../dist/crowdy-studio/game-context.js'
);

test('game-context heartbeat stays on so Studio can refresh the Harness bind token', () => {
  assert.ok(
    GAME_CONTEXT_HEARTBEAT_MS > 0 && GAME_CONTEXT_HEARTBEAT_MS <= 60_000,
    `heartbeat must stay in (0, 60s], got ${GAME_CONTEXT_HEARTBEAT_MS}`,
  );
});

test('bindGameContextShipper posts a snapshot and skips unchanged repeats', async () => {
  const posted = [];
  const transport = {
    async updateGameContext(input) {
      posted.push(input);
    },
  };
  let chunk = { x: -3, y: 0, z: 7 };
  const shipper = bindGameContextShipper(
    () => 'proj-1',
    transport,
    () => ({
      currentChunk: chunk,
      gridId: 'grid-1',
      blockCatalog: [{ id: 1, name: 'Stone' }],
    }),
    10_000,
  );
  try {
    shipper.publish();
    await Promise.resolve();
    assert.equal(posted.length, 1);
    assert.equal(posted[0].projectId, 'proj-1');
    assert.deepEqual(posted[0].currentChunk, { x: -3, y: 0, z: 7 });

    chunk = { x: 4, y: 0, z: 1 };
    shipper.publish();
    await Promise.resolve();
    assert.equal(posted.length, 2);
    assert.deepEqual(posted[1].currentChunk, { x: 4, y: 0, z: 1 });
  } finally {
    shipper.dispose();
  }
});

test('bindGameContextShipper heartbeats an unchanged snapshot so the bind token can refresh', async () => {
  const posted = [];
  const transport = {
    async updateGameContext(input) {
      posted.push(input);
    },
  };
  const shipper = bindGameContextShipper(
    () => 'proj-1',
    transport,
    () => ({ currentChunk: { x: -3, y: 0, z: 8 } }),
    15,
    20,
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(posted.length >= 2, `expected heartbeat posts, got ${posted.length}`);
    assert.deepEqual(posted[0].currentChunk, { x: -3, y: 0, z: 8 });
  } finally {
    shipper.dispose();
  }
});

test('bindGameContextShipper is a no-op without a project or transport', async () => {
  const posted = [];
  const shipper = bindGameContextShipper(
    () => '',
    {
      async updateGameContext(input) {
        posted.push(input);
      },
    },
    () => ({ currentChunk: { x: 0, y: 0, z: 0 } }),
    10_000,
  );
  try {
    shipper.publish();
    await Promise.resolve();
    assert.equal(posted.length, 0);
  } finally {
    shipper.dispose();
  }
});
