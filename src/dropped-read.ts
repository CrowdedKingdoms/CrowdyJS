import {
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyTimeoutError,
  playerFaultOf,
  type CrowdyGraphQLErrorPayload,
} from './errors.js';

/**
 * Whether a failed read is worth reading again: nothing came back (a network failure, a body
 * that does not parse, or a timeout), what came back is not the API's answer (an HTTP 5xx or
 * 429 without GraphQL errors), or the API said it was busy (a refusal it marks retryable and
 * blames on the platform, `PLATFORM_BUSY`). A GraphQL refusal, any other HTTP status, a
 * `CrowdyProtocolError` (the SDK refused what came back) and the caller's own abort are
 * answers, and reading again would only repeat them.
 *
 * Not exported from the package. CrowdyCPP and CrowdyPy apply the same rule; change all three
 * together.
 */
export function isDroppedRead(error: unknown): boolean {
  if (error instanceof CrowdyNetworkError || error instanceof CrowdyTimeoutError) return true;
  if (error instanceof CrowdyHttpError) {
    if (error.status < 500 && error.status !== 429) return false;
    const errors = graphqlErrorsIn(error.body);
    return errors === null || isBusy(errors[0]);
  }
  return isBusy(error);
}

/** The wait the API asked for before the next read (`extensions.retryAfterMs`), or 0. */
export function retryAfterMsOf(error: unknown): number {
  const extensions = (error as { extensions?: Record<string, unknown> } | null)?.extensions;
  const value = extensions?.retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function isBusy(value: unknown): boolean {
  const fault = playerFaultOf(value);
  return fault !== null && fault.blame === 'PLATFORM' && fault.retryable;
}

function graphqlErrorsIn(body: string): CrowdyGraphQLErrorPayload[] | null {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown } | null;
    const errors = parsed?.errors;
    return Array.isArray(errors) && errors.length > 0 ? (errors as CrowdyGraphQLErrorPayload[]) : null;
  } catch {
    return null;
  }
}
