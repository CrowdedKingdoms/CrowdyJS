/**
 * Self-echo (round-trip) contract for actor updates against a deployed env.
 *
 * There is NO dedicated per-request response on the wire: the legacy
 * `ActorUpdateResponse` (opcode 129) is retired and never emitted. Instead the
 * game server fans an actor update out to every client in the target chunk
 * INCLUDING the sender, so a single client that sends its own update receives
 * its own `ActorUpdateNotification` back, correlated by `sequenceNumber`. That
 * self-notification is exactly what `sendActorUpdateAndWait` resolves with.
 *
 * This test pins that behavior so the "self-echo / full_rtt" expectation is
 * measured against the real design (a self-ActorUpdateNotification), not the
 * dead `ActorUpdateResponse` type.
 *
 * Black-box: provisions one entitled player through the management API only
 * (see provision.mjs). Auto-skips unless the full e2e env is present:
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' \
 *   npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { provisionAppWithPlayers, mintAppToken } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const SYNC_WAIT_MS = Number(process.env.CROWDY_TEST_SYNC_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clientConfig() {
  return {
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: {
      retryAttempts: 4,
      retryInitialDelayMs: 250,
      retryMaxDelayMs: 2000,
      waitTimeoutMs: 5000,
    },
  };
}

test(
  'sendActorUpdateAndWait resolves with the sender\'s own ActorUpdateNotification (self-echo)',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');

    const { appId, players } = await provisionAppWithPlayers(1);
    await sleep(SYNC_WAIT_MS); // let replica-sync mirror access + grid grants

    const client = createCrowdyClient(clientConfig());
    client.setToken(await mintAppToken(appId, players[0].token));

    try {
      // Open the WS subscription so the self-notification can be delivered.
      const unsubscribe = client.udp.subscribe({}, appId);
      await sleep(2000);

      // The first spatial message into a fresh chunk is dropped while the server
      // loads grid permissions, so register, wait, then do the awaited send.
      await client.udp.sendActorUpdate({
        appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID, state: 'AA==', sequenceNumber: 1,
      });
      await sleep(1500);

      const echo = await client.udp.sendActorUpdateAndWait({
        appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID, state: 'AA==', sequenceNumber: 42,
      });

      // The echo is the sender's own fan-out notification — NOT an
      // ActorUpdateResponse (that type is never emitted).
      assert.equal(
        echo.__typename,
        'ActorUpdateNotification',
        `self-echo should be an ActorUpdateNotification, got ${echo.__typename}`,
      );
      assert.equal(Number(echo.sequenceNumber), 42, 'self-echo carries the request sequenceNumber');
      assert.equal(echo.uuid, TEST_UUID, 'self-echo is for the sender\'s own actor');

      unsubscribe();
    } finally {
      try { await client.udp.disconnect(); } catch { /* swallow */ }
      client.close();
    }
  },
);
