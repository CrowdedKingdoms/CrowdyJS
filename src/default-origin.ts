/**
 * GENERATED — do not edit. The operator tooling's
 * `sync-client-origins.mjs --write --tier prod` writes this file, and
 * `check-sdk-default-origin.mjs` refuses it when it names the wrong tier or a
 * host that declaration does not carry. Regenerate; never hand-edit.
 *
 * THE DEFAULT IS LOAD-BEARING DURING A ROLLOUT, which is the opposite of how a
 * default is usually thought about: while the branches are mid-migration this is
 * what an unconfigured consumer gets, so a WRONG default on one branch is worse
 * than no default at all. Every fallback this SDK ever removed named a host that
 * was already dead. A generated file plus a gate is what makes this one different.
 *
 * Source: the operator's per-tier public CK API origin declaration, tier 'prod'
 */

/** The tier this build of the SDK is published for. */
export const CROWDY_DEFAULT_TIER = 'prod';

/** The public CK API origin for that tier. */
export const CROWDY_DEFAULT_HTTP_ORIGIN = 'https://ck.prod.crowdedkingdoms.com';

/** The same host over WebSocket. A scheme is composed; a hostname is looked up. */
export const CROWDY_DEFAULT_WS_ORIGIN = 'wss://ck.prod.crowdedkingdoms.com';

/** The bare hostname, for callers that need to compare rather than dial. */
export const CROWDY_DEFAULT_HOST = 'ck.prod.crowdedkingdoms.com';
