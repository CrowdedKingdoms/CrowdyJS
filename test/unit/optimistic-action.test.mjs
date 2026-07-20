import test from 'node:test';
import assert from 'node:assert/strict';
import { runOptimisticAction } from '../../dist/kit/actions.js';

test('accepts and keeps the optimistic state on referee success', async () => {
  let state = 'before';
  const outcome = await runOptimisticAction({
    apply: () => {
      state = 'optimistic';
      return () => {
        state = 'before';
      };
    },
    invoke: async ({ actionId }) => {
      assert.ok(actionId.length > 8);
      return { success: true, itemId: 'wood' };
    },
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.itemId, 'wood');
  assert.equal(state, 'optimistic');
});

test('rolls back on referee denial with the denial message', async () => {
  let state = 'before';
  const outcome = await runOptimisticAction({
    apply: () => {
      state = 'optimistic';
      return () => {
        state = 'before';
      };
    },
    invoke: async () => ({ success: false, reason: 'out of range' }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.errorMessage, 'out of range');
  assert.equal(state, 'before');
});

test('rolls back on transport errors without throwing', async () => {
  let rolledBack = false;
  const outcome = await runOptimisticAction({
    apply: () => undefined,
    rollback: () => {
      rolledBack = true;
    },
    invoke: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.errorMessage, 'network down');
  assert.equal(rolledBack, true);
});

test('custom validate + confirm hooks run in order', async () => {
  const calls = [];
  const outcome = await runOptimisticAction({
    apply: () => calls.push('apply'),
    invoke: async () => ({ verdict: 'allow' }),
    validate: (r) => r.verdict === 'allow',
    confirm: async () => calls.push('confirm'),
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, ['apply', 'confirm']);
});

test('honors a caller-supplied actionId for deliberate retries', async () => {
  const seen = [];
  await runOptimisticAction({
    apply: () => undefined,
    actionId: 'retry-1',
    invoke: async ({ actionId }) => {
      seen.push(actionId);
      return {};
    },
  });
  assert.deepEqual(seen, ['retry-1']);
});
