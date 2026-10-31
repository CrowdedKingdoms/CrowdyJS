/**
 * The teen safety program against a tier (ck-api v2.60.0): every new call through the SDK.
 *
 * Players with Crowded Kingdoms accounts (`client.auth`, `client.users`, `client.safety`): a
 * sign-up with a birth date and country, `me`'s bracket and country, `recordPlayerAge` refused
 * once an age is stored, a sign-up declaring a blocked country and one under 13 refused before
 * any account exists, the app's recording state, voice and video settings, contacts, blocks and
 * a report, which the app's moderator lists and resolves (`client.moderation`). The two players
 * delete their accounts at the end.
 *
 * Org-managed players: the organization's server mints with `ageYears` and `country` (the SDK
 * has no wrapper for that mint: it is the org server's call), the device adopts the token and
 * reads `me`, a blocked country and an age under the platform's youngest are refused before a
 * player exists, and the adult is deleted with `managedPlayers.delete` on the org token.
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com \
 *   CROWDY_PROVISIONING_TOKEN=...   # dev and test are staff-only: the `harness` token \
 *   CROWDY_SAFETY_APP_ID=<app id>   # an app whose default tier admits any player \
 *   CROWDY_OWNER_EMAIL=... CROWDY_OWNER_PASSWORD=...  # an admin of that app's org (moderator) \
 *   CROWDY_ORG_TOKEN=cko_...        # players:mint + players:manage, managed players on \
 *   CROWDY_MANAGED_APP_ID=<app id>  # an app of the org token's organization \
 *   node --test test/e2e/teen-safety.test.mjs
 *
 * Without the owner pair the report is not filed (an unresolved report would hold the reported
 * account). The country refusals assume the territory list blocks DE (seeded on every tier).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import { entryClientConfig, entryHttpUrl, gameClientConfig } from '../helpers.mjs';

globalThis.WebSocket = WebSocket;

const missingAccounts = ['CROWDY_HTTP_URL', 'CROWDY_SAFETY_APP_ID'].filter((k) => !process.env[k]);
const accountsSkip =
  missingAccounts.length > 0
    ? `teen-safety env not configured (missing: ${missingAccounts.join(', ')})`
    : undefined;
const missingManaged = ['CROWDY_HTTP_URL', 'CROWDY_ORG_TOKEN', 'CROWDY_MANAGED_APP_ID'].filter(
  (k) => !process.env[k],
);
const managedSkip =
  missingManaged.length > 0
    ? `managed-player env not configured (missing: ${missingManaged.join(', ')})`
    : undefined;
const moderatorReady = Boolean(process.env.CROWDY_OWNER_EMAIL && process.env.CROWDY_OWNER_PASSWORD);

const run = randomBytes(4).toString('hex');
const password = () => `Aa1!e2e-${randomBytes(8).toString('hex')}`;

/** The entry origin's GraphQL endpoint (CROWDY_HTTP_URL may name the bare origin). */
function graphqlEndpoint() {
  const base = entryHttpUrl().replace(/\/+$/, '');
  return base.endsWith('/graphql') ? base : `${base}/graphql`;
}

/**
 * A `fetch` that sends the tier's provisioning token on `register` only, as TIER-ACCESS asks:
 * dev and test refuse a new account without it. The SDK sends no header of its own for it, so
 * the e2e passes this through `createCrowdyClient({ fetch })`.
 */
function provisioningFetch() {
  const token = process.env.CROWDY_PROVISIONING_TOKEN?.trim();
  return async (url, init = {}) => {
    let isRegister = false;
    try {
      isRegister = /\bmutation Register\(/.test(JSON.parse(init.body).query);
    } catch {
      /* not a GraphQL body */
    }
    if (!token || !isRegister) return fetch(url, init);
    return fetch(url, { ...init, headers: { ...init.headers, 'x-ck-provisioning-token': token } });
  };
}

async function signUp(createCrowdyClient, label, answers) {
  const identity = createCrowdyClient(entryClientConfig({ fetch: provisioningFetch() }));
  const email = `crowdy-e2e-13p-${run}-${label}@test.invalid`;
  const auth = await identity.auth.register({
    email,
    password: password(),
    acceptLegal: true,
    attestAgeOfMajority: true,
    ...answers,
  });
  return { identity, email, userId: auth.user.userId };
}

/** What an organization's server does: mint a managed player's token with its org token. */
async function orgServerMint(input) {
  const res = await fetch(graphqlEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.CROWDY_ORG_TOKEN}`,
    },
    body: JSON.stringify({
      query:
        'mutation($i:MintManagedPlayerTokenInput!){ mintManagedPlayerToken(input:$i){ token gameTokenId appId expiresAt gameApiUrl gameApiWsUrl discoveryUrl launchUrl runtimeGate { status reason } } }',
      variables: { i: input },
    }),
  });
  const body = await res.json();
  return { data: body.data?.mintManagedPlayerToken ?? null, error: body.errors?.[0] ?? null };
}

test(
  'teen safety: age at sign-up, me, recording state, comm settings, contacts, blocks and a report',
  { skip: accountsSkip, timeout: 180_000 },
  async (t) => {
    const sdk = await import('../../dist/index.js');
    const { createCrowdyClient } = sdk;
    const appId = process.env.CROWDY_SAFETY_APP_ID;
    const cleanup = [];

    try {
      // A sign-up with a birth date and a country; me reads them back.
      const a = await signUp(createCrowdyClient, 'a', { birthDate: '1990-05-15', country: 'US' });
      cleanup.push(a);
      const b = await signUp(createCrowdyClient, 'b', { birthDate: '1988-11', country: 'CA' });
      cleanup.push(b);
      const meA = await a.identity.users.me();
      assert.equal(meA.ageBracket, '18_plus', "A's bracket comes from the birth date");
      assert.equal(meA.country, 'US', "A's declared country is stored");
      assert.equal((await b.identity.users.me()).country, 'CA');

      // An account that has an age cannot give another one.
      const again = await a.identity.auth
        .recordPlayerAge({ birthDate: '2001-01-01', country: 'US' })
        .then(() => null, (e) => e);
      assert.equal(again?.code, 'CONFLICT', `recordPlayerAge on an account with an age: ${again?.message}`);

      // Refused before any account exists: a blocked country, and an age under 13.
      const blocked = await signUp(createCrowdyClient, 'de', { birthDate: '1990-05-15', country: 'DE' }).then(
        () => assert.fail('a sign-up declaring DE was admitted'),
        (e) => e,
      );
      assert.deepEqual(sdk.territoryNotSupportedOf(blocked), { country: 'DE' }, blocked.message);
      const child = await signUp(createCrowdyClient, 'child', { birthDate: '2018-02-01', country: 'US' }).then(
        () => assert.fail('a sign-up under 13 was admitted'),
        (e) => e,
      );
      assert.equal(sdk.ageRequirementNotMetOf(child), true, child.message);

      // The players' app tokens, on the app's own datacenter.
      const accessA = await a.identity.portal.mintAppToken(appId);
      const accessB = await b.identity.portal.mintAppToken(appId);
      const gameA = createCrowdyClient(gameClientConfig(accessA));
      const gameB = createCrowdyClient(gameClientConfig(accessB));
      gameA.setToken(accessA.token);
      gameB.setToken(accessB.token);
      cleanup.push({ game: gameA }, { game: gameB });

      // The safety log's state, for the notice and the indicator.
      const recording = await gameA.apps.recording(appId);
      assert.ok(recording, 'the app reports its recording state to an app token');
      for (const k of ['enabled', 'voice', 'video']) assert.equal(typeof recording[k], 'boolean', k);
      if (!recording.enabled) {
        assert.equal(recording.voice, false, 'nothing is recorded while the log is off');
        assert.equal(recording.video, false, 'nothing is recorded while the log is off');
      }
      t.diagnostic(`recording: ${JSON.stringify(recording)}`);

      // Voice and video: an adult's defaults, then a lower choice.
      const before = await gameA.safety.commSettings(appId);
      assert.equal(before.isMinor, false);
      assert.equal(before.voiceAllowed, 'EVERYONE');
      assert.equal(before.videoAllowed, 'EVERYONE');
      const after = await gameA.safety.setCommSettings(appId, { voiceSend: 'CONTACTS', videoReceive: 'OFF' });
      assert.equal(after.voiceSend, 'CONTACTS');
      assert.equal(after.videoReceive, 'OFF');
      assert.equal(after.voiceReceive, before.voiceReceive, 'a field left out keeps its choice');
      assert.equal(after.choices.voiceSend, 'CONTACTS');
      assert.equal((await gameA.safety.commSettings(appId)).videoReceive, 'OFF', 'the change is stored');

      // An adult needs no parent's consent; nothing is sent.
      const consent = await gameA.safety
        .requestParentalConsent(appId, 'VOICE', `parent-${run}@example.invalid`)
        .catch((e) => e);
      if (sdk.parentalConsentUnavailableOf(consent)) {
        t.diagnostic('requestParentalConsent: PARENTAL_CONSENT_UNAVAILABLE on this deployment');
      } else {
        assert.equal(consent.status, 'NOT_REQUIRED', consent.message);
      }

      // Contacts: A asks, B sees it and accepts, both are contacts, then A removes B.
      const asked = await gameA.safety.requestContact(appId, b.userId);
      assert.equal(asked.state, 'PENDING');
      const incoming = await gameB.safety.contactRequests(appId);
      assert.ok(
        incoming.some((r) => String(r.userId) === String(a.userId) && r.direction === 'INCOMING'),
        'B sees A’s request',
      );
      assert.equal((await gameB.safety.acceptContact(appId, a.userId)).state, 'ACCEPTED');
      assert.ok((await gameA.safety.contacts(appId)).some((c) => String(c.userId) === String(b.userId)));
      assert.equal(await gameA.safety.removeContact(appId, b.userId), true);
      assert.equal((await gameB.safety.contacts(appId)).length, 0, 'a removal goes both ways');

      // Blocks: B's request to a player who blocked it is answered as usual and dropped.
      assert.equal(String((await gameA.safety.block(appId, b.userId)).userId), String(b.userId));
      assert.ok((await gameA.safety.blocks(appId)).some((x) => String(x.userId) === String(b.userId)));
      assert.equal((await gameB.safety.requestContact(appId, a.userId)).state, 'PENDING', 'B is not told');
      assert.equal(
        (await gameA.safety.contactRequests(appId)).some((r) => String(r.userId) === String(b.userId)),
        false,
        'the blocked player’s request is dropped',
      );
      assert.equal(await gameA.safety.unblock(appId, b.userId), true);
      assert.equal(await gameA.safety.unblock(appId, b.userId), false, 'nothing left to lift');

      // A report, which the app's moderator lists and resolves.
      if (!moderatorReady) {
        t.diagnostic('report skipped: CROWDY_OWNER_EMAIL / CROWDY_OWNER_PASSWORD not set');
      } else {
        const receipt = await gameA.safety.fileReport({
          appId,
          reportedUserId: b.userId,
          reason: 'OTHER',
          details: `CrowdyJS e2e ${run}: an automated test report`,
          occurredAt: new Date(Date.now() - 60_000),
        });
        assert.ok(receipt.reportId, 'a report id');
        const moderator = createCrowdyClient(entryClientConfig());
        cleanup.push({ game: moderator, logout: true });
        await moderator.auth.login({
          email: process.env.CROWDY_OWNER_EMAIL,
          password: process.env.CROWDY_OWNER_PASSWORD,
        });
        const open = await moderator.moderation.reports(appId, { status: 'OPEN', first: 200 });
        const report = open.find((r) => String(r.reportId) === String(receipt.reportId));
        assert.ok(report, 'the moderator lists the report');
        assert.equal(report.reason, 'OTHER');
        assert.equal(String(report.reporterUserId), String(a.userId));
        assert.equal(String(report.reportedUserId), String(b.userId));
        const resolved = await moderator.moderation.resolveReport(
          appId,
          receipt.reportId,
          `CrowdyJS e2e ${run}: test report, no action`,
        );
        assert.equal(resolved.status, 'RESOLVED');
        t.diagnostic(`report ${receipt.reportId} resolved; capture ${resolved.capture.status}`);
      }
    } finally {
      for (const entry of cleanup.reverse()) {
        try {
          if (entry.logout && entry.game.getToken()) await entry.game.auth.logout();
          if (entry.game) entry.game.close();
          if (entry.identity) {
            await entry.identity.users.deleteMyAccount();
            entry.identity.close();
          }
        } catch (err) {
          console.warn(`[teen-safety] cleanup: ${err?.message ?? err}`);
        }
      }
    }
  },
);

test(
  'teen safety: an org-managed player signed in with ageYears and country; a blocked country refused',
  { skip: managedSkip, timeout: 60_000 },
  async () => {
    const sdk = await import('../../dist/index.js');
    const appId = process.env.CROWDY_MANAGED_APP_ID;

    const adult = await orgServerMint({
      appId,
      externalId: `crowdy-e2e-13p-${run}-adult`,
      ageYears: 30,
      country: 'US',
    });
    assert.equal(adult.error, null, `the adult's mint: ${adult.error?.extensions?.code}: ${adult.error?.message}`);
    const device = sdk.createCrowdyClient(gameClientConfig(adult.data));
    const orgServer = sdk.createCrowdyClient(entryClientConfig());
    try {
      device.portal.adoptAppToken(adult.data);
      const me = await device.users.me();
      assert.equal(me.userType, 'org_managed');
      assert.equal(me.ageBracket, '18_plus', 'the asserted age is stored as a bracket');
      assert.equal(me.country, 'US', 'the asserted country is stored');
      assert.equal((await device.safety.commSettings(appId)).isMinor, false);

      // Refused before a player exists: a blocked country, and an age under the youngest admitted.
      const blocked = await orgServerMint({
        appId,
        externalId: `crowdy-e2e-13p-${run}-de`,
        ageYears: 30,
        country: 'DE',
      });
      assert.deepEqual(sdk.territoryNotSupportedOf(blocked.error), { country: 'DE' }, blocked.error?.message);
      const young = await orgServerMint({
        appId,
        externalId: `crowdy-e2e-13p-${run}-young`,
        ageYears: 12,
        country: 'US',
      });
      assert.equal(sdk.ageRequirementNotMetOf(young.error), true, young.error?.message);

      orgServer.setToken(process.env.CROWDY_ORG_TOKEN);
      for (const label of ['de', 'young']) {
        assert.equal(
          await orgServer.managedPlayers.get(me.orgId, `crowdy-e2e-13p-${run}-${label}`),
          null,
          `no player was created for a refused sign-in (${label})`,
        );
      }
      assert.equal(await orgServer.managedPlayers.delete(me.orgId, `crowdy-e2e-13p-${run}-adult`), true);
    } finally {
      device.close();
      orgServer.close();
    }
  },
);
