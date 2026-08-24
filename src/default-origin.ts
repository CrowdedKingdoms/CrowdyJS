/**
 * GENERATED — do not edit. `scripts/sync-client-origins.mjs --write --tier dev`
 * in the cks-michael-root wrapper writes this file, and
 * `scripts/check-sdk-default-origin.mjs` refuses it when it names the wrong tier
 * or a host the tier table does not declare.
 *
 * THE DEFAULT IS LOAD-BEARING DURING A ROLLOUT, which is the opposite of how a
 * default is usually thought about: while the branches are mid-migration this is
 * what an unconfigured consumer gets, so a WRONG default on one branch is worse
 * than no default at all. Every fallback this SDK ever removed named a host that
 * was already dead. A generated file plus a gate is what makes this one different.
 *
 * Source: cp-tiers.json tiers.dev.clientOriginHost (mirror of CK_CLIENT_ORIGIN_HOST_BY_TIER in dns-tier.ts)
 */

/** The tier this build of the SDK is published for. */
export const CROWDY_DEFAULT_TIER = 'dev';

/** The public CK API origin for that tier. */
export const CROWDY_DEFAULT_HTTP_ORIGIN = 'https://ck.dev.crowdedkingdoms.com';

/** The same host over WebSocket. A scheme is composed; a hostname is looked up. */
export const CROWDY_DEFAULT_WS_ORIGIN = 'wss://ck.dev.crowdedkingdoms.com';

/** The bare hostname, for callers that need to compare rather than dial. */
export const CROWDY_DEFAULT_HOST = 'ck.dev.crowdedkingdoms.com';
