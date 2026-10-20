/**
 * Opcode 140 (GENERIC_SPATIAL_1) between two players on the binary relay: A sends an
 * app-defined payload with `udp.sendGenericSpatial` and B, an actor in the same chunk, receives
 * it on `genericSpatial` with the payload untouched. SDK -> game-api relay -> Buddy and back.
 * Relay only: the GraphQL API has no mutation or union member for opcode 140.
 *
 * Auto-skips unless the integration env vars are present (see ../provision.mjs; against a tier,
 * CROWDY_PROVISIONING_TOKEN, CROWDY_TEST_APP_ID and the owner's password too).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = ['CROWDY_HTTP_URL', 'CROWDY_WS_URL', 'CROWDY_OWNER_EMAIL'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const UUID_A = 'aaaaaaaa1400ccccddddeeeeeeeeeeee';
const UUID_B = 'bbbbbbbb1400ddddeeeeeeeeeeeeeeee';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test(
  'a generic spatial message from A reaches B on the binary relay',
  { skip: skipReason, timeout: 90_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, 2, {
      realtime: { binaryTransport: true },
    });
    const [clientA, clientB] = clients;
    const chunk = { x: '30', y: '0', z: '0' };
    const received = { genericSpatial: [], errors: [] };
    const cleanup = [
      clientA.udp.subscribe({ genericError: (e) => received.errors.push(['A', e]) }, appId),
      clientB.udp.subscribe(
        {
          genericSpatial: (n) => received.genericSpatial.push(n),
          genericError: (e) => received.errors.push(['B', e]),
        },
        appId,
      ),
    ];
    try {
      await sleep(2000);
      const registerBoth = async () => {
        await clientA.udp.sendActorUpdate({ appId, chunk, distance: 8, uuid: UUID_A, state: 'AA==' });
        await clientB.udp.sendActorUpdate({ appId, chunk, distance: 8, uuid: UUID_B, state: 'AA==' });
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      const bytes = Buffer.from(`opcode-140-${Math.random().toString(36).slice(2, 10)}`);
      const payload = bytes.toString('base64');
      for (let i = 0; i < 5; i++) {
        assert.equal(
          await clientA.udp.sendGenericSpatial({
            appId,
            chunk,
            uuid: UUID_A,
            payload,
            sequenceNumber: 40 + i,
          }),
          true,
        );
        clientA.udp.flushSends();
        await sleep(200);
      }
      await sleep(NOTIFY_WAIT_MS);

      const fromA = received.genericSpatial.filter((n) => n.payload === payload);
      const diag = JSON.stringify({
        appId,
        rx: received.genericSpatial.length,
        errors: received.errors,
      });
      assert.ok(fromA.length > 0, `B should receive A's generic spatial message: ${diag}`);
      assert.equal(fromA[0].__typename, 'GenericSpatialNotification');
      assert.equal(fromA[0].uuid, UUID_A);
      assert.equal(String(fromA[0].chunkX), chunk.x);
      assert.equal(fromA[0].distance, 8);
      assert.equal(fromA[0].decayRate, 0);
      assert.deepEqual(
        received.errors.filter(([, e]) => e.sequenceNumber >= 40 && e.sequenceNumber < 45),
        [],
        diag,
      );
    } finally {
      for (const unsub of cleanup) {
        try {
          unsub();
        } catch {
          /* swallow */
        }
      }
      for (const c of clients) {
        try {
          await c.udp.disconnect();
        } catch {
          /* swallow */
        }
        c.close();
      }
    }
  },
);
