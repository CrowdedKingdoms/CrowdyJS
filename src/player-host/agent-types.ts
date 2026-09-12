/**
 * Vocabulary shared by the player host adapter contract and the games that
 * implement it. These names came from the Crowdy Agent kernel (retired in
 * favour of the DeepSeek Harness pane) and keep their values so games and
 * fixtures written against them still type-check.
 */

export type CrowdyAgentToolRisk =
  | 'READ_ONLY'
  | 'ROUTINE_WRITE'
  | 'WORLD_CONTROL'
  | 'DESTRUCTIVE'
  | 'TRUST_CONSENT'
  | 'ECONOMIC'
  | 'IRREVERSIBLE';
export type CrowdyAgentApprovalPolicy = 'NONE' | 'REQUIRED' | 'CONDITIONAL';

export interface CrowdyAgentLeaseV1 {
  readonly leaseId?: string;
  readonly leaseType?: 'WORKSPACE' | 'PLAY';
  readonly scopes?: readonly string[];
  readonly expiresAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly revokedReason?: string;
}

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
