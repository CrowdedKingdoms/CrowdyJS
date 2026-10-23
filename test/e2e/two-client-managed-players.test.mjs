/**
 * Org-managed players replicate like any players (cks-game-api #557; every tier since v2.53.0, once the
 * organization has accepted the Org-Managed Players Addendum, or the mint answers ORG_LEGAL_ACCEPTANCE_REQUIRED).
 *
 * The organization's server is played by this test: it mints two players' app tokens with
 * an org token (`mintManagedPlayerToken`, scope `players:mint`) the way a game studio's
 * backend would, and each "device" adopts its token with `portal.adoptAppToken`. Then the
 * two-client actor check: B subscribes, both register in a chunk, A sends actor updates, and
 * B must receive them through the Game API and Buddy. Nothing about Buddy changed for these
 * players; their tokens are ordinary app tokens confined to the organization's apps, and this
 * is the proof.
 *
 * Skips unless the env names an org token and one of its org's apps:
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com \
 *   CROWDY_ORG_TOKEN=cko_...            # players:mint; the org has managed players on \
 *   CROWDY_MANAGED_APP_ID=<app id>      # an app of that org (free tier grants access) \
 *   npm run test:e2e
 *
 * The org token is sent from this process (no Origin header), as from a server. The players'
 * external ids are new on every run (`crowdy-e2e-<run>-a` / `-b`).
 *
 * With CROWDY_MANAGED_APP_RECORDS=1 (the app has replay logging on: an org admin turned it on
 * with updateApp), the test also reads the input log as the players: A reads its own session's
 * recorded inputs, and B, who has no manage_apps, is answered NOT_FOUND for A's session.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { gameClientConfig, entryHttpUrl } from '../helpers.mjs';

globalThis.WebSocket = WebSocket;

const missing = ['CROWDY_HTTP_URL', 'CROWDY_ORG_TOKEN', 'CROWDY_MANAGED_APP_ID'].filter(
  (key) => !process.env[key],
);
const skipReason =
  missing.length > 0 ? `managed-player env not configured (missing: ${missing.join(', ')})` : undefined;

const RECORDS = process.env.CROWDY_MANAGED_APP_RECORDS === '1';
const SEND_COUNT = Number(process.env.CROWDY_TEST_SEND_COUNT ?? 5);
const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const UUID_A = 'aaaaaaaa1111cccc2222eeeeeeeeeeee';
const UUID_B = 'bbbbbbbb3333dddd4444eeeeeeeeeeee';

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

test(
  'two org-managed players see each other through Buddy',
  { skip: skipReason, timeout: RECORDS ? 180_000 : 60_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const appId = process.env.CROWDY_MANAGED_APP_ID;
    const run = randomBytes(3).toString('hex');

    const accessA = await mintManagedPlayer(appId, `crowdy-e2e-${run}-a`);
    const accessB = await mintManagedPlayer(appId, `crowdy-e2e-${run}-b`);
    const clientA = createCrowdyClient(gameClientConfig(accessA));
    const clientB = createCrowdyClient(gameClientConfig(accessB));
    clientA.portal.adoptAppToken(accessA);
    clientB.portal.adoptAppToken(accessB);
    const cleanup = [];

    try {
      const meA = await clientA.users.me();
      assert.equal(meA.userType, 'org_managed', 'A is an org-managed player');

      const receivedByB = { actorUpdates: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe(
          {
            actorUpdate: (n) => receivedByB.actorUpdates.push(n),
            genericError: (e) => receivedByB.genericErrors.push(e),
          },
          appId,
        ),
      );
      await sleep(2000);

      // The first spatial message to a new chunk is dropped while the server loads grid
      // permissions, so register, wait, register again.
      const registerBoth = async () => {
        assert.ok(
          await clientA.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid: UUID_A, state: 'AA==', sequenceNumber: 1,
          }),
          'A registered in the chunk',
        );
        assert.ok(
          await clientB.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid: UUID_B, state: 'AA==', sequenceNumber: 1,
          }),
          'B registered in the chunk',
        );
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      let sent = 0;
      for (let i = 0; i < SEND_COUNT; i++) {
        const ok = await clientA.udp.sendActorUpdate({
          appId,
          chunk: CHUNK,
          distance: 8,
          uuid: UUID_A,
          state: Buffer.from(randomBytes(96)).toString('base64'),
          sequenceNumber: i + 2,
        });
        if (ok) sent++;
        await sleep(200);
      }
      assert.equal(sent, SEND_COUNT, `all ${SEND_COUNT} sends accepted`);
      await sleep(NOTIFY_WAIT_MS);

      const fromA = receivedByB.actorUpdates.filter((n) => n.uuid === UUID_A);
      assert.ok(
        fromA.length > 0,
        `B should receive A's actor updates: ${JSON.stringify({
          appId,
          sent,
          receivedByB: receivedByB.actorUpdates.length,
          genericErrors: receivedByB.genericErrors,
        })}`,
      );

      if (RECORDS) {
        // The index trails the log by a few seconds: wait for A's session to be listed.
        const gtidA = String(accessA.gameTokenId);
        let session = null;
        for (let i = 0; i < 30 && !session; i++) {
          const page = await clientA.inputLog.sessions(appId, { first: 20 });
          session = page.edges.map((e) => e.node).find((s) => String(s.gameTokenId) === gtidA) ?? null;
          if (!session) await sleep(3000);
        }
        assert.ok(session, `A's session ${gtidA} was never listed for A`);
        assert.equal(String(session.userId), String(meA.userId), "the session is A's");

        const own = await clientA.inputLog.messages(appId, gtidA, { first: 50 });
        assert.ok(own.edges.length > 0, 'A reads the inputs it sent');
        assert.ok(
          own.edges.every((e) => String(e.node.userId) === String(meA.userId)),
          'every input read is A’s',
        );

        await assert.rejects(
          clientB.inputLog.messages(appId, gtidA, { first: 1 }),
          (err) => err?.code === 'NOT_FOUND' || /NOT_FOUND/.test(String(err?.message)),
          "B, without manage_apps, is answered NOT_FOUND for A's session",
        );
      }
    } finally {
      for (const unsub of cleanup) {
        try { unsub(); } catch { /* swallow */ }
      }
      try { await clientA.udp.disconnect(); } catch { /* swallow */ }
      try { await clientB.udp.disconnect(); } catch { /* swallow */ }
      clientA.close();
      clientB.close();
    }
  },
);
