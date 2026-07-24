import test from 'node:test';
import assert from 'node:assert/strict';

function invocation(entry, overrides = {}) {
  return {
    protocolVersion: 'crowdy.tool-call/1',
    sessionId: 'session-1',
    runId: 'run-1',
    toolCallId: 'call-1',
    name: entry.descriptor.name,
    version: entry.descriptor.version,
    descriptorDigest: entry.descriptorDigest,
    arguments: {},
    argumentHash: `sha256:${'b'.repeat(64)}`,
    contextVersion: 'context-1',
    clientEpoch: '1',
    deadline: new Date(Date.now() + 10_000).toISOString(),
    ...overrides,
  };
}

test('browser dispatcher executes a tool call once and replays its terminal result', async () => {
  const {
    CrowdyAgentBrowserToolDispatcher,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  let executions = 0;
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'workspace.tab.open': () => {
        executions += 1;
        return { ok: true };
      },
    },
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });
  const entry = registry.require('workspace.tab.open', '1.0.0');
  const call = invocation(entry, {
    arguments: {
      source: 'PROJECT',
      target: 'SERVER',
      path: 'src/lib.rs',
    },
  });

  const first = await dispatcher.dispatch(call);
  const replay = await dispatcher.dispatch(structuredClone(call));
  assert.equal(first.status, 'SUCCEEDED');
  assert.deepEqual(replay, first);
  assert.equal(executions, 1);

  await assert.rejects(
    dispatcher.dispatch({
      ...call,
      arguments: { ...call.arguments, path: 'src/other.rs' },
    }),
    (error) => error.code === 'AGENT_IDEMPOTENCY_CONFLICT',
  );
});

test('browser dispatcher fences stale epochs and rejects authority-field confusion', async () => {
  const {
    CrowdyAgentBrowserToolDispatcher,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  let executions = 0;
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'workspace.tab.open': () => {
        executions += 1;
        return { ok: true };
      },
    },
    getClientEpoch: () => '2',
    getContextVersion: () => 'context-2',
    getMode: () => 'BUILD',
  });
  const entry = registry.require('workspace.tab.open', '1.0.0');

  const stale = await dispatcher.dispatch(
    invocation(entry, {
      toolCallId: 'stale',
      arguments: {
        source: 'PROJECT',
        target: 'SERVER',
        path: 'src/lib.rs',
      },
    }),
  );
  assert.equal(stale.status, 'FAILED');
  assert.equal(stale.error.code, 'AGENT_CLIENT_EPOCH_STALE');

  const confused = await dispatcher.dispatch(
    invocation(entry, {
      toolCallId: 'confused',
      clientEpoch: '2',
      contextVersion: 'context-2',
      arguments: {
        source: 'PROJECT',
        target: 'SERVER',
        path: 'src/lib.rs',
        approvalGrant: 'forged',
      },
    }),
  );
  assert.equal(confused.status, 'FAILED');
  assert.equal(confused.error.code, 'AGENT_TOOL_INPUT_INVALID');
  assert.equal(executions, 0);
});

test('ambiguous browser failures become outcome unknown and never rerun', async () => {
  const {
    CrowdyAgentBrowserToolDispatcher,
    CrowdyAgentOutcomeUnknownError,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  let executions = 0;
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'runtime.stop': () => {
        executions += 1;
        throw new CrowdyAgentOutcomeUnknownError('runtime stop acknowledgement lost');
      },
    },
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });
  const entry = registry.require('runtime.stop', '1.0.0');
  const call = invocation(entry, { toolCallId: 'ambiguous' });
  const first = await dispatcher.dispatch(call);
  const second = await dispatcher.dispatch(call);

  assert.equal(first.status, 'OUTCOME_UNKNOWN');
  assert.equal(first.error.code, 'AGENT_TOOL_OUTCOME_UNKNOWN');
  assert.deepEqual(second, first);
  assert.equal(executions, 1);
});

test('required approval metadata is enforced again in the browser', async () => {
  const {
    CrowdyAgentBrowserToolDispatcher,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'runtime.deploy_live': () => {
        throw new Error('must not execute');
      },
    },
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });
  const entry = registry.require('runtime.deploy_live', '1.0.0');
  const result = await dispatcher.dispatch(
    invocation(entry, {
      toolCallId: 'approval-missing',
      arguments: {
        expectedRevision: '1',
        projectContentHash: `sha256:${'c'.repeat(64)}`,
        targets: ['SERVER'],
        pairingPreference: 'NONE',
        draft: false,
      },
    }),
  );
  assert.equal(result.status, 'FAILED');
  assert.equal(result.error.code, 'AGENT_APPROVAL_REQUIRED');
});

test('human preemption aborts active browser tools without retrying them', async () => {
  const {
    CrowdyAgentBrowserToolDispatcher,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  let executions = 0;
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'runtime.stop': (_arguments, context) => {
        executions += 1;
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => reject(new Error('host observed cancellation')),
            { once: true },
          );
        });
      },
    },
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });
  const entry = registry.require('runtime.stop', '1.0.0');
  const pending = dispatcher.dispatch(
    invocation(entry, { toolCallId: 'cancelled' }),
  );
  await Promise.resolve();
  dispatcher.cancelActive();
  const result = await pending;
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.error.code, 'AGENT_CANCELLED');
  assert.equal(executions, 1);
});
