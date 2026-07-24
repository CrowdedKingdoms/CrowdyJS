import test from 'node:test';
import assert from 'node:assert/strict';

function project() {
  return {
    projectId: 'project-1',
    appId: '42',
    gridId: '500',
    kind: 'SERVER',
    metadata: {
      name: 'Runtime tools',
      serverModuleName: 'runtime-tools',
      pairingPreference: 'NONE',
    },
    files: [
      { target: 'SERVER', path: 'Cargo.toml', content: '[package]\nname="runtime"' },
      { target: 'SERVER', path: 'src/lib.rs', content: 'pub fn invoke() {}' },
    ],
    sdkVersion: '0.1.5',
    abiVersion: 0,
    revision: { id: '1', savedAt: '2026-07-24T00:00:00Z' },
    createdAt: '2026-07-24T00:00:00Z',
    updatedAt: '2026-07-24T00:00:00Z',
  };
}

function fullStackProject() {
  const value = project();
  return {
    ...value,
    kind: 'FULL_STACK',
    metadata: {
      ...value.metadata,
      clientModuleName: 'runtime-tools-client',
      pairingPreference: 'REQUIRED',
    },
    files: [
      ...value.files,
      {
        target: 'CLIENT',
        path: 'src/lib.rs',
        content: 'pub fn client() {}',
      },
    ],
  };
}

function provider(value = project()) {
  return {
    async listProjects() {
      return [{
        projectId: value.projectId,
        name: value.metadata.name,
        kind: value.kind,
        revisionId: value.revision.id,
        serverModuleName: value.metadata.serverModuleName,
        updatedAt: value.updatedAt,
      }];
    },
    async getProject() {
      return structuredClone(value);
    },
    async createProject() {
      return structuredClone(value);
    },
    async saveProject() {
      return structuredClone(value);
    },
    async listPersonalLibraryFiles() {
      return [];
    },
    async listCommonFiles() {
      return [];
    },
    async importReferenceFile() {
      return structuredClone(value);
    },
    async savePersonalLibraryFile() {
      throw new Error('not used');
    },
  };
}

function compute(overrides = {}) {
  const calls = [];
  return {
    calls,
    async deploy(input) {
      calls.push({ kind: 'deploy', input: structuredClone(input) });
      return { versionId: input.draft ? 'draft-v1' : 'live-v1' };
    },
    async versions() {
      return [{
        versionId: calls.at(-1)?.input?.draft ? 'draft-v1' : 'live-v1',
        compileStatus: 'succeeded',
        compileLog: null,
      }];
    },
    async setEnabled(input) {
      calls.push({ kind: 'enabled', input: structuredClone(input) });
      return {};
    },
    async setRequires() {
      return true;
    },
    async artifactBytes() {
      throw new Error('not used');
    },
    async usage() {
      return {
        hourUnitsUsed: '1',
        dayUnitsUsed: '1',
        unitsPerHour: '100',
        unitsPerDay: '1000',
        compilesThisHour: 1,
        maxCompilesPerHour: 20,
        gateStatus: 'active',
        gateReason: null,
      };
    },
    async runs() {
      return [];
    },
    async logs() {
      return [];
    },
    async invoke(input) {
      calls.push({ kind: 'invoke', input: structuredClone(input) });
      return { resultJson: '{"ok":true}', fuelUsed: '4', durationUs: 2 };
    },
    ...overrides,
  };
}

function invocation(entry, controller, argumentsValue, options = {}) {
  const leaseId =
    options.leaseId ??
    (entry.descriptor.name === 'runtime.stop'
      ? undefined
      : entry.descriptor.name === 'runtime.invoke' &&
          argumentsValue.environment === 'LIVE'
        ? 'play-lease'
        : 'workspace-lease');
  return {
    protocolVersion: 'crowdy.tool-call/1',
    sessionId: 'session-1',
    runId: 'run-1',
    toolCallId: options.toolCallId ?? `tool-${entry.descriptor.name}`,
    name: entry.descriptor.name,
    version: entry.descriptor.version,
    descriptorDigest: entry.descriptorDigest,
    arguments: argumentsValue,
    argumentHash: `sha256:${'c'.repeat(64)}`,
    contextVersion: 'context-1',
    clientEpoch: '1',
    ...(leaseId ? { leaseId } : {}),
    ...(options.approvalGrant
      ? { approvalGrant: options.approvalGrant }
      : {}),
    deadline: new Date(Date.now() + 120_000).toISOString(),
  };
}

test('runtime browser tools preserve draft/live/stop/invoke authority', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentBrowserToolDispatcher,
    createCrowdyStudioAgentTools,
  } = await import('../../dist/crowdy-agent/index.js');
  const { CrowdyStudioController } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const playerCompute = compute();
  const controller = new CrowdyStudioController({
    projectProvider: provider(),
    playerCompute,
    appId: '42',
    gridId: '500',
    sleep: async () => {},
  });
  await controller.initialize();
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: createCrowdyStudioAgentTools(controller, {
      isLeaseActive: (leaseId, kind) =>
        (kind === 'WORKSPACE' && leaseId === 'workspace-lease') ||
        (kind === 'PLAY' && leaseId === 'play-lease'),
    }),
    getSessionId: () => 'session-1',
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });

  const draft = registry.require('runtime.test_draft', '1.0.0');
  const deniedDraft = await dispatcher.dispatch(
    invocation(
      draft,
      controller,
      { expectedRevision: '1', targets: ['SERVER'] },
      { toolCallId: 'draft-without-lease', leaseId: '' },
    ),
  );
  assert.equal(deniedDraft.status, 'FAILED');
  assert.equal(deniedDraft.error.code, 'AGENT_LEASE_REQUIRED');
  const draftResult = await dispatcher.dispatch(
    invocation(draft, controller, {
      expectedRevision: '1',
      targets: ['SERVER'],
    }),
  );
  assert.equal(draftResult.status, 'SUCCEEDED');
  assert.equal(
    playerCompute.calls.find((call) => call.kind === 'deploy').input.draft,
    true,
  );
  const invoke = registry.require('runtime.invoke', '1.0.0');
  const draftInvoke = await dispatcher.dispatch(
    invocation(
      invoke,
      controller,
      {
        exportName: 'invoke',
        environment: 'DRAFT',
        params: [],
      },
      { toolCallId: 'invoke-draft' },
    ),
  );
  assert.equal(draftInvoke.status, 'SUCCEEDED');

  const live = registry.require('runtime.deploy_live', '1.0.0');
  const liveArguments = {
    expectedRevision: '1',
    projectContentHash: controller.getAgentContext().projectContentHash,
    targets: ['SERVER'],
    pairingPreference: 'NONE',
    draft: false,
  };
  const deniedLive = await dispatcher.dispatch(
    invocation(live, controller, liveArguments, {
      toolCallId: 'live-without-approval',
    }),
  );
  assert.equal(deniedLive.status, 'FAILED');
  assert.equal(deniedLive.error.code, 'AGENT_APPROVAL_REQUIRED');
  const liveResult = await dispatcher.dispatch(
    invocation(live, controller, liveArguments, {
      toolCallId: 'live-approved',
      approvalGrant: 'opaque-live-approval',
    }),
  );
  assert.equal(liveResult.status, 'SUCCEEDED');
  assert.equal(
    playerCompute.calls
      .filter((call) => call.kind === 'deploy')
      .at(-1).input.draft,
    false,
  );

  const invokeArguments = {
    exportName: 'invoke',
    environment: 'LIVE',
    params: [{ name: 'enabled', type: 'BOOLEAN', value: 'true' }],
  };
  const deniedInvoke = await dispatcher.dispatch(
    invocation(invoke, controller, invokeArguments, {
      toolCallId: 'invoke-without-approval',
    }),
  );
  assert.equal(deniedInvoke.status, 'FAILED');
  assert.equal(deniedInvoke.error.code, 'AGENT_APPROVAL_REQUIRED');
  const invokeResult = await dispatcher.dispatch(
    invocation(invoke, controller, invokeArguments, {
      toolCallId: 'invoke-approved',
      approvalGrant: 'opaque-invoke-approval',
    }),
  );
  assert.equal(invokeResult.status, 'SUCCEEDED');
  assert.equal(
    playerCompute.calls
      .filter((call) => call.kind === 'invoke')
      .at(-1).input.paramsJson,
    '{"enabled":true}',
  );

  const stop = registry.require('runtime.stop', '1.0.0');
  const stopResult = await dispatcher.dispatch(
    invocation(stop, controller, {}, { toolCallId: 'runtime-stop' }),
  );
  assert.equal(stopResult.status, 'SUCCEEDED');
  assert.equal(
    playerCompute.calls
      .filter((call) => call.kind === 'enabled')
      .at(-1).input.enabled,
    false,
  );
  controller.destroy();
});

test('runtime plans reject target omission, pairing, revision, and content mismatches', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentBrowserToolDispatcher,
    createCrowdyStudioAgentTools,
  } = await import('../../dist/crowdy-agent/index.js');
  const { CrowdyStudioController } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const playerCompute = compute();
  const controller = new CrowdyStudioController({
    projectProvider: provider(fullStackProject()),
    playerCompute,
    appId: '42',
    gridId: '500',
    sleep: async () => {},
  });
  await controller.initialize();
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: createCrowdyStudioAgentTools(controller, {
      isLeaseActive: (leaseId, kind) =>
        kind === 'WORKSPACE' && leaseId === 'workspace-lease',
    }),
    getSessionId: () => 'session-1',
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });

  const draft = registry.require('runtime.test_draft', '1.0.0');
  const omittedTarget = await dispatcher.dispatch(
    invocation(
      draft,
      controller,
      { expectedRevision: '1', targets: ['SERVER'] },
      { toolCallId: 'draft-server-only' },
    ),
  );
  assert.equal(omittedTarget.status, 'FAILED');

  const live = registry.require('runtime.deploy_live', '1.0.0');
  const authoritative = {
    expectedRevision: '1',
    projectContentHash: controller.getAgentContext().projectContentHash,
    targets: ['SERVER', 'CLIENT'],
    pairingPreference: 'REQUIRED',
    draft: false,
  };
  for (const [toolCallId, patch] of [
    ['live-target-omission', { targets: ['SERVER'] }],
    ['live-pairing-change', { pairingPreference: 'OPTIONAL' }],
    ['live-revision-change', { expectedRevision: '2' }],
    ['live-content-change', { projectContentHash: `sha256:${'0'.repeat(64)}` }],
  ]) {
    const result = await dispatcher.dispatch(
      invocation(
        live,
        controller,
        { ...authoritative, ...patch },
        { toolCallId, approvalGrant: 'opaque-live-approval' },
      ),
    );
    assert.equal(result.status, 'FAILED', toolCallId);
  }
  assert.equal(
    playerCompute.calls.some((call) => call.kind === 'deploy'),
    false,
    'no mismatched plan may reach playerCompute.deploy',
  );
  controller.destroy();
});

test('runtime handler abort fences the controller operation', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentBrowserToolDispatcher,
    createCrowdyStudioAgentTools,
  } = await import('../../dist/crowdy-agent/index.js');
  const { CrowdyStudioController } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const playerCompute = compute({
    async versions() {
      return [{ versionId: 'draft-v1', compileStatus: 'pending', compileLog: null }];
    },
  });
  const controller = new CrowdyStudioController({
    projectProvider: provider(),
    playerCompute,
    appId: '42',
    gridId: '500',
    sleep: async () => new Promise(() => {}),
  });
  await controller.initialize();
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: createCrowdyStudioAgentTools(controller, {
      isLeaseActive: (leaseId, kind) =>
        kind === 'WORKSPACE' && leaseId === 'workspace-lease',
    }),
    getSessionId: () => 'session-1',
    getClientEpoch: () => '1',
    getContextVersion: () => 'context-1',
    getMode: () => 'BUILD',
  });
  const draft = registry.require('runtime.test_draft', '1.0.0');
  const pending = dispatcher.dispatch(
    invocation(
      draft,
      controller,
      { expectedRevision: '1', targets: ['SERVER'] },
      { toolCallId: 'aborted-draft' },
    ),
  );
  await Promise.resolve();
  dispatcher.cancelActive();
  const result = await pending;
  assert.equal(result.status, 'CANCELLED');
  assert.equal(controller.getState().agentActivity, 'PAUSED');
  assert.match(controller.getState().runtime.message, /preempted/u);
  controller.destroy();
});
