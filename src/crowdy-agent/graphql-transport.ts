import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createClient as createWsClient } from 'graphql-ws';
import { print } from 'graphql';
import type { GraphQLClient } from '../client.js';
import {
  CrowdyGraphQLError,
  type CrowdyGraphQLErrorPayload,
} from '../errors.js';
import {
  CrowdyStudioAgentAcknowledgeEventsDocument,
  CrowdyStudioAgentApproveToolDocument,
  CrowdyStudioAgentAttachClientDocument,
  CrowdyStudioAgentBudgetDocument,
  CrowdyStudioAgentCancelRunDocument,
  CrowdyStudioAgentCloseSessionDocument,
  CrowdyStudioAgentCreateSessionDocument,
  CrowdyStudioAgentEventsDocument,
  CrowdyStudioAgentGrantLeaseDocument,
  CrowdyStudioAgentHeartbeatDocument,
  CrowdyStudioAgentHistoryDocument,
  CrowdyStudioAgentPauseDocument,
  CrowdyStudioAgentRejectToolDocument,
  CrowdyStudioAgentResumeDocument,
  CrowdyStudioAgentRevokeLeaseDocument,
  CrowdyStudioAgentSendMessageDocument,
  CrowdyStudioAgentSessionDocument,
  CrowdyStudioAgentSessionsDocument,
  CrowdyStudioAgentSetModeDocument,
  CrowdyStudioAgentToolDescriptorsDocument,
  CrowdyStudioAgentToolResultDocument,
  CrowdyStudioAgentMode,
  CrowdyStudioAgentToolResultStatus,
  type CrowdyAgentApprovalFieldsFragment,
  type CrowdyAgentBudgetFieldsFragment,
  type CrowdyAgentEventFieldsFragment,
  type CrowdyAgentLeaseFieldsFragment,
  type CrowdyAgentRunFieldsFragment,
  type CrowdyAgentSessionFieldsFragment,
  type CrowdyAgentToolDescriptorFieldsFragment,
} from '../generated/graphql.js';
import {
  CrowdyAgentError,
  type CrowdyAgentErrorCode,
} from './errors.js';
import {
  canonicalJson,
  digestCanonicalJson,
} from './schema.js';
import { CrowdyAgentToolRegistry } from './registry.js';
import type {
  CrowdyAgentApprovalV1,
  CrowdyAgentBudgetDimensionV1,
  CrowdyAgentBudgetV1,
  CrowdyAgentEventType,
  CrowdyAgentEventV1,
  CrowdyAgentHeartbeatV1,
  CrowdyAgentLeaseV1,
  CrowdyAgentMessageV1,
  CrowdyAgentMode,
  CrowdyAgentRegisteredToolV1,
  CrowdyAgentRunV1,
  CrowdyAgentSessionV1,
  CrowdyAgentToolCallAckV1,
  CrowdyAgentToolDescriptorV1,
  CrowdyAgentToolInvocationV1,
  CrowdyAgentToolResultV1,
} from './types.js';
import type {
  CrowdyAgentConnectionV1,
  CrowdyAgentCreateSessionInputV1,
  CrowdyAgentEventSubscriptionHandlersV1,
  CrowdyAgentEventSubscriptionV1,
  CrowdyAgentHistoryPageV1,
  CrowdyStudioAgentTransportV1,
} from './transport.js';

export interface CrowdyAgentGraphQLSubscriptionClient {
  subscribe(
    payload: {
      query: string;
      variables: Readonly<Record<string, unknown>>;
    },
    sink: {
      next(value: { data?: unknown; errors?: readonly unknown[] }): void;
      error(error: unknown): void;
      complete(): void;
    },
  ): () => void;
  dispose(): void | Promise<void>;
}

export interface CrowdyAgentGraphQLTransportOptions {
  /** graphql-transport-ws endpoint used only for durable agent events. */
  readonly wsUrl?: string;
  readonly getToken: () => string | null;
  readonly webSocketImpl?: unknown;
  /** Deterministic injection seam for generated-document integration tests. */
  readonly subscriptionClientFactory?: () => CrowdyAgentGraphQLSubscriptionClient;
}

/**
 * Production generated-GraphQL adapter for `CrowdyStudioAgentTransportV1`.
 * Every HTTP and subscription shape is selected by committed typed documents.
 */
export class CrowdyAgentGraphQLTransport
  implements CrowdyStudioAgentTransportV1
{
  private readonly activeSubscriptions =
    new Set<CrowdyAgentEventSubscriptionV1>();

  constructor(
    private readonly graphql: GraphQLClient,
    private readonly options: CrowdyAgentGraphQLTransportOptions,
  ) {}

  async getSession(sessionId: string): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentSessionDocument, {
      sessionId,
    });
    return mapSession(data.crowdyStudioAgentSession);
  }

  async listSessions(input: {
    readonly appId: string;
    readonly after?: string;
    readonly first: number;
  }): Promise<CrowdyAgentConnectionV1<CrowdyAgentSessionV1>> {
    const data = await this.request(CrowdyStudioAgentSessionsDocument, {
      appId: input.appId,
      after: input.after ?? null,
      first: input.first,
    });
    const connection = data.crowdyStudioAgentSessions;
    const edges = connection.edges.map((edge) => ({
      cursor: edge.cursor,
      node: mapSession(edge.node),
    }));
    return {
      edges,
      pageInfo: {
        hasNextPage: connection.pageInfo.hasNextPage,
        ...(connection.pageInfo.endCursor
          ? { endCursor: connection.pageInfo.endCursor }
          : {}),
      },
      nodes: edges.map((edge) => edge.node),
      ...(connection.endCursor ? { endCursor: connection.endCursor } : {}),
      hasNextPage: connection.hasNextPage,
    };
  }

  async history(input: {
    readonly sessionId: string;
    readonly afterSeq: string;
    readonly first: number;
  }): Promise<CrowdyAgentHistoryPageV1> {
    const data = await this.request(CrowdyStudioAgentHistoryDocument, {
      sessionId: input.sessionId,
      afterSeq: input.afterSeq,
      first: input.first,
    });
    const connection = data.crowdyStudioAgentHistory;
    const edges = connection.edges.map((edge) => ({
      cursor: edge.cursor,
      node: mapEvent(edge.node),
    }));
    return {
      edges,
      pageInfo: {
        hasNextPage: connection.pageInfo.hasNextPage,
        ...(connection.pageInfo.endCursor
          ? { endCursor: connection.pageInfo.endCursor }
          : {}),
      },
      events: edges.map((edge) => edge.node),
      hasMore: connection.hasMore,
    };
  }

  async toolDescriptors(sessionId: string): Promise<{
    readonly registryDigest: string;
    readonly tools: readonly CrowdyAgentRegisteredToolV1[];
  }> {
    const data = await this.request(
      CrowdyStudioAgentToolDescriptorsDocument,
      { sessionId },
    );
    const result = data.crowdyStudioAgentToolDescriptors;
    const descriptors = result.tools.map(mapDescriptor);
    const registry = new CrowdyAgentToolRegistry(descriptors);
    if (registry.registryDigest !== result.registryDigest) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_STALE',
        'Game API descriptor registry digest does not match canonical descriptors',
      );
    }
    return {
      registryDigest: result.registryDigest,
      tools: registry.list(),
    };
  }

  async budget(sessionId: string): Promise<CrowdyAgentBudgetV1> {
    const data = await this.request(CrowdyStudioAgentBudgetDocument, {
      sessionId,
    });
    return mapBudget(data.crowdyStudioAgentBudget);
  }

  async createSession(
    input: CrowdyAgentCreateSessionInputV1,
  ): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentCreateSessionDocument, {
      input: {
        idempotencyKey: input.idempotencyKey,
        appId: input.appId,
        mode: input.mode as CrowdyStudioAgentMode,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.gridId ? { gridId: input.gridId } : {}),
        ...(input.requestedModel
          ? { requestedModel: input.requestedModel }
          : {}),
        providerDataConsent: input.providerDataConsent ?? false,
      },
    });
    return mapSession(data.crowdyStudioAgentCreateSession);
  }

  async attachClient(input: {
    readonly sessionId: string;
    readonly clientInstanceId?: string;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly session: CrowdyAgentSessionV1;
    readonly clientEpoch: string;
    readonly replayAfterSeq: string;
  }> {
    const data = await this.request(CrowdyStudioAgentAttachClientDocument, {
      input: {
        sessionId: input.sessionId,
        idempotencyKey: input.idempotencyKey,
        ...(input.clientInstanceId
          ? { clientInstanceId: input.clientInstanceId }
          : {}),
      },
    });
    const attachment = data.crowdyStudioAgentAttachClient;
    return {
      session: mapSession(attachment.session),
      clientEpoch: String(attachment.clientEpoch),
      replayAfterSeq: String(attachment.replayAfterSeq),
    };
  }

  async setMode(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly mode: CrowdyAgentMode;
  }): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentSetModeDocument, {
      input: {
        ...input,
        mode: input.mode as CrowdyStudioAgentMode,
      },
    });
    return mapSession(data.crowdyStudioAgentSetMode);
  }

  async acknowledgeEvents(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly throughSeq: string;
  }): Promise<{ readonly throughSeq: string }> {
    const data = await this.request(
      CrowdyStudioAgentAcknowledgeEventsDocument,
      { input },
    );
    return {
      throughSeq: String(
        data.crowdyStudioAgentAcknowledgeEvents.throughSeq,
      ),
    };
  }

  async heartbeat(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
  }): Promise<CrowdyAgentHeartbeatV1> {
    const data = await this.request(CrowdyStudioAgentHeartbeatDocument, {
      input,
    });
    const heartbeat = data.crowdyStudioAgentHeartbeat;
    return {
      serverTime: heartbeat.serverTime,
      ...(heartbeat.playLeaseFreshUntil
        ? { playLeaseFreshUntil: heartbeat.playLeaseFreshUntil }
        : {}),
      ...(heartbeat.workspaceLeaseExpiresAt
        ? { workspaceLeaseExpiresAt: heartbeat.workspaceLeaseExpiresAt }
        : {}),
    };
  }

  async sendMessage(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly message: string;
  }): Promise<CrowdyAgentRunV1> {
    const data = await this.request(CrowdyStudioAgentSendMessageDocument, {
      input: {
        sessionId: input.sessionId,
        clientEpoch: input.clientEpoch,
        idempotencyKey: input.idempotencyKey,
        content: input.message,
      },
    });
    return mapRun(data.crowdyStudioAgentSendMessage);
  }

  async approveTool(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly toolCallId: string;
    readonly argumentHash: string;
  }): Promise<CrowdyAgentApprovalV1> {
    const data = await this.request(CrowdyStudioAgentApproveToolDocument, {
      input,
    });
    return mapApproval(data.crowdyStudioAgentApproveTool);
  }

  async rejectTool(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly toolCallId: string;
    readonly argumentHash: string;
    readonly reason?: string;
  }): Promise<CrowdyAgentApprovalV1> {
    const data = await this.request(CrowdyStudioAgentRejectToolDocument, {
      input: {
        sessionId: input.sessionId,
        clientEpoch: input.clientEpoch,
        idempotencyKey: input.idempotencyKey,
        toolCallId: input.toolCallId,
        argumentHash: input.argumentHash,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    return mapApproval(data.crowdyStudioAgentRejectTool);
  }

  async toolResult(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly result: CrowdyAgentToolResultV1;
  }): Promise<CrowdyAgentToolCallAckV1> {
    const result = input.result;
    const data = await this.request(CrowdyStudioAgentToolResultDocument, {
      input: {
        sessionId: input.sessionId,
        clientEpoch: input.clientEpoch,
        idempotencyKey: input.idempotencyKey,
        result: {
          protocolVersion: result.protocolVersion,
          toolCallId: result.toolCallId,
          status: result.status as CrowdyStudioAgentToolResultStatus,
          ...(result.output !== undefined
            ? { outputJson: canonicalJson(result.output) }
            : {}),
          ...(result.error
            ? {
                errorCode: result.error.code,
                errorMessage: result.error.message,
                errorRetryable: result.error.retryable,
              }
            : {}),
          observedContextVersion: result.observedContextVersion,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
        },
      },
    });
    const call = data.crowdyStudioAgentToolResult;
    return {
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      status: call.status as CrowdyAgentToolCallAckV1['status'],
      argumentHash: call.argumentHash,
      ...(call.error ? { error: mapError(call.error) } : {}),
      accepted: call.accepted,
    };
  }

  async grantLease(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly scopes: readonly string[];
    readonly durationSeconds: number;
    readonly controlledEntityId: string;
    readonly hostCapabilityRevision: string;
  }): Promise<CrowdyAgentLeaseV1> {
    const data = await this.request(CrowdyStudioAgentGrantLeaseDocument, {
      input: {
        ...input,
        scopes: [...input.scopes],
      },
    });
    return mapLease(data.crowdyStudioAgentGrantLease);
  }

  async revokeLease(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly leaseId: string;
    readonly reason: string;
  }): Promise<CrowdyAgentLeaseV1> {
    const data = await this.request(CrowdyStudioAgentRevokeLeaseDocument, {
      input,
    });
    return mapLease(data.crowdyStudioAgentRevokeLease);
  }

  async pause(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
  }): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentPauseDocument, { input });
    return mapSession(data.crowdyStudioAgentPause);
  }

  async resume(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
  }): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentResumeDocument, { input });
    return mapSession(data.crowdyStudioAgentResume);
  }

  async cancelRun(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
    readonly runId: string;
  }): Promise<CrowdyAgentRunV1> {
    const data = await this.request(CrowdyStudioAgentCancelRunDocument, {
      input,
    });
    return mapRun(data.crowdyStudioAgentCancelRun);
  }

  async closeSession(input: {
    readonly sessionId: string;
    readonly clientEpoch: string;
    readonly idempotencyKey: string;
  }): Promise<CrowdyAgentSessionV1> {
    const data = await this.request(CrowdyStudioAgentCloseSessionDocument, {
      input,
    });
    return mapSession(data.crowdyStudioAgentCloseSession);
  }

  subscribeEvents(
    input: {
      readonly sessionId: string;
      readonly afterSeq: string;
      readonly clientEpoch: string;
    },
    handlers: CrowdyAgentEventSubscriptionHandlersV1,
  ): CrowdyAgentEventSubscriptionV1 {
    const client = this.createSubscriptionClient();
    let closed = false;
    const dispose = client.subscribe(
      {
        query: print(CrowdyStudioAgentEventsDocument),
        variables: input,
      },
      {
        next: (message) => {
          if (message.errors?.length) {
            handlers.error(mapGraphQLErrors(message.errors));
            return;
          }
          const data = message.data as
            | {
                crowdyStudioAgentEvents?: CrowdyAgentEventFieldsFragment;
              }
            | undefined;
          if (data?.crowdyStudioAgentEvents) {
            try {
              handlers.next(mapEvent(data.crowdyStudioAgentEvents));
            } catch (error) {
              handlers.error(error);
            }
          }
        },
        error: (error) => handlers.error(mapTransportError(error)),
        complete: () => handlers.complete(),
      },
    );
    const subscription: CrowdyAgentEventSubscriptionV1 = {
      close: () => {
        if (closed) return;
        closed = true;
        this.activeSubscriptions.delete(subscription);
        dispose();
        void client.dispose();
      },
    };
    this.activeSubscriptions.add(subscription);
    return subscription;
  }

  /** Close all agent event sockets owned by this adapter. */
  close(): void {
    for (const subscription of [...this.activeSubscriptions]) {
      subscription.close();
    }
  }

  private createSubscriptionClient(): CrowdyAgentGraphQLSubscriptionClient {
    if (this.options.subscriptionClientFactory) {
      return this.options.subscriptionClientFactory();
    }
    if (!this.options.wsUrl) {
      throw new CrowdyAgentError(
        'AGENT_HOST_UNAVAILABLE',
        'Crowdy agent events require a graphql-transport-ws endpoint',
      );
    }
    return createWsClient({
      url: this.options.wsUrl,
      lazy: false,
      retryAttempts: 0,
      ...(this.options.webSocketImpl
        ? { webSocketImpl: this.options.webSocketImpl as never }
        : {}),
      connectionParams: () => {
        const token = this.options.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    });
  }

  private async request<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    variables: TVariables,
  ): Promise<TResult> {
    try {
      return await this.graphql.request(document, variables);
    } catch (error) {
      throw mapTransportError(error);
    }
  }
}

function mapSession(
  value: CrowdyAgentSessionFieldsFragment,
): CrowdyAgentSessionV1 {
  return {
    contractVersion: 'crowdy.studio-agent/1',
    sessionId: value.sessionId,
    appId: String(value.appId),
    ...(value.projectId ? { projectId: value.projectId } : {}),
    ...(value.gridId ? { gridId: String(value.gridId) } : {}),
    mode: value.mode as CrowdyAgentMode,
    status: value.status as CrowdyAgentSessionV1['status'],
    requestedModel: value.requestedModel,
    ...(value.model ? { model: value.model } : {}),
    ...(value.resolvedModel ? { resolvedModel: value.resolvedModel } : {}),
    providerDataConsent: value.providerDataConsent,
    registryDigest: value.registryDigest,
    providerPolicyVersion: value.providerPolicyVersion,
    appPolicyVersion: value.appPolicyVersion,
    contextVersion: value.contextVersion,
    currentClientEpoch: String(value.currentClientEpoch),
    ...(value.clientEpoch ? { clientEpoch: String(value.clientEpoch) } : {}),
    lastEventSeq: String(value.lastEventSeq),
    ...(value.currentRun ? { currentRun: mapRun(value.currentRun) } : {}),
    activeLeases: value.activeLeases.map(mapLease),
    ...(value.pendingApproval
      ? { pendingApproval: mapApproval(value.pendingApproval) }
      : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.closedAt ? { closedAt: value.closedAt } : {}),
  };
}

function mapRun(value: CrowdyAgentRunFieldsFragment): CrowdyAgentRunV1 {
  return {
    runId: value.runId,
    status: value.status as CrowdyAgentRunV1['status'],
    providerRounds: value.providerRounds,
    toolCalls: value.toolCalls,
    ...(value.errorCode ? { errorCode: value.errorCode } : {}),
    ...(value.terminalReason
      ? { terminalReason: value.terminalReason }
      : {}),
    ...(value.reason ? { reason: value.reason } : {}),
    ...(value.startedAt ? { startedAt: value.startedAt } : {}),
    ...(value.finishedAt ? { finishedAt: value.finishedAt } : {}),
    createdAt: value.createdAt,
    cancelled: value.cancelled,
  };
}

function mapApproval(
  value: CrowdyAgentApprovalFieldsFragment,
  reasons: readonly string[] = [],
): CrowdyAgentApprovalV1 {
  return {
    approvalId: value.approvalId,
    toolCallId: value.toolCallId,
    argumentHash: value.argumentHash,
    status: value.status as CrowdyAgentApprovalV1['status'],
    safeSummary: value.safeSummary,
    reasons,
    clientEpoch: String(value.clientEpoch),
    expiresAt: value.expiresAt,
    approved: value.approved,
    rejected: value.rejected,
  };
}

function mapLease(value: CrowdyAgentLeaseFieldsFragment): CrowdyAgentLeaseV1 {
  return {
    leaseId: value.leaseId,
    kind: value.kind as CrowdyAgentLeaseV1['kind'],
    status: value.status as CrowdyAgentLeaseV1['status'],
    clientEpoch: String(value.clientEpoch),
    scopes: value.scopes,
    holder: value.holder,
    ...(value.controlledEntityId
      ? { controlledEntityId: value.controlledEntityId }
      : {}),
    ...(value.hostCapabilityRevision
      ? { hostCapabilityRevision: value.hostCapabilityRevision }
      : {}),
    ...(value.expectedProjectRevision
      ? { expectedProjectRevision: String(value.expectedProjectRevision) }
      : {}),
    contextVersion: value.contextVersion,
    grantedAt: value.grantedAt,
    expiresAt: value.expiresAt,
    ...(value.revokedReason
      ? {
          revokedReason: mapPreemptionReason(value.revokedReason),
        }
      : {}),
  };
}

function mapBudget(value: CrowdyAgentBudgetFieldsFragment): CrowdyAgentBudgetV1 {
  return {
    dimensions: value.dimensions.map((dimension) => {
      assertBudgetName(dimension.name);
      assertBudgetScope(dimension.scope);
      return {
        name: dimension.name,
        scope: dimension.scope,
        limit: String(dimension.limit),
        reserved: String(dimension.reserved),
        consumed: String(dimension.consumed),
        remaining: String(dimension.remaining),
        unit: dimension.unit,
      };
    }),
    ...(value.resetAt ? { resetAt: value.resetAt } : {}),
    platformFunded: value.platformFunded,
    payer: mapPayer(value.payer),
  };
}

function mapDescriptor(
  value: CrowdyAgentToolDescriptorFieldsFragment,
): CrowdyAgentToolDescriptorV1 {
  const parsed = parseJsonObject(value.descriptorJson, 'descriptorJson');
  if (canonicalJson(parsed) !== value.descriptorJson) {
    throw new CrowdyAgentError(
      'AGENT_CONTEXT_STALE',
      `${value.name} descriptor JSON is not canonical`,
    );
  }
  if (digestCanonicalJson(parsed) !== value.descriptorDigest) {
    throw new CrowdyAgentError(
      'AGENT_CONTEXT_STALE',
      `${value.name} descriptor digest does not match its canonical JSON`,
    );
  }
  const descriptor = parsed as unknown as CrowdyAgentToolDescriptorV1;
  if (
    descriptor.name !== value.name ||
    descriptor.version !== value.version ||
    descriptor.wireName !== value.wireName ||
    descriptor.schemaVersion !== value.schemaVersion ||
    descriptor.summary !== value.summary ||
    descriptor.executor !== value.executor ||
    canonicalJson(descriptor.modes) !== canonicalJson(value.modes) ||
    descriptor.risk.class !== value.risk ||
    canonicalJson(descriptor.risk.effects) !==
      canonicalJson(value.riskEffects) ||
    descriptor.risk.reversible !== value.riskReversible ||
    canonicalJson(descriptor.scopes.map((scope) => scope.scope)) !==
      canonicalJson(value.scopes) ||
    canonicalJson(descriptor.scopes) !== value.scopeRequirementsJson ||
    (descriptor.approval.policy === 'REQUIRED') !==
      value.approvalRequired ||
    descriptor.approval.policy !== value.approvalPolicy ||
    canonicalJson(descriptor.approval.reasons) !==
      canonicalJson(value.approvalReasons) ||
    descriptor.approval.maxTtlSeconds !== value.approvalMaxTtlSeconds ||
    descriptor.idempotency.class !== value.idempotencyClass ||
    descriptor.idempotency.keyScope !== value.idempotencyKeyScope ||
    descriptor.timeoutMs !== value.timeoutMs ||
    canonicalJson(descriptor.inputSchema) !== value.inputSchemaJson ||
    canonicalJson(descriptor.outputSchema) !== value.outputSchemaJson ||
    canonicalJson(descriptor.redaction.input) !== value.inputRedactionJson ||
    canonicalJson(descriptor.redaction.output) !== value.outputRedactionJson ||
    descriptor.redaction.maxPersistedBytes !== value.maxPersistedBytes
  ) {
    throw new CrowdyAgentError(
      'AGENT_CONTEXT_STALE',
      `${value.name} descriptor fields diverge from descriptorJson`,
    );
  }
  return descriptor;
}

function mapEvent(value: CrowdyAgentEventFieldsFragment): CrowdyAgentEventV1 {
  const base = {
    protocolVersion: value.protocolVersion as 'crowdy.agent-event/1',
    eventId: value.eventId,
    sessionId: value.sessionId,
    seq: String(value.seq),
    createdAt: value.createdAt,
  };
  const type = value.type as CrowdyAgentEventType;
  switch (value.__typename) {
    case 'AgentLifecycleEvent':
      if (type === 'MODE_SELECTED') {
        if (!value.lifecycleMode) {
          throw invalidEvent('MODE_SELECTED omitted mode');
        }
        return {
          ...base,
          type,
          payload: { mode: value.lifecycleMode as CrowdyAgentMode },
        } as CrowdyAgentEventV1;
      }
      if (type === 'CONTEXT_CHANGED') {
        if (!value.lifecycleContextVersion) {
          throw invalidEvent('CONTEXT_CHANGED omitted contextVersion');
        }
        return {
          ...base,
          type,
          payload: {
            contextVersion: value.lifecycleContextVersion,
            reason: value.lifecycleReason ?? 'CONTEXT_CHANGED',
          },
        } as CrowdyAgentEventV1;
      }
      if (type === 'CLIENT_ATTACHED' || type === 'CLIENT_DETACHED') {
        return {
          ...base,
          type,
          payload: {
            ...(value.lifecycleClientEpoch
              ? { clientEpoch: String(value.lifecycleClientEpoch) }
              : {}),
            ...(value.lifecycleReplayAfterSeq
              ? { replayAfterSeq: String(value.lifecycleReplayAfterSeq) }
              : {}),
            ...(value.lifecycleReason
              ? { reason: value.lifecycleReason }
              : {}),
          },
        } as CrowdyAgentEventV1;
      }
      return {
        ...base,
        type,
        payload: {
          sessionId: value.sessionId,
          ...(value.lifecycleReason
            ? { reason: value.lifecycleReason }
            : {}),
        },
      } as CrowdyAgentEventV1;
    case 'AgentMessageEvent': {
      const role = value.messageRole;
      if (role !== 'USER' && role !== 'ASSISTANT') {
        throw invalidEvent('Message event contains an unknown role');
      }
      if (type === 'ASSISTANT_CHUNK') {
        return {
          ...base,
          type,
          payload: {
            runId: value.runId ?? '',
            content: value.messageContent,
          },
        } as CrowdyAgentEventV1;
      }
      const message: CrowdyAgentMessageV1 = {
        messageId: value.messageEventId,
        role,
        content: value.messageContent,
        ...(value.runId ? { runId: value.runId } : {}),
        createdAt: value.createdAt,
      };
      return {
        ...base,
        type,
        payload: { message },
      } as CrowdyAgentEventV1;
    }
    case 'AgentRunEvent':
      if (!value.runId) throw invalidEvent('Run event omitted runId');
      return {
        ...base,
        type,
        payload: {
          runId: value.runId,
          status: value.runStatus as CrowdyAgentRunV1['status'],
          ...(value.runCode ? { code: value.runCode } : {}),
          ...(value.runReason ? { reason: value.runReason } : {}),
          ...(value.runError ? { error: mapError(value.runError) } : {}),
        },
      } as CrowdyAgentEventV1;
    case 'AgentToolEvent':
      return {
        ...base,
        type,
        payload: {
          toolCallId: value.toolEventCallId,
          name: value.toolEventName,
          version: value.toolEventVersion,
          status:
            value.toolStatus as CrowdyAgentToolCallAckV1['status'],
          ...(value.toolSafeSummary
            ? { safeSummary: value.toolSafeSummary }
            : {}),
          ...(value.toolArgumentHash
            ? { argumentHash: value.toolArgumentHash }
            : {}),
          ...(value.toolInvocation
            ? { invocation: mapInvocation(value.toolInvocation) }
            : {}),
          ...(value.toolResult
            ? { result: mapResultEnvelope(value.toolResult) }
            : {}),
          ...(value.toolError ? { error: mapError(value.toolError) } : {}),
        },
      } as CrowdyAgentEventV1;
    case 'AgentApprovalEvent':
      return {
        ...base,
        type,
        payload: {
          approval: {
            approvalId: value.approvalEventId,
            toolCallId: value.approvalToolCallId,
            argumentHash: value.approvalArgumentHash,
            status:
              value.approvalStatus as CrowdyAgentApprovalV1['status'],
            safeSummary: value.approvalSafeSummary,
            reasons: value.approvalReasons,
            expiresAt: value.approvalExpiresAt,
            approved:
              value.approvalStatus === 'GRANTED' ||
              value.approvalStatus === 'CONSUMED',
            rejected: value.approvalStatus === 'DENIED',
          },
        },
      } as CrowdyAgentEventV1;
    case 'AgentLeaseEvent':
      return {
        ...base,
        type,
        payload: {
          lease: {
            leaseId: value.leaseEventId,
            kind: value.leaseKind as CrowdyAgentLeaseV1['kind'],
            status: value.leaseStatus as CrowdyAgentLeaseV1['status'],
            clientEpoch: String(value.leaseClientEpoch),
            scopes: value.leaseScopes,
            holder: value.leaseHolder,
            contextVersion: value.leaseContextVersion,
            ...(value.leaseControlledEntityId
              ? { controlledEntityId: value.leaseControlledEntityId }
              : {}),
            ...(value.leaseHostCapabilityRevision
              ? {
                  hostCapabilityRevision:
                    value.leaseHostCapabilityRevision,
                }
              : {}),
            ...(value.leaseExpectedProjectRevision
              ? {
                  expectedProjectRevision: String(
                    value.leaseExpectedProjectRevision,
                  ),
                }
              : {}),
            grantedAt: value.leaseGrantedAt,
            expiresAt: value.leaseExpiresAt,
            ...(value.leaseReason
              ? {
                  revokedReason: mapPreemptionReason(value.leaseReason),
                }
              : {}),
          },
        },
      } as CrowdyAgentEventV1;
    case 'AgentCheckpointEvent':
      if (
        value.checkpointReason !== 'AGENT_WRITE' &&
        value.checkpointReason !== 'RESTORE_PREIMAGE' &&
        value.checkpointReason !== 'MANUAL'
      ) {
        throw invalidEvent(
          `Unknown checkpoint reason ${value.checkpointReason}`,
        );
      }
      return {
        ...base,
        type,
        payload: {
          checkpoint: {
            checkpointId: value.checkpointEventId,
            projectRevision: String(value.checkpointProjectRevision),
            contentHash: value.checkpointContentHash,
            reason: value.checkpointReason,
            files: value.checkpointFiles.map((file) => {
              if (file.target !== 'SERVER' && file.target !== 'CLIENT') {
                throw invalidEvent(
                  `Unknown checkpoint file target ${file.target}`,
                );
              }
              return {
                target: file.target,
                path: file.path,
                contentHash: file.contentHash,
                byteLength: file.byteLength,
              };
            }),
            createdAt: value.createdAt,
            ...(value.checkpointRestoredAt
              ? { restoredAt: value.checkpointRestoredAt }
              : {}),
          },
        },
      } as CrowdyAgentEventV1;
    case 'AgentBudgetEvent':
      return {
        ...base,
        type,
        payload: { budget: mapBudget(value.budgetSnapshot) },
      } as CrowdyAgentEventV1;
  }
}

function mapInvocation(value: {
  readonly protocolVersion: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly toolCallId: string;
  readonly name: string;
  readonly version: string;
  readonly descriptorDigest: string;
  readonly argumentsJson: string;
  readonly argumentHash: string;
  readonly contextVersion: string;
  readonly clientEpoch: string | null;
  readonly leaseId: string | null;
  readonly approvalGrant: string | null;
  readonly idempotencyKey: string | null;
  readonly deadline: string;
}): CrowdyAgentToolInvocationV1 {
  return {
    protocolVersion: value.protocolVersion as 'crowdy.tool-call/1',
    sessionId: value.sessionId,
    runId: value.runId,
    toolCallId: value.toolCallId,
    name: value.name,
    version: value.version,
    descriptorDigest: value.descriptorDigest,
    arguments: parseJsonObject(value.argumentsJson, 'argumentsJson'),
    argumentHash: value.argumentHash,
    contextVersion: value.contextVersion,
    ...(value.clientEpoch
      ? { clientEpoch: String(value.clientEpoch) }
      : {}),
    ...(value.leaseId ? { leaseId: value.leaseId } : {}),
    ...(value.approvalGrant
      ? { approvalGrant: value.approvalGrant }
      : {}),
    ...(value.idempotencyKey
      ? { idempotencyKey: value.idempotencyKey }
      : {}),
    deadline: value.deadline,
  };
}

function mapResultEnvelope(value: {
  readonly protocolVersion: string;
  readonly toolCallId: string;
  readonly status: string;
  readonly outputJson: string | null;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly remediation: string | null;
    readonly field: string | null;
    readonly requiredScope: string | null;
  } | null;
  readonly observedContextVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}): CrowdyAgentToolResultV1 {
  return {
    protocolVersion: value.protocolVersion as 'crowdy.tool-result/1',
    toolCallId: value.toolCallId,
    status: value.status as CrowdyAgentToolResultV1['status'],
    ...(value.outputJson
      ? { output: parseJsonObject(value.outputJson, 'outputJson') }
      : {}),
    ...(value.error ? { error: mapError(value.error) } : {}),
    observedContextVersion: value.observedContextVersion,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
  };
}

function mapError(value: {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly remediation: string | null;
  readonly field: string | null;
  readonly requiredScope: string | null;
}) {
  return {
    code: value.code as CrowdyAgentErrorCode,
    message: value.message,
    retryable: value.retryable,
    ...(value.remediation ? { remediation: value.remediation } : {}),
    ...(value.field ? { field: value.field } : {}),
    ...(value.requiredScope ? { requiredScope: value.requiredScope } : {}),
  };
}

function parseJsonObject(
  value: string,
  field: string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('not object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new CrowdyAgentError(
      'AGENT_EVENT_CURSOR_INVALID',
      `${field} must contain one JSON object`,
      { field },
    );
  }
}

function assertBudgetName(
  value: string,
): asserts value is CrowdyAgentBudgetDimensionV1['name'] {
  if (
    ![
      'REQUESTS',
      'INPUT_TOKENS',
      'OUTPUT_TOKENS',
      'REASONING_TOKENS',
      'PROVIDER_COST',
      'TOOL_ROUNDS',
      'WALL_CLOCK_MS',
      'TOOL_CALLS',
      'COMPILES',
    ].includes(value)
  ) {
    throw invalidEvent(`Unknown budget dimension ${value}`);
  }
}

function assertBudgetScope(
  value: string,
): asserts value is CrowdyAgentBudgetDimensionV1['scope'] {
  if (!['TURN', 'SESSION', 'PLAYER_DAY'].includes(value)) {
    throw invalidEvent(`Unknown budget scope ${value}`);
  }
}

function mapPayer(value: string): CrowdyAgentBudgetV1['payer'] {
  if (value !== 'PLATFORM' && value !== 'APP' && value !== 'USER') {
    throw invalidEvent(`Unknown agent budget payer ${value}`);
  }
  return value;
}

function mapPreemptionReason(
  value: string,
): NonNullable<CrowdyAgentLeaseV1['revokedReason']> {
  const reasons = [
    'HUMAN_INPUT',
    'HUMAN_EDIT',
    'HUMAN_STOP',
    'ESCAPE',
    'DEATH',
    'CONTEXT_CHANGED',
    'PERMISSION_CHANGED',
    'ADMISSION_CHANGED',
    'CONTROL_TARGET_CHANGED',
    'DISCONNECTED',
    'CLIENT_REATTACHED',
    'QUOTA_FAILURE',
    'BUDGET_FAILURE',
    'OPERATOR_KILL',
    'LEASE_EXPIRED',
    'SESSION_CLOSED',
  ] as const;
  if (!reasons.includes(value as (typeof reasons)[number])) {
    throw invalidEvent(`Unknown agent preemption reason ${value}`);
  }
  return value as (typeof reasons)[number];
}

function invalidEvent(message: string): CrowdyAgentError {
  return new CrowdyAgentError('AGENT_EVENT_CURSOR_INVALID', message);
}

function mapGraphQLErrors(errors: readonly unknown[]): Error {
  const payloads = errors.filter(
    (error): error is CrowdyGraphQLErrorPayload =>
      error !== null &&
      typeof error === 'object' &&
      typeof (error as { message?: unknown }).message === 'string',
  );
  return mapTransportError(
    new CrowdyGraphQLError(
      payloads.length > 0
        ? payloads
        : [{ message: 'Agent subscription failed' }],
    ),
  );
}

function mapTransportError(error: unknown): Error {
  if (error instanceof CrowdyAgentError) return error;
  if (error instanceof CrowdyGraphQLError) {
    const code = error.code;
    if (
      typeof code === 'string' &&
      (code.startsWith('AGENT_') ||
        code === 'CROWDY_STUDIO_REVISION_CONFLICT')
    ) {
      return new CrowdyAgentError(
        code as CrowdyAgentErrorCode,
        error.message,
        {
          retryable: error.extensions?.retryable === true,
          ...(typeof error.extensions?.remediation === 'string'
            ? { remediation: error.extensions.remediation }
            : {}),
          ...(typeof error.extensions?.field === 'string'
            ? { field: error.extensions.field }
            : {}),
          ...(typeof error.extensions?.requiredScope === 'string'
            ? { requiredScope: error.extensions.requiredScope }
            : {}),
          cause: error,
        },
      );
    }
    return error;
  }
  if (Array.isArray(error)) return mapGraphQLErrors(error);
  return new CrowdyAgentError(
    'AGENT_DISCONNECTED',
    'Crowdy agent GraphQL transport disconnected',
    { retryable: true, cause: error },
  );
}
