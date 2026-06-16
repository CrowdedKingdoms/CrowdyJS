/**
 * Gamer user-story e2e: the full client journey through the game-api surface via
 * the SDK — bootstrap, avatars + per-app avatar state, host heartbeat, persisted
 * user state, persisted actors (incl. idempotent delete), teleport authorization,
 * and the dual-success spatial model (a send mutation returns `true` for
 * acceptance while a GenericErrorResponse arrives asynchronously on the
 * subscription).
 *
 * Full-stack: needs management-api + game-api + realtime + a Buddy. Auto-skips
 * without the full e2e env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSdk,
  clientConfig,
  skipReasonFor,
  FULL_E2E_ENV,
  sleep,
  randomActorUuid,
  numEnv,
} from '../helpers.mjs';
import { provisionClients } from '../provision.mjs';

const skip = skipReasonFor(FULL_E2E_ENV);
const NOTIFY_WAIT_MS = numEnv('CROWDY_TEST_NOTIFY_WAIT_MS', 3000);

test('gamer: avatars, host, state, actors, idempotency', { skip, timeout: 90_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const { appId, clients, players } = await provisionClients(createCrowdyClient, clientConfig(), 1);
  const client = clients[0];
  try {
    // Bootstrap.
    const boot = await client.serverStatus.gameClientBootstrap(appId);
    assert.ok(boot?.me, 'bootstrap returns the authenticated user');

    // Avatars + per-app avatar state.
    const avatar = await client.avatars.create({ name: `e2e-${Date.now()}` });
    assert.ok(avatar?.avatarId, 'createAvatar returns an avatar id');
    const mine = await client.avatars.mine();
    assert.ok(mine.some((a) => a.avatarId === avatar.avatarId), 'avatar appears in myAvatars');
    await client.avatars.updateState(avatar.avatarId, { publicState: 'AA==' });
    await client.avatars.updateAppState({ appId, avatarId: avatar.avatarId, state: 'AA==' });
    const appState = await client.avatars.appState(appId, avatar.avatarId);
    assert.ok(appState != null, 'avatarAppState round-trips');

    // Host heartbeat (host may be null until an actor is connected via Buddy).
    const host = await client.host.heartbeat(appId);
    assert.ok(host === null || typeof host.hostUserId === 'string', 'actorHeartbeat returns a host or null');

    // Persisted user app state.
    await client.state.update({ appId, state: 'AA==' });
    const st = await client.state.getOne(appId);
    assert.ok(st != null, 'userAppState round-trips');
    await client.state.delete(appId);

    // Persisted actors + idempotent delete contract.
    const uuid1 = randomActorUuid();
    await client.actors.create({ appId, uuid: uuid1 });
    const got = await client.actors.get(uuid1);
    assert.equal(got.uuid, uuid1, 'createActor + actor round-trip');

    const key = `e2e-del-${randomActorUuid()}`;
    const del1 = await client.actors.delete(uuid1, key);
    assert.ok(del1, 'first idempotent delete succeeds');
    const del2 = await client.actors.delete(uuid1, key); // replay -> same result, no error
    assert.ok(del2, 'replaying the same idempotency key returns the first result');

    const uuid2 = randomActorUuid();
    await client.actors.create({ appId, uuid: uuid2 });
    await assert.rejects(
      () => client.actors.delete(uuid2, key), // same key, different args -> conflict
      (err) => (err?.extensions?.code ?? '') === 'IDEMPOTENCY_CONFLICT',
      'reusing a key with different args throws IDEMPOTENCY_CONFLICT',
    );
    await client.actors.delete(uuid2); // cleanup (no key)

    // Teleport authorization check (returns a structured result, never throws on
    // an authz failure).
    const tp = await client.teleport.request({
      appId,
      uuid: uuid1,
      chunkAddress: { x: '0', y: '0', z: '0' },
      voxelAddress: { x: 0, y: 0, z: 0 },
    });
    assert.ok('success' in tp && 'errorCode' in tp, 'teleportRequest returns success + errorCode');
  } finally {
    client.close();
  }
});

test('gamer: dual-success spatial model (accept -> async NAK)', { skip, timeout: 90_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const { appId, clients } = await provisionClients(createCrowdyClient, clientConfig(), 1);
  const client = clients[0];
  const cleanup = [];
  try {
    const received = { genericErrors: [], voxelUpdates: [] };
    cleanup.push(
      client.udp.subscribe(
        {
          voxelUpdate: (n) => received.voxelUpdates.push(n),
          genericError: (e) => received.genericErrors.push(e),
        },
        appId,
      ),
    );
    await sleep(2000); // let the WS connect + subscribe

    // Send a voxel update addressed to a chunk far outside any granted grid.
    // The mutation returns true (the datagram was ACCEPTED for sending), but the
    // world rejects it asynchronously with a GenericErrorResponse — the
    // dual-success model.
    const accepted = await client.udp.sendVoxelUpdate({
      appId,
      chunk: { x: '5000000', y: '5000000', z: '5000000' },
      uuid: randomActorUuid(),
      voxel: { x: 0, y: 0, z: 0 },
      voxelType: 1,
      voxelState: 'AA==',
      sequenceNumber: 7,
    });
    assert.equal(accepted, true, 'send mutation returns true (accepted for sending)');

    await sleep(NOTIFY_WAIT_MS);
    assert.ok(
      received.genericErrors.length > 0,
      `an out-of-grid send should surface an async GenericErrorResponse (dual-success). diagnostics=${JSON.stringify(received)}`,
    );
  } finally {
    for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
    try { await client.udp.disconnect(); } catch { /* swallow */ }
    client.close();
  }
});
