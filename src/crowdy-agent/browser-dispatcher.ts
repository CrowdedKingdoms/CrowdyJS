import {
  CrowdyAgentError,
  CrowdyAgentOutcomeUnknownError,
  toAgentError,
} from './errors.js';
import { canonicalJson, sha256Digest } from './schema.js';
import type {
  CrowdyAgentMode,
  CrowdyAgentToolInvocationV1,
  CrowdyAgentToolResultV1,
} from './types.js';
import { CrowdyAgentToolRegistry } from './registry.js';

export interface CrowdyAgentBrowserToolContextV1 {
  readonly invocation: CrowdyAgentToolInvocationV1;
  readonly signal: AbortSignal;
}

export type CrowdyAgentBrowserToolHandlerV1 = (
  argumentsValue: Readonly<Record<string, unknown>>,
  context: CrowdyAgentBrowserToolContextV1,
) => unknown | Promise<unknown>;

export type CrowdyAgentBrowserToolHandlersV1 = Readonly<
  Record<string, CrowdyAgentBrowserToolHandlerV1>
>;

export interface CrowdyAgentBrowserDispatcherOptionsV1 {
  readonly registry: CrowdyAgentToolRegistry;
  readonly handlers: CrowdyAgentBrowserToolHandlersV1;
  readonly getSessionId?: () => string | null;
  readonly getClientEpoch: () => string | null;
  readonly getContextVersion: () => string;
  readonly getMode?: () => CrowdyAgentMode;
  readonly now?: () => number;
  readonly maxRememberedCalls?: number;
}

interface DispatchRecord {
  readonly fingerprint: string;
  readonly promise: Promise<CrowdyAgentToolResultV1>;
}

/**
 * Exact browser tool router with execute-once semantics. It has no fallback
 * executor: unknown names, raw SDK access, and missing handlers fail closed.
 */
export class CrowdyAgentBrowserToolDispatcher {
  private readonly records = new Map<string, DispatchRecord>();
  private readonly active = new Map<string, AbortController>();
  private readonly now: () => number;

  constructor(private readonly options: CrowdyAgentBrowserDispatcherOptionsV1) {
    this.now = options.now ?? Date.now;
    for (const name of Object.keys(options.handlers)) {
      const matches = options.registry
        .list({ executor: 'BROWSER' })
        .filter(({ descriptor }) => descriptor.name === name);
      if (matches.length === 0) {
        throw new CrowdyAgentError(
          'AGENT_TOOL_UNKNOWN',
          `Browser handler ${name} is not an exact registered browser tool`,
        );
      }
    }
  }

  dispatch(
    invocation: CrowdyAgentToolInvocationV1,
  ): Promise<CrowdyAgentToolResultV1> {
    if (
      typeof invocation.toolCallId !== 'string' ||
      invocation.toolCallId.length < 1 ||
      invocation.toolCallId.length > 128
    ) {
      return this.execute(invocation);
    }
    try {
      // Bound arguments before canonical fingerprinting or cache insertion.
      this.options.registry.validateInput(
        invocation.name,
        invocation.version,
        invocation.arguments,
      );
    } catch {
      return this.execute(invocation);
    }
    const fingerprint = invocationFingerprint(invocation);
    const previous = this.records.get(invocation.toolCallId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return Promise.reject(
          new CrowdyAgentError(
            'AGENT_IDEMPOTENCY_CONFLICT',
            `Tool call ${invocation.toolCallId} was replayed with different arguments`,
          ),
        );
      }
      return previous.promise;
    }
    const max = this.options.maxRememberedCalls ?? 2_048;
    if (this.records.size >= max) {
      return Promise.reject(
        new CrowdyAgentError(
          'AGENT_RATE_LIMITED',
          'Browser execute-once cache is full; attach a fresh session before continuing',
        ),
      );
    }
    const promise = this.execute(invocation);
    this.records.set(invocation.toolCallId, { fingerprint, promise });
    return promise;
  }

  has(toolCallId: string): boolean {
    return this.records.has(toolCallId);
  }

  /** Abort pending browser work during human or context preemption. */
  cancelActive(): void {
    for (const controller of this.active.values()) controller.abort();
  }

  /**
   * Cache lifetime is the attached session. Call only after that session is
   * closed or fenced; clearing during a live session could repeat an effect.
   */
  clearClosedSession(): void {
    this.cancelActive();
    this.records.clear();
  }

  private async execute(
    invocation: CrowdyAgentToolInvocationV1,
  ): Promise<CrowdyAgentToolResultV1> {
    const startedMs = this.now();
    const startedAt = new Date(startedMs).toISOString();
    let entry: ReturnType<CrowdyAgentToolRegistry['require']>;
    let activeAbort: AbortController | null = null;
    try {
      this.validateEnvelope(invocation, startedMs);
      entry = this.options.registry.require(invocation.name, invocation.version);
      if (entry.descriptor.executor !== 'BROWSER') {
        throw new CrowdyAgentError(
          'AGENT_TOOL_UNKNOWN',
          `${invocation.name} is not a browser-executed tool`,
        );
      }
      if (entry.descriptorDigest !== invocation.descriptorDigest) {
        throw new CrowdyAgentError(
          'AGENT_CONTEXT_STALE',
          `${invocation.name} descriptor digest changed`,
        );
      }
      if (
        this.options.getMode &&
        !entry.descriptor.modes.includes(this.options.getMode())
      ) {
        throw new CrowdyAgentError(
          'AGENT_SCOPE_DENIED',
          `${invocation.name} is unavailable in the selected mode`,
        );
      }
      if (
        entry.descriptor.approval.policy === 'REQUIRED' &&
        !invocation.approvalGrant
      ) {
        throw new CrowdyAgentError(
          'AGENT_APPROVAL_REQUIRED',
          `${invocation.name} requires exact human approval`,
        );
      }
      this.options.registry.validateInput(
        invocation.name,
        invocation.version,
        invocation.arguments,
      );
      if (!isRecord(invocation.arguments)) {
        throw new CrowdyAgentError(
          'AGENT_TOOL_INPUT_INVALID',
          'Browser tool arguments must be an object',
        );
      }
      const handler = this.options.handlers[invocation.name];
      if (!handler) {
        throw new CrowdyAgentError(
          'AGENT_HOST_UNAVAILABLE',
          `No browser host implements ${invocation.name}`,
        );
      }
      const deadlineMs = Date.parse(invocation.deadline);
      const remaining = Math.min(
        entry.descriptor.timeoutMs,
        Math.max(0, deadlineMs - startedMs),
      );
      const abort = new AbortController();
      activeAbort = abort;
      this.active.set(invocation.toolCallId, abort);
      const output = await runWithDeadline(
        Promise.resolve(
          handler(invocation.arguments, {
            invocation,
            signal: abort.signal,
          }),
        ),
        remaining,
        abort,
      );
      if (abort.signal.aborted) {
        throw new CrowdyAgentError(
          'AGENT_CANCELLED',
          'Browser tool was cancelled before its result was accepted',
        );
      }
      if (invocation.contextVersion !== this.options.getContextVersion()) {
        throw new CrowdyAgentError(
          'AGENT_CONTEXT_STALE',
          'Browser tool context changed before its result was accepted',
        );
      }
      this.options.registry.validateOutput(
        invocation.name,
        invocation.version,
        output,
      );
      return {
        protocolVersion: 'crowdy.tool-result/1',
        toolCallId: invocation.toolCallId,
        status: 'SUCCEEDED',
        output,
        observedContextVersion: this.options.getContextVersion(),
        startedAt,
        finishedAt: new Date(this.now()).toISOString(),
      };
    } catch (error) {
      const registered = this.options.registry.get(invocation.name, invocation.version);
      const timedOut =
        error instanceof CrowdyAgentError && error.code === 'AGENT_TOOL_TIMEOUT';
      const ambiguous =
        error instanceof CrowdyAgentOutcomeUnknownError ||
        (timedOut &&
          registered !== undefined &&
          ['TOOL_CALL_ONCE', 'NON_RETRYABLE'].includes(
            registered.descriptor.idempotency.class,
          ));
      return {
        protocolVersion: 'crowdy.tool-result/1',
        toolCallId: invocation.toolCallId,
        status: ambiguous
          ? 'OUTCOME_UNKNOWN'
          : timedOut
            ? 'TIMED_OUT'
            : error instanceof CrowdyAgentError &&
                error.code === 'AGENT_CANCELLED'
              ? 'CANCELLED'
              : 'FAILED',
        error: toAgentError(
          ambiguous
            ? new CrowdyAgentOutcomeUnknownError(
                error instanceof Error ? error.message : undefined,
              )
            : error,
          timedOut ? 'AGENT_TOOL_TIMEOUT' : 'AGENT_TOOL_FAILED',
        ),
        observedContextVersion: this.options.getContextVersion(),
        startedAt,
        finishedAt: new Date(this.now()).toISOString(),
      };
    } finally {
      if (activeAbort) this.active.delete(invocation.toolCallId);
    }
  }

  private validateEnvelope(
    invocation: CrowdyAgentToolInvocationV1,
    now: number,
  ): void {
    if (invocation.protocolVersion !== 'crowdy.tool-call/1') {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Unsupported browser tool-call protocol',
      );
    }
    for (const [field, value, max] of [
      ['sessionId', invocation.sessionId, 128],
      ['runId', invocation.runId, 128],
      ['toolCallId', invocation.toolCallId, 128],
      ['contextVersion', invocation.contextVersion, 128],
    ] as const) {
      if (
        typeof value !== 'string' ||
        value.length < 1 ||
        value.length > max
      ) {
        throw new CrowdyAgentError(
          'AGENT_TOOL_INPUT_INVALID',
          `${field} is outside protocol bounds`,
          { field },
        );
      }
    }
    const currentSessionId = this.options.getSessionId?.();
    if (currentSessionId && invocation.sessionId !== currentSessionId) {
      throw new CrowdyAgentError(
        'AGENT_SESSION_NOT_FOUND',
        'Browser tool dispatch belongs to a different session',
      );
    }
    if (
      typeof invocation.descriptorDigest !== 'string' ||
      typeof invocation.argumentHash !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(invocation.descriptorDigest) ||
      !/^sha256:[0-9a-f]{64}$/u.test(invocation.argumentHash) ||
      (invocation.approvalGrant !== undefined &&
        (typeof invocation.approvalGrant !== 'string' ||
          invocation.approvalGrant.length < 1)) ||
      (invocation.approvalGrant?.length ?? 0) > 512 ||
      (invocation.idempotencyKey !== undefined &&
        (typeof invocation.idempotencyKey !== 'string' ||
          invocation.idempotencyKey.length < 1)) ||
      (invocation.idempotencyKey?.length ?? 0) > 240
    ) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Browser tool dispatch contains invalid digest or capability metadata',
      );
    }
    const currentEpoch = this.options.getClientEpoch();
    if (
      !currentEpoch ||
      !invocation.clientEpoch ||
      invocation.clientEpoch !== currentEpoch
    ) {
      throw new CrowdyAgentError(
        'AGENT_CLIENT_EPOCH_STALE',
        'Browser tool dispatch belongs to a stale client epoch',
      );
    }
    if (invocation.contextVersion !== this.options.getContextVersion()) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_STALE',
        'Browser tool dispatch belongs to a stale app, project, or game context',
      );
    }
    if (
      typeof invocation.deadline !== 'string' ||
      invocation.deadline.length < 20 ||
      invocation.deadline.length > 40
    ) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Browser tool deadline is invalid',
      );
    }
    const deadline = Date.parse(invocation.deadline);
    if (!Number.isFinite(deadline) || deadline <= now) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_TIMEOUT',
        'Browser tool deadline has expired',
      );
    }
  }
}

function invocationFingerprint(invocation: CrowdyAgentToolInvocationV1): string {
  return sha256Digest(
    canonicalJson({
      protocolVersion: invocation.protocolVersion,
      sessionId: invocation.sessionId,
      runId: invocation.runId,
      toolCallId: invocation.toolCallId,
      name: invocation.name,
      version: invocation.version,
      descriptorDigest: invocation.descriptorDigest,
      arguments: invocation.arguments,
      argumentHash: invocation.argumentHash,
      contextVersion: invocation.contextVersion,
      ...(invocation.clientEpoch
        ? { clientEpoch: invocation.clientEpoch }
        : {}),
      ...(invocation.leaseId ? { leaseId: invocation.leaseId } : {}),
      ...(invocation.approvalGrant
        ? { approvalGrant: invocation.approvalGrant }
        : {}),
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    }),
  );
}

function runWithDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  abort: AbortController,
): Promise<T> {
  if (timeoutMs <= 0) {
    abort.abort();
    return Promise.reject(
      new CrowdyAgentError('AGENT_TOOL_TIMEOUT', 'Browser tool deadline expired'),
    );
  }
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const onAbort = (): void => {
      if (!timedOut) {
        clearTimeout(timer);
        reject(
          new CrowdyAgentError(
            'AGENT_CANCELLED',
            'Browser tool was cancelled by human or context preemption',
          ),
        );
      }
    };
    abort.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
      reject(
        new CrowdyAgentError(
          'AGENT_TOOL_TIMEOUT',
          `Browser tool exceeded its ${timeoutMs}ms deadline`,
        ),
      );
    }, timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        abort.signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        abort.signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
