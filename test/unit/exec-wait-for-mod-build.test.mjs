/**
 * `exec.waitForModBuild` against a fake GraphQL client: a dropped status read (no answer, a
 * gateway's 5xx, `PLATFORM_BUSY`) is read again until the deadline, and a refusal is thrown at
 * once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CrowdyGraphQLError,
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyUserCodeFaultError,
  ExecAPI,
} from '../../dist/index.js';

function buildAnswer(status) {
  return { execModBuildStatus: { __typename: 'ExecBuild', buildId: 'b1', status, kind: 'exec', log: null, artifacts: [] } };
}

/** An ExecAPI whose status reads answer from `script` in turn: an error is thrown, a status returned. */
function scriptedExec(script) {
  const reads = [];
  const exec = new ExecAPI({
    request: async (_doc, vars) => {
      reads.push(vars.buildId);
      const next = script.length > 1 ? script.shift() : script[0];
      if (next instanceof Error) throw next;
      return buildAnswer(next);
    },
  });
  return { exec, reads };
}

const busy = () =>
  new CrowdyUserCodeFaultError([
    { message: 'the platform is busy; retry shortly', extensions: { code: 'PLATFORM_BUSY', blame: 'PLATFORM', retryable: true } },
  ]);

test('waitForModBuild reads a dropped status again and returns the settled build', async () => {
  const { exec, reads } = scriptedExec([
    new CrowdyNetworkError(new Error('socket hang up')),
    new CrowdyHttpError(504, 'Gateway Timeout'),
    busy(),
    'running',
    'succeeded',
  ]);
  const built = await exec.waitForModBuild('42', 'b1', { intervalMs: 1, timeoutMs: 5_000 });
  assert.equal(built.status, 'succeeded');
  assert.equal(reads.length, 5);
});

test('waitForModBuild throws a refusal at once', async () => {
  const refusal = new CrowdyGraphQLError([{ message: 'no build b1 of yours', extensions: { code: 'NOT_FOUND' } }]);
  const { exec, reads } = scriptedExec([refusal]);
  await assert.rejects(exec.waitForModBuild('42', 'b1', { intervalMs: 1 }), (error) => error === refusal);
  assert.equal(reads.length, 1);

  // A busy answer that does not blame the platform, or says it is not retryable, is a refusal.
  const notBusy = new CrowdyUserCodeFaultError([
    { message: 'too slow', extensions: { code: 'USER_CODE_TOO_SLOW', blame: 'AUTHOR', retryable: false } },
  ]);
  const second = scriptedExec([notBusy]);
  await assert.rejects(second.exec.waitForModBuild('42', 'b1', { intervalMs: 1 }), (error) => error === notBusy);
  assert.equal(second.reads.length, 1);
});

test('waitForModBuild throws the last dropped read once its deadline passes', async () => {
  const dropped = new CrowdyNetworkError(new Error('connect ECONNREFUSED'));
  const { exec, reads } = scriptedExec([dropped]);
  await assert.rejects(exec.waitForModBuild('42', 'b1', { intervalMs: 5, timeoutMs: 30 }), (error) => error === dropped);
  assert.ok(reads.length >= 2, `read ${reads.length} times`);
});
