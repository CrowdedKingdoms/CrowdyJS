/**
 * Channel messaging end-to-end for a CKS env, exercising the full SDK ->
 * game-api (GraphQL channel CRUD + UDP proxy) -> Buddy chain.
 *
 * The app owner creates a channel and adds players A and B as members (C is left
 * out). Client A publishes a channel message; B (a member) must receive a
 * ChannelMessageNotification, while C (a non-member) must NOT, and A receives no
 * echo of its own message.
 *
 * Black-box: owner + players are provisioned through the management API
 * (see provision.mjs); channel CRUD goes through client.channels. Auto-skips
 * unless the integration env vars are present:
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3001' \
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

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const SESSION_WAIT_MS = Number(process.env.CROWDY_TEST_SESSION_WAIT_MS ?? 2500);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';
const TEST_UUID_C = 'ccccccccddddeeeeffff000011112222';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


test(
  'channel message reaches members but not non-members, with no sender echo',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, owner, players, clients } = await provisionClients(createCrowdyClient, 3);
    const [clientA, clientB, clientC] = clients;
    const cleanup = [];

    // Owner client (app admin) creates the channel and manages membership.
    // Channel CRUD is a game-api surface that targets a concrete appId, so the
    // owner needs an app-scoped token (Overworld token confinement rejects
    // identity session tokens with SCOPE_MISSING).
    // Channel creation is an app-resident write, so the owner's client goes to
    // the same datacenter the three player clients were placed in.
    const ownerAccess = await mintAppAccess(appId, owner.token);
    const ownerClient = createCrowdyClient(gameClientConfig(ownerAccess));
    ownerClient.setToken(ownerAccess.token);

    let channelId;
    try {
      const channel = await ownerClient.channels.create({
        appId,
        name: `e2e-chan-${Date.now()}`,
        membershipPolicy: 'invite',
        membersCanSend: true,
      });
      channelId = channel.groupId;
      assert.ok(channelId, 'createChannel returned a groupId');

      // A and B are members; C is intentionally not added.
      await ownerClient.channels.addMember(channelId, players[0].userId);
      await ownerClient.channels.addMember(channelId, players[1].userId);

      const receivedByB = { channel: [], errors: [] };
      const receivedByC = { channel: [], errors: [] };
      const receivedByA = { channel: [] };
      cleanup.push(clientB.udp.subscribe({
        channelMessage: (n) => receivedByB.channel.push(n),
        genericError: (e) => receivedByB.errors.push(e),
      }, appId));
      cleanup.push(clientC.udp.subscribe({
        channelMessage: (n) => receivedByC.channel.push(n),
        genericError: (e) => receivedByC.errors.push(e),
      }, appId));
      cleanup.push(clientA.udp.subscribe({
        channelMessage: (n) => receivedByA.channel.push(n),
      }, appId));

      // Every connected client sends actor-update keepalives; this registers each
      // client's UDP return path on Buddy (so channel messages can be delivered)
      // and opens the proxy session, triggering Buddy's connect-time channel pull.
      // Register twice (the first message into a new chunk region is dropped while
      // the grid permission window lazy-loads).
      const registerAll = async () => {
        for (const [client, uuid] of [
          [clientA, TEST_UUID_A], [clientB, TEST_UUID_B], [clientC, TEST_UUID_C],
        ]) {
          await client.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid, state: 'AA==', sequenceNumber: 1,
          });
        }
      };
      await registerAll();
      await sleep(SESSION_WAIT_MS);
      await registerAll();
      await sleep(1000);

      const payloadText = `chan-${Date.now()}`;
      const payloadB64 = Buffer.from(payloadText).toString('base64');
      const sent = await clientA.udp.sendChannelMessage({
        channelId,
        uuid: TEST_UUID_A,
        payload: payloadB64,
        sequenceNumber: 2,
      });
      assert.ok(sent, 'sendChannelMessage returned truthy');

      await sleep(NOTIFY_WAIT_MS);

      const diagnostics = {
        appId,
        channelId,
        receivedByB: receivedByB.channel.length,
        receivedByC: receivedByC.channel.length,
        receivedByA: receivedByA.channel.length,
        errorsB: receivedByB.errors,
      };

      const matchB = receivedByB.channel.find((n) => n.payload === payloadB64);
      assert.ok(matchB, `Member B should receive the channel message. diagnostics=${JSON.stringify(diagnostics)}`);
      assert.equal(matchB.__typename, 'ChannelMessageNotification');
      assert.equal(String(matchB.channelId), String(channelId), 'channelId echoed');
      assert.equal(Buffer.from(matchB.payload, 'base64').toString(), payloadText);

      const leakedToC = receivedByC.channel.find((n) => n.payload === payloadB64);
      assert.ok(!leakedToC, `Non-member C must NOT receive the channel message. diagnostics=${JSON.stringify(diagnostics)}`);

      const echoedToA = receivedByA.channel.find((n) => n.payload === payloadB64);
      assert.ok(!echoedToA, `Sender A must NOT receive an echo. diagnostics=${JSON.stringify(diagnostics)}`);
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      if (channelId) { try { await ownerClient.channels.remove(channelId); } catch { /* swallow */ } }
      ownerClient.close();
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);

test(
  'read-only member is refused and a sender still reaches them',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, owner, players, clients } = await provisionClients(createCrowdyClient, 2);
    const [clientA, clientB] = clients;
    const cleanup = [];

    const ownerAccess = await mintAppAccess(appId, owner.token);
    const ownerClient = createCrowdyClient(gameClientConfig(ownerAccess));
    ownerClient.setToken(ownerAccess.token);

    let channelId;
    try {
      const channel = await ownerClient.channels.create({
        appId,
        name: `e2e-ro-${Date.now()}`,
        membershipPolicy: 'invite',
        membersCanSend: false,
      });
      channelId = channel.groupId;
      assert.ok(channelId, 'createChannel returned a groupId');

      await ownerClient.channels.addMember(channelId, players[0].userId);
      await ownerClient.channels.addMember(channelId, players[1].userId);

      const senderRole = await ownerClient.channels.createRole({
        groupId: channelId,
        roleName: `sender-${Date.now()}`,
        permissions: ['send_messages'],
      });
      await ownerClient.channels.setMemberRoles({
        groupId: channelId,
        userId: players[0].userId,
        roleIds: [senderRole.groupRoleId],
      });

      const receivedByB = { channel: [], errors: [] };
      const receivedByA = { channel: [], errors: [] };
      cleanup.push(clientB.udp.subscribe({
        channelMessage: (n) => receivedByB.channel.push(n),
        genericError: (e) => receivedByB.errors.push(e),
      }, appId));
      cleanup.push(clientA.udp.subscribe({
        channelMessage: (n) => receivedByA.channel.push(n),
        genericError: (e) => receivedByA.errors.push(e),
      }, appId));

      const registerAll = async () => {
        for (const [client, uuid] of [
          [clientA, TEST_UUID_A], [clientB, TEST_UUID_B],
        ]) {
          await client.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid, state: 'AA==', sequenceNumber: 1,
          });
        }
      };
      await registerAll();
      await sleep(SESSION_WAIT_MS);
      await registerAll();
      await sleep(1000);

      const deniedText = `ro-deny-${Date.now()}`;
      const deniedB64 = Buffer.from(deniedText).toString('base64');
      await clientB.udp.sendChannelMessage({
        channelId,
        uuid: TEST_UUID_B,
        payload: deniedB64,
        sequenceNumber: 2,
      });
      await sleep(NOTIFY_WAIT_MS);

      const leakedToA = receivedByA.channel.find((n) => n.payload === deniedB64);
      assert.ok(!leakedToA, 'read-only B must not deliver a channel message to A');
      const unauthorized = receivedByB.errors.find((e) => {
        const code = String(e?.code ?? e?.extensions?.code ?? e?.message ?? '');
        return /UNAUTHOR/i.test(code);
      });
      assert.ok(
        unauthorized || receivedByB.errors.length > 0,
        `read-only B should get UNAUTHORIZED (or any genericError). errors=${JSON.stringify(receivedByB.errors)}`,
      );

      const okText = `ro-ok-${Date.now()}`;
      const okB64 = Buffer.from(okText).toString('base64');
      const sent = await clientA.udp.sendChannelMessage({
        channelId,
        uuid: TEST_UUID_A,
        payload: okB64,
        sequenceNumber: 3,
      });
      assert.ok(sent, 'sender A sendChannelMessage returned truthy');
      await sleep(NOTIFY_WAIT_MS);

      const matchB = receivedByB.channel.find((n) => n.payload === okB64);
      assert.ok(matchB, 'member B should still receive from a sender');
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      if (channelId) { try { await ownerClient.channels.remove(channelId); } catch { /* swallow */ } }
      ownerClient.close();
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);
