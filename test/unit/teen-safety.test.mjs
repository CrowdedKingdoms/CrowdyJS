/**
 * The teen safety program (ck-api v2.60.0; cks-game-api #613 to #616). The SDK carries the
 * player's age and documents (`auth`), the player's own controls in an app (`safety`), the
 * moderators' reports (`moderation`), the safety log's notice state and an app's documents
 * (`apps`), the territory list (`platform`), Minecraft sign-in for Crowded Kingdoms' own apps
 * (`portal`), and a reader for each new refusal. The operator's fields (setTerritoryPolicy,
 * exportPlayerData) are not wrapped (sdk-audience.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema, print, validate } from 'graphql';

const sdk = await import('../../dist/index.js');
const errors = await import('../../dist/errors.js');
const generated = await import('../../dist/generated/graphql.js');
const { AuthAPI } = await import('../../dist/domains/auth.js');
const { PortalAPI } = await import('../../dist/domains/portal.js');
const { SafetyAPI } = await import('../../dist/domains/safety.js');
const { ModerationAPI } = await import('../../dist/domains/moderation.js');
const { AppsAPI } = await import('../../dist/domains/apps.js');
const { PlatformAPI } = await import('../../dist/domains/platform.js');

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A GraphQL client that records each request and answers from `respond`. */
function fakeGql(respond = () => ({})) {
  const calls = [];
  return {
    calls,
    async request(document, variables) {
      const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = op.selectionSet.selections[0].name.value;
      calls.push({ operation: op.name?.value, field, variables, text: print(document) });
      return respond(field, variables);
    },
  };
}

function fakeSession() {
  const tokens = [];
  return { tokens, setToken: (t) => tokens.push(t), getToken: () => tokens.at(-1) ?? null };
}

const appToken = (token) => ({
  token,
  gameTokenId: '9',
  appId: '7',
  expiresAt: '2026-10-31T00:00:00.000Z',
  gameApiUrl: 'https://ck-or.dev.example/graphql',
  gameApiWsUrl: 'wss://ck-or.dev.example/graphql',
  discoveryUrl: null,
  launchUrl: null,
  runtimeGate: { status: 'ACTIVE', reason: null },
});

const refusal = (code, extensions = {}) =>
  new errors.CrowdyGraphQLError([{ message: `refused: ${code}`, extensions: { code, ...extensions } }]);

// --- auth: the age, the documents, the consents ------------------------------------------

test('register forwards the age answers inside registerUserInput, and only those given', async () => {
  const gql = fakeGql(() => ({ register: { token: 's', gameTokenId: '1', user: { userId: '7' } } }));
  const auth = new AuthAPI(gql, fakeSession());
  await auth.register({
    email: 'a@b.invalid',
    password: 'pw-123456',
    acceptLegal: true,
    birthDate: '2011-06-15',
    country: 'US',
    parentalConfirmation: true,
  });
  await auth.register({ email: 'c@d.invalid', password: 'pw-123456' });
  assert.deepEqual(gql.calls[0].variables.registerUserInput, {
    email: 'a@b.invalid',
    password: 'pw-123456',
    acceptLegal: true,
    birthDate: '2011-06-15',
    country: 'US',
    parentalConfirmation: true,
  });
  assert.deepEqual(gql.calls[1].variables.registerUserInput, {
    email: 'c@d.invalid',
    password: 'pw-123456',
  });
});

test('recordPlayerAge sends the answers and returns the bracket and country', async () => {
  const gql = fakeGql(() => ({
    recordPlayerAge: { userId: '7', ageBracket: '18_plus', country: 'US' },
  }));
  const auth = new AuthAPI(gql, fakeSession());
  const age = await auth.recordPlayerAge({ birthDate: '1990-05', country: 'US' });
  assert.deepEqual(age, { userId: '7', ageBracket: '18_plus', country: 'US' });
  await auth.recordPlayerAge({ birthDate: '2011-06-15', country: 'CA', parentalConfirmation: true });
  assert.deepEqual(
    gql.calls.map((c) => [c.field, c.variables]),
    [
      ['recordPlayerAge', { input: { birthDate: '1990-05', country: 'US' } }],
      ['recordPlayerAge', { input: { birthDate: '2011-06-15', country: 'CA', parentalConfirmation: true } }],
    ],
  );
  assert.match(gql.calls[0].text, /recordPlayerAge\(input: \$input\) \{\s*userId\s+ageBracket\s+country\s*\}/);
});

test('recordPlayerConsents keeps the 18.23 document for the call an older API knows', async () => {
  const gql = fakeGql(() => ({ recordPlayerConsents: true }));
  const auth = new AuthAPI(gql, fakeSession());
  assert.equal(await auth.recordPlayerConsents({ acceptLegal: true, attestAgeOfMajority: true }), true);
  const [call] = gql.calls;
  assert.equal(call.operation, 'RecordPlayerConsents');
  assert.match(call.text, /\$attestAgeOfMajority: Boolean!/);
  assert.doesNotMatch(call.text, /appId|method/);
  assert.deepEqual(call.variables, { acceptLegal: true, attestAgeOfMajority: true });
});

test("recordPlayerConsents sends v2.60.0's document for an app, a method or no attestation", async () => {
  const gql = fakeGql(() => ({ recordPlayerConsents: true }));
  const auth = new AuthAPI(gql, fakeSession());
  await auth.recordPlayerConsents({ acceptLegal: true, appId: '42' });
  await auth.recordPlayerConsents({ acceptLegal: true, appId: '42', method: 'IN_GAME' });
  await auth.recordPlayerConsents({ acceptLegal: true });
  await auth.recordPlayerConsents({ acceptLegal: true, attestAgeOfMajority: true, method: 'CLICKWRAP' });
  assert.deepEqual(
    gql.calls.map((c) => [c.operation, c.variables]),
    [
      ['RecordPlayerConsentsForApp', { acceptLegal: true, appId: '42' }],
      ['RecordPlayerConsentsForApp', { acceptLegal: true, appId: '42', method: 'IN_GAME' }],
      ['RecordPlayerConsentsForApp', { acceptLegal: true }],
      ['RecordPlayerConsentsForApp', { acceptLegal: true, attestAgeOfMajority: true, method: 'CLICKWRAP' }],
    ],
  );
  assert.match(
    gql.calls[0].text,
    /\$attestAgeOfMajority: Boolean, \$appId: BigInt, \$method: LegalAcceptanceMethod\)/,
  );
});

test('playerLegalAcceptance names an app only when given one', async () => {
  const gql = fakeGql(() => ({ playerLegalAcceptance: false }));
  const auth = new AuthAPI(gql, fakeSession());
  assert.equal(await auth.playerLegalAcceptance(), false);
  assert.equal(await auth.playerLegalAcceptance({ appId: '42' }), false);
  assert.deepEqual(
    gql.calls.map((c) => [c.operation, c.variables]),
    [
      ['PlayerLegalAcceptance', {}],
      ['PlayerLegalAcceptanceForApp', { appId: '42' }],
    ],
  );
  assert.match(gql.calls[1].text, /playerLegalAcceptance\(appId: \$appId\)/);
});

test('the documents to show, and the developer consents', async () => {
  const doc = { documentId: 'player-terms', version: 'player-terms-2026-11-01', title: 'Player Terms', url: 'https://crowdedkingdoms.example/player-terms.html', appId: null };
  const rules = { ...doc, documentId: 'rules', version: 'rules-1', appId: '42' };
  const answers = {
    playerLegalDocuments: [doc],
    appRequiredDocuments: [rules],
    developerLegalDocuments: [],
    developerLegalAcceptance: true,
    recordDeveloperConsents: true,
  };
  const gql = fakeGql((field) => ({ [field]: answers[field] }));
  const auth = new AuthAPI(gql, fakeSession());
  assert.deepEqual(await auth.playerLegalDocuments(), [doc]);
  assert.deepEqual(await auth.appRequiredDocuments('42'), [rules]);
  assert.deepEqual(await auth.developerLegalDocuments(), []);
  assert.equal(await auth.developerLegalAcceptance(), true);
  assert.equal(await auth.recordDeveloperConsents({ acceptDeveloperTerms: true }), true);
  assert.deepEqual(
    gql.calls.map((c) => [c.field, c.variables]),
    [
      ['playerLegalDocuments', {}],
      ['appRequiredDocuments', { appId: '42' }],
      ['developerLegalDocuments', {}],
      ['developerLegalAcceptance', {}],
      ['recordDeveloperConsents', { acceptDeveloperTerms: true }],
    ],
  );
  for (const call of gql.calls.slice(0, 3)) {
    assert.match(call.text, /\{\s*documentId\s+version\s+title\s+url\s+appId\s*\}/, call.field);
  }
});

test('users.me selects the age bracket and the country', () => {
  const text = print(generated.MeDocument);
  assert.match(text, /\bageBracket\b/);
  assert.match(text, /\bcountry\b/);
});

// --- safety: the player's own controls -----------------------------------------------------

test('safety sends each field with its arguments, on the app token', async () => {
  const settings = {
    appId: '42', isMinor: false, voiceSend: 'EVERYONE', voiceReceive: 'EVERYONE', videoSend: 'EVERYONE',
    videoReceive: 'EVERYONE', choices: { voiceSend: null, voiceReceive: null, videoSend: null, videoReceive: null },
    voiceAllowed: 'EVERYONE', videoAllowed: 'EVERYONE', voiceConsent: false, videoConsent: false, updatedAt: null,
  };
  const contact = { userId: '8', state: 'PENDING', createdAt: '2026-10-30T00:00:00Z', acceptedAt: null };
  const answers = {
    myCommSettings: settings,
    setMyCommSettings: { ...settings, voiceSend: 'CONTACTS' },
    requestParentalConsent: { appId: '42', feature: 'VOICE', status: 'NOT_REQUIRED' },
    myContacts: [],
    contactRequests: [{ userId: '8', direction: 'OUTGOING', createdAt: '2026-10-30T00:00:00Z' }],
    requestContact: contact,
    acceptContact: { ...contact, state: 'ACCEPTED' },
    removeContact: true,
    myBlocks: [],
    blockPlayer: { userId: '8', createdAt: '2026-10-30T00:00:00Z' },
    unblockPlayer: false,
    fileSafetyReport: { reportId: '99', filedAt: '2026-10-30T00:00:00Z' },
  };
  const gql = fakeGql((field) => ({ [field]: answers[field] }));
  const safety = new SafetyAPI(gql);

  assert.equal((await safety.commSettings('42')).voiceSend, 'EVERYONE');
  assert.equal(
    (await safety.setCommSettings('42', { voiceSend: 'CONTACTS', videoReceive: undefined, videoSend: sdk.CommScope.Off })).voiceSend,
    'CONTACTS',
  );
  assert.equal((await safety.requestParentalConsent('42', 'VOICE', 'parent@example.invalid')).status, 'NOT_REQUIRED');
  assert.deepEqual(await safety.contacts('42'), []);
  assert.equal((await safety.contactRequests('42'))[0].direction, 'OUTGOING');
  assert.equal((await safety.requestContact('42', '8')).state, 'PENDING');
  assert.equal((await safety.acceptContact('42', '8')).state, 'ACCEPTED');
  assert.equal(await safety.removeContact('42', '8'), true);
  assert.deepEqual(await safety.blocks('42'), []);
  assert.equal((await safety.block('42', '8')).userId, '8');
  assert.equal(await safety.unblock('42', '8'), false);
  assert.equal(
    (await safety.fileReport({ appId: '42', reportedUserId: '8', reason: 'HARASSMENT', occurredAt: new Date('2026-10-30T12:00:00Z') })).reportId,
    '99',
  );
  await safety.fileReport({
    appId: '42',
    reportedUserId: '8',
    reportedActorUuid: 'aaaaaaaabbbbccccddddeeeeeeeeeeee',
    reason: sdk.SafetyReportReason.ChildSafety,
    details: 'what happened',
    occurredAt: '2026-10-30T12:00:00.000Z',
  });

  assert.deepEqual(
    gql.calls.map((c) => [c.field, c.variables]),
    [
      ['myCommSettings', { appId: '42' }],
      ['setMyCommSettings', { appId: '42', input: { voiceSend: 'CONTACTS', videoSend: 'OFF' } }],
      ['requestParentalConsent', { appId: '42', feature: 'VOICE', parentEmail: 'parent@example.invalid' }],
      ['myContacts', { appId: '42' }],
      ['contactRequests', { appId: '42' }],
      ['requestContact', { appId: '42', userId: '8' }],
      ['acceptContact', { appId: '42', userId: '8' }],
      ['removeContact', { appId: '42', userId: '8' }],
      ['myBlocks', { appId: '42' }],
      ['blockPlayer', { appId: '42', userId: '8' }],
      ['unblockPlayer', { appId: '42', userId: '8' }],
      ['fileSafetyReport', { input: { appId: '42', reportedUserId: '8', reason: 'HARASSMENT', occurredAt: '2026-10-30T12:00:00.000Z' } }],
      ['fileSafetyReport', {
        input: {
          appId: '42',
          reportedUserId: '8',
          reason: 'CHILD_SAFETY',
          occurredAt: '2026-10-30T12:00:00.000Z',
          reportedActorUuid: 'aaaaaaaabbbbccccddddeeeeeeeeeeee',
          details: 'what happened',
        },
      }],
    ],
  );
  // The settings documents select the whole record: effective scopes, choices, caps and consents.
  assert.match(gql.calls[0].text, /choices \{\s*voiceSend\s+voiceReceive\s+videoSend\s+videoReceive\s*\}/);
  for (const field of ['isMinor', 'voiceAllowed', 'videoAllowed', 'voiceConsent', 'videoConsent', 'updatedAt']) {
    assert.match(gql.calls[0].text, new RegExp(`\\b${field}\\b`), field);
  }
});

// --- moderation: the app's reports ----------------------------------------------------------

test('moderation lists, resolves and escalates, sending only the options given', async () => {
  const report = { appId: '42', reportId: '99', status: 'OPEN', sessions: ['5'], capture: { status: 'COMPLETE' } };
  const gql = fakeGql((field) => ({ [field]: field === 'safetyReports' ? [report] : { ...report, status: field === 'resolveSafetyReport' ? 'RESOLVED' : 'ESCALATED' } }));
  const moderation = new ModerationAPI(gql);
  assert.equal((await moderation.reports('42'))[0].reportId, '99');
  await moderation.reports('42', { status: 'OPEN', first: 20 });
  assert.equal((await moderation.resolveReport('42', '99', 'warned')).status, 'RESOLVED');
  assert.equal((await moderation.escalateReport('42', '99', 'NCMEC-1')).status, 'ESCALATED');
  assert.deepEqual(
    gql.calls.map((c) => [c.field, c.variables]),
    [
      ['safetyReports', { appId: '42' }],
      ['safetyReports', { appId: '42', status: 'OPEN', first: 20 }],
      ['resolveSafetyReport', { appId: '42', reportId: '99', outcome: 'warned' }],
      ['escalateSafetyReport', { appId: '42', reportId: '99', ncmecReportId: 'NCMEC-1' }],
    ],
  );
  assert.match(gql.calls[0].text, /\bsessions\b/);
  assert.match(gql.calls[0].text, /capture \{\s*status\s+objects\s+expected\s+bytes\s+retainUntil\s*\}/);
});

// --- apps, platform -------------------------------------------------------------------------

test('apps.recording reads the notice state, and is null for an unknown app', async () => {
  const recording = { enabled: true, voice: true, video: false };
  let known = true;
  const gql = fakeGql(() => ({ app: known ? { appId: '42', recording } : null }));
  const apps = new AppsAPI(gql);
  assert.deepEqual(await apps.recording('42'), recording);
  known = false;
  assert.equal(await apps.recording('43'), null);
  assert.deepEqual(gql.calls.map((c) => [c.operation, c.variables]), [
    ['AppRecording', { appId: '42' }],
    ['AppRecording', { appId: '43' }],
  ]);
  assert.match(gql.calls[0].text, /recording \{\s*enabled\s+voice\s+video\s*\}/);
});

test('apps.setRequiredDocuments sends the whole list', async () => {
  const documents = [{ documentId: 'rules', version: 'rules-2026-11-01', title: 'House rules', url: 'https://game.example/rules' }];
  const gql = fakeGql(() => ({ setAppRequiredDocuments: documents.map((d) => ({ ...d, appId: '42' })) }));
  const apps = new AppsAPI(gql);
  const out = await apps.setRequiredDocuments('42', documents);
  assert.equal(out[0].appId, '42');
  await apps.setRequiredDocuments('42', []);
  assert.deepEqual(gql.calls.map((c) => [c.field, c.variables]), [
    ['setAppRequiredDocuments', { appId: '42', documents }],
    ['setAppRequiredDocuments', { appId: '42', documents: [] }],
  ]);
});

test('app reads and updates select the safety log and age fields', () => {
  for (const document of [generated.AppDocument, generated.UpdateAppDocument]) {
    const text = print(document);
    for (const field of ['replayLoggingRecordsVoice', 'replayLoggingRecordsVideo', 'minPlayerAge', 'effectiveMinPlayerAge']) {
      assert.match(text, new RegExp(`\\b${field}\\b`), field);
    }
    assert.match(text, /recording \{\s*enabled\s+voice\s+video\s*\}/);
  }
});

test('platform.territoryPolicies reads the public list', async () => {
  const gql = fakeGql(() => ({ territoryPolicies: [{ countryCode: 'DE', status: 'blocked', minAge: 13 }] }));
  const platform = new PlatformAPI(gql);
  assert.equal((await platform.territoryPolicies())[0].status, 'blocked');
  assert.deepEqual(gql.calls.map((c) => [c.field, c.variables]), [['territoryPolicies', {}]]);
});

// --- portal: Minecraft sign-in --------------------------------------------------------------

test('minecraftChallenge asks for the app; signInWithMinecraft sends only its fields and stores the token', async () => {
  const gql = fakeGql((field) =>
    field === 'minecraftChallenge'
      ? { minecraftChallenge: { serverId: 'a'.repeat(40), expiresAt: '2026-10-31T00:02:00Z' } }
      : { signInWithMinecraft: appToken('m'.repeat(64)) },
  );
  const session = fakeSession();
  const portal = new PortalAPI(gql, session);
  const challenge = await portal.minecraftChallenge('42');
  assert.equal(challenge.serverId.length, 40);
  const out = await portal.signInWithMinecraft({
    appId: '42',
    username: 'Steve',
    serverId: challenge.serverId,
    birthDate: '2001-02',
    country: 'US',
    acceptedDocuments: [{ documentId: 'player-terms', version: 'v1', title: 'not sent' }],
    unexpected: 'not sent',
  });
  assert.equal(out.token, 'm'.repeat(64));
  assert.deepEqual(session.tokens, ['m'.repeat(64)]);
  assert.deepEqual(gql.calls.map((c) => [c.field, c.variables]), [
    ['minecraftChallenge', { appId: '42' }],
    ['signInWithMinecraft', {
      input: {
        appId: '42',
        username: 'Steve',
        serverId: 'a'.repeat(40),
        birthDate: '2001-02',
        country: 'US',
        acceptedDocuments: [{ documentId: 'player-terms', version: 'v1' }],
      },
    }],
  ]);
});

test('a refused Minecraft sign-in stores nothing', async () => {
  const gql = fakeGql(() => {
    throw refusal('MINECRAFT_VERIFICATION_FAILED', { reason: 'not_joined' });
  });
  const session = fakeSession();
  const portal = new PortalAPI(gql, session);
  const err = await portal
    .signInWithMinecraft({ appId: '42', username: 'Steve', serverId: 'x', birthDate: '2001-02', country: 'US', acceptedDocuments: [] })
    .catch((e) => e);
  assert.deepEqual(errors.minecraftVerificationFailedOf(err), { reason: 'not_joined' });
  assert.deepEqual(session.tokens, []);
});

// --- the refusals ---------------------------------------------------------------------------

test('legalAcceptanceRequiredOf lists the missing documents, the platform and the app', () => {
  const err = refusal('LEGAL_ACCEPTANCE_REQUIRED', {
    missingDocuments: [
      { documentId: 'player-terms', version: 'player-terms-2026-11-01', appId: null },
      { documentId: 'rules', version: 'rules-1', appId: '42' },
      { documentId: 'odd', version: 'v', appId: 42 },
      { documentId: 7 },
      null,
    ],
  });
  assert.deepEqual(errors.legalAcceptanceRequiredOf(err), {
    missingDocuments: [
      { documentId: 'player-terms', version: 'player-terms-2026-11-01', appId: null },
      { documentId: 'rules', version: 'rules-1', appId: '42' },
      { documentId: 'odd', version: 'v', appId: '42' },
    ],
  });
  assert.deepEqual(errors.legalAcceptanceRequiredOf(refusal('LEGAL_ACCEPTANCE_REQUIRED')), { missingDocuments: [] });
  assert.deepEqual(
    errors.legalAcceptanceRequiredOf({ message: 'x', extensions: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } }),
    { missingDocuments: [] },
    'a raw payload reads too',
  );
  assert.equal(errors.legalAcceptanceRequiredOf(refusal('ORG_LEGAL_ACCEPTANCE_REQUIRED')), null);
  assert.equal(errors.legalAcceptanceRequiredOf(new Error('LEGAL_ACCEPTANCE_REQUIRED')), null);
  assert.equal(sdk.isLegalAcceptanceRequiredError(err), true);
});

test('the age refusals are booleans: no reader surfaces an age (decision 35)', () => {
  const notMet = refusal('AGE_REQUIREMENT_NOT_MET', { minimumAge: 18, ageBracket: '13_15' });
  assert.equal(errors.ageRequirementNotMetOf(notMet), true);
  assert.equal(errors.ageRequirementNotMetOf(refusal('AGE_REQUIRED')), false);
  assert.equal(errors.ageRequiredOf(refusal('AGE_REQUIRED')), true);
  assert.equal(errors.ageRequiredOf(notMet), false);
  assert.equal(errors.ageRequiredOf(null), false);
});

test('territory, safety log, consent, social limit and Minecraft refusals read their fields', () => {
  assert.deepEqual(errors.territoryNotSupportedOf(refusal('TERRITORY_NOT_SUPPORTED', { country: 'DE' })), { country: 'DE' });
  assert.deepEqual(errors.territoryNotSupportedOf(refusal('TERRITORY_NOT_SUPPORTED')), { country: null });
  assert.equal(errors.territoryNotSupportedOf(refusal('AGE_REQUIRED')), null);
  assert.equal(errors.safetyLogRequiredOf(refusal('SAFETY_LOG_REQUIRED')), true);
  assert.equal(errors.parentalConsentUnavailableOf(refusal('PARENTAL_CONSENT_UNAVAILABLE')), true);
  assert.equal(errors.socialLimitReachedOf(refusal('SOCIAL_LIMIT_REACHED')), true);
  assert.equal(errors.socialLimitReachedOf(refusal('RATE_LIMITED')), false);
  assert.equal(errors.minecraftVerificationUnavailableOf(refusal('MINECRAFT_VERIFICATION_UNAVAILABLE', { retryable: true })), true);
  assert.deepEqual(errors.minecraftVerificationFailedOf(refusal('MINECRAFT_VERIFICATION_FAILED')), { reason: null });
  assert.equal(errors.minecraftVerificationFailedOf(refusal('MINECRAFT_VERIFICATION_UNAVAILABLE')), null);
  // A later entry of a multi-error response reads too.
  const later = new errors.CrowdyGraphQLError([
    { message: 'other', extensions: { code: 'BAD_USER_INPUT' } },
    { message: 'refused', extensions: { code: 'TERRITORY_NOT_SUPPORTED', country: 'GB' } },
  ]);
  assert.deepEqual(errors.territoryNotSupportedOf(later), { country: 'GB' });
});

test('the package exports every reader and code', () => {
  const pairs = {
    LEGAL_ACCEPTANCE_REQUIRED_CODE: 'LEGAL_ACCEPTANCE_REQUIRED',
    AGE_REQUIRED_CODE: 'AGE_REQUIRED',
    AGE_REQUIREMENT_NOT_MET_CODE: 'AGE_REQUIREMENT_NOT_MET',
    TERRITORY_NOT_SUPPORTED_CODE: 'TERRITORY_NOT_SUPPORTED',
    SAFETY_LOG_REQUIRED_CODE: 'SAFETY_LOG_REQUIRED',
    PARENTAL_CONSENT_UNAVAILABLE_CODE: 'PARENTAL_CONSENT_UNAVAILABLE',
    SOCIAL_LIMIT_REACHED_CODE: 'SOCIAL_LIMIT_REACHED',
    MINECRAFT_VERIFICATION_FAILED_CODE: 'MINECRAFT_VERIFICATION_FAILED',
    MINECRAFT_VERIFICATION_UNAVAILABLE_CODE: 'MINECRAFT_VERIFICATION_UNAVAILABLE',
  };
  for (const [name, value] of Object.entries(pairs)) assert.equal(sdk[name], value, name);
  for (const reader of [
    'legalAcceptanceRequiredOf', 'ageRequiredOf', 'ageRequirementNotMetOf', 'territoryNotSupportedOf',
    'safetyLogRequiredOf', 'parentalConsentUnavailableOf', 'socialLimitReachedOf',
    'minecraftVerificationFailedOf', 'minecraftVerificationUnavailableOf',
  ]) {
    assert.equal(sdk[reader], errors[reader], reader);
  }
  for (const cls of ['SafetyAPI', 'ModerationAPI']) assert.equal(typeof sdk[cls], 'function', cls);
  assert.equal(sdk.CommScope.Contacts, 'CONTACTS');
  assert.equal(sdk.LegalAcceptanceMethod.InGame, 'IN_GAME');
});

test('a refused mint reads as the gate refusal through the client', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null, forEach: () => {} },
    json: async () => ({ errors: [{ message: 'not available', extensions: { code: 'TERRITORY_NOT_SUPPORTED', country: 'DE' } }] }),
  });
  const client = sdk.createCrowdyClient({ httpUrl: 'https://ck.example', wsUrl: 'wss://ck.example' });
  try {
    client.setToken('session-token');
    const err = await client.portal.mintAppToken('42').catch((e) => e);
    assert.deepEqual(sdk.territoryNotSupportedOf(err), { country: 'DE' });
    assert.equal(sdk.ageRequiredOf(err), false);
  } finally {
    globalThis.fetch = original;
    client.close();
  }
});

test("every inline document the new calls send validates against the release's schema.gql", async () => {
  // Codegen validates the .graphql documents; the hand-written ones in auth.ts and portal.ts
  // reach the server unchecked unless something checks them here.
  const schema = buildSchema(readFileSync(join(repo, 'schema.gql'), 'utf8'));
  const documents = [];
  const gql = {
    async request(document) {
      documents.push(document);
      const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = op.selectionSet.selections[0].name.value;
      return { [field]: field === 'signInWithMinecraft' ? appToken('t') : field === 'register' ? { token: 's' } : null };
    },
  };
  const auth = new AuthAPI(gql, fakeSession());
  const portal = new PortalAPI(gql, fakeSession());
  await auth.register({ email: 'a@b.invalid', password: 'x', birthDate: '2001-02', country: 'US', parentalConfirmation: true });
  await auth.recordPlayerConsents({ acceptLegal: true, attestAgeOfMajority: true });
  await auth.recordPlayerConsents({ acceptLegal: true, appId: '42', method: 'IN_GAME' });
  await auth.playerLegalAcceptance();
  await auth.playerLegalAcceptance({ appId: '42' });
  await auth.recordPlayerAge({ birthDate: '2001-02', country: 'US' });
  await auth.playerLegalDocuments();
  await auth.appRequiredDocuments('42');
  await auth.developerLegalDocuments();
  await auth.developerLegalAcceptance();
  await auth.recordDeveloperConsents({ acceptDeveloperTerms: true });
  await portal.minecraftChallenge('42');
  await portal.signInWithMinecraft({ appId: '42', username: 'Steve', serverId: 'x', birthDate: '2001-02', country: 'US', acceptedDocuments: [] });
  await portal.mintAppToken('42').catch(() => {});
  assert.equal(documents.length, 14);
  for (const document of documents) {
    const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
    assert.deepEqual(validate(schema, document).map((e) => e.message), [], op.name?.value);
  }
});

test('the client exposes safety and moderation; no source wraps an operator field', () => {
  const client = sdk.createCrowdyClient({ httpUrl: 'https://game.invalid', wsUrl: 'wss://game.invalid' });
  try {
    assert.ok(client.safety instanceof SafetyAPI);
    assert.ok(client.moderation instanceof ModerationAPI);
    assert.equal(client.admin.moderation, client.moderation);
  } finally {
    client.close();
  }
  // The inline documents (auth.ts, portal.ts, platform.ts) are not .graphql files, so the
  // audience test does not read them.
  for (const name of readdirSync(join(repo, 'src', 'domains'))) {
    const source = readFileSync(join(repo, 'src', 'domains', name), 'utf8');
    assert.doesNotMatch(source, /\b(setTerritoryPolicy|exportPlayerData|mintManagedPlayerToken)\s*\(/, name);
  }
});
