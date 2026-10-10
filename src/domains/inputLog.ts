import type { GraphQLClient } from '../client.js';

import {
  InputLogMessagesDocument,
  InputLogSessionsDocument,
  type InputLogMessageFilter,
  type InputLogMessagesQuery,
  type InputLogSessionFilter,
  type InputLogSessionsQuery,
} from '../generated/graphql.js';

/** One page of {@link InputLogAPI.sessions}. */
export type InputLogSessionPage = InputLogSessionsQuery['inputLogSessions'];
/** One recorded session, as {@link InputLogAPI.sessions} returns it. */
export type InputLogSessionRecord = InputLogSessionPage['edges'][number]['node'];
/** One page of {@link InputLogAPI.messages}. */
export type InputLogMessagePage = InputLogMessagesQuery['inputLogMessages'];
/** One recorded input, as {@link InputLogAPI.messages} returns it. */
export type InputLogMessageRecord = InputLogMessagePage['edges'][number]['node'];

/** Paging and filters for {@link InputLogAPI.sessions} and {@link InputLogAPI.messages}. */
export interface InputLogPageOptions<Filter> {
  /** Page size. The server defaults to 50 and clamps to 1..200. */
  first?: number;
  /** A previous page's `pageInfo.endCursor`; omit for the first page. */
  after?: string;
  filter?: Filter;
}

/**
 * The input log: the client inputs the realtime servers recorded for an app with
 * replay logging on (`App.replayLoggingEnabled`, set with {@link AppsAPI.update}).
 * Exposed as `client.inputLog`.
 *
 * **Game plane.** Call it on the app-scoped client for the app (`portal.mintAppToken`
 * or hosted sign-in). An identity session token is refused, and the client follows
 * the app to its datacenter like any gameplay call.
 *
 * **Who sees what.** A player reads only the sessions and inputs they sent. A holder of
 * `manage_apps` on the app reads every session and may filter by `userId`.
 *
 * Inputs are kept for the input log's published retention (crowdedkingdoms.com/pricing,
 * up to about an hour longer) and then deleted, so an old session can still be listed
 * after its inputs are gone. Recording is best-effort: a session's `missingRecords` counts
 * the inputs that were accepted but never reached the log.
 *
 * Without input logging on the deployment, both calls throw {@link CrowdyGraphQLError}
 * `INPUT_LOG_UNAVAILABLE`. `messages` throws `INPUT_LOG_TEMPORARILY_UNAVAILABLE` when the
 * log cannot be read right now, and `INPUT_LOG_RATE_LIMITED` while another read of yours
 * (one per user, two per app) is running: both carry `extensions.retryable`, so wait a
 * moment and call again with the same cursor. An operation may select `inputLogMessages`
 * only once. The Game API release after v2.40.2 raises those two; v2.39.0 to v2.40.2 answer
 * `INPUT_LOG_UNAVAILABLE` instead, and an empty page when a read could not start in time.
 */
export class InputLogAPI {
  constructor(private gql: GraphQLClient) {}

  /**
   * Recorded sessions of an app, newest first. A session is one game token's inputs.
   *
   * @param appId - Numeric app id.
   * @param opts - Paging, and {@link InputLogSessionFilter}: `userId` (another user's
   *   needs `manage_apps`), `from` / `to`, and `messageType` (sessions containing it).
   * @returns One page: `edges[].node` are the sessions, `pageInfo.endCursor` the next
   *   page's `after`, `totalCount` the matching sessions. A node's `endReason` is how the
   *   session ended: `expired`, `revoked`, `reconnect` or `released` as the client saw it;
   *   `logging_off` when the app turned replay logging off during it; `shutdown` when the
   *   realtime server recording it stopped (the client reconnects elsewhere, a new session);
   *   `unrecorded` when no end was recorded and it was closed an hour after its last input; or
   *   null while it may still run. `missingRecords` counts the session's inputs that were
   *   accepted but never recorded (0 when complete, null on a session recorded before the
   *   count existed).
   * @throws {CrowdyGraphQLError} `FORBIDDEN` for another user's sessions without
   *   `manage_apps`, or `INPUT_LOG_UNAVAILABLE`.
   */
  async sessions(
    appId: string,
    opts: InputLogPageOptions<InputLogSessionFilter> = {},
  ): Promise<InputLogSessionPage> {
    const data = await this.gql.request(InputLogSessionsDocument, {
      appId,
      first: opts.first,
      after: opts.after,
      filter: opts.filter,
    });
    return data.inputLogSessions;
  }

  /**
   * The recorded inputs of one session, oldest first, each as the client sent it.
   *
   * `body` is the message in base64, from its type byte up to its authentication tail,
   * which is not recorded (`decodeBase64` gives the bytes). `sizeBytes` is what stored
   * input logs are billed on. Spatial inputs also carry their chunk and actor, and
   * channel inputs their channel.
   *
   * **Keep paging while `pageInfo.hasNextPage` is true**, not while `endCursor` is set: a page
   * can hold fewer than `first` inputs, or none, when it reached the server's time or scan
   * limit, and its `endCursor` still moves the next page on. Keep the previous cursor if one
   * comes back null, and retry `INPUT_LOG_TEMPORARILY_UNAVAILABLE` / `INPUT_LOG_RATE_LIMITED`
   * with it after a short back-off (MIGRATION.md, 18.8.0).
   *
   * @param appId - Numeric app id.
   * @param gameTokenId - The session: {@link InputLogSessionRecord.gameTokenId}.
   * @param opts - Paging, and {@link InputLogMessageFilter}: `from` / `to`, and
   *   `messageTypes` (at most 64).
   * @returns One page of inputs.
   * @throws {CrowdyGraphQLError} `NOT_FOUND` for a session that is not yours without
   *   `manage_apps`; `BAD_USER_INPUT` for a malformed cursor, or (from the Game API release
   *   after v2.40.2, which binds a cursor to its session) one from another session;
   *   `INPUT_LOG_TEMPORARILY_UNAVAILABLE` or `INPUT_LOG_RATE_LIMITED`, both retryable with the
   *   same cursor; or `INPUT_LOG_UNAVAILABLE`.
   */
  async messages(
    appId: string,
    gameTokenId: string,
    opts: InputLogPageOptions<InputLogMessageFilter> = {},
  ): Promise<InputLogMessagePage> {
    const data = await this.gql.request(InputLogMessagesDocument, {
      appId,
      gameTokenId,
      first: opts.first,
      after: opts.after,
      filter: opts.filter,
    });
    return data.inputLogMessages;
  }
}
