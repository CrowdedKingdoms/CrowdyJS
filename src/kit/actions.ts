/**
 * Optimistic-action helper (api-design-review G9): the packaged form of the
 * snapshot → optimistic apply → referee invoke → confirm/rollback loop every
 * server-refereed action client hand-rolls (the reference implementation was
 * Blocks with Friends' `ActionService`).
 *
 * The referee side (a compute-module invoke export or a Model function) is
 * expected to be **idempotent on `actionId`**: the helper generates one per
 * attempt so a client retry of the same action returns the prior verdict
 * instead of double-applying (the BWF receipt pattern).
 *
 * ```ts
 * const outcome = await runOptimisticAction({
 *   apply: () => {
 *     const previous = world.getBlock(pos);
 *     world.setBlock(pos, BLOCK_AIR);            // instant local feedback
 *     return () => world.setBlock(pos, previous); // rollback closure
 *   },
 *   invoke: ({ actionId }) =>
 *     client.compute.invoke({
 *       appId, moduleName: 'bwf-actions', exportName: 'mine',
 *       paramsJson: JSON.stringify({ actionId, ...coords }),
 *     }).then((r) => JSON.parse(r.resultJson ?? '{}')),
 *   validate: (r) => r.success !== false,
 * });
 * if (!outcome.ok) showToast(outcome.errorMessage);
 * ```
 */

/** Outcome of {@link runOptimisticAction}. */
export interface OptimisticActionOutcome<T> {
  /** True when the referee accepted the action (the optimistic state stands). */
  ok: boolean;
  /** The referee's (validated) result when `ok`. */
  result?: T;
  /** Human-readable failure reason when not `ok` (rollback already ran). */
  errorMessage?: string;
  /** The thrown error, when the failure was an exception rather than a denial. */
  error?: unknown;
  /** The actionId used for the attempt (for logging / retry correlation). */
  actionId: string;
}

export interface OptimisticActionSpec<T> {
  /**
   * Apply the optimistic local change. Either return a rollback closure or
   * provide a separate {@link rollback}. Runs synchronously before the
   * referee round-trip.
   */
  apply: () => void | (() => void);
  /** Rollback when {@link apply} doesn't return one. */
  rollback?: () => void;
  /**
   * The referee round-trip. Receives the generated `actionId`; include it in
   * the request so server receipts make client retries idempotent.
   */
  invoke: (ctx: { actionId: string }) => Promise<T>;
  /**
   * Decide whether the referee accepted. Defaults to treating a result with
   * `success === false` as a denial and anything else as acceptance.
   */
  validate?: (result: T) => boolean;
  /** Extract the denial message. Defaults to `result.errorMessage ?? result.reason`. */
  denialMessage?: (result: T) => string | undefined;
  /** Optional post-acceptance hook (refresh inventories, play effects, ...). */
  confirm?: (result: T) => void | Promise<void>;
  /** Override the generated actionId (e.g. for a deliberate retry). */
  actionId?: string;
}

function defaultValidate(result: unknown): boolean {
  return !(
    typeof result === 'object' &&
    result !== null &&
    (result as { success?: unknown }).success === false
  );
}

function defaultDenialMessage(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const r = result as { errorMessage?: unknown; reason?: unknown };
  if (typeof r.errorMessage === 'string') return r.errorMessage;
  if (typeof r.reason === 'string') return r.reason;
  return undefined;
}

function newActionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Non-cryptographic fallback for exotic runtimes: uniqueness, not secrecy.
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Run one optimistic, server-refereed action: apply locally, ask the referee,
 * keep the optimistic state on acceptance or roll it back on denial/error.
 * Never throws — failures come back as `{ ok: false }` with the rollback
 * already executed.
 */
export async function runOptimisticAction<T>(
  spec: OptimisticActionSpec<T>,
): Promise<OptimisticActionOutcome<T>> {
  const actionId = spec.actionId ?? newActionId();
  const validate = spec.validate ?? defaultValidate;
  const denialMessage = spec.denialMessage ?? defaultDenialMessage;

  let rollback = spec.rollback;
  try {
    const returned = spec.apply();
    if (typeof returned === 'function') rollback = returned;
  } catch (error) {
    return {
      ok: false,
      error,
      errorMessage: error instanceof Error ? error.message : 'optimistic apply failed',
      actionId,
    };
  }

  try {
    const result = await spec.invoke({ actionId });
    if (!validate(result)) {
      rollback?.();
      return {
        ok: false,
        result,
        errorMessage: denialMessage(result) ?? 'action rejected',
        actionId,
      };
    }
    await spec.confirm?.(result);
    return { ok: true, result, actionId };
  } catch (error) {
    rollback?.();
    return {
      ok: false,
      error,
      errorMessage: error instanceof Error ? error.message : 'action failed',
      actionId,
    };
  }
}
