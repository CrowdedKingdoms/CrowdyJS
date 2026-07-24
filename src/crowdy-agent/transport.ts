import type {
  CrowdyAgentBudgetV1,
  CrowdyAgentEventV1,
  CrowdyAgentHeartbeatV1,
  CrowdyAgentLeaseV1,
  CrowdyAgentMode,
  CrowdyAgentPreemptionReason,
  CrowdyAgentRegisteredToolV1,
  CrowdyAgentRunV1,
  CrowdyAgentSessionV1,
  CrowdyAgentApprovalV1,
  CrowdyAgentToolCallAckV1,
  CrowdyAgentToolResultV1,
} from './types.js';

export interface CrowdyAgentEdgeV1<T> {
  readonly cursor: string;
  readonly node: T;
}

export interface CrowdyAgentPageInfoV1 {
  readonly hasNextPage: boolean;
  readonly endCursor?: string;
}

export interface CrowdyAgentConnectionV1<T> {
  readonly edges: readonly CrowdyAgentEdgeV1<T>[];
  readonly pageInfo: CrowdyAgentPageInfoV1;
  readonly nodes: readonly T[];
  readonly endCursor?: string;
  readonly hasNextPage: boolean;
}

export interface CrowdyAgentCreateSessionInputV1 {
  readonly appId: string;
  readonly projectId?: string;
  readonly gridId?: string;
  readonly mode: CrowdyAgentMode;
  readonly requestedModel?: string;
  readonly providerDataConsent?: boolean;
  readonly idempotencyKey: string;
}

export interface CrowdyAgentAttachResultV1 {
  readonly session: CrowdyAgentSessionV1;
  readonly clientEpoch: string;
  /** Highest contiguous sequence already persisted for this client cursor. */
  readonly replayAfterSeq: string;
}

export interface CrowdyAgentHistoryPageV1 {
  readonly edges: readonly CrowdyAgentEdgeV1<CrowdyAgentEventV1>[];
  readonly pageInfo: CrowdyAgentPageInfoV1;
  readonly events: readonly CrowdyAgentEventV1[];
  readonly hasMore: boolean;
}

export interface CrowdyAgentEventSubscriptionHandlersV1 {
  next(event: CrowdyAgentEventV1): void;
  error(error: unknown): void;
  complete(): void;
}

export interface CrowdyAgentEventSubscriptionV1 {
  close(): void;
}

interface SessionMutationInput {
  readonly sessionId: string;
  readonly clientEpoch: string;
  readonly idempotencyKey: string;
}

/**
 * Provider-neutral durable orchestration transport. A generated GraphQL
 * adapter implements only this interface; tests and other hosts inject fakes.
 */
export interface CrowdyStudioAgentTransportV1 {
  getSession(sessionId: string): Promise<CrowdyAgentSessionV1>;
  listSessions(input: {
    readonly appId: string;
    readonly after?: string;
    readonly first: number;
  }): Promise<CrowdyAgentConnectionV1<CrowdyAgentSessionV1>>;
  history(input: {
    readonly sessionId: string;
    readonly afterSeq: string;
    readonly first: number;
  }): Promise<CrowdyAgentHistoryPageV1>;
  toolDescriptors(sessionId: string): Promise<{
    readonly registryDigest: string;
    readonly tools: readonly CrowdyAgentRegisteredToolV1[];
  }>;
  budget(sessionId: string): Promise<CrowdyAgentBudgetV1>;

  createSession(
    input: CrowdyAgentCreateSessionInputV1,
  ): Promise<CrowdyAgentSessionV1>;
  attachClient(input: {
    readonly sessionId: string;
    readonly clientInstanceId?: string;
    readonly idempotencyKey: string;
  }): Promise<CrowdyAgentAttachResultV1>;
  setMode(
    input: SessionMutationInput & { readonly mode: CrowdyAgentMode },
  ): Promise<CrowdyAgentSessionV1>;
  acknowledgeEvents(
    input: SessionMutationInput & { readonly throughSeq: string },
  ): Promise<{ readonly throughSeq: string }>;
  heartbeat(input: SessionMutationInput): Promise<CrowdyAgentHeartbeatV1>;
  sendMessage(
    input: SessionMutationInput & { readonly message: string },
  ): Promise<CrowdyAgentRunV1>;
  approveTool(
    input: SessionMutationInput & {
      readonly toolCallId: string;
      readonly argumentHash: string;
    },
  ): Promise<CrowdyAgentApprovalV1>;
  rejectTool(
    input: SessionMutationInput & {
      readonly toolCallId: string;
      readonly argumentHash: string;
      readonly reason?: string;
    },
  ): Promise<CrowdyAgentApprovalV1>;
  toolResult(
    input: SessionMutationInput & {
      readonly result: CrowdyAgentToolResultV1;
    },
  ): Promise<CrowdyAgentToolCallAckV1>;
  grantLease(
    input: SessionMutationInput & {
      readonly scopes: readonly string[];
      readonly durationSeconds: number;
      readonly controlledEntityId: string;
      readonly hostCapabilityRevision: string;
    },
  ): Promise<CrowdyAgentLeaseV1>;
  revokeLease(
    input: SessionMutationInput & {
      readonly leaseId: string;
      readonly reason: CrowdyAgentPreemptionReason;
    },
  ): Promise<CrowdyAgentLeaseV1>;
  pause(input: SessionMutationInput): Promise<CrowdyAgentSessionV1>;
  resume(input: SessionMutationInput): Promise<CrowdyAgentSessionV1>;
  cancelRun(
    input: SessionMutationInput & { readonly runId: string },
  ): Promise<CrowdyAgentRunV1>;
  closeSession(input: SessionMutationInput): Promise<CrowdyAgentSessionV1>;

  subscribeEvents(
    input: {
      readonly sessionId: string;
      readonly afterSeq: string;
      readonly clientEpoch: string;
    },
    handlers: CrowdyAgentEventSubscriptionHandlersV1,
  ): CrowdyAgentEventSubscriptionV1 | Promise<CrowdyAgentEventSubscriptionV1>;
}

/**
 * Exact operation mapping implemented by `CrowdyAgentGraphQLTransport`.
 * This metadata cannot issue a raw GraphQL request.
 */
export const CROWDY_AGENT_GRAPHQL_OPERATIONS_V1 = Object.freeze({
  getSession: 'crowdyStudioAgentSession',
  listSessions: 'crowdyStudioAgentSessions',
  history: 'crowdyStudioAgentHistory',
  toolDescriptors: 'crowdyStudioAgentToolDescriptors',
  budget: 'crowdyStudioAgentBudget',
  createSession: 'crowdyStudioAgentCreateSession',
  attachClient: 'crowdyStudioAgentAttachClient',
  setMode: 'crowdyStudioAgentSetMode',
  acknowledgeEvents: 'crowdyStudioAgentAcknowledgeEvents',
  heartbeat: 'crowdyStudioAgentHeartbeat',
  sendMessage: 'crowdyStudioAgentSendMessage',
  approveTool: 'crowdyStudioAgentApproveTool',
  rejectTool: 'crowdyStudioAgentRejectTool',
  toolResult: 'crowdyStudioAgentToolResult',
  grantLease: 'crowdyStudioAgentGrantLease',
  revokeLease: 'crowdyStudioAgentRevokeLease',
  pause: 'crowdyStudioAgentPause',
  resume: 'crowdyStudioAgentResume',
  cancelRun: 'crowdyStudioAgentCancelRun',
  closeSession: 'crowdyStudioAgentCloseSession',
  subscribeEvents: 'crowdyStudioAgentEvents',
} as const);
