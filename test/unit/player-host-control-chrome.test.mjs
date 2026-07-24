import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, recorder } from './fixtures/embed-dom.mjs';

const { PlayerControlGate } = await import(
  '../../dist/player-host/control-gate.js'
);
const { AgentControlBanner } = await import(
  '../../dist/player-host/control-banner.js'
);

let window;

beforeEach(() => {
  window = setupDom({ width: 1_200 });
});

afterEach(() => {
  teardownDom(window);
});

test('gate preempts synchronously before normal human input proceeds', () => {
  const order = [];
  const lease = playLease();
  const manager = fakeLeaseManager(lease, (reason) => {
    order.push(`clear:${reason}`);
  });
  const controller = fakeController(lease);
  const gate = new PlayerControlGate((reason) =>
    order.push(`fallback:${reason}`),
  );
  gate.start();
  gate.bind(manager, controller);
  const target = document.createElement('button');
  document.body.append(target);
  target.addEventListener('keydown', () => order.push('human-handler'));

  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'KeyW',
    }),
  );

  assert.deepEqual(order.slice(0, 2), ['clear:HUMAN_INPUT', 'human-handler']);
  assert.deepEqual(controller.revokeLease.calls.at(0), [
    'lease-1',
    'HUMAN_INPUT',
  ]);
  assert.equal(gate.snapshot().activeLease, null);
  gate.destroy();
});

test('gate uses Escape, death, pagehide, and disconnect preemption reasons', () => {
  const reasons = [];
  const gate = new PlayerControlGate((reason) => reasons.push(reason));
  gate.start();

  window.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, code: 'Escape' }),
  );
  gate.death();
  window.dispatchEvent(new Event('pagehide'));
  gate.disconnected();

  // Escape has no active lease, while explicit safety transitions always
  // clear even before Studio has attached a controller.
  assert.deepEqual(reasons, ['DEATH', 'DISCONNECTED', 'DISCONNECTED']);
  gate.destroy();
});

test('gate stops locally even when remote Stop is offline', async () => {
  const order = [];
  const lease = playLease();
  const manager = fakeLeaseManager(lease, (reason) => {
    order.push(`clear:${reason}`);
  });
  const controller = fakeController(lease);
  controller.stop = recorder(async () => {
    order.push('remote-stop');
    throw new Error('offline');
  });
  const gate = new PlayerControlGate((reason) =>
    order.push(`fallback:${reason}`),
  );
  gate.bind(manager, controller);

  gate.stop();

  assert.equal(order[0], 'clear:HUMAN_STOP');
  const snapshot = gate.snapshot();
  assert.equal(snapshot.activeLease, null);
  assert.equal(snapshot.offlineStop, true);
  assert.equal(snapshot.lastPreemption, 'HUMAN_STOP');
  await Promise.resolve();
  assert.ok(order.includes('remote-stop'));
  gate.destroy();
});

test('banner shows mode, scopes, entity, expiry, and accessible Pause/Stop', () => {
  const lease = playLease();
  const manager = fakeLeaseManager(lease, () => {});
  const controller = fakeBannerController(agentState(lease));
  const gate = new PlayerControlGate(() => {});
  gate.bind(manager, controller);
  const banner = new AgentControlBanner(document.body, gate);
  banner.bind(controller);

  assert.equal(banner.root.hidden, false);
  assert.equal(banner.root.getAttribute('role'), 'region');
  assert.equal(banner.root.getAttribute('aria-label'), 'Agent player control');
  assert.ok(banner.root.textContent.includes('Mode PLAY'));
  assert.ok(banner.root.textContent.includes('locomotion'));
  assert.ok(banner.root.textContent.includes('game:player-1:player'));
  assert.ok(banner.root.textContent.includes('Control expires'));
  assert.equal(
    banner.root.querySelector('button:not(.ck-agent-control-stop)')
      .textContent,
    'Pause agent',
  );
  assert.equal(
    banner.root.querySelector('.ck-agent-control-stop').disabled,
    false,
  );
  // The banner injects its own styles once.
  assert.ok(document.getElementById('ck-agent-control-banner-styles'));

  banner.destroy();
  gate.destroy();
});

test('banner Stop clears locally and remains usable with an offline controller', async () => {
  const lease = playLease();
  const manager = fakeLeaseManager(lease, () => {});
  const controller = fakeBannerController(agentState(lease));
  controller.stop = recorder(async () => {
    throw new Error('offline');
  });
  const gate = new PlayerControlGate(() => {});
  gate.bind(manager, controller);
  const banner = new AgentControlBanner(document.body, gate);
  banner.bind(controller);

  banner.root.querySelector('.ck-agent-control-stop').click();

  assert.deepEqual(manager.preempt.calls.at(0), ['HUMAN_STOP']);
  assert.equal(gate.snapshot().activeLease, null);
  assert.ok(banner.root.textContent.includes('Stopped locally'));
  await Promise.resolve();
  assert.equal(controller.stop.calls.length, 1);
  banner.destroy();
  gate.destroy();
});

test('banner renders a fail-closed disabled message without authority inputs', () => {
  const gate = new PlayerControlGate(() => {});
  const banner = new AgentControlBanner(document.body, gate);

  banner.showUnavailable('effective policy disabled');

  assert.equal(banner.root.hidden, false);
  assert.equal(banner.root.dataset.state, 'unavailable');
  assert.ok(banner.root.textContent.includes('effective policy disabled'));
  assert.equal(banner.root.querySelector('input'), null);
  assert.equal(banner.root.querySelector('textarea'), null);
  assert.doesNotMatch(
    banner.root.textContent.toLowerCase(),
    /bearer|token|authorization|graphql|udp|host_call/u,
  );
  assert.equal(
    banner.root.querySelector('.ck-agent-control-stop').disabled,
    false,
  );
  banner.destroy();
  gate.destroy();
});

function fakeLeaseManager(initialLease, clear) {
  let lease = initialLease;
  const preempt = recorder((reason) => {
    clear(reason);
    lease = null;
  });
  return {
    snapshot: () => ({
      connected: true,
      clientEpoch: '1',
      lease,
      capabilities: null,
    }),
    preempt,
  };
}

function fakeController(lease) {
  return {
    getState: () => ({ leases: [lease] }),
    revokeLease: recorder(async () => {}),
    pause: recorder(async () => {}),
    stop: recorder(async () => {}),
  };
}

function fakeBannerController(initial) {
  const state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    revokeLease: recorder(async () => {}),
    pause: recorder(async () => {}),
    stop: recorder(async () => {}),
  };
}

function agentState(lease) {
  return {
    connection: 'CONNECTED',
    session: {
      mode: 'PLAY',
      status: 'ACTIVE',
    },
    clientEpoch: '1',
    lastContiguousSeq: '0',
    lastAcknowledgedSeq: '0',
    events: [],
    messages: [],
    streamingText: '',
    tools: [],
    approvals: [],
    leases: [lease],
    checkpoints: [],
    budget: null,
    toolDescriptors: [],
    lastHeartbeatAt: null,
    playLeaseFreshUntil: lease.expiresAt,
    lastError: null,
    reconnectRequired: false,
  };
}

function playLease() {
  return {
    leaseId: 'lease-1',
    kind: 'PLAY',
    status: 'ACTIVE',
    clientEpoch: '1',
    scopes: ['observe', 'locomotion', 'interact'],
    holder: 'human',
    controlledEntityId: 'game:player-1:player',
    hostCapabilityRevision: 'revision-1',
    contextVersion: 'context-1',
    grantedAt: '2026-07-23T20:00:00.000Z',
    expiresAt: '2099-07-23T20:01:00.000Z',
  };
}
