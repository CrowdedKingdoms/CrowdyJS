import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_TIME = Date.parse('2026-07-23T20:00:00Z');

function capabilities(now = BASE_TIME) {
  return {
    contractVersion: 'crowdy.player-host/1',
    gameId: 'blocks-with-friends',
    revision: 'capability-7',
    controlledEntityId: 'player-7',
    commands: [
      {
        kind: 'MOVE',
        toolName: 'game.control.move',
        requiredScope: 'locomotion',
        risk: 'WORLD_CONTROL',
        approval: 'NONE',
        rateLimitPerSecond: 5,
      },
      {
        kind: 'STOP',
        toolName: 'game.control.stop',
        risk: 'WORLD_CONTROL',
        approval: 'NONE',
        rateLimitPerSecond: 100,
      },
    ],
    observation: {
      maxAgeMs: 2_000,
      maxNearbyActors: 16,
      maxNearbyVoxels: 32,
    },
    advertisedAt: new Date(now).toISOString(),
  };
}

function observation(now = BASE_TIME) {
  const vector = { x: '0', y: '64', z: '0' };
  return {
    contractVersion: 'crowdy.game-observation/1',
    observationId: `observation-${now}`,
    capabilityRevision: 'capability-7',
    controlledEntityId: 'player-7',
    observedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 2_000).toISOString(),
    player: {
      position: vector,
      velocity: { x: '0', y: '0', z: '0' },
      look: { yaw: '0', pitch: '0' },
      health: '20',
      alive: true,
    },
    controlledEntity: {
      kind: 'PLAYER',
      position: vector,
      velocity: { x: '0', y: '0', z: '0' },
    },
    nearbyActors: [],
    nearbyVoxels: [],
    inputState: {
      modalOpen: false,
      textInputFocused: false,
      humanInputActive: false,
    },
  };
}

function lease(expiresAt) {
  return {
    leaseId: 'lease-1',
    kind: 'PLAY',
    status: 'ACTIVE',
    clientEpoch: '1',
    scopes: ['locomotion'],
    holder: 'Current player',
    controlledEntityId: 'player-7',
    hostCapabilityRevision: 'capability-7',
    contextVersion: 'context-1',
    grantedAt: new Date(BASE_TIME).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function move(observationId) {
  return {
    kind: 'MOVE',
    observationId,
    capabilityRevision: 'capability-7',
    controlledEntityId: 'player-7',
    direction: 'FORWARD',
    intensity: 1,
    durationMs: 100,
  };
}

test('lease gate checks freshness and executes each toolCallId once', async () => {
  const { AgentControlLeaseManager } = await import(
    '../../dist/player-host/index.js'
  );
  let now = BASE_TIME;
  let dispatches = 0;
  const cleared = [];
  const adapter = {
    contractVersion: 'crowdy.player-host/1',
    async capabilities() {
      return capabilities(now);
    },
    async observe() {
      return observation(now);
    },
    async dispatch(command) {
      dispatches += 1;
      return {
        contractVersion: 'crowdy.game-command-result/1',
        status: 'SUCCEEDED',
        commandKind: command.kind,
        observationId: command.observationId,
      };
    },
    clearAgentIntent(reason) {
      cleared.push(reason);
    },
  };
  const manager = new AgentControlLeaseManager(adapter, { now: () => now });
  manager.attach('1');
  await manager.refreshCapabilities();
  manager.grantLease(lease(BASE_TIME + 60_000));
  const observed = await manager.observe({
    detail: 'STANDARD',
    maxNearbyActors: 8,
    maxNearbyVoxels: 16,
  });
  const input = {
    toolCallId: 'tool-1',
    clientEpoch: '1',
    leaseId: 'lease-1',
    command: move(observed.observationId),
  };
  const first = await manager.dispatch(input);
  const replay = await manager.dispatch(structuredClone(input));
  assert.equal(first.status, 'SUCCEEDED');
  assert.deepEqual(replay, first);
  assert.equal(dispatches, 1);

  now += 2_001;
  await assert.rejects(
    manager.dispatch({ ...input, toolCallId: 'tool-2' }),
    (error) => error.code === 'AGENT_OBSERVATION_STALE',
  );
  manager.preempt('HUMAN_INPUT');
  assert.equal(cleared.at(-1), 'HUMAN_INPUT');
});

test('human preemption is synchronous and old epochs cannot dispatch', async () => {
  const { AgentControlLeaseManager } = await import(
    '../../dist/player-host/index.js'
  );
  const calls = [];
  const adapter = {
    contractVersion: 'crowdy.player-host/1',
    async capabilities() {
      return capabilities();
    },
    async observe() {
      return observation();
    },
    async dispatch(command) {
      calls.push(`dispatch:${command.kind}`);
      return {
        contractVersion: 'crowdy.game-command-result/1',
        status: 'SUCCEEDED',
        commandKind: command.kind,
        observationId: command.observationId,
      };
    },
    clearAgentIntent(reason) {
      calls.push(`clear:${reason}`);
    },
  };
  const manager = new AgentControlLeaseManager(adapter, {
    now: () => BASE_TIME,
  });
  manager.attach('1');
  await manager.refreshCapabilities();
  manager.grantLease(lease(BASE_TIME + 60_000));
  const observed = await manager.observe({
    detail: 'MINIMAL',
    maxNearbyActors: 0,
    maxNearbyVoxels: 0,
  });

  manager.preempt('HUMAN_INPUT');
  assert.deepEqual(calls, ['clear:HUMAN_INPUT']);
  await assert.rejects(
    manager.dispatch({
      toolCallId: 'after-preempt',
      clientEpoch: '1',
      leaseId: 'lease-1',
      command: move(observed.observationId),
    }),
    (error) => error.code === 'AGENT_LEASE_REQUIRED',
  );

  manager.attach('2');
  await assert.rejects(
    manager.dispatch({
      toolCallId: 'stale-epoch',
      clientEpoch: '1',
      leaseId: 'lease-1',
      command: move(observed.observationId),
    }),
    (error) => error.code === 'AGENT_CLIENT_EPOCH_STALE',
  );
});

test('lease expiry clears intent and ambiguous host results remain outcome unknown', async () => {
  const { AgentControlLeaseManager } = await import(
    '../../dist/player-host/index.js'
  );
  let dispatches = 0;
  const cleared = [];
  const adapter = {
    contractVersion: 'crowdy.player-host/1',
    async capabilities() {
      return capabilities(Date.now());
    },
    async observe() {
      return observation(Date.now());
    },
    async dispatch() {
      dispatches += 1;
      throw new Error('connection dropped after intent submission');
    },
    clearAgentIntent(reason) {
      cleared.push(reason);
    },
  };
  const manager = new AgentControlLeaseManager(adapter);
  manager.attach('1');
  await manager.refreshCapabilities();
  manager.grantLease({
    ...lease(Date.now() + 40),
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 40).toISOString(),
  });
  const observed = await manager.observe({
    detail: 'MINIMAL',
    maxNearbyActors: 0,
    maxNearbyVoxels: 0,
  });
  const input = {
    toolCallId: 'ambiguous',
    clientEpoch: '1',
    leaseId: 'lease-1',
    command: move(observed.observationId),
  };
  const first = await manager.dispatch(input);
  const replay = await manager.dispatch(input);
  assert.equal(first.status, 'OUTCOME_UNKNOWN');
  assert.deepEqual(replay, first);
  assert.equal(dispatches, 1);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(cleared.at(-1), 'LEASE_EXPIRED');
  await assert.rejects(
    manager.dispatch({ ...input, toolCallId: 'expired' }),
    (error) => error.code === 'AGENT_LEASE_REQUIRED',
  );
});
