/**
 * Distance-limited channel messages end to end: SDK -> game-api (the GraphQL UDP proxy, or the
 * binary relay) -> Buddy v0.35.0.
 *
 * The app owner makes a channel with four members, and each member registers an actor at its
 * own chunk. A sends `sendRangedChannelMessage` from (0,0,0): with maxDistance 5 only B, exactly
 * 5 chunks away, receives it (C, a Chebyshev neighbour at ~5.66, does not); 6 adds C; 7 adds D.
 * A never receives its own message. Members get the ordinary ChannelMessageNotification.
 *
 * Auto-skips unless the integration env vars are present (see two-client-channel.test.mjs):
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients, mintAppAccess } from '../provision.mjs';
import { gameClientConfig } from '../helpers.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = ['CROWDY_HTTP_URL', 'CROWDY_WS_URL', 'CROWDY_OWNER_EMAIL'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const SESSION_WAIT_MS = Number(process.env.CROWDY_TEST_SESSION_WAIT_MS ?? 2500);

const MEMBERS = [
  { name: 'A', uuid: 'aaaaaaaa0000111122223333aaaaaaaa', chunk: { x: '0', y: '0', z: '0' } },
  { name: 'B', uuid: 'bbbbbbbb0000111122223333bbbbbbbb', chunk: { x: '3', y: '4', z: '0' } },
  { name: 'C', uuid: 'cccccccc0000111122223333cccccccc', chunk: { x: '4', y: '4', z: '0' } },
  { name: 'D', uuid: 'dddddddd0000111122223333dddddddd', chunk: { x: '0', y: '0', z: '7' } },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

for (const [transport, overrides] of [
  ['GraphQL proxy', {}],
  ['binary relay', { realtime: { binaryTransport: true } }],
]) {
  test(
    `a ranged channel message reaches only the members in range (${transport})`,
    { skip: skipReason, timeout: 90_000 },
    async () => {
      const { createCrowdyClient } = await import('../../dist/index.js');
      const { appId, owner, players, clients } = await provisionClients(
        createCrowdyClient,
        MEMBERS.length,
        overrides,
      );
      const cleanup = [];
      const ownerAccess = await mintAppAccess(appId, owner.token);
      const ownerClient = createCrowdyClient(gameClientConfig(ownerAccess));
      ownerClient.setToken(ownerAccess.token);

      let channelId;
      try {
        const channel = await ownerClient.channels.create({
          appId,
          name: `e2e-ranged-${Date.now()}`,
          membershipPolicy: 'invite',
          membersCanSend: true,
        });
        channelId = channel.groupId;
        for (const p of players) await ownerClient.channels.addMember(channelId, p.userId);

        const received = new Map(MEMBERS.map((m) => [m.name, []]));
        const errors = [];
        MEMBERS.forEach((m, i) => {
          cleanup.push(
            clients[i].udp.subscribe(
              {
                channelMessage: (n) => received.get(m.name).push(n),
                genericError: (e) => errors.push({ member: m.name, e }),
              },
              appId,
            ),
          );
        });

        // Actors go stale after a few seconds without an update, so every member refreshes
        // its own before each send. The first update into a region can be dropped while the
        // grid permission window loads, hence the two rounds up front.
        const registerAll = async () => {
          for (const [i, m] of MEMBERS.entries()) {
            await clients[i].udp.sendActorUpdate({
              appId,
              chunk: m.chunk,
              distance: 0,
              uuid: m.uuid,
              state: 'AA==',
            });
          }
        };
        await registerAll();
        await sleep(SESSION_WAIT_MS);
        await registerAll();
        await sleep(1000);

        const sender = clients[0];
        let seq = 10;
        const rangedSeqs = new Set();
        const whoReceived = async (maxDistance) => {
          await registerAll();
          await sleep(300);
          const payload = Buffer.from(`ranged-${maxDistance}-${Date.now()}`).toString('base64');
          rangedSeqs.add(seq);
          const sent = await sender.udp.sendRangedChannelMessage({
            channelId,
            uuid: MEMBERS[0].uuid,
            payload,
            appId,
            chunk: MEMBERS[0].chunk,
            maxDistance,
            sequenceNumber: seq++,
          });
          assert.ok(sent, 'sendRangedChannelMessage returned truthy');
          await sleep(NOTIFY_WAIT_MS);
          const got = MEMBERS.filter((m) =>
            received.get(m.name).some((n) => n.payload === payload),
          ).map((m) => m.name);
          for (const m of MEMBERS) {
            const n = received.get(m.name).find((x) => x.payload === payload);
            if (n) {
              assert.equal(n.__typename, 'ChannelMessageNotification');
              assert.equal(String(n.channelId), String(channelId));
              assert.equal(n.uuid, MEMBERS[0].uuid);
            }
          }
          return got;
        };

        const diag = () => JSON.stringify({ appId, channelId, errors });
        assert.deepEqual(await whoReceived(5), ['B'], `radius 5: ${diag()}`);
        assert.deepEqual(await whoReceived(6), ['B', 'C'], `radius 6: ${diag()}`);
        assert.deepEqual(await whoReceived(7), ['B', 'C', 'D'], `radius 7: ${diag()}`);
        // The first actor update into a region can be refused while its grid window loads
        // (sequenceNumber 0 above); a ranged send itself must never be.
        assert.deepEqual(
          errors.filter(({ e }) => rangedSeqs.has(e.sequenceNumber)),
          [],
          diag(),
        );
      } finally {
        for (const unsub of cleanup) {
          try {
            unsub();
          } catch {
            /* swallow */
          }
        }
        if (channelId) {
          try {
            await ownerClient.channels.remove(channelId);
          } catch {
            /* swallow */
          }
        }
        ownerClient.close();
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
}
