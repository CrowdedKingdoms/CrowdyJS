/**
 * Structured error classes thrown by CrowdyJS.
 *
 * Every failure the SDK raises is an instance of {@link CrowdyError} (which
 * extends the native `Error`), so you can catch the base class and branch on
 * the concrete subclass with `instanceof`. Transport-level problems
 * (`CrowdyHttpError`, `CrowdyNetworkError`, `CrowdyTimeoutError`) are distinct
 * from API-level problems (`CrowdyGraphQLError`), which lets you retry network
 * blips without retrying a rejected mutation.
 *
 * For API errors prefer branching on the **stable** `extensions.code`
 * (e.g. `UNAUTHENTICATED`, `SCOPE_MISSING`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`,
 * `RATE_LIMITED`) rather than the human-readable message — see the
 * [error-code reference](https://docs.crowdedkingdoms.com/overview/error-codes).
 *
 * @example
 * ```ts
 * import { CrowdyGraphQLError, CrowdyTimeoutError } from '@crowdedkingdoms/crowdyjs';
 * try {
 *   await client.actors.delete(uuid, key);
 * } catch (err) {
 *   if (err instanceof CrowdyGraphQLError && err.code === 'IDEMPOTENCY_CONFLICT') {
 *     // same key was already used with different arguments — don't retry blindly
 *   } else if (err instanceof CrowdyTimeoutError) {
 *     // safe to retry with the same idempotency key
 *   }
 * }
 * ```
 */

/** A single GraphQL error entry as returned in a response's `errors[]` array. */
export interface CrowdyGraphQLErrorPayload {
  /** Human-readable message. Do not branch on this — use {@link extensions}.code. */
  message: string;
  /** Source locations in the operation document, when the server reports them. */
  locations?: readonly unknown[];
  /** Response path to the field that errored (e.g. `['createCheckout']`). */
  path?: readonly (string | number)[];
  /**
   * Server-provided metadata. Carries the stable `code` plus, where applicable,
   * `remediation` (a short hint on how to resolve it) and `requiredPermission`
   * (the scope the caller is missing). See the published error-code reference.
   */
  extensions?: Record<string, unknown>;
}

/** Options accepted by the {@link CrowdyError} base constructor. */
export interface CrowdyErrorOptions {
  /** Message passed to the native `Error`. */
  message: string;
  /** Underlying cause (an inner error, rejected promise value, etc.). */
  cause?: unknown;
}

/**
 * Base class for every error thrown by the SDK. Catch this to handle any
 * CrowdyJS failure uniformly; `error.name` is set to the concrete subclass
 * name. Prefer `instanceof` checks on the subclasses below for branching.
 */
export class CrowdyError extends Error {
  /** The underlying cause, if this error wraps another. */
  readonly cause?: unknown;

  constructor(options: CrowdyErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.cause = options.cause;
  }
}

/**
 * A GraphQL endpoint returned a non-2xx HTTP status. This is a transport-level
 * failure (the request never reached resolver execution cleanly) — distinct
 * from {@link CrowdyGraphQLError}, which carries structured `errors[]` from a
 * 200 response. Typical causes: a `401` from an expired token at the gateway,
 * a `413`/`400` malformed request, or a `5xx`.
 */
export class CrowdyHttpError extends CrowdyError {
  /** HTTP status code of the response. */
  readonly status: number;
  /** Raw response body (often JSON text or an error page). */
  readonly body: string;

  constructor(status: number, body: string) {
    super({ message: `HTTP ${status}: ${body}` });
    this.status = status;
    this.body = body;
  }
}

/**
 * The server returned a 200 response whose `errors[]` array was non-empty.
 * This is the SDK's primary API-error type: authentication, authorization,
 * validation, idempotency conflicts, and business-rule rejections all surface
 * here.
 *
 * Branch on {@link code} (the first error's `extensions.code`) — it is a stable
 * contract; the message text is not. The full array is preserved on
 * {@link graphqlErrors} for multi-error responses.
 */
export class CrowdyGraphQLError extends CrowdyError {
  /** Every GraphQL error entry from the response, in server order. */
  readonly graphqlErrors: CrowdyGraphQLErrorPayload[];

  constructor(errors: CrowdyGraphQLErrorPayload[]) {
    super({ message: errors.map((error) => error.message).join('; ') });
    this.graphqlErrors = errors;
  }

  /**
   * Stable machine-readable code of the first error (its `extensions.code`),
   * e.g. `'UNAUTHENTICATED'`, `'SCOPE_MISSING'`, `'FORBIDDEN'`,
   * `'IDEMPOTENCY_CONFLICT'`, `'RATE_LIMITED'`, `'BAD_USER_INPUT'`. Returns
   * `undefined` when the server didn't attach a code. Branch on this rather
   * than parsing {@link message}.
   */
  get code(): unknown {
    return this.graphqlErrors[0]?.extensions?.code;
  }

  /**
   * The `extensions` bag of the first error: may include `remediation` (a hint
   * on how to fix it) and `requiredPermission` (the missing scope for
   * `FORBIDDEN`/`SCOPE_MISSING`).
   */
  get extensions(): Record<string, unknown> | undefined {
    return this.graphqlErrors[0]?.extensions;
  }
}

/**
 * Extension code the API uses to say "this app's datacenter is not serving".
 *
 * Distinct from {@link WRONG_DATACENTER_CODE}, and the distinction is the whole
 * point: that one names an endpoint to move to, this one deliberately does not,
 * because there is nowhere to move to.
 */
export const APP_UNAVAILABLE_CODE = 'APP_UNAVAILABLE';

/** Extension code the API uses to say "this app lives somewhere else". */
export const WRONG_DATACENTER_CODE = 'WRONG_DATACENTER';

/**
 * The app's own datacenter is not currently serving clients.
 *
 * WHAT MAKES THIS DIFFERENT FROM EVERY OTHER ERROR HERE: there is nothing the
 * client, the SDK, or the player can do about it. A `WRONG_DATACENTER` is fixed
 * by moving, an `UNAUTHENTICATED` by logging in, a `RATE_LIMITED` by waiting a
 * measurable amount of time. This one is fixed by an operator, and the honest
 * thing for an application to do is stop retrying in a loop and say so.
 *
 * {@link message} is written by the server to be shown to a player as-is: it says
 * what is happening, that it is being worked on, and that there is nothing for
 * them to do. Prefer it over inventing your own wording, because the server knows
 * things the client does not — whether this is a brief drain or a whole
 * datacenter — and its phrasing can improve without an SDK release.
 *
 * It carries NO endpoint, on purpose. Do not fall back to a cached one: the
 * cached one is in the datacenter that is down.
 *
 * ```ts
 * try {
 *   await client.grids.chunk(appId, x, y, z);
 * } catch (err) {
 *   if (err instanceof CrowdyAppUnavailableError) {
 *     showBanner(err.message);   // "This app is temporarily offline..."
 *     return;                    // do not retry in a tight loop
 *   }
 *   throw err;
 * }
 * ```
 */
export class CrowdyAppUnavailableError extends CrowdyGraphQLError {
  /** The app the server refused to serve, when it named one. */
  get appId(): string | undefined {
    const value = this.extensions?.appId;
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * The datacenter that is not serving. Diagnostic only — do not show a player a
   * datacenter code, and do not try to reach it.
   */
  get appDatacenter(): string | undefined {
    const value = this.extensions?.appDatacenter;
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * Whether it is worth trying again later. True today for every case the server
   * raises this for; read it rather than assuming, so a future permanent variant
   * (an app placed in a datacenter that has been destroyed, say) can say false
   * without the SDK changing.
   */
  get retryable(): boolean {
    return this.extensions?.retryable !== false;
  }
}

/**
 * Whose problem a failure is, as the platform attributes it.
 *
 * The one question a game cannot answer for itself: from inside a client there is no way
 * to tell "your function is too slow" from "we were busy and never ran it" from "this app
 * is out of budget", and until the server started saying so, all three arrived as the
 * same sentence. Presentation is still yours — this says only whose fault it was.
 */
export type CrowdyFaultBlame = 'PLATFORM' | 'AUTHOR' | 'BUDGET';

/**
 * The stable reason a call into app-authored code failed.
 *
 * Deliberately coarse. It never names an engine, a module, a function or a limit,
 * because those are the app developer's business and not the player's — the developer
 * reads the full detail in the Crowdy console. Treat it as an open union: the server may
 * add a code, and a client that switches on it should have a default branch.
 */
export type CrowdyFaultCode =
  | 'USER_CODE_ERROR'
  | 'USER_CODE_TOO_SLOW'
  | 'USER_CODE_LIMIT_EXCEEDED'
  | 'PLATFORM_BUSY'
  | 'PLATFORM_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'CIRCUIT_OPEN'
  | 'TEMPORARILY_DISABLED'
  | 'INVALID_REQUEST'
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'WRONG_DATACENTER'
  | 'APP_UNAVAILABLE'
  | (string & {});

/** What the platform says about a failure, in the only vocabulary a player is shown. */
export interface CrowdyPlayerFault {
  /** A stable, enumerated reason. Branch on this, never on a message. */
  code: CrowdyFaultCode;
  /** Whose problem it is. */
  blame: CrowdyFaultBlame;
  /** Whether repeating the identical call could succeed with nothing else changing. */
  retryable: boolean;
  /**
   * Why an open circuit opened, when the server knows. `watchdog_timeout`
   * means the failures were watchdog kills; wait out `retryAfterMs` and send
   * the hit again. Absent for every other code.
   */
  cause?: string;
}

/**
 * A call into code the platform did not write failed, and the platform has said whose
 * fault it was.
 *
 * WHY THIS EXISTS RATHER THAN A MESSAGE. Until 2026-08-11 a failure inside an app's own
 * function reached the client as the server's internal text — `Evaluation timed out` was
 * returned to players of every app for four days while the real cause was a platform
 * query taking 1.2 seconds. A game rendering that string told its players their own game
 * was broken, on the platform's behalf, in the platform's words. Nothing on the wire
 * distinguished the three cases, so no game could have done better.
 *
 * Now the server attributes blame and the game decides what to render. Nothing in
 * {@link message} is written by the app's code or by an engine; it is a platform-authored
 * sentence, safe to show as-is, and you are expected to replace it with your own.
 *
 * @example
 * ```ts
 * try {
 *   await client.graphql.request(SomeDocument, variables);
 * } catch (err) {
 *   const fault = playerFaultOf(err);
 *   if (!fault) throw err;
 *   if (fault.blame === 'PLATFORM' && fault.retryable) return retryLater();
 *   if (fault.blame === 'BUDGET') return showBanner('The arena is busy — one moment.');
 *   return showBanner('That move did not work.');   // AUTHOR: our bug, our wording
 * }
 * ```
 */
export class CrowdyUserCodeFaultError extends CrowdyGraphQLError {
  /** The platform's attribution: `{ code, blame, retryable }`. */
  get fault(): CrowdyPlayerFault {
    const extensions = this.extensions ?? {};
    return faultFields(
      (extensions.code as CrowdyFaultCode) ?? 'PLATFORM_ERROR',
      (extensions.blame as CrowdyFaultBlame) ?? 'PLATFORM',
      extensions.retryable === true,
      extensions.cause,
    );
  }

  /** Whose problem this is. Shorthand for `fault.blame`. */
  get blame(): CrowdyFaultBlame {
    return this.fault.blame;
  }

  /** Whether repeating the identical call could succeed. Shorthand for `fault.retryable`. */
  get retryable(): boolean {
    return this.fault.retryable;
  }
}

/** Extensions carry `blame` only for a fault the platform has attributed. */
function faultFromExtensions(
  extensions: Record<string, unknown> | undefined,
): CrowdyPlayerFault | null {
  if (!extensions || typeof extensions.blame !== 'string') return null;
  return faultFields(
    (extensions.code as CrowdyFaultCode) ?? 'PLATFORM_ERROR',
    extensions.blame as CrowdyFaultBlame,
    extensions.retryable === true,
    extensions.cause,
  );
}

function faultFields(
  code: CrowdyFaultCode,
  blame: CrowdyFaultBlame,
  retryable: boolean,
  cause: unknown,
): CrowdyPlayerFault {
  const fault: CrowdyPlayerFault = { code, blame, retryable };
  if (typeof cause === 'string' && cause.length > 0) fault.cause = cause;
  return fault;
}

/**
 * Read the platform's attribution from EITHER carrier, so a game branches once.
 *
 * There are two. A refused or failed call THROWS, and the fault arrives in the GraphQL
 * error's extensions. A result may instead RETURN one: a verdict that still carries
 * whatever did apply comes back as `success: false` with a `fault` field. This function
 * accepts both and gives you one thing to switch on.
 *
 * Returns `null` when there is no fault: a successful result, or an error that is not an
 * attributed one (a network drop, a timeout, an ordinary validation error elsewhere in
 * the API). `null` means "this is not a question about whose code failed" — keep
 * handling it the way you already do.
 *
 * @example
 * ```ts
 * const fault = playerFaultOf(errorOrResult);
 * if (fault?.retryable) scheduleRetry();
 * ```
 */
export function playerFaultOf(value: unknown): CrowdyPlayerFault | null {
  if (!value || typeof value !== 'object') return null;

  if (value instanceof CrowdyGraphQLError) {
    return faultFromExtensions(value.extensions);
  }

  // The in-band carrier: an invoke result that reports its own failure.
  const result = value as {
    success?: unknown;
    fault?: {
      code?: unknown;
      blame?: unknown;
      retryable?: unknown;
      cause?: unknown;
    } | null;
  };
  const fault = result.fault;
  if (fault && typeof fault.blame === 'string') {
    return faultFields(
      (fault.code as CrowdyFaultCode) ?? 'PLATFORM_ERROR',
      fault.blame as CrowdyFaultBlame,
      fault.retryable === true,
      fault.cause,
    );
  }

  // A raw GraphQL error payload, e.g. one entry pulled out of `graphqlErrors`.
  const payload = value as CrowdyGraphQLErrorPayload;
  if (payload.extensions) return faultFromExtensions(payload.extensions);

  return null;
}

/** `extensions.code` for "an actor with this uuid already exists" (HTTP 409). */
export const ACTOR_EXISTS_CODE = 'ACTOR_EXISTS';
/** `extensions.code` for "this player's access to the app was revoked" (HTTP 403). */
export const ACCESS_REVOKED_CODE = 'ACCESS_REVOKED';
/** `extensions.code` for "this player is suspended from the app until a time" (HTTP 403). */
export const ACCESS_SUSPENDED_CODE = 'ACCESS_SUSPENDED';
/** `extensions.code` for "this player holds no access to the app" (HTTP 403). */
export const ACCESS_NOT_GRANTED_CODE = 'ACCESS_NOT_GRANTED';
/** `extensions.code` for "the app is paused" (HTTP 403); see {@link appPausedOf}. */
export const APP_PAUSED_CODE = 'APP_PAUSED';
/**
 * `extensions.code` for "a platform operator has blocked this account" (HTTP 403), on every
 * sign-in and every request of a blocked account; see {@link accountBlockedOf}.
 */
export const ACCOUNT_BLOCKED_CODE = 'ACCOUNT_BLOCKED';
/**
 * `extensions.code` for "this channel or team has banned the user" (HTTP 403), on a join, a
 * request, an add or an invite; see {@link groupMemberBannedOf}.
 */
export const GROUP_MEMBER_BANNED_CODE = 'GROUP_MEMBER_BANNED';
/**
 * `extensions.code` for "an org-managed player cannot do this" (HTTP 403): it has no wallet,
 * and its mods are refused where its organization has not switched them on for the app; see
 * {@link managedPlayerNotAllowedOf}.
 */
export const MANAGED_PLAYER_NOT_ALLOWED_CODE = 'MANAGED_PLAYER_NOT_ALLOWED';
/**
 * `extensions.code` for "the organization's signed player assertion was refused" (HTTP 401),
 * with the failed check in `extensions.reason`; see {@link assertionRejectedOf}.
 */
export const ASSERTION_REJECTED_CODE = 'ASSERTION_REJECTED';
/**
 * `extensions.code` for "the player's organization has not accepted the current Org-Managed
 * Players Addendum" (HTTP 403), on an org-managed player's sign-in and refresh and on
 * provisioning; see {@link orgLegalAcceptanceRequiredOf}.
 */
export const ORG_LEGAL_ACCEPTANCE_REQUIRED_CODE = 'ORG_LEGAL_ACCEPTANCE_REQUIRED';
/**
 * `extensions.code` for "the player has not accepted the current required documents" (HTTP
 * 403): the platform's player documents or the app's own, listed in
 * `extensions.missingDocuments`; see {@link legalAcceptanceRequiredOf}.
 */
export const LEGAL_ACCEPTANCE_REQUIRED_CODE = 'LEGAL_ACCEPTANCE_REQUIRED';
/**
 * `extensions.code` for "the player's age is not known" (HTTP 403), at a token's mint or
 * refresh, or the developer documents for an account with no age; see {@link ageRequiredOf}.
 */
export const AGE_REQUIRED_CODE = 'AGE_REQUIRED';
/**
 * `extensions.code` for "the player may not play this" by age (HTTP 403); see
 * {@link ageRequirementNotMetOf}.
 */
export const AGE_REQUIREMENT_NOT_MET_CODE = 'AGE_REQUIREMENT_NOT_MET';
/**
 * `extensions.code` for "Crowded Kingdoms does not serve the player's country" (HTTP 403); see
 * {@link territoryNotSupportedOf}.
 */
export const TERRITORY_NOT_SUPPORTED_CODE = 'TERRITORY_NOT_SUPPORTED';
/**
 * `extensions.code` for "the app does not keep the safety log where it must" (HTTP 403); see
 * {@link safetyLogRequiredOf}.
 */
export const SAFETY_LOG_REQUIRED_CODE = 'SAFETY_LOG_REQUIRED';
/**
 * `extensions.code` for "parental consent cannot be requested on this deployment" (HTTP 503);
 * see {@link parentalConsentUnavailableOf}.
 */
export const PARENTAL_CONSENT_UNAVAILABLE_CODE = 'PARENTAL_CONSENT_UNAVAILABLE';
/**
 * `extensions.code` for "the player has as many contacts, waiting requests or blocks in the app
 * as the platform allows" (HTTP 409); see {@link socialLimitReachedOf}.
 */
export const SOCIAL_LIMIT_REACHED_CODE = 'SOCIAL_LIMIT_REACHED';
/**
 * `extensions.code` for "the Minecraft account could not be confirmed" (HTTP 401), with the
 * failed check in `extensions.reason`; see {@link minecraftVerificationFailedOf}.
 */
export const MINECRAFT_VERIFICATION_FAILED_CODE = 'MINECRAFT_VERIFICATION_FAILED';
/**
 * `extensions.code` for "Mojang's session service did not answer" (HTTP 503, retryable); see
 * {@link minecraftVerificationUnavailableOf}.
 */
export const MINECRAFT_VERIFICATION_UNAVAILABLE_CODE = 'MINECRAFT_VERIFICATION_UNAVAILABLE';

/**
 * Why a Minecraft sign-in was not confirmed, as `extensions.reason` carries it. Open union:
 * the server may add one.
 */
export type MinecraftVerificationFailure =
  | 'malformed'
  | 'forged'
  | 'expired'
  | 'not_joined'
  | 'replayed'
  | (string & {});

/** One document a refused player still has to accept, from `extensions.missingDocuments`. */
export interface MissingLegalDocument {
  /** The document's stable id, such as `player-terms` or an app's own `rules`. */
  documentId: string;
  /** The version the player has to accept. */
  version: string;
  /** The app whose own document it is; null for a platform document. */
  appId: string | null;
}

/**
 * Why an app is paused, as `extensions.reason` on `APP_PAUSED` and
 * `AppRuntimeGate.reason` carry it. Open union: the server may add one.
 */
export type AppPauseReason =
  | 'insufficient_funds'
  | 'spend_cap'
  | 'subscription_lapsed'
  | (string & {});

/** The first error entry carrying `code`, from an error or a raw payload. */
function errorWithCode(
  value: unknown,
  code: string,
): CrowdyGraphQLErrorPayload | null {
  if (!value || typeof value !== 'object') return null;
  const entries: readonly CrowdyGraphQLErrorPayload[] =
    value instanceof CrowdyGraphQLError
      ? value.graphqlErrors
      : [value as CrowdyGraphQLErrorPayload];
  return entries.find((entry) => entry?.extensions?.code === code) ?? null;
}

/**
 * An `ACTOR_EXISTS` refusal (creating an actor whose uuid is taken), or `null`.
 * `ownedByCaller` is `extensions.ownedByCaller`: `true` means the actor is
 * already yours (a retried create; read it rather than failing), `false` that
 * another player holds the uuid, `null` when the server did not say.
 */
export function actorExistsOf(value: unknown): { ownedByCaller: boolean | null } | null {
  const entry = errorWithCode(value, ACTOR_EXISTS_CODE);
  if (!entry) return null;
  const owned = entry.extensions?.ownedByCaller;
  return { ownedByCaller: typeof owned === 'boolean' ? owned : null };
}

/** A refusal of the player's own access to an app; see {@link accessRefusalOf}. */
export interface CrowdyAccessRefusal {
  code: 'ACCESS_REVOKED' | 'ACCESS_SUSPENDED' | 'ACCESS_NOT_GRANTED';
  /** `extensions.suspendedUntil` (ISO-8601) on `ACCESS_SUSPENDED`; access returns by itself then. */
  suspendedUntil?: string;
}

/**
 * An access refusal (`ACCESS_REVOKED`, `ACCESS_SUSPENDED` or `ACCESS_NOT_GRANTED`,
 * all HTTP 403) from a thrown error or a raw error payload, or `null`. None of
 * them is fixed by retrying; tell the player.
 */
export function accessRefusalOf(value: unknown): CrowdyAccessRefusal | null {
  for (const code of [
    ACCESS_SUSPENDED_CODE,
    ACCESS_REVOKED_CODE,
    ACCESS_NOT_GRANTED_CODE,
  ] as const) {
    const entry = errorWithCode(value, code);
    if (!entry) continue;
    const refusal: CrowdyAccessRefusal = { code };
    const until = entry.extensions?.suspendedUntil;
    if (typeof until === 'string' && until.length > 0) refusal.suspendedUntil = until;
    return refusal;
  }
  return null;
}

/**
 * An `ACCOUNT_BLOCKED` refusal (HTTP 403: a platform operator blocked the account), or
 * `null`. `blockedUntil` is `extensions.blockedUntil` (ISO-8601) for a timed block, when it
 * lapses by itself; `null` while it lasts until lifted. Not fixed by retrying; sign out and
 * tell the player.
 */
export function accountBlockedOf(value: unknown): { blockedUntil: string | null } | null {
  const entry = errorWithCode(value, ACCOUNT_BLOCKED_CODE);
  if (!entry) return null;
  const until = entry.extensions?.blockedUntil;
  return { blockedUntil: typeof until === 'string' && until.length > 0 ? until : null };
}

/** Whether an error is a `GROUP_MEMBER_BANNED` refusal (HTTP 403); only an unban lifts it. */
export function groupMemberBannedOf(value: unknown): boolean {
  return errorWithCode(value, GROUP_MEMBER_BANNED_CODE) !== null;
}

/**
 * Whether an error is a `MANAGED_PLAYER_NOT_ALLOWED` refusal (HTTP 403): an org-managed
 * player asked for a wallet, or for a mod, a Crowdy Studio write or the Studio agent in an app
 * whose organization has not switched its managed players' mods on. Not fixed by retrying.
 */
export function managedPlayerNotAllowedOf(value: unknown): boolean {
  return errorWithCode(value, MANAGED_PLAYER_NOT_ALLOWED_CODE) !== null;
}

/**
 * An `ASSERTION_REJECTED` refusal (HTTP 401) from
 * `portal.exchangeManagedPlayerAssertion`, or `null`. `reason` is `extensions.reason`, the
 * check that failed: for example `expired`, `replayed`, `signature`, `audience` or
 * `unknown_key`. Resending the same assertion cannot succeed; ask the organization's
 * sign-in service for a new one.
 */
export function assertionRejectedOf(value: unknown): { reason: string | null } | null {
  const entry = errorWithCode(value, ASSERTION_REJECTED_CODE);
  if (!entry) return null;
  const reason = entry.extensions?.reason;
  return { reason: typeof reason === 'string' && reason.length > 0 ? reason : null };
}

/**
 * Whether an error is an `ORG_LEGAL_ACCEPTANCE_REQUIRED` refusal (HTTP 403, ck-api v2.53.0):
 * the player's organization has not accepted the current Org-Managed Players Addendum, so it
 * signs no player in, provisions none, and its players' tokens do not refresh. The player
 * cannot fix it, and neither can the organization's server: an admin of the organization
 * accepts it in Studio. Not fixed by retrying. Distinct from the player's own
 * `LEGAL_ACCEPTANCE_REQUIRED` ({@link isLegalAcceptanceRequiredError}), which a managed
 * player never gets.
 */
export function orgLegalAcceptanceRequiredOf(value: unknown): boolean {
  return errorWithCode(value, ORG_LEGAL_ACCEPTANCE_REQUIRED_CODE) !== null;
}

/**
 * A `LEGAL_ACCEPTANCE_REQUIRED` refusal (HTTP 403), or `null`. `missingDocuments` is what the
 * player still has to accept: the platform's player documents (`appId` null) and the app's own
 * (`appId` set). Show those documents, then record the player's agreement
 * (`auth.recordPlayerConsents`, with the app's `appId` for its own); a browser game sends the
 * player back through `portal.signIn`, where Studio asks. Empty when the server did not list
 * them (an older API, or a refused `register` or `recordPlayerConsents`). Not fixed by retrying.
 * Distinct from the organization's `ORG_LEGAL_ACCEPTANCE_REQUIRED`
 * ({@link orgLegalAcceptanceRequiredOf}).
 */
export function legalAcceptanceRequiredOf(
  value: unknown,
): { missingDocuments: MissingLegalDocument[] } | null {
  const entry = errorWithCode(value, LEGAL_ACCEPTANCE_REQUIRED_CODE);
  if (!entry) return null;
  const listed = entry.extensions?.missingDocuments;
  const missingDocuments: MissingLegalDocument[] = [];
  if (Array.isArray(listed)) {
    for (const item of listed) {
      const doc = item as { documentId?: unknown; version?: unknown; appId?: unknown } | null;
      if (typeof doc?.documentId !== 'string' || typeof doc.version !== 'string') continue;
      const appId = doc.appId;
      missingDocuments.push({
        documentId: doc.documentId,
        version: doc.version,
        appId:
          typeof appId === 'string' && appId.length > 0
            ? appId
            : typeof appId === 'number'
              ? String(appId)
              : null,
      });
    }
  }
  return { missingDocuments };
}

/**
 * Whether an error is an `AGE_REQUIRED` refusal (HTTP 403): the player's age is not known.
 * For an account, ask the player's birth date and country on your own neutral screen and call
 * `auth.recordPlayerAge`, then mint again; a browser game sends the player back through
 * `portal.signIn`, where Studio asks. For an org-managed player, the organization sends
 * `ageYears` and `country` when it signs the player in. Not fixed by retrying as is.
 */
export function ageRequiredOf(value: unknown): boolean {
  return errorWithCode(value, AGE_REQUIRED_CODE) !== null;
}

/**
 * Whether an error is an `AGE_REQUIREMENT_NOT_MET` refusal (HTTP 403): by age, the player may
 * not play this app, or create or administer an organization. Not retryable, and asking for
 * the age again changes nothing: an account keeps the answer it gave.
 *
 * Deliberately a boolean. No refusal names an age (the platform's neutral age screen): tell the
 * player they cannot play this, without naming an age or a minimum, and do not offer to enter
 * the date again. Older APIs put `minimumAge` and `ageBracket` in the extensions; this reader
 * does not surface them, and a game must not show them.
 */
export function ageRequirementNotMetOf(value: unknown): boolean {
  return errorWithCode(value, AGE_REQUIREMENT_NOT_MET_CODE) !== null;
}

/**
 * A `TERRITORY_NOT_SUPPORTED` refusal (HTTP 403), or `null`: Crowded Kingdoms does not serve
 * the player's country (the one they connect from, the one they declared, or the one their
 * organization asserted). `country` is `extensions.country` (ISO 3166-1 alpha-2), null when the
 * server did not say. Not retryable; tell the player it is not available where they are.
 */
export function territoryNotSupportedOf(value: unknown): { country: string | null } | null {
  const entry = errorWithCode(value, TERRITORY_NOT_SUPPORTED_CODE);
  if (!entry) return null;
  const country = entry.extensions?.country;
  return { country: typeof country === 'string' && country.length > 0 ? country : null };
}

/**
 * Whether an error is a `SAFETY_LOG_REQUIRED` refusal (HTTP 403): the app does not keep the
 * safety log (replay logging) where it must. A player under 18 gets it at the mint of an app
 * without one, and an app admitting players under 18 cannot turn its log off. The player
 * cannot fix it: the app's admins turn the log on (`apps.update`) or raise its minimum age.
 */
export function safetyLogRequiredOf(value: unknown): boolean {
  return errorWithCode(value, SAFETY_LOG_REQUIRED_CODE) !== null;
}

/**
 * Whether an error is a `PARENTAL_CONSENT_UNAVAILABLE` refusal (HTTP 503) from
 * `safety.requestParentalConsent`: the deployment's consent service is not configured. Not
 * fixed by retrying soon; voice and video stay off for the player meanwhile.
 */
export function parentalConsentUnavailableOf(value: unknown): boolean {
  return errorWithCode(value, PARENTAL_CONSENT_UNAVAILABLE_CODE) !== null;
}

/**
 * Whether an error is a `SOCIAL_LIMIT_REACHED` refusal (HTTP 409): the player already has as
 * many contacts, waiting contact requests or blocks in the app as the platform allows (the
 * message says which). Remove some first; not fixed by retrying.
 */
export function socialLimitReachedOf(value: unknown): boolean {
  return errorWithCode(value, SOCIAL_LIMIT_REACHED_CODE) !== null;
}

/**
 * A `MINECRAFT_VERIFICATION_FAILED` refusal (HTTP 401) from `portal.signInWithMinecraft`, or
 * `null`. `reason` is `extensions.reason`: `malformed`, `forged`, `expired`, `not_joined` or
 * `replayed`. Never resend the same server id: ask for a new challenge
 * (`portal.minecraftChallenge`) and join it again.
 */
export function minecraftVerificationFailedOf(
  value: unknown,
): { reason: MinecraftVerificationFailure | null } | null {
  const entry = errorWithCode(value, MINECRAFT_VERIFICATION_FAILED_CODE);
  if (!entry) return null;
  const reason = entry.extensions?.reason;
  return { reason: typeof reason === 'string' && reason.length > 0 ? reason : null };
}

/**
 * Whether an error is a `MINECRAFT_VERIFICATION_UNAVAILABLE` refusal (HTTP 503): Mojang's
 * session service did not answer, so the account was not confirmed. Retryable shortly, with a
 * new challenge.
 */
export function minecraftVerificationUnavailableOf(value: unknown): boolean {
  return errorWithCode(value, MINECRAFT_VERIFICATION_UNAVAILABLE_CODE) !== null;
}

/**
 * An `APP_PAUSED` refusal (HTTP 403: the app's runtime gate is not ACTIVE), or
 * `null`. `reason` is `extensions.reason`. Show the player that the world is
 * paused instead of retrying in a loop.
 */
export function appPausedOf(value: unknown): { reason: AppPauseReason | null } | null {
  const entry = errorWithCode(value, APP_PAUSED_CODE);
  if (!entry) return null;
  const reason = entry.extensions?.reason;
  return { reason: typeof reason === 'string' && reason.length > 0 ? reason : null };
}

/**
 * Whether an app's runtime gate (`AppTokenResponse.runtimeGate`,
 * `GameClientBootstrap.runtimeGate`) says the app is paused: any status but
 * `ACTIVE`. A missing gate (an older server) reads as not paused.
 */
export function isAppPaused(
  gate: { status: string } | null | undefined,
): boolean {
  return gate != null && gate.status !== 'ACTIVE';
}

/**
 * A network-level failure before any HTTP response was received: DNS failure,
 * TLS error, connection refused, or an aborted `fetch`. Generally retryable
 * with backoff. The original failure is on {@link CrowdyError.cause}.
 */
export class CrowdyNetworkError extends CrowdyError {
  constructor(cause: unknown) {
    super({ message: `Network error: ${String(cause)}`, cause });
  }
}

/**
 * An HTTP request to a GraphQL endpoint exceeded the configured `timeout`.
 *
 * Note: realtime `...AndWait` echo timeouts do **not** throw this — they reject
 * with {@link CrowdyRealtimeError} (`code === 'UDP_SEQUENCE_TIMEOUT'`). For
 * idempotent operations — or any mutation you passed an `idempotencyKey` — a
 * retry is safe; the server replays the first result.
 */
export class CrowdyTimeoutError extends CrowdyError {
  constructor(timeoutMs: number) {
    super({ message: `Request timed out after ${timeoutMs}ms` });
  }
}

/**
 * A realtime/WebSocket failure: a subscription couldn't be established, was
 * rejected, or dropped — or an `...AndWait` spatial send didn't receive its
 * matching echo in time.
 *
 * Branch on {@link code}:
 * - `'UDP_SEQUENCE_TIMEOUT'` — an `...AndWait` send timed out (retryable).
 * - `'APP_ID_REQUIRED'` — subscribed without an `appId` (not retryable).
 * - `'AUTH_REQUIRED'` / `'AUTH_CLEARED'` — no/!cleared session token.
 * - `'WEBSOCKET_ERROR'` / `'SUBSCRIPTION_FAILED'` — transport-level drops.
 *
 * When an `...AndWait` send is answered by a server `GenericErrorResponse`,
 * {@link code} carries that server error code instead. Use {@link retryable}
 * to decide whether to reconnect/retry.
 */
export class CrowdyRealtimeError extends CrowdyError {
  /** Server- or client-assigned reason code, when available. */
  readonly code?: string;
  /** Whether reconnecting is expected to succeed (transient vs. fatal). */
  readonly retryable?: boolean;

  constructor(message: string, options: { code?: string; retryable?: boolean; cause?: unknown } = {}) {
    super({ message, cause: options.cause });
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

/**
 * A server response failed the SDK's structural validation — the payload was
 * shaped unexpectedly (e.g. a missing required field on a notification). Almost
 * always indicates an SDK/server version mismatch; check the server
 * compatibility floor in the README.
 */
export class CrowdyProtocolError extends CrowdyError {}
