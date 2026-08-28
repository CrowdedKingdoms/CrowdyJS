import type { FunctionNotificationInput } from '../generated/graphql.js';

/**
 * Builders for a model function's `notifications`, so the non-staleable shape is the easy
 * one to reach for.
 *
 * WHY THESE EXIST AT ALL, given the input is three lines of JSON. A channel notification
 * can name its target two ways, and only one of them survives the app being recreated or
 * moved between organizations. Membership is scoped to the app, so a function naming a
 * channel that belongs to a DIFFERENT app produces a notification that is built, signed,
 * sent to every server and then dropped for want of a recipient -- while the invoke
 * succeeds and the run records success, because emission is best-effort and never fails a
 * function. The only symptom is silence.
 *
 * That is not hypothetical: it is what a copied game model does, and the server now reports
 * it as the `notification_channel_foreign` lint error. A NAME is resolved per-invocation
 * against the app that is running, so it cannot go stale the way an id copied between apps
 * does. `sessionChannel` is the shape to prefer.
 */

/**
 * Notify every client in the app's default session channel.
 *
 * `$session_channel_name` is injected by the server from the app the function is RUNNING
 * in, so this expression is correct in any app that ever holds this definition -- which is
 * the whole point. It is also the channel every SDK client joins on connect, so this is
 * "tell everyone playing" with nothing to configure and nothing to keep in sync.
 */
export function sessionChannelNotification(
  payloadExpression: string,
): FunctionNotificationInput {
  return {
    kind: 'channel',
    args: [
      { name: 'channel_name', expression: '$session_channel_name' },
      { name: 'payload', expression: payloadExpression },
    ],
  };
}

/**
 * Notify a channel named by NAME rather than by id.
 *
 * Use this when the channel is not the session channel but is still derivable -- a lobby
 * per app, say, as `concat("lobby-", $app_id)`. Same property as above: resolved against
 * the running app, so a copied model addresses its new home.
 */
export function namedChannelNotification(
  channelNameExpression: string,
  payloadExpression: string,
): FunctionNotificationInput {
  return {
    kind: 'channel',
    args: [
      { name: 'channel_name', expression: channelNameExpression },
      { name: 'payload', expression: payloadExpression },
    ],
  };
}

/**
 * Notify a channel named by id.
 *
 * Correct when the id is READ FROM MODEL STATE -- `self.channel_id` on a container that
 * owns its own channel is the shape the matches blueprint uses, and it is app-portable
 * because the property travels with the row. A LITERAL id is the one to avoid, and the
 * server's `notification_channel_foreign` lint error exists to catch it.
 */
export function channelIdNotification(
  channelIdExpression: string,
  payloadExpression: string,
): FunctionNotificationInput {
  return {
    kind: 'channel',
    args: [
      { name: 'channel_id', expression: channelIdExpression },
      { name: 'payload', expression: payloadExpression },
    ],
  };
}
