/**
 * Server-announced departure (ActorLeftNotification, Buddy v0.25.0) against a
 * CKS environment.
 *
 * Players A and B register in one chunk. B disconnects. Within a few seconds the
 * game server stops considering B's actor present and A must receive exactly ONE
 * ActorLeftNotification carrying B's uuid and last chunk -- instead of guessing
 * after the World Stores' 12 s staleness reap.
 *
 * Auto-skips unless the integration env vars are present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { provisionClients } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = ['CROWDY_HTTP_URL', 'CROWDY_WS_URL', 'CROWDY_OWNER_EMAIL'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

/** Buddy removes presence ~5 s after the last update; allow for the proxy hop. */
const LEAVE_WAIT_MS = Number(process.env.CROWDY_TEST_LEAVE_WAIT_MS ?? 9000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'llllllllbbbbccccddddeeeeeeeeeee1';
const TEST_UUID_B = 'llllllllbbbbccccddddeeeeeeeeeee2';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test(
  'two-client leave: B disconnects, A receives one ActorLeftNotification for B',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, 2);
    const [clientA, clientB] = clients;
    const cleanup = [];

    try {
      const received = { left: [], genericErrors: [] };
      cleanup.push(
        clientA.udp.subscribe(
          {
            actorLeft: (n) => received.left.push(n),
            genericError: (e) => received.genericErrors.push(e),
          },
          appId,
        ),
      );
      // B subscribes too, as every real client does: on the GraphQL proxy the
      // subscription is what pins the session to one ck-api instance, so that
      // B's `disconnect()` below reaches the instance holding its socket.
      const unsubB = clientB.udp.subscribe({ any: () => {} }, appId);
      await sleep(2000);

      const registerBoth = async () => {
        assert.ok(
          await clientA.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 2, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1,
          }),
        );
        assert.ok(
          await clientB.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 2, uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1,
          }),
        );
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      // B leaves. Its session is released and its actor stops updating.
      unsubB();
      await clientB.udp.disconnect();
      const leftAt = Date.now();

      // Keep A's own actor fresh so A is not the one announced.
      const deadline = leftAt + LEAVE_WAIT_MS;
      while (Date.now() < deadline) {
        await clientA.udp.sendActorUpdate({
          appId, chunk: CHUNK, distance: 2, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 2,
        });
        await sleep(1000);
      }

      const forB = received.left.filter((n) => n.uuid === TEST_UUID_B);
      const diagnostics = { appId, left: received.left, genericErrors: received.genericErrors };
      assert.equal(forB.length, 1, `A should receive exactly one ActorLeftNotification for B. diagnostics=${JSON.stringify(diagnostics)}`);
      assert.equal(forB[0].__typename, 'ActorLeftNotification');
      assert.equal(forB[0].chunkX, CHUNK.x, 'carries the last chunk');
      assert.equal(forB[0].leftReason, 0, 'reason STALE');
      assert.equal(received.left.filter((n) => n.uuid === TEST_UUID_A).length, 0, 'A, still updating, is never announced');
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);
