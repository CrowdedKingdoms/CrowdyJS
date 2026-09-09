import test from 'node:test';
import assert from 'node:assert/strict';

function session(registryDigest) {
  return {
    contractVersion: 'crowdy.studio-agent/1',
    sessionId: 'session-1',
    appId: 'app-1',
    projectId: 'project-1',
    gridId: 'grid-1',
    mode: 'ASK',
    status: 'ACTIVE',
    requestedModel: 'fake/model',
    providerDataConsent: false,
    registryDigest,
    providerPolicyVersion: 'provider-policy-1',
    appPolicyVersion: 'app-policy-1',
    contextVersion: 'context-1',
    currentClientEpoch: '0',
    lastEventSeq: '0',
    activeLeases: [],
    createdAt: '2026-07-23T20:00:00Z',
    updatedAt: '2026-07-23T20:00:00Z',
  };
}

function event(seq, type, payload) {
  return {
    protocolVersion: 'crowdy.agent-event/1',
    eventId: `event-${seq}`,
    sessionId: 'session-1',
    seq: String(seq),
    createdAt: `2026-07-23T20:00:${String(seq).padStart(2, '0')}Z`,
    type,
    payload,
  };
}

function fakeTransport(registry) {
  const durable = [];
  const subscriptions = [];
  const acknowledgements = [];
  const approvals = [];
  const toolResults = [];
  const heartbeats = [];
  const workspaceRenewals = [];
  const revocations = [];
  let epoch = 0;
  let currentSession = session(registry.registryDigest);
  return {
    durable,
    subscriptions,
    acknowledgements,
    approvals,
    toolResults,
    heartbeats,
    workspaceRenewals,
    revocations,
    async getSession() {
      return structuredClone(currentSession);
    },
    async listSessions() {
      return {
        edges: [{ cursor: 'cursor-1', node: structuredClone(currentSession) }],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
        nodes: [structuredClone(currentSession)],
        endCursor: 'cursor-1',
        hasNextPage: false,
      };
    },
    async history({ afterSeq, first }) {
      const all = durable
        .filter((entry) => BigInt(entry.seq) > BigInt(afterSeq))
        .sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq)));
      return {
        edges: all.slice(0, first).map((entry) => ({
          cursor: entry.seq,
          node: structuredClone(entry),
        })),
        pageInfo: {
          hasNextPage: all.length > first,
          ...(all.length > 0 ? { endCursor: all.at(-1).seq } : {}),
        },
        events: structuredClone(all.slice(0, first)),
        hasMore: all.length > first,
      };
    },
    async toolDescriptors() {
      return {
        registryDigest: registry.registryDigest,
        tools: registry.list(),
      };
    },
    async budget() {
      return {
        dimensions: [{
          name: 'TOOL_CALLS',
          scope: 'SESSION',
          limit: '20',
          reserved: '0',
          consumed: '0',
          remaining: '20',
          unit: 'calls',
        }],
        platformFunded: true,
        payer: 'PLATFORM',
      };
    },
    async createSession() {
      return structuredClone(currentSession);
    },
    async attachClient() {
      epoch += 1;
      currentSession = {
        ...currentSession,
        currentClientEpoch: String(epoch),
        clientEpoch: String(epoch),
      };
      return {
        session: structuredClone(currentSession),
        clientEpoch: String(epoch),
        replayAfterSeq: '0',
      };
    },
    async setMode({ mode }) {
      currentSession = { ...currentSession, mode };
      return structuredClone(currentSession);
    },
    async acknowledgeEvents({ throughSeq }) {
      acknowledgements.push(throughSeq);
      return { throughSeq };
    },
    async heartbeat(input) {
      heartbeats.push(structuredClone(input));
      if (input.idempotencyKey.includes('renew-workspace-')) {
        workspaceRenewals.push(structuredClone(input));
      }
      return {
        serverTime: new Date().toISOString(),
        playLeaseFreshUntil: new Date(Date.now() + 5_000).toISOString(),
        workspaceLeaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      };
    },
    async sendMessage() {
      return { runId: 'run-1' };
    },
    async approveTool(input) {
      approvals.push(input);
      return { approved: true };
    },
    async rejectTool() {
      return { rejected: true };
    },
    async toolResult(input) {
      toolResults.push(input);
      return { accepted: true };
    },
    async grantLease() {
      throw new Error('not used');
    },
    async revokeLease(input) {
      revocations.push(structuredClone(input));
      return {
        leaseId: input.leaseId,
        kind: 'WORKSPACE',
        status: 'REVOKED',
        clientEpoch: input.clientEpoch,
        scopes: ['studio.project.write.server'],
        holder: 'Current player',
        expectedProjectRevision: '1',
        contextVersion: currentSession.contextVersion,
        grantedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        revokedReason: input.reason,
      };
    },
    async pause() {
      currentSession = { ...currentSession, status: 'PAUSED' };
      return structuredClone(currentSession);
    },
    async resume() {
      currentSession = { ...currentSession, status: 'ACTIVE' };
      return structuredClone(currentSession);
    },
    async cancelRun() {
      return {
        runId: 'run-1',
        status: 'CANCELLED',
        providerRounds: 0,
        toolCalls: 0,
        createdAt: '2026-07-23T20:00:00Z',
        cancelled: true,
      };
    },
    async closeSession() {
      currentSession = { ...currentSession, status: 'CLOSED' };
      return structuredClone(currentSession);
    },
    subscribeEvents(input, handlers) {
      const subscription = {
        input,
        handlers,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      subscriptions.push(subscription);
      return subscription;
    },
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

test('event client fills gaps, deduplicates replay, and acknowledges contiguous history', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    createIdempotencyKey: (operation) => `key:${operation}`,
  });
  await controller.initialize();

  const user = event(1, 'USER_MESSAGE', {
    message: {
      messageId: 'message-1',
      role: 'USER',
      content: 'Build a weather system',
      createdAt: '2026-07-23T20:00:01Z',
    },
  });
  const chunk = event(2, 'ASSISTANT_CHUNK', {
    runId: 'run-1',
    content: 'Working…',
  });
  const assistant = event(3, 'ASSISTANT_MESSAGE', {
    message: {
      messageId: 'message-2',
      role: 'ASSISTANT',
      content: 'The plan is ready.',
      runId: 'run-1',
      createdAt: '2026-07-23T20:00:03Z',
    },
  });
  transport.durable.push(user, chunk, assistant);

  transport.subscriptions[0].handlers.next(structuredClone(assistant));
  await settle();
  assert.equal(controller.getState().lastContiguousSeq, '3');
  assert.deepEqual(
    controller.getState().messages.map((message) => message.messageId),
    ['message-1', 'message-2'],
  );
  assert.equal(controller.getState().streamingText, '');
  assert.equal(transport.acknowledgements.at(-1), '3');

  transport.subscriptions[0].handlers.next(structuredClone(chunk));
  await settle();
  assert.equal(controller.getState().events.length, 3);
  controller.destroy();
});

test('fresh attach fences old subscription callbacks and old browser dispatch epochs', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  let dispatches = 0;
  const browserDispatcher = {
    async dispatch(invocation) {
      dispatches += 1;
      return {
        protocolVersion: 'crowdy.tool-result/1',
        toolCallId: invocation.toolCallId,
        status: 'SUCCEEDED',
        output: { ok: true },
        observedContextVersion: 'context-1',
        startedAt: '2026-07-23T20:00:00Z',
        finishedAt: '2026-07-23T20:00:01Z',
      };
    },
    cancelActive() {},
    clearClosedSession() {},
  };
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    browserDispatcher,
  });
  await controller.initialize();
  const oldSubscription = transport.subscriptions[0];
  await controller.reconnect();
  const currentSubscription = transport.subscriptions[1];
  assert.equal(controller.getState().clientEpoch, '2');
  assert.equal(oldSubscription.closed, true);

  const mode = event(1, 'MODE_SELECTED', { mode: 'BUILD' });
  transport.durable.push(mode);
  oldSubscription.handlers.next(structuredClone(mode));
  await settle();
  assert.equal(controller.getState().session.mode, 'ASK');
  currentSubscription.handlers.next(structuredClone(mode));
  await settle();
  assert.equal(controller.getState().session.mode, 'BUILD');

  const tab = registry.require('workspace.tab.open', '1.0.0');
  const staleDispatch = event(2, 'TOOL_DISPATCHED', {
    toolCallId: 'tool-1',
    name: tab.descriptor.name,
    version: tab.descriptor.version,
    status: 'DISPATCHED',
    invocation: {
      protocolVersion: 'crowdy.tool-call/1',
      sessionId: 'session-1',
      runId: 'run-1',
      toolCallId: 'tool-1',
      name: tab.descriptor.name,
      version: tab.descriptor.version,
      descriptorDigest: tab.descriptorDigest,
      arguments: {
        source: 'PROJECT',
        target: 'SERVER',
        path: 'src/lib.rs',
      },
      argumentHash: `sha256:${'d'.repeat(64)}`,
      contextVersion: 'context-1',
      clientEpoch: '1',
      deadline: new Date(Date.now() + 10_000).toISOString(),
    },
  });
  transport.durable.push(staleDispatch);
  currentSubscription.handlers.next(structuredClone(staleDispatch));
  await settle();
  assert.equal(dispatches, 0);
  assert.equal(transport.toolResults.length, 0);
  controller.destroy();
});

test('approval action is bound to the exact displayed argument hash', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
  });
  await controller.initialize();
  const approval = {
    approvalId: 'approval-1',
    toolCallId: 'tool-1',
    argumentHash: `sha256:${'e'.repeat(64)}`,
    status: 'PENDING',
    safeSummary: 'Deploy revision 7 live',
    reasons: ['Live deployment'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const requested = event(1, 'APPROVAL_REQUESTED', { approval });
  transport.durable.push(requested);
  transport.subscriptions[0].handlers.next(structuredClone(requested));
  await settle();

  await assert.rejects(
    controller.approveTool('tool-1', `sha256:${'f'.repeat(64)}`),
    (error) => error.code === 'AGENT_APPROVAL_MISMATCH',
  );
  await controller.approveTool('tool-1', approval.argumentHash);
  assert.equal(transport.approvals.length, 1);
  assert.equal(transport.approvals[0].argumentHash, approval.argumentHash);
  controller.destroy();
});

test('unknown event enum values fail closed without advancing the cursor', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
  });
  await controller.initialize();
  transport.subscriptions[0].handlers.next(
    event(1, 'MODE_SELECTED', { mode: 'ADMIN' }),
  );
  await settle();
  assert.equal(controller.getState().connection, 'ERROR');
  assert.equal(controller.getState().lastContiguousSeq, '0');
  assert.equal(
    controller.getState().lastError.code,
    'AGENT_EVENT_CURSOR_INVALID',
  );
  controller.destroy();
});

test('ASK to BUILD to PLAY accepts each server-repinned registry and policy context', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: full,
    CrowdyAgentToolRegistry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const registries = {
    ASK: new CrowdyAgentToolRegistry([
      full.require('studio.context.get', '1.0.0').descriptor,
    ]),
    BUILD: new CrowdyAgentToolRegistry([
      full.require('workspace.file.patch', '1.0.0').descriptor,
    ]),
    PLAY: new CrowdyAgentToolRegistry([
      full.require('game.control.stop', '1.0.0').descriptor,
    ]),
  };
  let mode = 'ASK';
  const transport = fakeTransport(registries.ASK);
  transport.toolDescriptors = async () => ({
    registryDigest: registries[mode].registryDigest,
    tools: registries[mode].list(),
  });
  transport.setMode = async ({ mode: next }) => {
    mode = next;
    return {
      ...session(registries[next].registryDigest),
      mode: next,
      currentClientEpoch: '1',
      clientEpoch: '1',
      providerPolicyVersion: `provider-${next}`,
      appPolicyVersion: `app-${next}`,
      contextVersion: `context-${next}`,
    };
  };
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
  });
  await controller.initialize();
  await controller.setMode('BUILD');
  assert.equal(
    controller.getState().session.registryDigest,
    registries.BUILD.registryDigest,
  );
  assert.equal(controller.getState().session.contextVersion, 'context-BUILD');
  assert.equal(
    controller.getState().toolDescriptors[0].descriptor.name,
    'workspace.file.patch',
  );
  await controller.setMode('PLAY');
  assert.equal(
    controller.getState().session.registryDigest,
    registries.PLAY.registryDigest,
  );
  assert.equal(
    controller.getState().session.providerPolicyVersion,
    'provider-PLAY',
  );
  assert.equal(
    controller.getState().toolDescriptors[0].descriptor.name,
    'game.control.stop',
  );
  controller.destroy();
});

test('session creation derives the saved selected project and project switches fail closed', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  let createInput;
  transport.listSessions = async () => ({
    edges: [],
    pageInfo: { hasNextPage: false },
    nodes: [],
    hasNextPage: false,
  });
  transport.createSession = async (input) => {
    createInput = structuredClone(input);
    return {
      ...session(registry.registryDigest),
      projectId: input.projectId,
      gridId: input.gridId,
      mode: input.mode,
    };
  };
  const controller = new CrowdyStudioAgentController({
    transport,
    createSession: {
      appId: 'app-1',
      projectId: 'guessed-project',
      gridId: 'guessed-grid',
      mode: 'BUILD',
      idempotencyKey: 'create-project-bound',
    },
    resolveProjectBinding: async () => ({
      projectId: 'project-1',
      gridId: 'grid-1',
    }),
  });
  await controller.initialize();
  assert.equal(createInput.projectId, 'project-1');
  assert.equal(createInput.gridId, 'grid-1');
  assert.equal(controller.getState().session.projectId, 'project-1');

  controller.projectSelectionChanged('project-2');
  assert.equal(controller.getState().connection, 'ERROR');
  assert.equal(controller.getState().clientEpoch, null);
  assert.equal(
    controller.getState().lastError.code,
    'AGENT_CONTEXT_CHANGED',
  );
  controller.destroy();
});

test('Play heartbeat runs only while attached, active, and visible', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    heartbeatIntervalMs: 5,
  });
  await controller.initialize();
  await controller.setMode('PLAY');
  await new Promise((resolve) => setTimeout(resolve, 18));
  assert.ok(transport.heartbeats.length >= 2);
  assert.ok(controller.getState().playLeaseFreshUntil);

  controller.setPageVisible(false);
  const hiddenCount = transport.heartbeats.length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(transport.heartbeats.length, hiddenCount);

  controller.setPageVisible(true);
  await new Promise((resolve) => setTimeout(resolve, 8));
  assert.ok(transport.heartbeats.length > hiddenCount);
  await controller.pause();
  const pausedCount = transport.heartbeats.length;
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(transport.heartbeats.length, pausedCount);
  controller.destroy();
});

test('heartbeat freshness timeout fails closed locally', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  transport.heartbeat = async () => new Promise(() => {});
  const preemptions = [];
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    heartbeatIntervalMs: 2,
    heartbeatStaleMs: 8,
    onPreempt: (reason) => preemptions.push(reason),
  });
  await controller.initialize();
  await controller.setMode('PLAY');
  await new Promise((resolve) => setTimeout(resolve, 18));
  assert.equal(controller.getState().connection, 'DISCONNECTED');
  assert.equal(controller.getState().clientEpoch, null);
  assert.ok(preemptions.includes('DISCONNECTED'));
  controller.destroy();
});

test('workspace lease renews every interval and stops on human edit', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  const controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    workspaceRenewIntervalMs: 5,
  });
  await controller.initialize();
  await controller.setMode('BUILD');
  const lease = {
    leaseId: 'workspace-1',
    kind: 'WORKSPACE',
    status: 'ACTIVE',
    clientEpoch: '1',
    scopes: ['studio.project.write.server'],
    holder: 'Current player',
    expectedProjectRevision: '1',
    contextVersion: 'context-1',
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
  const granted = event(1, 'LEASE_GRANTED', { lease });
  transport.durable.push(granted);
  transport.subscriptions[0].handlers.next(structuredClone(granted));
  await new Promise((resolve) => setTimeout(resolve, 18));
  assert.ok(transport.workspaceRenewals.length >= 2);
  assert.equal(
    transport.workspaceRenewals[0].sessionId,
    'session-1',
  );
  assert.match(
    transport.workspaceRenewals[0].idempotencyKey,
    /renew-workspace-workspace-1/u,
  );

  controller.preemptForHumanEdit();
  const stoppedAt = transport.workspaceRenewals.length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(transport.workspaceRenewals.length, stoppedAt);
  assert.equal(transport.revocations.at(-1).reason, 'HUMAN_EDIT');
  controller.destroy();
});

test('lease revocation aborts browser handlers and rejects late results', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentBrowserToolDispatcher,
    CrowdyStudioAgentController,
  } = await import('../../dist/crowdy-agent/index.js');
  const transport = fakeTransport(registry);
  let controller;
  let started = false;
  let aborted = false;
  const dispatcher = new CrowdyAgentBrowserToolDispatcher({
    registry,
    handlers: {
      'workspace.tab.open': (_arguments, context) =>
        new Promise((_resolve, reject) => {
          started = true;
          context.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('late browser handler aborted'));
            },
            { once: true },
          );
        }),
    },
    getSessionId: () => 'session-1',
    getClientEpoch: () => controller?.getState().clientEpoch ?? null,
    getContextVersion: () =>
      controller?.getState().session?.contextVersion ?? 'context-1',
    getMode: () => 'BUILD',
  });
  controller = new CrowdyStudioAgentController({
    transport,
    sessionId: 'session-1',
    browserDispatcher: dispatcher,
    workspaceRenewIntervalMs: 60_000,
  });
  await controller.initialize();
  await controller.setMode('BUILD');
  const workspaceLease = {
    leaseId: 'workspace-late',
    kind: 'WORKSPACE',
    status: 'ACTIVE',
    clientEpoch: '1',
    scopes: ['studio.project.write.server'],
    holder: 'Current player',
    expectedProjectRevision: '1',
    contextVersion: 'context-1',
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
  const granted = event(1, 'LEASE_GRANTED', { lease: workspaceLease });
  transport.durable.push(granted);
  transport.subscriptions[0].handlers.next(structuredClone(granted));
  await settle();

  const entry = registry.require('workspace.tab.open', '1.0.0');
  const dispatched = event(2, 'TOOL_DISPATCHED', {
    toolCallId: 'late-tool',
    name: entry.descriptor.name,
    version: entry.descriptor.version,
    status: 'DISPATCHED',
    invocation: {
      protocolVersion: 'crowdy.tool-call/1',
      sessionId: 'session-1',
      runId: 'run-1',
      toolCallId: 'late-tool',
      name: entry.descriptor.name,
      version: entry.descriptor.version,
      descriptorDigest: entry.descriptorDigest,
      arguments: {
        source: 'PROJECT',
        target: 'SERVER',
        path: 'src/lib.rs',
      },
      argumentHash: `sha256:${'d'.repeat(64)}`,
      contextVersion: 'context-1',
      clientEpoch: '1',
      leaseId: 'workspace-late',
      deadline: new Date(Date.now() + 10_000).toISOString(),
    },
  });
  transport.durable.push(dispatched);
  transport.subscriptions[0].handlers.next(structuredClone(dispatched));
  for (let attempt = 0; attempt < 20 && !started; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const revoked = event(3, 'LEASE_REVOKED', {
    lease: {
      ...workspaceLease,
      status: 'REVOKED',
      revokedReason: 'HUMAN_EDIT',
    },
  });
  transport.durable.push(revoked);
  transport.subscriptions[0].handlers.next(structuredClone(revoked));
  await settle();
  const wasAborted = aborted;
  const didStart = started;
  const resultCount = transport.toolResults.length;
  controller.destroy();
  assert.equal(didStart, true);
  assert.equal(wasAborted, true);
  assert.equal(resultCount, 0);
});

test('reopening Studio attaches the last project session instead of creating another', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyStudioAgentController,
    pickResumableAgentSession,
  } = await import('../../dist/crowdy-agent/index.js');

  const empty = {
    ...session(registry.registryDigest),
    sessionId: 'session-empty',
    lastEventSeq: '2',
    createdAt: '2026-08-21T19:00:00Z',
    updatedAt: '2026-08-21T19:00:00Z',
  };
  const chat = {
    ...session(registry.registryDigest),
    sessionId: 'session-chat',
    lastEventSeq: '24',
    createdAt: '2026-08-21T18:00:00Z',
    updatedAt: '2026-08-21T18:30:00Z',
  };
  const otherProject = {
    ...session(registry.registryDigest),
    sessionId: 'session-other',
    projectId: 'project-2',
    lastEventSeq: '40',
    updatedAt: '2026-08-21T20:00:00Z',
  };

  assert.equal(
    pickResumableAgentSession([empty, chat, otherProject], {
      projectId: 'project-1',
      gridId: 'grid-1',
    })?.sessionId,
    'session-chat',
  );
  assert.equal(
    pickResumableAgentSession([empty, chat], {
      projectId: 'project-1',
      preferredSessionId: 'session-empty',
    })?.sessionId,
    'session-empty',
  );

  const transport = fakeTransport(registry);
  let created = 0;
  transport.listSessions = async () => ({
    edges: [
      { cursor: 'empty', node: structuredClone(empty) },
      { cursor: 'chat', node: structuredClone(chat) },
    ],
    pageInfo: { hasNextPage: false },
    nodes: [structuredClone(empty), structuredClone(chat)],
    hasNextPage: false,
  });
  transport.getSession = async (sessionId) =>
    structuredClone(sessionId === 'session-empty' ? empty : chat);
  transport.attachClient = async () => ({
    session: {
      ...structuredClone(chat),
      currentClientEpoch: '1',
      clientEpoch: '1',
    },
    clientEpoch: '1',
    replayAfterSeq: '0',
  });
  transport.createSession = async () => {
    created += 1;
    return structuredClone(chat);
  };
  const memory = new Map();
  const controller = new CrowdyStudioAgentController({
    transport,
    createSession: {
      appId: 'app-1',
      mode: 'ASK',
      idempotencyKey: 'should-not-create',
    },
    resolveProjectBinding: async () => ({
      projectId: 'project-1',
      gridId: 'grid-1',
    }),
    sessionMemory: {
      get: (key) => memory.get(key) ?? null,
      set: (key, value) => {
        memory.set(key, value);
      },
    },
  });
  await controller.initialize();
  assert.equal(created, 0);
  assert.equal(controller.getState().session.sessionId, 'session-chat');
  assert.equal(
    [...memory.values()].includes('session-chat'),
    true,
  );
  controller.destroy();
});
