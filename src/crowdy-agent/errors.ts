import { CrowdyError } from '../errors.js';

/** Stable Agentic Crowdy Studio error vocabulary. */
export const CROWDY_AGENT_ERROR_CODES = [
  'AGENT_DISABLED',
  'AGENT_UNAUTHENTICATED',
  'AGENT_PERMISSION_DENIED',
  'AGENT_SCOPE_DENIED',
  'AGENT_CONTEXT_CHANGED',
  'AGENT_CONTEXT_STALE',
  'AGENT_SESSION_NOT_FOUND',
  'AGENT_SESSION_CLOSED',
  'AGENT_RUN_ALREADY_ACTIVE',
  'AGENT_RUN_NOT_ACTIVE',
  'AGENT_CANCELLED',
  'AGENT_PREEMPTED',
  'AGENT_OPERATOR_KILLED',
  'AGENT_DISCONNECTED',
  'AGENT_CLIENT_REATTACHED',
  'AGENT_CLIENT_EPOCH_STALE',
  'AGENT_EVENT_CURSOR_INVALID',
  'AGENT_EVENT_GAP',
  'AGENT_MODEL_NOT_ALLOWED',
  'AGENT_PROVIDER_POLICY_UNSATISFIED',
  'AGENT_PROVIDER_UNAVAILABLE',
  'AGENT_PROVIDER_OUTPUT_INVALID',
  'AGENT_PROVIDER_USAGE_UNAVAILABLE',
  'AGENT_BUDGET_EXHAUSTED',
  'AGENT_QUOTA_EXHAUSTED',
  'AGENT_RATE_LIMITED',
  'AGENT_TOOL_UNKNOWN',
  'AGENT_TOOL_VERSION_UNSUPPORTED',
  'AGENT_TOOL_INPUT_INVALID',
  'AGENT_TOOL_OUTPUT_INVALID',
  'AGENT_TOOL_DESCRIPTOR_INVALID',
  'AGENT_TOOL_FAILED',
  'AGENT_TOOL_TIMEOUT',
  'AGENT_TOOL_OUTCOME_UNKNOWN',
  'AGENT_HOST_UNAVAILABLE',
  'AGENT_HOST_CAPABILITY_CHANGED',
  'AGENT_OBSERVATION_STALE',
  'AGENT_CONTROL_TARGET_CHANGED',
  'AGENT_PARALLEL_TOOL_CALLS_UNSUPPORTED',
  'AGENT_APPROVAL_REQUIRED',
  'AGENT_APPROVAL_MISMATCH',
  'AGENT_APPROVAL_EXPIRED',
  'AGENT_APPROVAL_DENIED',
  'AGENT_APPROVAL_REVOKED',
  'AGENT_LEASE_REQUIRED',
  'AGENT_LEASE_EXPIRED',
  'AGENT_LEASE_REVOKED',
  'AGENT_LEASE_SCOPE_MISSING',
  'AGENT_IDEMPOTENCY_CONFLICT',
  'AGENT_CHECKPOINT_NOT_FOUND',
  'CROWDY_STUDIO_REVISION_CONFLICT',
] as const;

export type CrowdyAgentErrorCode = (typeof CROWDY_AGENT_ERROR_CODES)[number];

export interface AgentErrorV1 {
  code: CrowdyAgentErrorCode;
  message: string;
  retryable: boolean;
  remediation?: string;
  field?: string;
  requiredScope?: string;
}

/** Safe, stable failure used by every agent SDK boundary. */
export class CrowdyAgentError extends CrowdyError implements AgentErrorV1 {
  readonly retryable: boolean;
  readonly remediation?: string;
  readonly field?: string;
  readonly requiredScope?: string;
  constructor(
    readonly code: CrowdyAgentErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      remediation?: string;
      field?: string;
      requiredScope?: string;
      cause?: unknown;
    } = {},
  ) {
    super({ message: sanitizeAgentText(message), cause: options.cause });
    this.retryable = options.retryable ?? false;
    this.remediation = options.remediation
      ? sanitizeAgentText(options.remediation)
      : undefined;
    this.field = options.field?.slice(0, 256);
    this.requiredScope = options.requiredScope?.slice(0, 80);
  }

  toJSON(): AgentErrorV1 {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.remediation ? { remediation: this.remediation } : {}),
      ...(this.field ? { field: this.field } : {}),
      ...(this.requiredScope ? { requiredScope: this.requiredScope } : {}),
    };
  }
}

/**
 * Marks a browser effect whose outcome cannot be recovered safely. Dispatchers
 * convert this into `OUTCOME_UNKNOWN`; they never retry the effect.
 */
export class CrowdyAgentOutcomeUnknownError extends CrowdyAgentError {
  constructor(message = 'The tool effect may have occurred; inspect current state') {
    super('AGENT_TOOL_OUTCOME_UNKNOWN', message, {
      remediation: 'Inspect the current project or game state before continuing.',
    });
    this.name = 'CrowdyAgentOutcomeUnknownError';
  }
}

export function toAgentError(
  error: unknown,
  fallback: CrowdyAgentErrorCode = 'AGENT_TOOL_FAILED',
): AgentErrorV1 {
  if (error instanceof CrowdyAgentError) return error.toJSON();
  return {
    code: fallback,
    message: 'Agent operation failed',
    retryable: false,
  };
}

function sanitizeAgentText(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(
      /\b(?:bearer|token|secret|api[_ -]?key)\s*[:=]?\s*[^\s,;]+/giu,
      '[redacted]',
    )
    .trim()
    .slice(0, 512);
  return normalized || 'Agent operation failed';
}
