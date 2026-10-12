/**
 * Typed readers for the refusals ck-api v2.40 adds (ACTOR_EXISTS, ACCESS_REVOKED,
 * ACCESS_SUSPENDED, ACCESS_NOT_GRANTED, APP_PAUSED), the runtime gate helper, and the voxel edit
 * checks a send makes before anything leaves the client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const errors = await import('../../dist/errors.js');
const wire = await import('../../dist/binary-wire.js');
const { UdpAPI } = await import('../../dist/domains/udp.js');

const gqlError = (extensions, message = 'refused') =>
  new errors.CrowdyGraphQLError([{ message, extensions }]);

test('actorExistsOf reads ownedByCaller', () => {
  assert.deepEqual(errors.actorExistsOf(gqlError({ code: 'ACTOR_EXISTS', ownedByCaller: true })), {
    ownedByCaller: true,
  });
  assert.deepEqual(errors.actorExistsOf(gqlError({ code: 'ACTOR_EXISTS' })), { ownedByCaller: null });
  assert.equal(errors.actorExistsOf(gqlError({ code: 'FORBIDDEN' })), null);
  assert.equal(errors.actorExistsOf(new Error('x')), null);
  assert.equal(errors.actorExistsOf(null), null);
});

test('accessRefusalOf reads the three access codes and suspendedUntil', () => {
  assert.deepEqual(
    errors.accessRefusalOf(
      gqlError({ code: 'ACCESS_SUSPENDED', suspendedUntil: '2026-10-11T00:00:00.000Z' }),
    ),
    { code: 'ACCESS_SUSPENDED', suspendedUntil: '2026-10-11T00:00:00.000Z' },
  );
  assert.deepEqual(errors.accessRefusalOf(gqlError({ code: 'ACCESS_REVOKED' })), {
    code: 'ACCESS_REVOKED',
  });
  assert.deepEqual(errors.accessRefusalOf({ message: 'm', extensions: { code: 'ACCESS_NOT_GRANTED' } }), {
    code: 'ACCESS_NOT_GRANTED',
  });
  assert.equal(errors.accessRefusalOf(gqlError({ code: 'APP_PAUSED' })), null);
});

test('appPausedOf reads the reason, also from a later entry', () => {
  const error = new errors.CrowdyGraphQLError([
    { message: 'a', extensions: { code: 'BAD_USER_INPUT' } },
    { message: 'b', extensions: { code: 'APP_PAUSED', reason: 'spend_cap' } },
  ]);
  assert.deepEqual(errors.appPausedOf(error), { reason: 'spend_cap' });
  assert.deepEqual(errors.appPausedOf(gqlError({ code: 'APP_PAUSED' })), { reason: null });
  assert.equal(errors.appPausedOf(gqlError({ code: 'APP_UNAVAILABLE' })), null);
});

test('isAppPaused is any status but ACTIVE, and false without a gate', () => {
  assert.equal(errors.isAppPaused({ status: 'ACTIVE', reason: null }), false);
  for (const status of ['GRACE', 'DENIED', 'SUSPENDED']) {
    assert.equal(errors.isAppPaused({ status, reason: 'insufficient_funds' }), true);
  }
  assert.equal(errors.isAppPaused(null), false);
  assert.equal(errors.isAppPaused(undefined), false);
});

test('assertVoxelEdit allows any int16 position and type and caps the state at 1,024 bytes', () => {
  const ok = { voxel: { x: -32768, y: 32767, z: 16 }, voxelType: 300 };
  wire.assertVoxelEdit(ok);
  wire.assertVoxelEdit({ ...ok, voxelType: -5, voxelState: Buffer.alloc(1024).toString('base64') });
  assert.throws(() => wire.assertVoxelEdit({ ...ok, voxel: { x: 32768, y: 0, z: 0 } }), RangeError);
  assert.throws(() => wire.assertVoxelEdit({ ...ok, voxel: { x: 0, y: 1.5, z: 0 } }), RangeError);
  assert.throws(() => wire.assertVoxelEdit({ ...ok, voxelType: -32769 }), RangeError);
  assert.throws(
    () => wire.assertVoxelEdit({ ...ok, voxelState: Buffer.alloc(1025).toString('base64') }),
    /1025 bytes/,
  );
  assert.equal(wire.VOXEL_STATE_MAX_BYTES, 1024);
});

test('udp.sendVoxelUpdate refuses an edit that does not fit before anything is sent', async () => {
  let sent = 0;
  const gql = { request: async () => ((sent += 1), { sendVoxelUpdate: true }) };
  const udp = new UdpAPI(gql, { usingBinaryTransport: () => false });
  const base = { appId: '1', chunk: { x: '0', y: '0', z: '0' }, uuid: 'u'.repeat(32) };
  assert.equal(await udp.sendVoxelUpdate({ ...base, voxel: { x: 99, y: -7, z: 16 }, voxelType: 4000 }), true);
  await assert.rejects(
    udp.sendVoxelUpdate({ ...base, voxel: { x: 0, y: 0, z: 0 }, voxelType: 40000 }),
    RangeError,
  );
  await assert.rejects(
    udp.sendVoxelUpdate({
      ...base,
      voxel: { x: 0, y: 0, z: 0 },
      voxelType: 1,
      voxelState: Buffer.alloc(2000).toString('base64'),
    }),
    RangeError,
  );
  assert.equal(sent, 1);
});
