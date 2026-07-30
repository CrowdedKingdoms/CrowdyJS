/**
 * Offline unit tests for the game-model timer surface and the automation
 * trigger fields added alongside it. A stub transport captures the operation
 * name and variables, so these assert the wire contract without a server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

/**
 * Records every GraphQL request and replies with a canned payload. Restores the
 * real fetch when the test ends so the stub cannot leak into another test.
 */
async function clientWith(payload, t) {
  const { createCrowdyClient } = await loadSdk();
  const calls = [];
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: payload }),
      text: async () => JSON.stringify({ data: payload }),
    };
  };
  const client = createCrowdyClient({
    managementUrl: 'https://example.test/graphql',
    gameUrl: 'https://example.test/graphql',
  });
  client.auth.setToken('token');
  return { client, calls };
}

const TIMER = {
  timerId: 'timer-1',
  appId: '266',
  sessionId: null,
  selfContainerId: '00000000-0000-0000-0000-000000000001',
  functionName: 'AdvanceBossWave',
  paramsJson: '{"wave":3}',
  fireAt: '2026-07-30T00:00:05.000Z',
  dedupeKey: 'boss_wave',
  cascadeDepth: 0,
  flowId: null,
  armedBy: 'client',
  createdAt: '2026-07-30T00:00:00.000Z',
};

test('scheduleInvoke sends the delay, params, and dedupe key', async (t) => {
  const { client, calls } = await clientWith({ gameModelScheduleInvoke: TIMER }, t);

  const timer = await client.gameModel.scheduleInvoke({
    appId: '266',
    functionName: 'AdvanceBossWave',
    selfContainerId: '00000000-0000-0000-0000-000000000001',
    delayMs: 5000,
    paramsJson: '{"wave":3}',
    dedupeKey: 'boss_wave',
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /GameModelScheduleInvoke/);
  assert.deepEqual(calls[0].variables.input, {
    appId: '266',
    functionName: 'AdvanceBossWave',
    selfContainerId: '00000000-0000-0000-0000-000000000001',
    delayMs: 5000,
    paramsJson: '{"wave":3}',
    dedupeKey: 'boss_wave',
  });
  assert.equal(timer.timerId, 'timer-1');
  assert.equal(timer.armedBy, 'client');
  assert.equal(timer.dedupeKey, 'boss_wave');
});

test('cancelTimer accepts either selector and returns the removed count', async (t) => {
  const { client, calls } = await clientWith({ gameModelCancelTimer: 1 }, t);

  const removed = await client.gameModel.cancelTimer({
    appId: '266',
    dedupeKey: 'boss_wave',
  });

  assert.equal(removed, 1);
  assert.match(calls[0].query, /GameModelCancelTimer/);
  assert.equal(calls[0].variables.dedupeKey, 'boss_wave');
  assert.equal(calls[0].variables.timerId, undefined);
});

test('timers lists pending timers with the full field set', async (t) => {
  const { client, calls } = await clientWith({ gameModelTimers: [TIMER] }, t);

  const pending = await client.gameModel.timers({ appId: '266', limit: 10 });

  assert.match(calls[0].query, /GameModelTimers/);
  assert.equal(calls[0].variables.limit, 10);
  assert.equal(pending.length, 1);
  // The fragment must carry every field, or callers silently get undefined.
  for (const field of Object.keys(TIMER)) {
    assert.ok(field in pending[0], `GmTimerFields should select ${field}`);
  }
});

test('upsertAutomationTrigger forwards writeSource for property_changed', async (t) => {
  const { client, calls } = await clientWith({
    gameModelUpsertAutomationTrigger: {
      triggerId: 'trigger-1',
      appId: '266',
      automationId: 'automation-1',
      onEvent: 'property_changed',
      functionName: null,
      containerTypeName: 'BP_Boss',
      propertyKey: 'waveIndex',
      writeSource: 'function',
      debounceMs: 0,
      lastMatchedAt: null,
      matchCount24h: 0,
      warnings: [],
    },
  }, t);

  const trigger = await client.gameModel.upsertAutomationTrigger({
    appId: '266',
    automationName: 'RegenerateCovers',
    onEvent: 'property_changed',
    containerTypeName: 'BP_Boss',
    propertyKey: 'waveIndex',
    writeSource: 'function',
  });

  assert.equal(calls[0].variables.input.writeSource, 'function');
  assert.equal(trigger.writeSource, 'function');
  // The diagnostics fields are what make a non-firing trigger debuggable.
  assert.equal(trigger.lastMatchedAt, null);
  assert.equal(trigger.matchCount24h, 0);
  assert.deepEqual(trigger.warnings, []);
});

test('automationTriggers selects the diagnostics fields', async (t) => {
  const { client, calls } = await clientWith({
    gameModelAutomationTriggers: [
      {
        triggerId: 'trigger-1',
        appId: '266',
        automationId: 'automation-1',
        onEvent: 'function_invoked',
        functionName: 'InitiateBossWave',
        containerTypeName: 'BP_TA_BossCharacter',
        propertyKey: null,
        writeSource: 'any',
        debounceMs: 0,
        lastMatchedAt: '2026-07-30T00:00:00.000Z',
        matchCount24h: 12,
        warnings: [],
      },
    ],
  }, t);

  const triggers = await client.gameModel.automationTriggers({ appId: '266' });

  for (const field of ['writeSource', 'lastMatchedAt', 'matchCount24h', 'warnings']) {
    assert.match(calls[0].query, new RegExp(field), `fragment should select ${field}`);
  }
  assert.equal(triggers[0].matchCount24h, 12);
  assert.equal(triggers[0].containerTypeName, 'BP_TA_BossCharacter');
});

test('a function blueprint can declare timers through the seed input', async () => {
  const { mergeBlueprints } = await loadSdk();

  const merged = mergeBlueprints('266', [
    {
      name: 'boss',
      functions: [
        {
          name: 'startBossWave',
          containerTypeName: 'BP_Boss',
          autonomousInvocable: true,
          mutations: [
            { target: 'self', property: 'waveIndex', expression: 'self.waveIndex + 1' },
          ],
          timers: [
            {
              functionName: 'startBossWave',
              delayMsExpression: 'self.waveDelayMs',
              dedupeKeyExpression: '"boss_wave"',
              params: [{ name: 'wave', expression: 'self.waveIndex' }],
            },
          ],
        },
      ],
    },
  ]);

  const fn = merged.seedInput.functions[0];
  assert.equal(fn.timers.length, 1);
  assert.equal(fn.timers[0].delayMsExpression, 'self.waveDelayMs');
  assert.equal(fn.timers[0].params[0].name, 'wave');
});
