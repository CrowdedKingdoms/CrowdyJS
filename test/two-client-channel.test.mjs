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
 *   CROWDY_MANAGEMENT_URL='http://127.0.0.1:3001' \
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000/graphql' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' CROWDY_OWNER_PASSWORD='...' \
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients } from './provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = [
  'CROWDY_MANAGEMENT_URL',
  'CROWDY_HTTP_URL',
  'CROWDY_WS_URL',
  'CROWDY_OWNER_EMAIL',
  'CROWDY_OWNER_PASSWORD',
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

function clientConfig() {
  return {
    managementUrl: process.env.CROWDY_MANAGEMENT_URL,
    httpUrl: process.env.CROWDY_HTTP_URL,
    wsUrl: process.env.CROWDY_WS_URL,
    realtime: { retryAttempts: 4, retryInitialDelayMs: 250, retryMaxDelayMs: 2000, waitTimeoutMs: 5000 },
  };
}

test(
  'channel message reaches members but not non-members, with no sender echo',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../dist/index.js');
    const { appId, owner, players, clients } = await provisionClients(
      createCrowdyClient,
      clientConfig(),
      3,
    );
    const [clientA, clientB, clientC] = clients;
    const cleanup = [];

    // Owner client (app admin) creates the channel and manages membership.
    const ownerClient = createCrowdyClient(clientConfig());
    ownerClient.setToken(owner.token);

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
