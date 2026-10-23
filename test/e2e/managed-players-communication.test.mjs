/**
 * The communication keys and the recording switch, for org-managed players (Game API
 * v2.55.0). Both run on the binary relay, so a player's sends, its realtime session and the
 * server's refusals travel on one socket.
 *
 * The organization's server is played by this test, as in two-client-managed-players: it
 * mints each player's app token with an org token. Each case skips unless the env names its
 * app:
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com \
 *   CROWDY_ORG_TOKEN=cko_...          # players:mint for the apps below \
 *   CROWDY_QUIET_APP_ID=<app id>      # its default tier lacks use_text_chat and use_direct_messages \
 *   CROWDY_NO_MEDIA_APP_ID=<app id>   # replay logging on, replayLoggingRecordsMedia false \
 *   npm run test:e2e
 *
 * - On the quiet app a player still moves, and its text and its direct message are refused
 *   with UNAUTHORIZED for their sequence numbers.
 * - On the no-media app a player's text is recorded and its voice is not. Set both switches at
 *   least 20 seconds before the run: the realtime servers re-read which apps record, and
 *   whether with voice and video, every 15 seconds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { gameClientConfig, entryHttpUrl } from '../helpers.mjs';

globalThis.WebSocket = WebSocket;

const BASE_ENV = ['CROWDY_HTTP_URL', 'CROWDY_ORG_TOKEN'];
const skipUnless = (appKey) => {
  const missing = [...BASE_ENV, appKey].filter((key) => !process.env[key]);
  return missing.length ? `set ${missing.join(', ')}` : false;
};

const CHUNK = { x: '0', y: '0', z: '0' };
const MESSAGE_TYPE = { audio: 134, text: 136, video: 143 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The entry origin's GraphQL endpoint (CROWDY_HTTP_URL may name the bare origin). */
function graphqlEndpoint() {
  const base = entryHttpUrl().replace(/\/+$/, '');
  return base.endsWith('/graphql') ? base : `${base}/graphql`;
}

/** What an organization's server does: mint a player's app token with its org token. */
async function mintManagedPlayer(appId, externalId) {
  const res = await fetch(graphqlEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.CROWDY_ORG_TOKEN}`,
    },
    body: JSON.stringify({
      query:
        'mutation($i:MintManagedPlayerTokenInput!){ mintManagedPlayerToken(input:$i){ token gameTokenId appId expiresAt gameApiUrl gameApiWsUrl discoveryUrl launchUrl runtimeGate { status reason } } }',
      variables: { i: { appId, externalId, gamertag: externalId.slice(-12) } },
    }),
  });
  const body = await res.json();
  if (body.errors?.length) {
    const e = body.errors[0];
    throw new Error(`mintManagedPlayerToken: ${e.extensions?.code}: ${e.message}`);
  }
  if (!body.data?.mintManagedPlayerToken) {
    throw new Error(`mintManagedPlayerToken: HTTP ${res.status}, no data`);
  }
  return body.data.mintManagedPlayerToken;
}

/** A managed player on the binary relay, subscribed, with its actor in CHUNK. */
async function onlinePlayer(createCrowdyClient, appId, externalId) {
  const access = await mintManagedPlayer(appId, externalId);
  const client = createCrowdyClient(
    gameClientConfig(access, { realtime: { binaryTransport: true } }),
  );
  client.portal.adoptAppToken(access);
  const errors = [];
  const unsubscribe = client.udp.subscribe({ genericError: (e) => errors.push(e) }, appId);
  await sleep(2000);
  const uuid = randomBytes(16).toString('hex');
  // The first spatial message to a new chunk is refused while the server loads it.
  for (let i = 0; i < 2; i++) {
    await client.udp.sendActorUpdate({
      appId, chunk: CHUNK, distance: 8, uuid, state: 'AA==', sequenceNumber: 1,
    });
    client.udp.flushSends();
    await sleep(1000);
  }
  /** The code the server refused this send with, or null when it refused nothing in 4 s. */
  const refusal = async (sequenceNumber, send) => {
    await send();
    client.udp.flushSends();
    for (let i = 0; i < 16; i++) {
      const e = errors.find((x) => x.sequenceNumber === sequenceNumber);
      if (e) return e.errorCode;
      await sleep(250);
    }
    return null;
  };
  const close = async () => {
    try { unsubscribe(); } catch { /* swallow */ }
    try { await client.udp.disconnect(); } catch { /* swallow */ }
    client.close();
  };
  return { access, client, uuid, errors, refusal, close };
}

test(
  'a managed player whose tier lacks the communication keys moves but cannot text',
  { skip: skipUnless('CROWDY_QUIET_APP_ID'), timeout: 90_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const appId = process.env.CROWDY_QUIET_APP_ID;
    const run = randomBytes(3).toString('hex');
    const p = await onlinePlayer(createCrowdyClient, appId, `crowdy-e2e-${run}-quiet`);
    try {
      const { uuid } = p;
      assert.equal(
        await p.refusal(60, () =>
          p.client.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid, state: 'AA==', sequenceNumber: 60,
          }),
        ),
        null,
        'its actor update is not refused',
      );
      assert.equal(
        await p.refusal(61, () =>
          p.client.udp.sendTextPacket({ appId, chunk: CHUNK, uuid, text: 'hello', sequenceNumber: 61 }),
        ),
        'UNAUTHORIZED',
        'its text is refused',
      );
      assert.equal(
        await p.refusal(62, () =>
          p.client.udp.sendSingleActorMessage({
            appId,
            chunk: CHUNK,
            targetUuid: uuid,
            payload: Buffer.from('direct').toString('base64'),
            sequenceNumber: 62,
          }),
        ),
        'UNAUTHORIZED',
        'its direct message is refused',
      );
    } finally {
      await p.close();
    }
  },
);

test(
  'with voice and video left out of the recording, a text is recorded and voice is not',
  { skip: skipUnless('CROWDY_NO_MEDIA_APP_ID'), timeout: 180_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const appId = process.env.CROWDY_NO_MEDIA_APP_ID;
    const run = randomBytes(3).toString('hex');
    const p = await onlinePlayer(createCrowdyClient, appId, `crowdy-e2e-${run}-nomedia`);
    try {
      const { uuid } = p;
      for (let i = 0; i < 3; i++) {
        await p.client.udp.sendTextPacket({
          appId, chunk: CHUNK, uuid, text: `recorded ${i}`, sequenceNumber: 70 + i,
        });
        await p.client.udp.sendAudioPacket({
          appId,
          chunk: CHUNK,
          uuid,
          audioData: Buffer.from(randomBytes(64)).toString('base64'),
          sequenceNumber: 80 + i,
        });
        p.client.udp.flushSends();
        await sleep(300);
      }
      await sleep(2000);
      const refused = p.errors.filter((e) => e.sequenceNumber >= 70 && e.sequenceNumber < 83);
      assert.deepEqual(refused, [], 'the server accepted the text and the voice');

      // The index trails the log by a few seconds.
      const gameTokenId = String(p.access.gameTokenId);
      let types = [];
      for (let i = 0; i < 30; i++) {
        const page = await p.client.inputLog
          .messages(appId, gameTokenId, { first: 100 })
          .catch(() => null);
        types = page ? page.edges.map((e) => e.node.messageType) : [];
        if (types.includes(MESSAGE_TYPE.text)) break;
        await sleep(3000);
      }
      assert.ok(types.includes(MESSAGE_TYPE.text), `its text is recorded: ${JSON.stringify(types)}`);
      assert.ok(
        !types.includes(MESSAGE_TYPE.audio) && !types.includes(MESSAGE_TYPE.video),
        `its voice is not: ${JSON.stringify(types)}`,
      );
    } finally {
      await p.close();
    }
  },
);
