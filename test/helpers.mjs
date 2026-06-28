/**
 * Shared e2e/unit test helpers for the CrowdyJS suites.
 *
 * Centralizes the patterns that were previously copy-pasted across every
 * two-client test: the Node `WebSocket` polyfill, env-var gating / skip
 * computation, the standard client config, fixed test UUIDs, and small timing /
 * encoding utilities. New suites should import from here rather than redefining
 * them.
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

/** Env required for a FULL e2e run (management-api + game-api + realtime). */
export const FULL_E2E_ENV = [
  'CROWDY_MANAGEMENT_URL',
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
];

/** Env required for management-only e2e (no game-api / realtime needed). */
export const MANAGEMENT_E2E_ENV = [
  'CROWDY_MANAGEMENT_URL',
  'CROWDY_OWNER_EMAIL',
];

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

/** Standard CrowdyClient config from env, with optional overrides. */
export function clientConfig(overrides = {}) {
  return {
    managementUrl: process.env.CROWDY_MANAGEMENT_URL,
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: {
      retryAttempts: 4,
      retryInitialDelayMs: 250,
      retryMaxDelayMs: 2000,
      waitTimeoutMs: 5000,
    },
    ...overrides,
  };
}

/**
 * Lazily import the built SDK so suites can be evaluated even when `dist/` is
 * not built (the offline unit tests still pass). Tests should `await loadSdk()`
 * inside the test body, not at module top-level.
 */
export async function loadSdk() {
  return import('../dist/index.js');
}
