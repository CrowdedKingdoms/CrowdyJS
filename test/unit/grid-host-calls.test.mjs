/**
 * `createGridHostCalls`, the page's answer to a CLIENT half's host calls. `avatar_state_get` and
 * `grid_permission_check` are in the allowlist and crowdy-client-sdk wraps them, so they are
 * answered as the host catalog scopes them: an avatar whose live actor the game places inside
 * the grid (a public read), and the visiting player's own permission on this grid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

const BOX = { low: { x: 0n, y: 0n, z: 0n }, high: { x: 3n, y: 1n, z: 3n } };

async function hostCalls({ local, userId, avatars = true } = {}) {
  const { GridScope, createGridHostCalls } = await loadSdk();
  const reads = [];
  const scope = new GridScope({ grids: {}, channels: {}, udp: {} }, '42', '500', BOX);
  const client = {
    chunks: {},
    voxels: {},
    state: {},
    ...(avatars
      ? {
          avatars: {
            async appState(appId, avatarId) {
              reads.push([appId, avatarId]);
              return { appId, avatarId, state: 'c3RhdGU=', createdAt: 't0', updatedAt: 't1' };
            },
          },
        }
      : {}),
  };
  const call = createGridHostCalls({ scope, client, local, ...(userId ? { userId } : {}) });
  return { call, reads };
}

test('avatar_state_get reads the app state of an avatar whose live actor the game places inside the grid', async () => {
  const { GridHostCallRefused } = await loadSdk();
  const where = { 7: { x: 1n, y: 0n, z: 2n }, 8: { x: 9n, y: 0n, z: 0n } };
  const { call, reads } = await hostCalls({ local: { avatarChunk: async (id) => where[id] ?? null } });

  assert.deepEqual(await call({ fn: 'avatar_state_get', args: { avatarId: '7' } }), {
    appId: '42',
    avatarId: '7',
    state: 'c3RhdGU=',
    createdAt: 't0',
    updatedAt: 't1',
  });
  assert.deepEqual(reads, [['42', '7']]);

  for (const [args, reason] of [
    [{ avatarId: '8' }, /no live actor in this grid/],
    [{ avatarId: '9' }, /no live actor in this grid/],
    [{ avatarId: '0' }, /needs an avatar id/],
    [{ avatarId: '7 OR 1' }, /needs an avatar id/],
    [{}, /needs an avatar id/],
  ]) {
    await assert.rejects(
      call({ fn: 'avatar_state_get', args }),
      (e) => e instanceof GridHostCallRefused && reason.test(e.message),
      JSON.stringify(args),
    );
  }
  assert.equal(reads.length, 1, 'nothing outside the grid was read');
});

test('avatar_state_get is refused where the game cannot place avatars', async () => {
  const { GridHostCallRefused } = await loadSdk();
  for (const setup of [{}, { local: { avatarChunk: () => ({ x: 1, y: 0, z: 1 }) }, avatars: false }]) {
    const { call } = await hostCalls(setup);
    await assert.rejects(
      call({ fn: 'avatar_state_get', args: { avatarId: '7' } }),
      (e) => e instanceof GridHostCallRefused && /not offered in the browser/.test(e.message),
    );
  }
});

test('grid_permission_check answers for the visiting player on this grid, from the code keys the game knows', async () => {
  const { GridHostCallRefused, GRID_PERMISSION_CHECK_KEYS } = await loadSdk();
  assert.deepEqual(GRID_PERMISSION_CHECK_KEYS, [
    'write_server_code',
    'run_server_code',
    'write_client_code',
    'run_client_code',
  ]);
  const { call } = await hostCalls({
    userId: '31',
    local: { gridPermissionKeys: async () => ['run_client_code', 'update_voxel_data'] },
  });
  const ask = (args) => call({ fn: 'grid_permission_check', args });

  assert.equal(await ask({ userId: '31', gridId: '500', permissionKey: 'run_client_code' }), true);
  assert.equal(await ask({ userId: '31', gridId: '500', permissionKey: 'run_server_code' }), false);
  for (const [args, reason] of [
    [{ userId: '32', gridId: '500', permissionKey: 'run_client_code' }, /asks about another player/],
    [{ gridId: '500', permissionKey: 'run_client_code' }, /asks about another player/],
    [{ userId: '31', gridId: '501', permissionKey: 'run_client_code' }, /names another grid/],
    [{ userId: '31', permissionKey: 'run_client_code' }, /names another grid/],
    [{ userId: '31', gridId: '500', permissionKey: 'Access; drop' }, /needs a permission key/],
    [{ userId: '31', gridId: '500' }, /needs a permission key/],
    // A key the page does not know is refused, not answered false (OI-2026-09-28-004), even
    // when the game happens to list it.
    [{ userId: '31', gridId: '500', permissionKey: 'update_voxel_data' }, /knows only the player's code-permission keys/],
    [{ userId: '31', gridId: '500', permissionKey: 'access' }, /knows only the player's code-permission keys/],
  ]) {
    await assert.rejects(
      ask(args),
      (e) => e instanceof GridHostCallRefused && reason.test(e.message),
      JSON.stringify(args),
    );
  }
});

test('grid_permission_check is refused without the game\u2019s permissions or the visiting player', async () => {
  const { GridHostCallRefused } = await loadSdk();
  for (const setup of [
    { userId: '31' },
    { local: { gridPermissionKeys: () => ['access'] } },
    { userId: 'not-an-id', local: { gridPermissionKeys: () => ['access'] } },
  ]) {
    const { call } = await hostCalls(setup);
    await assert.rejects(
      call({ fn: 'grid_permission_check', args: { userId: '31', gridId: '500', permissionKey: 'run_client_code' } }),
      (e) => e instanceof GridHostCallRefused && /not offered in the browser/.test(e.message),
      JSON.stringify(setup),
    );
  }
});

test('voxel_set writes only a voxel inside its chunk, of a type 0-255', async () => {
  const { GridScope, createGridHostCalls, GridHostCallRefused } = await loadSdk();
  const scope = new GridScope({ grids: {}, channels: {}, udp: {} }, '42', '500', BOX);
  const local = [];
  const server = [];
  const make = (withLocal) =>
    createGridHostCalls({
      scope,
      client: { chunks: {}, state: {}, voxels: { update: async (input) => (server.push(input), true) } },
      ...(withLocal ? { local: { setVoxel: async (input) => (local.push(input), true) } } : {}),
    });
  const voxel = (over) => ({
    fn: 'voxel_set',
    args: { chunkX: 1, chunkY: 0, chunkZ: 2, voxelX: 3, voxelY: 4, voxelZ: 5, voxelType: 7, ...over },
  });
  for (const withLocal of [true, false]) {
    const call = make(withLocal);
    assert.deepEqual(await call(voxel({})), { ok: true });
    for (const over of [
      { voxelX: 16 },
      { voxelY: -1 },
      { voxelZ: 1e9 },
      { voxelX: 1.5 },
      { voxelX: 'NaN' },
      { voxelType: 256 },
      { voxelType: -3 },
      { voxelType: 2.5 },
    ]) {
      await assert.rejects(
        call(voxel(over)),
        (e) => e instanceof GridHostCallRefused && /inside its chunk/.test(e.message),
        JSON.stringify(over),
      );
    }
  }
  assert.equal(local.length, 1, 'the game wrote only the valid voxel');
  assert.equal(server.length, 1, 'the API was asked only for the valid voxel');
  assert.deepEqual(local[0], {
    chunk: { x: 1, y: 0, z: 2 },
    x: 3,
    y: 4,
    z: 5,
    voxelType: 7,
    state: undefined,
  });
  assert.deepEqual(server[0].location, { x: 3, y: 4, z: 5 });
});

test('voxel_set takes the bounds the game sets, and refuses bounds the wire cannot carry', async () => {
  const { GridScope, createGridHostCalls, GridHostCallRefused, DEFAULT_GRID_VOXEL_BOUNDS } = await loadSdk();
  assert.deepEqual(DEFAULT_GRID_VOXEL_BOUNDS, { position: { min: 0, max: 15 }, type: { min: 0, max: 255 } });
  const scope = new GridScope({ grids: {}, channels: {}, udp: {} }, '42', '500', BOX);
  const local = [];
  const make = (voxelBounds) =>
    createGridHostCalls({
      scope,
      client: { chunks: {}, state: {}, voxels: {} },
      local: { setVoxel: async (input) => (local.push(input), true) },
      voxelBounds,
    });
  const voxel = (over) => ({
    fn: 'voxel_set',
    args: { chunkX: 1, chunkY: 0, chunkZ: 2, voxelX: 3, voxelY: 4, voxelZ: 5, voxelType: 7, ...over },
  });

  const wide = make({ position: { min: -64, max: 79 }, type: { min: -1, max: 4095 } });
  for (const over of [{ voxelX: 16 }, { voxelY: -1 }, { voxelZ: -64 }, { voxelX: 79 }, { voxelType: 300 }, { voxelType: -1 }]) {
    assert.deepEqual(await wide(voxel(over)), { ok: true }, JSON.stringify(over));
  }
  assert.deepEqual(local.slice(-2).map((v) => v.voxelType), [300, -1]);
  for (const over of [{ voxelX: 80 }, { voxelY: -65 }, { voxelType: 4096 }, { voxelType: -2 }]) {
    await assert.rejects(
      wide(voxel(over)),
      (e) =>
        e instanceof GridHostCallRefused &&
        e.message.includes('inside its chunk (-64 to 79) and a voxel type -1 to 4095'),
      JSON.stringify(over),
    );
  }

  // Bounds for types only keep the default positions.
  const types = make({ type: { min: 0, max: 1023 } });
  assert.deepEqual(await types(voxel({ voxelType: 1023 })), { ok: true });
  await assert.rejects(types(voxel({ voxelX: 16 })), /inside its chunk \(0-15\) and a voxel type 0-1023/);

  for (const voxelBounds of [
    { position: { min: 5, max: 4 } },
    { position: { min: 0, max: 1.5 } },
    { type: { min: -32769, max: 0 } },
    { type: { min: 0, max: 32768 } },
  ]) {
    assert.throws(() => make(voxelBounds), RangeError, JSON.stringify(voxelBounds));
  }
});

test('spatial and channel sends go out under a uuid derived for the grid, never one the mod names', async () => {
  const { GridScope, createGridHostCalls, clientHalfActorUuid } = await loadSdk();
  const sent = [];
  const udp = {
    sendActorUpdate: async (input) => (sent.push(['actor', input]), true),
    sendTextPacket: async (input) => (sent.push(['text', input]), true),
    sendClientEvent: async (input) => (sent.push(['event', input]), true),
    sendChannelMessage: async (input) => (sent.push(['channel', input]), true),
  };
  const grids = { channels: async () => [{ groupId: '77' }] };
  const scope = new GridScope({ grids, channels: {}, udp }, '42', '500', BOX);
  const victim = 'a'.repeat(32);
  const victimHex = Buffer.from(victim, 'ascii').toString('hex');
  const call = createGridHostCalls({ scope, client: { chunks: {}, voxels: {}, state: {} } });

  const spatial = { chunkX: 1, chunkY: 0, chunkZ: 1, uuidHex: victimHex, payloadBase64: 'aGk=', distance: 2 };
  await call({ fn: 'emit_spatial', args: { kind: 'actor', ...spatial } });
  await call({ fn: 'emit_spatial', args: { kind: 'text', ...spatial } });
  await call({ fn: 'emit_spatial', args: { kind: 'client_event', ...spatial, payloadBase64: 'AQAB' } });
  await call({ fn: 'emit_channel', args: { channelId: '77', payloadBase64: 'aGk=' } });

  const own = await clientHalfActorUuid('500', victim);
  const unnamed = await clientHalfActorUuid('500', '');
  assert.match(own, /^[0-9a-f]{32}$/);
  assert.notEqual(own, victim, 'the mod cannot send as the uuid it names');
  assert.notEqual(await clientHalfActorUuid('501', victim), own, 'the uuid is per grid');
  const uuids = sent.map(([, input]) => JSON.stringify(input));
  assert.equal(sent.length, 4);
  for (const text of uuids.slice(0, 3)) {
    assert.ok(text.includes(own), text);
    assert.ok(!text.includes(victim), text);
  }
  assert.ok(uuids[3].includes(unnamed), uuids[3]);
});

test('every call in the CLIENT allowlist has an answer here or in the broker; the legacy ones are refused', async () => {
  const { EXEC_CLIENT_HOST_CALLS, GridHostCallRefused } = await loadSdk();
  const brokerAnswered = new Set(['grid_info', 'emit_event', 'hud_set', 'overlay_draw']);
  const source = (await import('node:fs')).readFileSync(
    new URL('../../src/grid-mods/grid-host-calls.ts', import.meta.url),
    'utf8',
  );
  for (const fn of Object.values(EXEC_CLIENT_HOST_CALLS).flatMap((set) => [...set])) {
    if (brokerAnswered.has(fn)) continue;
    assert.match(source, new RegExp(`case '${fn}':`), `${fn} has a case in createGridHostCalls`);
  }
  const { call } = await hostCalls();
  for (const fn of ['container_get', 'model_invoke', 'sessions_list', 'grid_state_get']) {
    await assert.rejects(call({ fn, args: {} }), (e) => e instanceof GridHostCallRefused, fn);
  }
});
