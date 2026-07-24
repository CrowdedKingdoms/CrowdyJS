import test from 'node:test';
import assert from 'node:assert/strict';

const COMMANDS = [
  ['game.control.move', 'MOVE', 'locomotion'],
  ['game.control.look', 'LOOK', 'locomotion'],
  ['game.inventory.select', 'INVENTORY_SELECT', 'interact'],
  ['game.inventory.consume', 'INVENTORY_CONSUME', 'interact'],
  ['game.inventory.transfer', 'INVENTORY_TRANSFER', 'interact'],
  ['game.interact', 'INTERACT', 'interact'],
  ['game.craft', 'CRAFT', 'craft'],
  ['game.mount', 'MOUNT', 'locomotion'],
  ['game.combat.attack', 'COMBAT_ATTACK', 'combat'],
  ['game.chat.send', 'CHAT_SEND', 'communicate'],
  ['game.travel.teleport', 'TRAVEL_TELEPORT', 'travel'],
  ['game.control.stop', 'STOP', null],
];

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

function capabilities(now) {
  return {
    contractVersion: 'crowdy.player-host/1',
    gameId: 'blocks-with-friends',
    revision: 'host-capability-1',
    controlledEntityId: 'player-1',
    commands: COMMANDS.map(([toolName, kind, scope]) => ({
      kind,
      toolName,
      ...(scope ? { requiredScope: scope } : {}),
      risk: 'WORLD_CONTROL',
      approval: kind === 'COMBAT_ATTACK' ? 'CONDITIONAL' : 'NONE',
      rateLimitPerSecond: 50,
    })),
    observation: {
      maxAgeMs: 5_000,
      maxNearbyActors: 16,
      maxNearbyVoxels: 32,
    },
    advertisedAt: new Date(now).toISOString(),
  };
}

function observation(now) {
  return {
    contractVersion: 'crowdy.game-observation/1',
    observationId: 'observation-1',
    capabilityRevision: 'host-capability-1',
    controlledEntityId: 'player-1',
    observedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5_000).toISOString(),
    player: {
      position: { x: '0', y: '64', z: '0' },
      velocity: { x: '0', y: '0', z: '0' },
      look: { yaw: '0', pitch: '0' },
      health: '20',
      alive: true,
    },
    controlledEntity: {
      kind: 'PLAYER',
      position: { x: '0', y: '64', z: '0' },
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

function session(registryDigest) {
  return {
    __typename: 'AgentSession',
    contractVersion: 'crowdy.studio-agent/1',
    sessionId: 'session-play',
    appId: '42',
    projectId: null,
    gridId: '500',
    mode: 'PLAY',
    requestedModel: 'fake/model',
    model: 'fake/model',
    resolvedModel: null,
    status: 'ACTIVE',
    providerDataConsent: false,
    registryDigest,
    providerPolicyVersion: 'platform-1',
    appPolicyVersion: 'app-1',
    contextVersion: 'context-play',
    currentClientEpoch: '1',
    clientEpoch: '1',
    lastEventSeq: '0',
    currentRun: null,
    activeLeases: [{
      __typename: 'AgentLease',
      leaseId: 'lease-play',
      kind: 'PLAY',
      status: 'ACTIVE',
      clientEpoch: '1',
      scopes: [
        'observe',
        'locomotion',
        'interact',
        'craft',
        'combat',
        'communicate',
        'travel',
      ],
      holder: 'Current player',
      contextVersion: 'context-play',
      controlledEntityId: 'player-1',
      hostCapabilityRevision: 'host-capability-1',
      expectedProjectRevision: null,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedReason: null,
    }],
    pendingApproval: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  };
}

function toolEvent(seq, entry, argumentsValue, options = {}) {
  const toolCallId = `tool-${seq}`;
  return {
    __typename: 'AgentToolEvent',
    protocolVersion: 'crowdy.agent-event/1',
    eventId: `event-${seq}`,
    sessionId: 'session-play',
    seq: String(seq),
    type: 'TOOL_DISPATCHED',
    runId: 'run-play',
    version: 'crowdy.agent-event/1',
    createdAt: new Date().toISOString(),
    toolEventCallId: toolCallId,
    toolEventName: entry.descriptor.name,
    toolEventVersion: entry.descriptor.version,
    toolStatus: 'DISPATCHED',
    toolSafeSummary: `Dispatch ${entry.descriptor.name}`,
    toolDescriptorDigest: entry.descriptorDigest,
    toolArgumentHash: `sha256:${String(seq % 10).repeat(64)}`,
    toolExecutor: 'BROWSER',
    toolContextVersion: 'context-play',
    toolClientEpoch: '1',
    toolArgumentsJson: JSON.stringify(argumentsValue),
    toolLeaseId: options.leaseId ?? null,
    toolApprovalGrant: options.approvalGrant ?? null,
    toolIdempotencyKey: null,
    toolResultJson: null,
    toolInvocation: {
      __typename: 'AgentToolInvocation',
      protocolVersion: 'crowdy.tool-call/1',
      sessionId: 'session-play',
      runId: 'run-play',
      toolCallId,
      name: entry.descriptor.name,
      version: entry.descriptor.version,
      descriptorDigest: entry.descriptorDigest,
      argumentsJson: JSON.stringify(argumentsValue),
      argumentHash: `sha256:${String(seq % 10).repeat(64)}`,
      contextVersion: 'context-play',
      clientEpoch: '1',
      leaseId: options.leaseId ?? null,
      approvalGrant: options.approvalGrant ?? null,
      idempotencyKey: null,
      deadline: new Date(Date.now() + 10_000).toISOString(),
    },
    toolResult: null,
    toolError: null,
    toolDeadline: new Date(Date.now() + 10_000).toISOString(),
  };
}

function commandArguments(name) {
  const planned = {
    observationId: 'observation-1',
    capabilityRevision: 'host-capability-1',
    controlledEntityId: 'player-1',
  };
  const values = {
    'game.control.move': {
      ...planned,
      direction: 'FORWARD',
      intensity: 1,
      durationMs: 100,
    },
    'game.control.look': { ...planned, deltaYaw: 5, deltaPitch: -2 },
    'game.inventory.select': { ...planned, slot: 1 },
    'game.inventory.consume': { ...planned, slot: 1, quantity: 1 },
    'game.inventory.transfer': {
      ...planned,
      direction: 'TO_CONTAINER',
      slot: 1,
      quantity: 1,
      containerRef: 'chest-1',
    },
    'game.interact': {
      ...planned,
      action: 'USE',
      targetRef: 'door-1',
    },
    'game.craft': { ...planned, recipeId: 'plank', quantity: 1 },
    'game.mount': { ...planned, action: 'DISMOUNT' },
    'game.combat.attack': {
      ...planned,
      targetRef: 'mob-1',
      attack: 'PRIMARY',
    },
    'game.chat.send': {
      ...planned,
      channel: 'LOCAL',
      text: 'Hello',
    },
    'game.travel.teleport': {
      ...planned,
      destinationRef: 'spawn',
    },
    'game.control.stop': {},
  };
  return values[name];
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for result');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

test('all 14 game descriptors dispatch through generated transport and PlayerHostAdapter', async () => {
  const agent = await import('../../dist/crowdy-agent/index.js');
  const playerHost = await import('../../dist/player-host/index.js');
  const generated = await import('../../dist/generated/graphql.js');
  const now = Date.now();
  const hostDispatches = [];
  const clearReasons = [];
  let capabilityReads = 0;
  let observationReads = 0;
  const adapter = {
    contractVersion: 'crowdy.player-host/1',
    async capabilities() {
      capabilityReads += 1;
      return capabilities(now);
    },
    async observe() {
      observationReads += 1;
      return observation(now);
    },
    async dispatch(command) {
      hostDispatches.push(command);
      return {
        contractVersion: 'crowdy.game-command-result/1',
        status: 'SUCCEEDED',
        commandKind: command.kind,
        observationId: command.observationId,
      };
    },
    clearAgentIntent(reason) {
      clearReasons.push(reason);
    },
  };
  let controller;
  const hostTools = playerHost.createPlayerHostAgentTools(adapter, {
    now: () => now,
    contextVersion: () => 'context-play',
  });
  const gameEntries = agent.CROWDY_AGENT_TOOL_REGISTRY_V1
    .list()
    .filter((entry) => entry.descriptor.name.startsWith('game.'));
  assert.equal(gameEntries.length, 14);
  const studioContext = agent.CROWDY_AGENT_TOOL_REGISTRY_V1.require(
    'studio.context.get',
    '1.0.0',
  );
  const playRegistry = new agent.CrowdyAgentToolRegistry([
    studioContext.descriptor,
    ...gameEntries.map((entry) => entry.descriptor),
  ]);
  const toolResults = [];
  const heartbeatCalls = [];
  let wsSink;
  const graph = {
    async request(document, variables) {
      if (document === generated.CrowdyStudioAgentSessionDocument) {
        return {
          crowdyStudioAgentSession: session(playRegistry.registryDigest),
        };
      }
      if (document === generated.CrowdyStudioAgentAttachClientDocument) {
        return {
          crowdyStudioAgentAttachClient: {
            __typename: 'AgentClientAttachment',
            session: session(playRegistry.registryDigest),
            clientEpoch: '1',
            replayAfterSeq: '0',
          },
        };
      }
      if (document === generated.CrowdyStudioAgentToolDescriptorsDocument) {
        return {
          crowdyStudioAgentToolDescriptors: {
            __typename: 'AgentToolDescriptorSet',
            registryDigest: playRegistry.registryDigest,
            tools: playRegistry
              .list()
              .map((entry) => graphDescriptor(entry, agent.canonicalJson)),
          },
        };
      }
      if (document === generated.CrowdyStudioAgentBudgetDocument) {
        return {
          crowdyStudioAgentBudget: {
            __typename: 'AgentBudget',
            dimensions: [],
            resetAt: null,
            platformFunded: true,
            payer: 'PLATFORM',
          },
        };
      }
      if (document === generated.CrowdyStudioAgentHistoryDocument) {
        return {
          crowdyStudioAgentHistory: {
            __typename: 'AgentEventConnection',
            edges: [],
            pageInfo: {
              __typename: 'AgentPageInfo',
              hasNextPage: false,
              endCursor: null,
            },
            events: [],
            hasMore: false,
          },
        };
      }
      if (document === generated.CrowdyStudioAgentHeartbeatDocument) {
        heartbeatCalls.push(structuredClone(variables));
        return {
          crowdyStudioAgentHeartbeat: {
            __typename: 'AgentHeartbeat',
            serverTime: new Date().toISOString(),
            playLeaseFreshUntil: new Date(Date.now() + 5_000).toISOString(),
          },
        };
      }
      if (document === generated.CrowdyStudioAgentToolResultDocument) {
        toolResults.push(structuredClone(variables.input.result));
        return {
          crowdyStudioAgentToolResult: {
            __typename: 'AgentToolCall',
            toolCallId: variables.input.result.toolCallId,
            toolName: 'game.test',
            status: variables.input.result.status,
            argumentHash: `sha256:${'a'.repeat(64)}`,
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
      throw new Error('Unexpected generated document');
    },
  };
  const transport = new agent.CrowdyAgentGraphQLTransport(graph, {
    getToken: () => 'app-token',
    subscriptionClientFactory: () => ({
      subscribe(_payload, sink) {
        wsSink = sink;
        return () => {};
      },
      dispose() {},
    }),
  });
  const dispatcher = new agent.CrowdyAgentBrowserToolDispatcher({
    registry: agent.CROWDY_AGENT_TOOL_REGISTRY_V1,
    handlers: hostTools.handlers,
    getSessionId: () => controller?.getState().session?.sessionId ?? null,
    getClientEpoch: () => controller?.getState().clientEpoch ?? null,
    getContextVersion: () => 'context-play',
    getMode: () => 'PLAY',
  });
  controller = new agent.CrowdyStudioAgentController({
    transport,
    sessionId: 'session-play',
    browserDispatcher: dispatcher,
    heartbeatIntervalMs: 5,
    onEpochAttached: (epoch) => hostTools.leaseManager.attach(epoch),
    onPreempt: (reason) => hostTools.leaseManager.preempt(reason),
  });
  await controller.initialize();
  await hostTools.leaseManager.refreshCapabilities();
  hostTools.leaseManager.grantLease({
    leaseId: 'lease-play',
    kind: 'PLAY',
    status: 'ACTIVE',
    clientEpoch: '1',
    scopes: [
      'observe',
      'locomotion',
      'interact',
      'craft',
      'combat',
      'communicate',
      'travel',
    ],
    holder: 'Current player',
    controlledEntityId: 'player-1',
    hostCapabilityRevision: 'host-capability-1',
    contextVersion: 'context-play',
    grantedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  });

  let seq = 1;
  const dispatch = async (name, argumentsValue, options = {}) => {
    const before = toolResults.length;
    const entry = agent.CROWDY_AGENT_TOOL_REGISTRY_V1.require(name, '1.0.0');
    wsSink.next({
      data: {
        crowdyStudioAgentEvents: toolEvent(
          seq++,
          entry,
          argumentsValue,
          options,
        ),
      },
    });
    await waitFor(() => toolResults.length === before + 1);
    return toolResults.at(-1);
  };

  const capabilityResult = await dispatch('game.capabilities.get', {});
  assert.equal(capabilityResult.status, 'SUCCEEDED');
  const observeResult = await dispatch('game.observe', {
    detail: 'STANDARD',
    maxNearbyActors: 8,
    maxNearbyVoxels: 8,
  }, {
    leaseId: 'lease-play',
  });
  assert.equal(observeResult.status, 'SUCCEEDED');

  for (const [name] of COMMANDS.filter(([candidate]) => candidate !== 'game.control.stop')) {
    if (name === 'game.combat.attack') {
      const denied = await dispatch(name, commandArguments(name), {
        leaseId: 'lease-play',
      });
      assert.equal(denied.status, 'FAILED');
      assert.equal(denied.errorCode, 'AGENT_APPROVAL_REQUIRED');
    }
    const result = await dispatch(name, commandArguments(name), {
      leaseId: 'lease-play',
      ...(name === 'game.combat.attack'
        ? { approvalGrant: 'opaque-combat-approval' }
        : {}),
    });
    assert.equal(result.status, 'SUCCEEDED', name);
    assert.equal(JSON.parse(result.outputJson).status, 'SUCCEEDED', name);
  }

  const stopResult = await dispatch('game.control.stop', {});
  assert.equal(stopResult.status, 'SUCCEEDED');
  assert.equal(JSON.parse(stopResult.outputJson).commandKind, 'STOP');
  assert.equal(clearReasons.at(-1), 'HUMAN_STOP');
  assert.equal(capabilityReads >= 1, true);
  assert.equal(observationReads, 1);
  assert.deepEqual(
    new Set(hostDispatches.map((command) => command.kind)),
    new Set(
      COMMANDS.map(([, kind]) => kind).filter((kind) => kind !== 'STOP'),
    ),
  );
  await waitFor(() => heartbeatCalls.length >= 1);
  assert.equal(toolResults.length, 15);
  controller.destroy();
});
