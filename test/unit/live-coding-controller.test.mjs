/**
 * Live-coding controller (P3): the deploy-loop state machine. Drives the
 * server (deploy -> compile-poll -> enable) and client (deploy -> compile ->
 * fetch -> broker respawn) paths with fully injected IO — no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

function fakePlayerCompute(overrides = {}) {
  return {
    deploy: async () => ({ versionId: 'v-1', compileStatus: 'pending' }),
    versions: async () => [{ versionId: 'v-1', compileStatus: 'succeeded', compileLog: null }],
    setEnabled: async () => ({ enabled: true }),
    usage: async () => ({
      hourUnitsUsed: '5',
      unitsPerHour: '1000',
      compilesThisHour: 1,
      maxCompilesPerHour: 20,
      gateStatus: 'active',
      gateReason: null,
    }),
    runs: async () => [],
    logs: async () => [],
    artifactBytes: async () => ({
      bytes: new ArrayBuffer(8),
      artifactHash: 'h',
      fuelPerDispatch: 100000000n,
      contractJson: null,
      versionId: 'v-1',
    }),
    ...overrides,
  };
}

const GRID = { low: { x: 0n, y: 0n, z: 0n }, high: { x: 2n, y: 2n, z: 2n } };

function baseOptions(playerCompute, extra = {}) {
  return {
    playerCompute,
    appId: '42',
    gridId: '500',
    grid: GRID,
    workerUrl: 'glue.js',
    onHostCall: async () => ({ ok: true }),
    sleep: async () => {},
    ...extra,
  };
}

test('server deploy: deploy -> compile -> enable -> running, with usage meter', async () => {
  const { LiveCodingController } = await loadSdk();
  const statuses = [];
  const controller = new LiveCodingController(
    baseOptions(fakePlayerCompute(), { onStatus: (s) => statuses.push(s.phase) }),
  );
  await controller.deploy({ name: 'm', target: 'server', sourceFilesJson: '{}' });
  assert.equal(controller.getStatus().phase, 'running');
  assert.ok(statuses.includes('compiling'));
  assert.ok(statuses.includes('enabling'));
  assert.equal(controller.getStatus().usage.gateStatus, 'active');
});

test('compile failure surfaces the log and stops before enable', async () => {
  const { LiveCodingController } = await loadSdk();
  let enabled = false;
  const pc = fakePlayerCompute({
    versions: async () => [{ versionId: 'v-1', compileStatus: 'failed', compileLog: 'E0001 boom' }],
    setEnabled: async () => {
      enabled = true;
      return { enabled: true };
    },
  });
  const controller = new LiveCodingController(baseOptions(pc));
  await controller.deploy({ name: 'm', target: 'server', sourceFilesJson: '{}' });
  assert.equal(controller.getStatus().phase, 'compile_failed');
  assert.match(controller.getStatus().compileLog, /E0001/);
  assert.equal(enabled, false);
});

test('deploy refusal (compile quota) surfaces as error, not a crash', async () => {
  const { LiveCodingController } = await loadSdk();
  const pc = fakePlayerCompute({
    deploy: async () => {
      throw new Error('PLAYER_COMPILE_QUOTA_EXHAUSTED: retry after 120s');
    },
  });
  const controller = new LiveCodingController(baseOptions(pc));
  await controller.deploy({ name: 'm', target: 'server', sourceFilesJson: '{}' });
  assert.equal(controller.getStatus().phase, 'error');
  assert.match(controller.getStatus().message, /QUOTA_EXHAUSTED/);
});

test('client deploy: fetches bytes and starts a hash-verified broker', async () => {
  const { LiveCodingController } = await loadSdk();
  const started = [];
  const brokerFactory = (opts) => ({
    start: async (bytes) => started.push({ bytes, hash: opts.artifactHash, fuel: opts.fuelPerDispatch }),
    stop: () => {},
  });
  const controller = new LiveCodingController(
    baseOptions(fakePlayerCompute(), { brokerFactory }),
  );
  await controller.deploy({ name: 'm', target: 'client', sourceFilesJson: '{}' });
  assert.equal(controller.getStatus().phase, 'running');
  assert.equal(started.length, 1);
  assert.equal(started[0].hash, 'h');
  assert.equal(started[0].fuel, 100000000n);
});
