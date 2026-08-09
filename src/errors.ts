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
