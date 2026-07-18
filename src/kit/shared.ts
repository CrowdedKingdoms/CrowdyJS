import { CrowdyGraphQLError } from '../errors.js';
import type { GameModelAPI } from '../domains/gameModel.js';
import type { GameModelInvokeMutation } from '../generated/graphql.js';

/** The raw server result of a `gameModelInvoke` call. */
export type RawInvokeResult = GameModelInvokeMutation['gameModelInvoke'];

/**
 * A kit invoke outcome: the server's authority/evaluation verdict plus the
 * parsed return value. Authority denials and expression errors are **not**
 * exceptions — check {@link success}.
 *
 * Older `cks-game-api` builds violate that contract for policy denials: they
 * throw a GraphQL error with `extensions.code === 'FORBIDDEN'` instead of
 * resolving with `success: false`. {@link kitInvoke} tolerates both server
 * generations by mapping that error onto a denial result — see {@link raw}
 * for how to recognize the mapped case.
 */
export interface KitInvokeResult<T = unknown> {
  /** `false` when the invoke policy denied the caller or the logic errored (rolled back). */
  success: boolean;
  /** The parsed `returnValueJson`, when present and `success` is true. */
  returnValue?: T;
  /** The server's error message when `success` is false. */
  errorMessage?: string;
  /**
   * The full server result (event id, applied mutations, …).
   *
   * When an older server reported a policy denial as a `FORBIDDEN` GraphQL
   * error (see the interface doc above), no server result exists; the SDK
   * synthesizes a minimal one — `success: false`, `errorMessage` from the
   * GraphQL error, `eventId: ''`, and no applied mutations.
   */
  raw: RawInvokeResult;
}

/** Wrap a raw invoke result, parsing the JSON return value. */
export function toKitInvokeResult<T>(raw: RawInvokeResult): KitInvokeResult<T> {
  let returnValue: T | undefined;
  if (raw.success && raw.returnValueJson != null) {
    try {
      returnValue = JSON.parse(raw.returnValueJson) as T;
    } catch {
      returnValue = undefined;
    }
  }
  return {
    success: raw.success,
    returnValue,
    errorMessage: raw.errorMessage ?? undefined,
    raw,
  };
}

/**
 * Invoke a model function and wrap the result.
 *
 * Server-generation tolerance: current `cks-game-api` builds resolve policy
 * denials with `success: false` (the kit contract), but older builds throw a
 * {@link CrowdyGraphQLError} with `extensions.code === 'FORBIDDEN'` instead.
 * This helper catches that specific error and maps it to a
 * `{ success: false, errorMessage }` result with a synthesized {@link
 * KitInvokeResult.raw}, so kit callers see one contract against both server
 * generations. Any other error is rethrown unchanged.
 */
export async function kitInvoke<T = unknown>(
  gameModel: GameModelAPI,
  input: {
    appId: string;
    functionName: string;
    selfContainerId: string;
    params?: Record<string, unknown>;
    sessionId?: string;
  },
): Promise<KitInvokeResult<T>> {
  let raw: RawInvokeResult;
  try {
    raw = await gameModel.invoke({
      appId: input.appId,
      functionName: input.functionName,
      selfContainerId: input.selfContainerId,
      paramsJson: JSON.stringify(input.params ?? {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });
  } catch (error) {
    if (error instanceof CrowdyGraphQLError && error.code === 'FORBIDDEN') {
      return {
        success: false,
        returnValue: undefined,
        errorMessage: error.message,
        raw: {
          eventId: '',
          functionName: input.functionName,
          success: false,
          returnValueJson: null,
          errorMessage: error.message,
          mutationsApplied: [],
        },
      };
    }
    throw error;
  }
  return toKitInvokeResult<T>(raw);
}

/** Read a container's visible properties as a parsed object. */
export async function kitContainerProperties(
  gameModel: GameModelAPI,
  appId: string,
  containerId: string,
): Promise<Record<string, unknown>> {
  const state = await gameModel.containerState({ appId, containerId });
  try {
    return JSON.parse(state.propertiesJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}
