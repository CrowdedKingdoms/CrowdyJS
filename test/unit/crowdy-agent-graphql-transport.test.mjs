import test from 'node:test';
import assert from 'node:assert/strict';

const SUBSET_NAMES = [
  'game.capabilities.get',
  'game.chat.send',
  'game.combat.attack',
  'game.control.look',
  'game.control.move',
  'game.control.stop',
  'game.craft',
  'game.interact',
  'game.inventory.consume',
  'game.inventory.select',
  'game.inventory.transfer',
  'game.mount',
  'game.observe',
  'game.travel.teleport',
  'project.checkpoint.list',
  'project.checkpoint.restore',
  'project.get',
  'project.list',
  'studio.context.get',
  'workspace.file.list',
  'workspace.file.patch',
  'workspace.file.read',
];

function run(status = 'RUNNING') {
  return {
    __typename: 'AgentRun',
    runId: 'run-1',
    status,
    providerRounds: 1,
    toolCalls: 1,
    errorCode: null,
    terminalReason: null,
    reason: null,
    startedAt: '2026-07-24T00:00:00Z',
    finishedAt: status === 'CANCELLED' ? '2026-07-24T00:00:03Z' : null,
    createdAt: '2026-07-24T00:00:00Z',
    cancelled: status === 'CANCELLED',
  };
}

function session(registryDigest, mode = 'BUILD') {
  return {
    __typename: 'AgentSession',
    contractVersion: 'crowdy.studio-agent/1',
    sessionId: 'session-1',
    appId: '42',
    projectId: 'project-1',
    gridId: '500',
    mode,
    requestedModel: 'fake/model',
    model: 'fake/model',
    resolvedModel: null,
    status: 'ACTIVE',
    providerDataConsent: true,
    registryDigest,
    providerPolicyVersion: 'platform-1',
    appPolicyVersion: 'app-1',
    contextVersion: 'context-1',
    currentClientEpoch: '1',
    clientEpoch: '1',
    lastEventSeq: '4',
    currentRun: run(),
    activeLeases: [],
    pendingApproval: null,
    createdAt: '2026-07-24T00:00:00Z',
    updatedAt: '2026-07-24T00:00:00Z',
    closedAt: null,
  };
}

function budget() {
  return {
    __typename: 'AgentBudget',
    dimensions: [{
      __typename: 'AgentBudgetDimension',
      name: 'TOOL_CALLS',
      scope: 'SESSION',
      limit: '20',
      reserved: '1',
      consumed: '1',
      remaining: '18',
      unit: 'calls',
    }],
    resetAt: null,
    platformFunded: true,
    payer: 'PLATFORM',
  };
}

function approval(status = 'PENDING') {
  return {
    __typename: 'AgentApproval',
    approvalId: 'approval-1',
    toolCallId: 'tool-1',
    argumentHash: `sha256:${'b'.repeat(64)}`,
    status,
    safeSummary: 'Read Studio context',
    clientEpoch: '1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    approved: status === 'GRANTED' || status === 'CONSUMED',
    rejected: status === 'DENIED',
  };
}

function lease(status = 'ACTIVE') {
  return {
    __typename: 'AgentLease',
    leaseId: 'lease-1',
    kind: 'PLAY',
    status,
    clientEpoch: '1',
    scopes: ['observe'],
    holder: 'user:current',
    contextVersion: 'context-1',
    controlledEntityId: 'player-1',
    hostCapabilityRevision: 'host-1',
    expectedProjectRevision: null,
    grantedAt: '2026-07-24T00:00:00Z',
    expiresAt: '2026-07-24T00:10:00Z',
    revokedReason: status === 'REVOKED' ? 'HUMAN_STOP' : null,
  };
}

function graphDescriptor(entry, canonicalJson) {
  const descriptor = entry.descriptor;
  return {
    __typename: 'AgentToolDescriptor',
    schemaVersion: descriptor.schemaVersion,
    name: descriptor.name,
    wireName: descriptor.wireName,
    version: descriptor.version,
    summary: descriptor.summary,
    executor: descriptor.executor,
    modes: [...descriptor.modes],
    risk: descriptor.risk.class,
    riskEffects: [...descriptor.risk.effects],
    riskReversible: descriptor.risk.reversible,
    scopes: descriptor.scopes.map((scope) => scope.scope),
    scopeRequirementsJson: canonicalJson(descriptor.scopes),
    approvalRequired: descriptor.approval.policy === 'REQUIRED',
    approvalPolicy: descriptor.approval.policy,
    approvalReasons: [...descriptor.approval.reasons],
    approvalMaxTtlSeconds: descriptor.approval.maxTtlSeconds,
    idempotencyClass: descriptor.idempotency.class,
    idempotencyKeyScope: descriptor.idempotency.keyScope,
    timeoutMs: descriptor.timeoutMs,
    inputSchemaJson: canonicalJson(descriptor.inputSchema),
    outputSchemaJson: canonicalJson(descriptor.outputSchema),
    inputRedactionJson: canonicalJson(descriptor.redaction.input),
    outputRedactionJson: canonicalJson(descriptor.redaction.output),
    maxPersistedBytes: descriptor.redaction.maxPersistedBytes,
    descriptorJson: canonicalJson(descriptor),
    descriptorDigest: entry.descriptorDigest,
  };
}

function baseEvent(seq, type, typename) {
  return {
    __typename: typename,
    protocolVersion: 'crowdy.agent-event/1',
    eventId: `event-${seq}`,
    sessionId: 'session-1',
    seq: String(seq),
    type,
    runId: 'run-1',
    version: 'crowdy.agent-event/1',
    createdAt: `2026-07-24T00:00:0${seq}Z`,
  };
}

function messageEvent(seq, type, content) {
  return {
    ...baseEvent(seq, type, 'AgentMessageEvent'),
    messageEventId: `message-${seq}`,
    messageRole: type === 'USER_MESSAGE' ? 'USER' : 'ASSISTANT',
    messageContent: content,
  };
}

async function harness({ heartbeatError } = {}) {
  const agent = await import('../../dist/crowdy-agent/index.js');
  const generated = await import('../../dist/generated/graphql.js');
  const { CrowdyGraphQLError } = await import('../../dist/index.js');
  const subsetEntries = SUBSET_NAMES.map((name) =>
    agent.CROWDY_AGENT_TOOL_REGISTRY_V1.require(name, '1.0.0'),
  );
  const buildRegistry = new agent.CrowdyAgentToolRegistry(
    subsetEntries
      .filter((entry) => entry.descriptor.modes.includes('BUILD'))
      .map((entry) => entry.descriptor),
  );
  const studioEntry = agent.CROWDY_AGENT_TOOL_REGISTRY_V1.require(
    'studio.context.get',
    '1.0.0',
  );
  const playRegistry = new agent.CrowdyAgentToolRegistry([
    ...subsetEntries
      .filter((entry) => entry.descriptor.modes.includes('PLAY'))
      .map((entry) => entry.descriptor),
  ]);
  let mode = 'BUILD';
  const calls = [];
  const historyCalls = [];
  const toolResults = [];
  const heartbeatCalls = [];
  let wsSink;
  let wsPayload;
  const graph = {
    async request(document, variables) {
      calls.push({ document, variables: structuredClone(variables) });
      if (document === generated.CrowdyStudioAgentSessionDocument) {
        return {
          crowdyStudioAgentSession: session(buildRegistry.registryDigest),
        };
      }
      if (document === generated.CrowdyStudioAgentSessionsDocument) {
        const node = session(buildRegistry.registryDigest);
        return {
          crowdyStudioAgentSessions: {
            __typename: 'AgentSessionConnection',
            edges: [{
              __typename: 'AgentSessionEdge',
              cursor: 'session-cursor-1',
              node,
            }],
            pageInfo: {
              __typename: 'AgentPageInfo',
              hasNextPage: false,
              endCursor: 'session-cursor-1',
            },
            nodes: [node],
            endCursor: 'session-cursor-1',
            hasNextPage: false,
          },
        };
      }
      if (document === generated.CrowdyStudioAgentCreateSessionDocument) {
        return {
          crowdyStudioAgentCreateSession: session(
            buildRegistry.registryDigest,
          ),
        };
      }
      if (document === generated.CrowdyStudioAgentAttachClientDocument) {
        return {
          crowdyStudioAgentAttachClient: {
            __typename: 'AgentClientAttachment',
            session: session(buildRegistry.registryDigest),
            clientEpoch: '1',
            replayAfterSeq: '1',
          },
        };
      }
      if (document === generated.CrowdyStudioAgentToolDescriptorsDocument) {
        const registry = mode === 'PLAY' ? playRegistry : buildRegistry;
        return {
          crowdyStudioAgentToolDescriptors: {
            __typename: 'AgentToolDescriptorSet',
            registryDigest: registry.registryDigest,
            tools: registry
              .list()
              .map((entry) => graphDescriptor(entry, agent.canonicalJson)),
          },
        };
      }
      if (document === generated.CrowdyStudioAgentBudgetDocument) {
        return { crowdyStudioAgentBudget: budget() };
      }
      if (document === generated.CrowdyStudioAgentHistoryDocument) {
        historyCalls.push(structuredClone(variables));
        const events =
          variables.afterSeq === '2'
            ? [messageEvent(3, 'USER_MESSAGE', 'replayed user message')]
            : [];
        return {
          crowdyStudioAgentHistory: {
            __typename: 'AgentEventConnection',
            edges: events.map((event) => ({
              __typename: 'AgentEventEdge',
              cursor: event.seq,
              node: event,
            })),
            pageInfo: {
              __typename: 'AgentPageInfo',
              hasNextPage: false,
              endCursor: events.at(-1)?.seq ?? null,
            },
            events,
            hasMore: false,
          },
        };
      }
      if (document === generated.CrowdyStudioAgentSendMessageDocument) {
        return { crowdyStudioAgentSendMessage: run() };
      }
      if (document === generated.CrowdyStudioAgentApproveToolDocument) {
        return { crowdyStudioAgentApproveTool: approval('GRANTED') };
      }
      if (document === generated.CrowdyStudioAgentRejectToolDocument) {
        return { crowdyStudioAgentRejectTool: approval('DENIED') };
      }
      if (document === generated.CrowdyStudioAgentToolResultDocument) {
        toolResults.push(structuredClone(variables));
        return {
          crowdyStudioAgentToolResult: {
            __typename: 'AgentToolCall',
            toolCallId: variables.input.result.toolCallId,
            toolName: 'studio.context.get',
            status: variables.input.result.status,
            argumentHash: `sha256:${'b'.repeat(64)}`,
            error: null,
            accepted: true,
          },
        };
      }
      if (document === generated.CrowdyStudioAgentAcknowledgeEventsDocument) {
        return {
          crowdyStudioAgentAcknowledgeEvents: {
            __typename: 'AgentEventAcknowledgement',
            throughSeq: variables.input.throughSeq,
          },
        };
      }
      if (document === generated.CrowdyStudioAgentCancelRunDocument) {
        return { crowdyStudioAgentCancelRun: run('CANCELLED') };
      }
      if (document === generated.CrowdyStudioAgentGrantLeaseDocument) {
        return { crowdyStudioAgentGrantLease: lease('ACTIVE') };
      }
      if (document === generated.CrowdyStudioAgentRevokeLeaseDocument) {
        return { crowdyStudioAgentRevokeLease: lease('REVOKED') };
      }
      if (document === generated.CrowdyStudioAgentSetModeDocument) {
        mode = variables.input.mode;
        const registry = mode === 'PLAY' ? playRegistry : buildRegistry;
        return {
          crowdyStudioAgentSetMode: session(registry.registryDigest, mode),
        };
      }
      if (document === generated.CrowdyStudioAgentHeartbeatDocument) {
        heartbeatCalls.push(structuredClone(variables));
        if (heartbeatError) {
          throw new CrowdyGraphQLError([{
            message: 'Agent platform was killed',
            extensions: { code: heartbeatError },
          }]);
        }
        return {
          crowdyStudioAgentHeartbeat: {
            __typename: 'AgentHeartbeat',
            serverTime: new Date().toISOString(),
            playLeaseFreshUntil: new Date(Date.now() + 5_000).toISOString(),
          },
        };
      }
      if (document === generated.CrowdyStudioAgentPauseDocument) {
        return {
          crowdyStudioAgentPause: {
            ...session(
              mode === 'PLAY'
                ? playRegistry.registryDigest
                : buildRegistry.registryDigest,
              mode,
            ),
            status: 'PAUSED',
          },
        };
      }
      if (document === generated.CrowdyStudioAgentResumeDocument) {
        return {
          crowdyStudioAgentResume: session(
            mode === 'PLAY'
              ? playRegistry.registryDigest
              : buildRegistry.registryDigest,
            mode,
          ),
        };
      }
      if (document === generated.CrowdyStudioAgentCloseSessionDocument) {
        return {
          crowdyStudioAgentCloseSession: {
            ...session(
              mode === 'PLAY'
                ? playRegistry.registryDigest
                : buildRegistry.registryDigest,
              mode,
            ),
            status: 'CLOSED',
            closedAt: '2026-07-24T00:20:00Z',
          },
        };
      }
      throw new Error(`Unexpected generated document: ${String(document)}`);
    },
  };
  const subscriptionClient = {
    subscribe(payload, sink) {
      wsPayload = payload;
      wsSink = sink;
      return () => {};
    },
    dispose() {},
  };
  const transport = new agent.CrowdyAgentGraphQLTransport(graph, {
    getToken: () => 'app-token',
    subscriptionClientFactory: () => subscriptionClient,
  });
  let controller;
  const dispatcher = new agent.CrowdyAgentBrowserToolDispatcher({
    registry: agent.CROWDY_AGENT_TOOL_REGISTRY_V1,
    handlers: {
      'studio.context.get': () => ({
        appRef: '42',
        projectRef: 'project-1',
        gridRef: '500',
        contextVersion: 'context-1',
        saveState: 'SAVED',
        runtime: {
          phase: 'IDLE',
          savedRevision: '1',
          sync: 'NEVER_RUN',
        },
        clientEpoch: '1',
        leaseKinds: [],
      }),
    },
    getSessionId: () => controller?.getState().session?.sessionId ?? null,
    getClientEpoch: () => controller?.getState().clientEpoch ?? null,
    getContextVersion: () =>
      controller?.getState().session?.contextVersion ?? 'context-1',
    getMode: () => controller?.getState().session?.mode ?? 'BUILD',
  });
  const preemptions = [];
  controller = new agent.CrowdyStudioAgentController({
    transport,
    createSession: {
      appId: '42',
      projectId: 'project-1',
      gridId: '500',
      mode: 'BUILD',
      requestedModel: 'fake/model',
      providerDataConsent: true,
      idempotencyKey: 'create-1',
    },
    clientInstanceId: '11111111-1111-4111-8111-111111111111',
    browserDispatcher: dispatcher,
    heartbeatIntervalMs: 5,
    createIdempotencyKey: (operation) => `key:${operation}`,
    onPreempt: (reason) => preemptions.push(reason),
  });
  return {
    agent,
    generated,
    transport,
    controller,
    calls,
    historyCalls,
    toolResults,
    heartbeatCalls,
    preemptions,
    get wsSink() {
      return wsSink;
    },
    get wsPayload() {
      return wsPayload;
    },
    studioEntry,
  };
}

async function settle(ms = 15) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test('generated transport runs create, attach, dispatch, result, heartbeat, replay, and cancel', async () => {
  const value = await harness();
  await value.controller.initialize();
  assert.equal(value.controller.getState().lastContiguousSeq, '1');
  assert.equal(value.wsPayload.variables.afterSeq, '1');
  assert.equal(value.wsPayload.variables.clientEpoch, '1');
  assert.match(value.wsPayload.query, /subscription CrowdyStudioAgentEvents/);

  const create = value.calls.find(
    (call) =>
      call.document === value.generated.CrowdyStudioAgentCreateSessionDocument,
  );
  assert.equal(create.variables.input.providerDataConsent, true);
  const attach = value.calls.find(
    (call) =>
      call.document === value.generated.CrowdyStudioAgentAttachClientDocument,
  );
  assert.equal(
    attach.variables.input.clientInstanceId,
    '11111111-1111-4111-8111-111111111111',
  );

  await value.controller.sendMessage('Build this safely');
  const send = value.calls.find(
    (call) =>
      call.document === value.generated.CrowdyStudioAgentSendMessageDocument,
  );
  assert.equal(send.variables.input.content, 'Build this safely');

  const entry = value.studioEntry;
  value.wsSink.next({
    data: {
      crowdyStudioAgentEvents: {
        ...baseEvent(2, 'TOOL_DISPATCHED', 'AgentToolEvent'),
        toolEventCallId: 'tool-1',
        toolEventName: entry.descriptor.name,
        toolEventVersion: entry.descriptor.version,
        toolStatus: 'DISPATCHED',
        toolSafeSummary: 'Read Studio context',
        toolDescriptorDigest: entry.descriptorDigest,
        toolArgumentHash: `sha256:${'b'.repeat(64)}`,
        toolExecutor: 'BROWSER',
        toolContextVersion: 'context-1',
        toolClientEpoch: '1',
        toolArgumentsJson: '{}',
        toolLeaseId: null,
        toolApprovalGrant: null,
        toolIdempotencyKey: null,
        toolResultJson: null,
        toolInvocation: {
          __typename: 'AgentToolInvocation',
          protocolVersion: 'crowdy.tool-call/1',
          sessionId: 'session-1',
          runId: 'run-1',
          toolCallId: 'tool-1',
          name: entry.descriptor.name,
          version: entry.descriptor.version,
          descriptorDigest: entry.descriptorDigest,
          argumentsJson: '{}',
          argumentHash: `sha256:${'b'.repeat(64)}`,
          contextVersion: 'context-1',
          clientEpoch: '1',
          leaseId: null,
          approvalGrant: null,
          idempotencyKey: null,
          deadline: new Date(Date.now() + 10_000).toISOString(),
        },
        toolResult: null,
        toolError: null,
        toolDeadline: new Date(Date.now() + 10_000).toISOString(),
      },
    },
  });
  await settle();
  assert.equal(value.toolResults.length, 1);
  assert.equal(value.toolResults[0].input.result.toolCallId, 'tool-1');
  assert.equal(value.toolResults[0].input.result.protocolVersion, 'crowdy.tool-result/1');
  assert.deepEqual(
    JSON.parse(value.toolResults[0].input.result.outputJson),
    {
      appRef: '42',
      clientEpoch: '1',
      contextVersion: 'context-1',
      gridRef: '500',
      leaseKinds: [],
      projectRef: 'project-1',
      runtime: {
        phase: 'IDLE',
        savedRevision: '1',
        sync: 'NEVER_RUN',
      },
      saveState: 'SAVED',
    },
  );

  value.wsSink.next({
    data: {
      crowdyStudioAgentEvents: messageEvent(
        4,
        'ASSISTANT_MESSAGE',
        'replayed answer',
      ),
    },
  });
  await settle();
  assert.equal(value.controller.getState().lastContiguousSeq, '4');
  assert.ok(
    value.historyCalls.some((input) => input.afterSeq === '2'),
    'sequence gap should query durable history after seq 2',
  );
  assert.deepEqual(
    value.controller.getState().messages.map((message) => message.messageId),
    ['message-3', 'message-4'],
  );

  await value.controller.cancelRun('run-1');
  const cancel = value.calls.find(
    (call) =>
      call.document === value.generated.CrowdyStudioAgentCancelRunDocument,
  );
  assert.equal(cancel.variables.input.runId, 'run-1');

  await value.controller.setMode('PLAY');
  await settle();
  assert.ok(value.heartbeatCalls.length >= 1);
  assert.equal(value.heartbeatCalls[0].input.clientEpoch, '1');
  value.controller.destroy();
});

test('generated transport maps every remaining Relay and control result shape', async () => {
  const value = await harness();
  const loaded = await value.transport.getSession('session-1');
  assert.equal(loaded.appId, '42');
  assert.equal(loaded.currentRun.runId, 'run-1');
  assert.deepEqual(loaded.activeLeases, []);

  const sessions = await value.transport.listSessions({
    appId: '42',
    first: 20,
  });
  assert.equal(sessions.edges[0].cursor, 'session-cursor-1');
  assert.equal(sessions.pageInfo.endCursor, 'session-cursor-1');
  assert.equal(sessions.nodes[0].sessionId, 'session-1');

  const descriptors = await value.transport.toolDescriptors('session-1');
  assert.equal(descriptors.tools.length, 8);
  const limits = await value.transport.budget('session-1');
  assert.equal(limits.dimensions[0].scope, 'SESSION');

  const context = {
    sessionId: 'session-1',
    clientEpoch: '1',
    idempotencyKey: 'control-key',
  };
  const approved = await value.transport.approveTool({
    ...context,
    toolCallId: 'tool-1',
    argumentHash: `sha256:${'b'.repeat(64)}`,
  });
  assert.equal(approved.status, 'GRANTED');
  const rejected = await value.transport.rejectTool({
    ...context,
    toolCallId: 'tool-1',
    argumentHash: `sha256:${'b'.repeat(64)}`,
    reason: 'No',
  });
  assert.equal(rejected.rejected, true);

  const granted = await value.transport.grantLease({
    ...context,
    scopes: ['observe'],
    durationSeconds: 60,
    controlledEntityId: 'player-1',
    hostCapabilityRevision: 'host-1',
  });
  assert.equal(granted.expectedProjectRevision, undefined);
  const revoked = await value.transport.revokeLease({
    ...context,
    leaseId: 'lease-1',
    reason: 'HUMAN_STOP',
  });
  assert.equal(revoked.status, 'REVOKED');

  const paused = await value.transport.pause(context);
  assert.equal(paused.status, 'PAUSED');
  const resumed = await value.transport.resume(context);
  assert.equal(resumed.status, 'ACTIVE');
  const closed = await value.transport.closeSession(context);
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedAt, '2026-07-24T00:20:00Z');
  value.transport.close();
});

test('stale subscription epoch and heartbeat kill fail closed', async () => {
  const stale = await harness();
  await stale.controller.initialize();
  stale.wsSink.next({
    errors: [{
      message: 'Old browser epoch',
      extensions: { code: 'AGENT_CLIENT_EPOCH_STALE' },
    }],
  });
  await settle();
  assert.equal(stale.controller.getState().connection, 'DISCONNECTED');
  assert.equal(stale.controller.getState().clientEpoch, null);
  assert.ok(stale.preemptions.includes('CLIENT_REATTACHED'));
  stale.controller.destroy();

  const killed = await harness({ heartbeatError: 'AGENT_OPERATOR_KILLED' });
  await killed.controller.initialize();
  await killed.controller.setMode('PLAY');
  await settle();
  assert.equal(killed.controller.getState().connection, 'DISCONNECTED');
  assert.equal(
    killed.controller.getState().lastError.code,
    'AGENT_OPERATOR_KILLED',
  );
  assert.ok(killed.preemptions.includes('OPERATOR_KILL'));
  killed.controller.destroy();
});
