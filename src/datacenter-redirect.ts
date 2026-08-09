/**
 * Reading a datacenter move out of a GraphQL error, in one place.
 *
 * WHY THIS IS ITS OWN MODULE. The server can raise `WRONG_DATACENTER` on three
 * different transports — an HTTP POST, a websocket mutation, and a subscription —
 * and they surface as three different error types (`CrowdyGraphQLError` and two
 * shapes of `CrowdyRealtimeError`). The decision "is this a move, and where to" is
 * identical in all three, and it is exactly the kind of small predicate that grows
 * a second, slightly different copy the first time somebody fixes a bug in one of
 * them.
 *
 * WHAT THE SERVER GUARANTEES, and what this therefore checks. A `WRONG_DATACENTER`
 * always names an endpoint; an `APP_UNAVAILABLE` never does, because there is
 * nowhere to send the client. So a "move" here means BOTH the code and a usable
 * URL. A `WRONG_DATACENTER` with no URL is a server that has changed its mind
 * about the contract, and the safe reading is "do not move" rather than "move to
 * undefined".
 */

import { WRONG_DATACENTER_CODE } from './errors.js';

/** Where the server says this client should go instead. */
export interface DatacenterMove {
  /** Absolute HTTP origin or GraphQL URL of the app's own datacenter. */
  gameApiUrl: string;
  /** Matching websocket URL, when the server named one. */
  gameApiWsUrl?: string;
  /** The app the move is about, for logging. */
  appId?: string;
  /** The datacenter being moved to, for logging. */
  appDatacenter?: string;
}

interface ErrorLike {
  extensions?: Record<string, unknown> | null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The move a single GraphQL error asks for, or null if it is not asking for one.
 *
 * @param error An entry from a GraphQL `errors[]` array.
 */
export function moveFromError(
  error: ErrorLike | null | undefined,
): DatacenterMove | null {
  const extensions = error?.extensions;
  if (!extensions) return null;
  if (extensions.code !== WRONG_DATACENTER_CODE) return null;

  const gameApiUrl = asString(extensions.gameApiUrl);
  // No endpoint means no move. See the note at the top: this is a contract
  // violation rather than an ordinary case, and guessing would send the client
  // somewhere it was not told to go.
  if (!gameApiUrl) return null;

  return {
    gameApiUrl,
    gameApiWsUrl: asString(extensions.gameApiWsUrl),
    appId: asString(extensions.appId),
    appDatacenter: asString(extensions.appDatacenter),
  };
}

/**
 * The first move asked for anywhere in a GraphQL `errors[]` array.
 *
 * Scans the whole array rather than reading `errors[0]`, because a query naming
 * several apps is refused per app and the misrouted one need not be first — and
 * a client that only inspected the first error would ignore a redirect that was
 * sitting right there.
 */
export function moveFromErrors(
  errors: readonly (ErrorLike | null | undefined)[] | null | undefined,
): DatacenterMove | null {
  for (const error of errors ?? []) {
    const move = moveFromError(error);
    if (move) return move;
  }
  return null;
}
