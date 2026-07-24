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
  let epoch = 0;
  let currentSession = session(registry.registryDigest);
  return {
    durable,
    subscriptions,
    acknowledgements,
    approvals,
    toolResults,
    heartbeats,
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
      return {
        serverTime: new Date().toISOString(),
        playLeaseFreshUntil: new Date(Date.now() + 5_000).toISOString(),
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
    async revokeLease() {
      throw new Error('not used');
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
