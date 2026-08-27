/**
 * Shared e2e/unit test helpers for the CrowdyJS suites.
 *
 * Centralizes the patterns that were previously copy-pasted across every
 * two-client test: the Node `WebSocket` polyfill, env-var gating / skip
 * computation, the standard client configs, fixed test UUIDs, and small timing /
 * encoding utilities. New suites should import from here rather than redefining
 * them.
 *
 * TWO ORIGINS, AND THE DIFFERENCE IS THE POINT.
 *
 * An app is resident in exactly ONE datacenter, because it is distributed on
 * `app_id` and all of its shards live on one node. `CROWDY_HTTP_URL` is the
 * ENTRY origin — the shared multivalue name (`ck.<tier>.crowdedkingdoms.com`) that
 * resolves to every datacenter's load balancer. It is the way IN and nothing
 * else: a cold client's first request lands wherever DNS pointed it, which on a
 * two-datacenter fleet is the wrong place about half the time.
 *
 * A real client therefore does not stay there. It asks where the app lives
 * (`discovery.apps()` before login, or the `gameApiUrl` that `mintAppToken`
 * returns after) and builds its gameplay client against THAT endpoint. The SDK
 * is built for this: `mintAppToken`, `exchangePortalCode` and `refreshAppToken`
 * all return `gameApiUrl` / `gameApiWsUrl` / `discoveryUrl`, and a `CrowdyClient`
 * that ends up on the wrong origin anyway is moved by the `WRONG_DATACENTER`
 * handler.
 *
 * This suite used to run every client — identity AND gameplay — against
 * `CROWDY_HTTP_URL`, which is a configuration no client the SDK ships for would
 * ever be in. It also made the suite non-deterministic: consecutive requests
 * from one "client" could be answered by different datacenters, and because the
 * UDP proxy connection is per-instance, a subscription opened on one and a
 * mutation sent to the other never met. That produced failures in tests as
 * simple as self-echo, which has only one client and cannot have a placement
 * problem.
 *
 * So: use {@link entryClientConfig} for identity and management, and
 * {@link gameClientConfig} — built from an endpoint the API handed back — for
 * anything holding an app-scoped token.
 */
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

// CrowdyJS realtime depends on a global `WebSocket`; Node doesn't have one.
// Set it once here so importing this module is enough for any suite that opens
// a realtime subscription.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

/** Env required for a FULL e2e run (HTTP + realtime). */
export const FULL_E2E_ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
];

/**
 * Env required for management-surface-only e2e (no realtime needed). Both point at
 * the same API: CROWDY_MANAGEMENT_URL was retired with the separate server.
 */
export const MANAGEMENT_E2E_ENV = ['CROWDY_HTTP_URL', 'CROWDY_OWNER_EMAIL'];

/** Return the subset of `keys` that are missing from the environment. */
export function missingEnv(keys) {
  return keys.filter((k) => !process.env[k]);
}

/**
 * Compute a node:test `skip` reason string for the given required env keys, or
 * `undefined` when they are all present (so the suite runs).
 */
export function skipReasonFor(keys) {
  const missing = missingEnv(keys);
  return missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;
}

/** Promise-based sleep. */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** A random base64-encoded binary blob of `byteCount` bytes (spatial state). */
export function randomBase64(byteCount = 96) {
  const buf = new Uint8Array(byteCount);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

/** A fresh 32-hex-char actor uuid (the UDP-wire actor id form). */
export function randomActorUuid() {
  return randomBytes(16).toString('hex');
}

/** Read a numeric env var with a default. */
export function numEnv(name, def) {
  const v = process.env[name];
  return v == null || v === '' ? def : Number(v);
}

/** The chunk most spatial tests register actors in. */
export const TEST_CHUNK = { x: '0', y: '0', z: '0' };

/** Deterministic per-suite actor uuids (stable so fan-out filters can match). */
export const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
export const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
export const TEST_UUID_C = 'ccccccccddddeeeeeeeeeeeeeeeeeeee';

/** Realtime tuning shared by both configs — short waits, because a hung e2e is a lost hour. */
const REALTIME_DEFAULTS = {
  retryAttempts: 4,
  retryInitialDelayMs: 250,
  retryMaxDelayMs: 2000,
  waitTimeoutMs: 5000,
};

/** The shared entry origin: `CROWDY_HTTP_URL`, a multivalue name over every datacenter. */
export function entryHttpUrl() {
  return process.env.CROWDY_HTTP_URL;
}

/** The shared entry origin's websocket form: `CROWDY_WS_URL`. */
export function entryWsUrl() {
  return process.env.CROWDY_WS_URL;
}

/**
 * Config for an IDENTITY / MANAGEMENT client, which correctly stays on the
 * shared entry origin.
 *
 * Sign-in, org and app administration, billing, compute authoring and operator
 * reads are not app-resident: they read and write reference tables that every
 * datacenter holds. `mintAppToken` belongs here too — you ask the entry origin
 * for a token and it tells you which datacenter to spend it in.
 */
export function entryClientConfig(overrides = {}) {
  return {
    httpUrl: entryHttpUrl(),
    wsUrl: entryWsUrl(),
    realtime: { ...REALTIME_DEFAULTS },
    ...overrides,
  };
}

/**
 * Config for a GAMEPLAY client, pinned to the datacenter the app actually lives
 * in.
 *
 * `endpoint` is what the API handed back — an `AppTokenResponse` from
 * `mintAppToken` / `exchangePortalCode`, or an `AppDiscovery` row. Never
 * hand-built: the whole point is that the server names the datacenter and the
 * client believes it.
 *
 * A null `gameApiUrl` is NOT an error. It means the app has no placement, and
 * the documented behaviour for that is "keep using the shared origin" — so we
 * fall back to the entry origin rather than refusing to run. An app that IS
 * placed but whose endpoint we ignored would be the bug.
 *
 * `discoveryUrl` is threaded into `realtime` so the client can recover if its
 * instance goes away. Under direct connect the API hands out ONE instance, and
 * without a discovery URL a client re-dials a dead host until its retries run
 * out and then sits there connected to nothing.
 */
export function gameClientConfig(endpoint = {}, overrides = {}) {
  const httpUrl = endpoint.gameApiUrl ?? entryHttpUrl();
  const wsUrl = endpoint.gameApiWsUrl ?? entryWsUrl();
  const { realtime: realtimeOverrides, ...rest } = overrides;
  return {
    httpUrl,
    wsUrl,
    realtime: {
      ...REALTIME_DEFAULTS,
      ...(endpoint.discoveryUrl ? { discoveryUrl: endpoint.discoveryUrl } : {}),
      ...realtimeOverrides,
    },
    ...rest,
  };
}

/**
 * True when `endpoint` names a datacenter different from the entry origin —
 * i.e. the app is placed and a real client would have moved.
 *
 * Used by the residency suite to assert the test is actually exercising the
 * multi-datacenter path rather than passing because everything happens to be
 * one host.
 */
export function isResidentElsewhere(endpoint = {}) {
  const url = endpoint.gameApiUrl;
  if (!url) return false;
  return originOf(url) !== originOf(entryHttpUrl());
}

/** Bare origin of a URL, for comparing endpoints that differ only by path. */
export function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/graphql\/?$/, '').replace(/\/$/, '');
  }
}

/**
 * Lazily import the built SDK so suites can be evaluated even when `dist/` is
 * not built (the offline unit tests still pass). Tests should `await loadSdk()`
 * inside the test body, not at module top-level.
 */
export async function loadSdk() {
  return import('../dist/index.js');
}

/** Lazily import the built World Stores subpath (`@crowdedkingdoms/crowdyjs/stores`). */
export async function loadStores() {
  return import('../dist/stores/index.js');
}
