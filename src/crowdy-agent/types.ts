import type { AgentErrorV1 } from './errors.js';
import type { JsonSchemaObject } from './schema.js';

export type CrowdyAgentMode = 'ASK' | 'BUILD' | 'PLAY';
export type CrowdyAgentToolExecutor = 'SERVER' | 'BROWSER';
export type CrowdyAgentToolRisk =
  | 'READ_ONLY'
  | 'ROUTINE_WRITE'
  | 'WORLD_CONTROL'
  | 'DESTRUCTIVE'
  | 'TRUST_CONSENT'
  | 'ECONOMIC'
  | 'IRREVERSIBLE';
export type CrowdyAgentApprovalPolicy = 'NONE' | 'REQUIRED' | 'CONDITIONAL';
export type CrowdyAgentIdempotencyClass =
  | 'PURE'
  | 'KEYED'
  | 'TOOL_CALL_ONCE'
  | 'NON_RETRYABLE';
export type CrowdyAgentRedactionAction =
  | 'DROP'
  | 'HASH'
  | 'MASK'
  | 'TRUNCATE'
  | 'SUMMARY';

export interface CrowdyAgentRedactionRuleV1 {
  readonly path: string;
  readonly action: CrowdyAgentRedactionAction;
  readonly maxBytes?: number;
}

export interface CrowdyAgentScopeRequirementV1 {
  readonly scope: string;
  readonly when?: {
    readonly argumentPath: string;
    readonly operator: 'EQUALS' | 'CONTAINS';
    readonly value: string | number | boolean;
  };
}

/** Immutable `crowdy.agent-tool/1` descriptor supplied to a model by the server. */
export interface CrowdyAgentToolDescriptorV1 {
  readonly schemaVersion: 'crowdy.agent-tool/1';
  readonly name: `${string}.${string}`;
  readonly wireName: string;
  readonly version: `${number}.${number}.${number}`;
  readonly summary: string;
  readonly executor: CrowdyAgentToolExecutor;
  readonly modes: readonly CrowdyAgentMode[];
  readonly inputSchema: JsonSchemaObject;
  readonly outputSchema: JsonSchemaObject;
  readonly risk: {
    readonly class: CrowdyAgentToolRisk;
    readonly effects: readonly string[];
    readonly reversible: boolean;
  };
  readonly scopes: readonly CrowdyAgentScopeRequirementV1[];
  readonly approval: {
    readonly policy: CrowdyAgentApprovalPolicy;
    readonly reasons: readonly string[];
    readonly maxTtlSeconds: number;
  };
  readonly idempotency: {
    readonly class: CrowdyAgentIdempotencyClass;
    readonly keyScope: 'NONE' | 'TOOL_CALL' | 'USER_TOOL_ARGUMENTS';
  };
  readonly timeoutMs: number;
  readonly redaction: {
    readonly input: readonly CrowdyAgentRedactionRuleV1[];
    readonly output: readonly CrowdyAgentRedactionRuleV1[];
    readonly maxPersistedBytes: number;
  };
}

export interface CrowdyAgentRegisteredToolV1 {
  readonly descriptor: CrowdyAgentToolDescriptorV1;
  readonly descriptorDigest: `sha256:${string}`;
}

export interface CrowdyAgentToolInvocationV1 {
  readonly protocolVersion: 'crowdy.tool-call/1';
  readonly sessionId: string;
  readonly runId: string;
  readonly toolCallId: string;
  readonly name: string;
  readonly version: string;
  readonly descriptorDigest: string;
  readonly arguments: unknown;
  readonly argumentHash: string;
  readonly contextVersion: string;
  readonly clientEpoch?: string;
  readonly leaseId?: string;
  readonly approvalGrant?: string;
  readonly idempotencyKey?: string;
  readonly deadline: string;
}

export type CrowdyAgentToolResultStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'OUTCOME_UNKNOWN';

export interface CrowdyAgentToolResultV1<T = unknown> {
  readonly protocolVersion: 'crowdy.tool-result/1';
  readonly toolCallId: string;
  readonly status: CrowdyAgentToolResultStatus;
  readonly output?: T;
  readonly error?: AgentErrorV1;
  readonly observedContextVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export type CrowdyAgentSessionStatus = 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'REVOKED';
export type CrowdyAgentRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_TOOL'
  | 'WAITING_FOR_APPROVAL'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PREEMPTED';
export type CrowdyAgentToolCallStatus =
  | 'PROPOSED'
  | 'WAITING_FOR_APPROVAL'
  | 'DISPATCHED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'DENIED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'STALE'
  | 'OUTCOME_UNKNOWN';
export type CrowdyAgentLeaseStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type CrowdyAgentApprovalStatus =
  | 'PENDING'
  | 'GRANTED'
  | 'DENIED'
  | 'CONSUMED'
  | 'REVOKED'
  | 'EXPIRED';

export type CrowdyAgentPreemptionReason =
  | 'HUMAN_INPUT'
  | 'HUMAN_EDIT'
  | 'HUMAN_STOP'
  | 'ESCAPE'
  | 'DEATH'
  | 'CONTEXT_CHANGED'
  | 'PERMISSION_CHANGED'
  | 'ADMISSION_CHANGED'
  | 'CONTROL_TARGET_CHANGED'
  | 'DISCONNECTED'
  | 'CLIENT_REATTACHED'
  | 'QUOTA_FAILURE'
  | 'BUDGET_FAILURE'
  | 'OPERATOR_KILL'
  | 'LEASE_EXPIRED'
  | 'SESSION_CLOSED';

export interface CrowdyAgentSessionV1 {
  readonly contractVersion: 'crowdy.studio-agent/1';
  readonly sessionId: string;
  readonly appId: string;
  readonly projectId?: string;
  readonly gridId?: string;
  readonly mode: CrowdyAgentMode;
  readonly status: CrowdyAgentSessionStatus;
  readonly requestedModel: string;
  readonly model?: string;
  readonly resolvedModel?: string;
  readonly providerDataConsent: boolean;
  readonly registryDigest: string;
  readonly providerPolicyVersion: string;
  readonly appPolicyVersion: string;
  readonly contextVersion: string;
  readonly hostCapabilityRevision?: string;
  readonly currentClientEpoch: string;
  readonly clientEpoch?: string;
  readonly lastEventSeq: string;
  readonly currentRun?: CrowdyAgentRunV1;
  readonly activeLeases: readonly CrowdyAgentLeaseV1[];
  readonly pendingApproval?: CrowdyAgentApprovalV1;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
}

export interface CrowdyAgentRunV1 {
  readonly runId: string;
  readonly status: CrowdyAgentRunStatus;
  readonly providerRounds?: number;
  readonly toolCalls?: number;
  readonly errorCode?: string;
  readonly terminalReason?: string;
  readonly createdAt?: string;
  readonly cancelled?: boolean;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly reason?: string;
}

export interface CrowdyAgentApprovalV1 {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly argumentHash: string;
  readonly status: CrowdyAgentApprovalStatus;
  readonly safeSummary: string;
  readonly reasons: readonly string[];
  readonly clientEpoch?: string;
  readonly expiresAt: string;
  readonly approved: boolean;
  readonly rejected: boolean;
}

export interface CrowdyAgentLeaseV1 {
  readonly leaseId: string;
  readonly kind: 'WORKSPACE' | 'PLAY';
  readonly status: CrowdyAgentLeaseStatus;
  readonly clientEpoch: string;
  readonly scopes: readonly string[];
  readonly holder: string;
  readonly controlledEntityId?: string;
  readonly hostCapabilityRevision?: string;
  readonly expectedProjectRevision?: string;
  readonly contextVersion: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly revokedReason?: CrowdyAgentPreemptionReason;
}

export interface CrowdyAgentCheckpointFileV1 {
  readonly target: 'SERVER' | 'CLIENT';
  readonly path: string;
  readonly contentHash: string;
  readonly byteLength: number;
}

export interface CrowdyAgentCheckpointV1 {
  readonly checkpointId: string;
  readonly projectRevision: string;
  readonly contentHash: string;
  readonly reason: 'AGENT_WRITE' | 'RESTORE_PREIMAGE' | 'MANUAL';
  readonly files: readonly CrowdyAgentCheckpointFileV1[];
  readonly createdAt: string;
  readonly restoredAt?: string;
}

export interface CrowdyAgentBudgetDimensionV1 {
  readonly name:
    | 'REQUESTS'
    | 'INPUT_TOKENS'
    | 'OUTPUT_TOKENS'
    | 'REASONING_TOKENS'
    | 'PROVIDER_COST'
    | 'TOOL_ROUNDS'
    | 'WALL_CLOCK_MS'
    | 'TOOL_CALLS'
    | 'COMPILES';
  readonly scope: 'TURN' | 'SESSION' | 'PLAYER_DAY';
  readonly limit: string;
  readonly reserved: string;
  readonly consumed: string;
  readonly remaining: string;
  readonly unit: string;
}

export interface CrowdyAgentBudgetV1 {
  readonly dimensions: readonly CrowdyAgentBudgetDimensionV1[];
  readonly resetAt?: string;
  readonly platformFunded: boolean;
  readonly payer: 'PLATFORM' | 'APP' | 'USER';
}

export interface CrowdyAgentHeartbeatV1 {
  readonly serverTime: string;
  readonly playLeaseFreshUntil?: string;
}

export interface CrowdyAgentToolCallAckV1 {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: CrowdyAgentToolCallStatus;
  readonly argumentHash: string;
  readonly error?: AgentErrorV1;
  readonly accepted: boolean;
}

export interface CrowdyAgentMessageV1 {
  readonly messageId: string;
  readonly role: 'USER' | 'ASSISTANT';
  readonly content: string;
  readonly runId?: string;
  readonly createdAt: string;
}

export interface CrowdyAgentToolTimelineItemV1 {
  readonly toolCallId: string;
  readonly name: string;
  readonly version: string;
  readonly status: CrowdyAgentToolCallStatus;
  readonly risk?: CrowdyAgentToolRisk;
  readonly safeSummary?: string;
  readonly argumentHash?: string;
  readonly result?: CrowdyAgentToolResultV1;
  readonly error?: AgentErrorV1;
  readonly updatedAt: string;
}

interface SessionEventPayload {
  readonly sessionId: string;
  readonly status?: CrowdyAgentSessionStatus;
  readonly reason?: CrowdyAgentPreemptionReason | string;
}

interface ClientEventPayload {
  readonly clientEpoch?: string;
  readonly replayAfterSeq?: string;
  readonly reason?: string;
}

interface RunEventPayload {
  readonly runId: string;
  readonly status: CrowdyAgentRunStatus;
  readonly reason?: CrowdyAgentPreemptionReason | string;
}

interface ToolEventPayload {
  readonly toolCallId: string;
  readonly name: string;
  readonly version: string;
  readonly status: CrowdyAgentToolCallStatus;
  readonly safeSummary?: string;
  readonly argumentHash?: string;
  readonly invocation?: CrowdyAgentToolInvocationV1;
  readonly result?: CrowdyAgentToolResultV1;
  readonly error?: AgentErrorV1;
}

interface ApprovalEventPayload {
  readonly approval: CrowdyAgentApprovalV1;
}

interface LeaseEventPayload {
  readonly lease: CrowdyAgentLeaseV1;
}

interface CheckpointEventPayload {
  readonly checkpoint: CrowdyAgentCheckpointV1;
}

export interface CrowdyAgentEventPayloadMap {
  readonly SESSION_CREATED: SessionEventPayload;
  readonly SESSION_PAUSED: SessionEventPayload;
  readonly SESSION_RESUMED: SessionEventPayload;
  readonly SESSION_CLOSED: SessionEventPayload;
  readonly CLIENT_ATTACHED: ClientEventPayload;
  readonly CLIENT_DETACHED: ClientEventPayload;
  readonly MODE_SELECTED: { readonly mode: CrowdyAgentMode };
  readonly USER_MESSAGE: { readonly message: CrowdyAgentMessageV1 };
  readonly RUN_STARTED: RunEventPayload;
  readonly ASSISTANT_CHUNK: {
    readonly runId: string;
    readonly content: string;
  };
  readonly ASSISTANT_MESSAGE: { readonly message: CrowdyAgentMessageV1 };
  readonly TOOL_PROPOSED: ToolEventPayload;
  readonly TOOL_DISPATCHED: ToolEventPayload;
  readonly TOOL_SUCCEEDED: ToolEventPayload;
  readonly TOOL_FAILED: ToolEventPayload;
  readonly TOOL_DENIED: ToolEventPayload;
  readonly TOOL_TIMED_OUT: ToolEventPayload;
  readonly TOOL_OUTCOME_UNKNOWN: ToolEventPayload;
  readonly APPROVAL_REQUESTED: ApprovalEventPayload;
  readonly APPROVAL_GRANTED: ApprovalEventPayload;
  readonly APPROVAL_DENIED: ApprovalEventPayload;
  readonly APPROVAL_CONSUMED: ApprovalEventPayload;
  readonly APPROVAL_EXPIRED: ApprovalEventPayload;
  readonly CHECKPOINT_CREATED: CheckpointEventPayload;
  readonly CHECKPOINT_RESTORED: CheckpointEventPayload;
  readonly LEASE_GRANTED: LeaseEventPayload;
  readonly LEASE_REVOKED: LeaseEventPayload;
  readonly LEASE_EXPIRED: LeaseEventPayload;
  readonly CONTEXT_CHANGED: {
    readonly contextVersion: string;
    readonly reason: string;
  };
  readonly BUDGET_UPDATED: { readonly budget: CrowdyAgentBudgetV1 };
  readonly RUN_PAUSED: RunEventPayload;
  readonly RUN_SUCCEEDED: RunEventPayload;
  readonly RUN_FAILED: RunEventPayload;
  readonly RUN_CANCELLED: RunEventPayload;
  readonly RUN_PREEMPTED: RunEventPayload;
}

export const CROWDY_AGENT_EVENT_TYPES = [
  'SESSION_CREATED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'SESSION_CLOSED',
  'CLIENT_ATTACHED',
  'CLIENT_DETACHED',
  'MODE_SELECTED',
  'USER_MESSAGE',
  'RUN_STARTED',
  'ASSISTANT_CHUNK',
  'ASSISTANT_MESSAGE',
  'TOOL_PROPOSED',
  'TOOL_DISPATCHED',
  'TOOL_SUCCEEDED',
  'TOOL_FAILED',
  'TOOL_DENIED',
  'TOOL_TIMED_OUT',
  'TOOL_OUTCOME_UNKNOWN',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_DENIED',
  'APPROVAL_CONSUMED',
  'APPROVAL_EXPIRED',
  'CHECKPOINT_CREATED',
  'CHECKPOINT_RESTORED',
  'LEASE_GRANTED',
  'LEASE_REVOKED',
  'LEASE_EXPIRED',
  'CONTEXT_CHANGED',
  'BUDGET_UPDATED',
  'RUN_PAUSED',
  'RUN_SUCCEEDED',
  'RUN_FAILED',
  'RUN_CANCELLED',
  'RUN_PREEMPTED',
] as const satisfies readonly (keyof CrowdyAgentEventPayloadMap)[];

export type CrowdyAgentEventType = keyof CrowdyAgentEventPayloadMap;

interface CrowdyAgentEventBaseV1 {
  readonly protocolVersion: 'crowdy.agent-event/1';
  readonly eventId: string;
  readonly sessionId: string;
  /** Monotonic decimal-string BigInt. */
  readonly seq: string;
  readonly createdAt: string;
}

export type CrowdyAgentEventV1 = {
  readonly [Type in CrowdyAgentEventType]: CrowdyAgentEventBaseV1 & {
    readonly type: Type;
    readonly payload: CrowdyAgentEventPayloadMap[Type];
  };
}[CrowdyAgentEventType];
