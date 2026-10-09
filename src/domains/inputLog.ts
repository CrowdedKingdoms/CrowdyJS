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
 * Inputs are kept for the input log's published retention (crowdedkingdoms.com/pricing)
 * and then deleted, so an old session can still be listed after its inputs are gone.
 * Without input logging on the deployment, both calls throw
 * {@link CrowdyGraphQLError} `INPUT_LOG_UNAVAILABLE`; `messages` also throws it, retryable
 * with the same cursor, when the log cannot be read right now.
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
   *   page's `after`, `totalCount` the matching sessions.
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
   * **Keep paging while `pageInfo.hasNextPage` is true.** A page can hold fewer than
   * `first` inputs, or none, when it reached the server's time or scan limit.
   *
   * @param appId - Numeric app id.
   * @param gameTokenId - The session: {@link InputLogSessionRecord.gameTokenId}.
   * @param opts - Paging, and {@link InputLogMessageFilter}: `from` / `to`, and
   *   `messageTypes` (at most 64).
   * @returns One page of inputs.
   * @throws {CrowdyGraphQLError} `NOT_FOUND` for a session that is not yours without
   *   `manage_apps`, `BAD_USER_INPUT` for a cursor from another session, or
   *   `INPUT_LOG_UNAVAILABLE`.
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
