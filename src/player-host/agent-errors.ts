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
  const normalized = redactAgentSecrets(replaceControlChars(value))
    .trim()
    .slice(0, 512);
  return normalized || 'Agent operation failed';
}

/** Same span as `/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu` → space. */
function replaceControlChars(value: string): string {
  let changed = false;
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (
      c <= 0x08 ||
      c === 0x0b ||
      c === 0x0c ||
      (c >= 0x0e && c <= 0x1f) ||
      c === 0x7f
    ) {
      out += ' ';
      changed = true;
    } else {
      out += value[i];
    }
  }
  return changed ? out : value;
}

/**
 * Same span as
 * `/\b(?:bearer|token|secret|api[_ -]?key)\s*[:=]?\s*[^\s,;]+/giu`.
 * Linear left-to-right scan; no nested quantifiers.
 */
function redactAgentSecrets(value: string): string {
  const parts: string[] = [];
  let i = 0;
  let plainStart = 0;
  while (i < value.length) {
    const end = matchSecretSpanEnd(value, i);
    if (end > i) {
      if (i > plainStart) parts.push(value.slice(plainStart, i));
      parts.push('[redacted]');
      i = end;
      plainStart = i;
      continue;
    }
    i += 1;
  }
  if (plainStart === 0) return value;
  if (plainStart < value.length) parts.push(value.slice(plainStart));
  return parts.join('');
}

function matchSecretSpanEnd(value: string, index: number): number {
  const afterKeyword = matchSecretKeywordEnd(value, index);
  if (afterKeyword < 0) return -1;

  let j = afterKeyword;
  while (j < value.length && isUnicodeSpaceCode(value.charCodeAt(j))) j += 1;
  const afterWs = j;

  if (afterWs < value.length && (value[afterWs] === ':' || value[afterWs] === '=')) {
    let k = afterWs + 1;
    while (k < value.length && isUnicodeSpaceCode(value.charCodeAt(k))) k += 1;
    const withSep = consumeSecretToken(value, k);
    if (withSep > 0) return withSep;
  }
  return consumeSecretToken(value, afterWs);
}

function matchSecretKeywordEnd(value: string, index: number): number {
  if (index > 0 && isAsciiWordChar(value.charCodeAt(index - 1))) return -1;
  if (equalsIgnoreCaseAscii(value, index, 'bearer')) return index + 6;
  if (equalsIgnoreCaseAscii(value, index, 'token')) return index + 5;
  if (equalsIgnoreCaseAscii(value, index, 'secret')) return index + 6;
  if (!equalsIgnoreCaseAscii(value, index, 'api')) return -1;
  const sepAt = index + 3;
  if (sepAt < value.length) {
    const sep = value[sepAt];
    if (
      (sep === '_' || sep === ' ' || sep === '-') &&
      equalsIgnoreCaseAscii(value, sepAt + 1, 'key')
    ) {
      return sepAt + 4;
    }
  }
  if (equalsIgnoreCaseAscii(value, index + 3, 'key')) return index + 6;
  return -1;
}

function consumeSecretToken(value: string, start: number): number {
  let k = start;
  while (k < value.length) {
    const ch = value[k]!;
    if (isUnicodeSpaceCode(value.charCodeAt(k)) || ch === ',' || ch === ';') break;
    k += 1;
  }
  return k > start ? k : -1;
}

function equalsIgnoreCaseAscii(value: string, index: number, word: string): boolean {
  if (index + word.length > value.length) return false;
  for (let k = 0; k < word.length; k += 1) {
    const ch = value[index + k]!;
    if (ch.toLowerCase() !== word[k]) return false;
  }
  return true;
}

function isAsciiWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

/** Unicode `White_Space` that JS `/\s/u` matches, plus U+FEFF. */
function isUnicodeSpaceCode(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x20 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}
