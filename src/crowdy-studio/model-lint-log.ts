import type { CrowdyLogger } from '../logger.js';

/**
 * Tell the developer, once, when the server refuses something because the game model is
 * wrong.
 *
 * THIS IS THE HALF THAT WORKS IN A SHIPPED GAME. `gameModelLint` needs `manage_apps`, so a
 * client holding a player token cannot ask whether the app is coherent and never will be
 * able to. What it can see is the server refusing one specific operation, and that turns
 * out to be enough — the refusals carry a code and the facts, so the client can say what
 * happened without being allowed to audit the app.
 *
 * WHY IT MATTERS THAT IT SAYS ANYTHING AT ALL. The case this was built for is a client that
 * called `gameModelEnsureContainer` against a type nobody had defined. The call SUCCEEDED.
 * The container was written, nothing bound to it, and the only trace anywhere was the game's
 * own line — `[GameModel] InvokeAndApply: no container bound for entity F3B8B18E…` — which
 * names a symptom and not one thing about the cause. It read as a permissions fault for
 * most of a day. The server refuses that call now and says why; this is what makes sure the
 * why is not swallowed on the way to the developer.
 *
 * ONCE PER (code, subject), NOT PER OCCURRENCE, and that is not a nicety. These fire on
 * gameplay paths — a bind can be attempted every frame, for every entity — and a warning
 * printed at that rate is indistinguishable from noise. Warnings being ignorable is the
 * root cause of the incident this file exists because of, so reproducing it with better
 * wording would be the one clearly wrong outcome.
 */

/** A refusal the server attributes to the app's game model. */
export interface CrowdyModelRefusal {
  code: string;
  message: string;
  /** The object the refusal is about, for deduplication and for the developer. */
  subject?: string;
  /**
   * For a quarantine: the lint finding that caused it, and what kind of object it is.
   *
   * FIRST-CLASS BECAUSE `reason` IS THE ONLY ACTIONABLE FIELD. Before these existed the
   * server's `quarantineReason` was reachable only by digging through the untyped `detail`
   * bag, so a developer was told their function is quarantined and left to guess which of
   * their lint errors did it. `subject` says which object; this says what to fix.
   */
  quarantine?: { kind?: string; reason: string };
  /** Anything else the server named in `extensions`, for the developer to read. */
  detail?: Record<string, unknown>;
}

/**
 * Error codes that mean "your game model is wrong", as opposed to a transient or
 * permissions failure. Keys off `extensions.code`, never the message text.
 */
export const MODEL_REFUSAL_CODES = new Set([
  'CONTAINER_TYPE_UNDEFINED',
  'OBJECT_QUARANTINED',
]);

/** Read a refusal out of a GraphQL error, or null if it is not one of ours. */
export function modelRefusalFrom(error: unknown): CrowdyModelRefusal | null {
  if (typeof error !== 'object' || error === null) return null;
  const extensions = (error as { extensions?: Record<string, unknown> })
    .extensions;
  if (!extensions) return null;
  const code = extensions.code;
  // A QUARANTINE ON `gameModelInvoke` DOES NOT ARRIVE AS `OBJECT_QUARANTINED`. That entry
  // point is a user-code boundary, so the server rebuilds the error from a
  // { code, blame, retryable } triple and the code becomes USER_CODE_ERROR — while the
  // quarantine fields survive. Recognising the code alone therefore misses the refusal on
  // the single path a player takes, which is where it matters most, so the presence of
  // `quarantineReason` is treated as identifying too.
  const quarantineReason =
    typeof extensions.quarantineReason === 'string'
      ? extensions.quarantineReason
      : undefined;
  const isRefusal =
    (typeof code === 'string' && MODEL_REFUSAL_CODES.has(code)) ||
    quarantineReason !== undefined;
  if (!isRefusal) return null;

  const subject =
    typeof extensions.typeName === 'string'
      ? extensions.typeName
      : typeof extensions.quarantinedName === 'string'
        ? extensions.quarantinedName
        : undefined;

  return {
    code: typeof code === 'string' ? code : 'OBJECT_QUARANTINED',
    message: String((error as { message?: unknown }).message ?? code),
    ...(subject ? { subject } : {}),
    ...(quarantineReason
      ? {
          quarantine: {
            ...(typeof extensions.quarantinedKind === 'string'
              ? { kind: extensions.quarantinedKind }
              : {}),
            reason: quarantineReason,
          },
        }
      : {}),
    detail: extensions,
  };
}

/**
 * Deduplicating sink for model refusals.
 *
 * Holds the set for the life of the process rather than expiring it: the point is to say a
 * thing once, and a TTL would only decide how often to repeat something the developer has
 * already read. A game that runs for hours would repeat it hourly for no gain.
 */
export class CrowdyModelLintLog {
  private readonly seen = new Set<string>();
  private readonly refusals: CrowdyModelRefusal[] = [];

  constructor(private readonly logger: CrowdyLogger = {}) {}

  /**
   * Record a refusal. Returns true when this was the first of its kind, which is also
   * when anything was logged.
   */
  record(refusal: CrowdyModelRefusal): boolean {
    const key = `${refusal.code}\u0000${refusal.subject ?? ''}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.refusals.push(refusal);

    // warn, not error: the app is running and the developer is the audience. An
    // error would push a game's own error handling into treating a schema problem
    // as a crash.
    this.logger.warn?.(
      `[crowdy:model] ${refusal.code}: ${refusal.message}\n` +
        '  This is reported once per distinct problem. Call gameModelLint with an ' +
        'app-admin token for everything currently wrong with this app.',
      refusal.detail,
    );
    return true;
  }

  /** Every distinct refusal seen so far, for an editor panel rather than a log tail. */
  collected(): readonly CrowdyModelRefusal[] {
    return this.refusals;
  }

  /** Forget everything, so a reconnect to a repaired app reports afresh. */
  reset(): void {
    this.seen.clear();
    this.refusals.length = 0;
  }
}
