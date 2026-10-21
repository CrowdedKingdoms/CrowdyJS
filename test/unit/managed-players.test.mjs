/**
 * Org-managed players (cks-game-api #557; the addendum, #560). An organization signs its own players in:
 * its server mints the player's app token with an org token, or its sign-in service signs an
 * assertion the device trades. The device holds the player's app token and never the org
 * token, so the SDK wraps the organization's administration and the device's two steps, and
 * has no wrapper for the org-token mint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'graphql';

const { PortalAPI } = await import('../../dist/domains/portal.js');
const { ManagedPlayersAPI } = await import('../../dist/domains/managedPlayers.js');
const { OrganizationsAPI } = await import('../../dist/domains/organizations.js');
const errors = await import('../../dist/errors.js');
const sdk = await import('../../dist/index.js');

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A GraphQL client that records each request and answers from `respond`. */
function fakeGql(respond) {
  const calls = [];
  return {
    calls,
    async request(document, variables) {
      const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = op.selectionSet.selections[0].name.value;
      calls.push({ operation: op.name?.value, field, variables });
      return respond(field, variables);
    },
  };
}

function fakeSession() {
  const tokens = [];
  return { tokens, setToken: (t) => tokens.push(t) };
}

const appToken = (token) => ({
  token,
  gameTokenId: '9',
  appId: '7',
  expiresAt: '2026-10-22T00:00:00.000Z',
  gameApiUrl: 'https://ck-or.dev.example/graphql',
  gameApiWsUrl: 'wss://ck-or.dev.example/graphql',
  discoveryUrl: null,
  launchUrl: null,
  runtimeGate: { status: 'ACTIVE', reason: null },
});

test('adoptAppToken stores the app token the organization minted and returns it unchanged', () => {
  const session = fakeSession();
  const portal = new PortalAPI(fakeGql(() => ({})), session);
  const response = appToken('a'.repeat(64));
  assert.equal(portal.adoptAppToken(response), response);
  assert.deepEqual(session.tokens, ['a'.repeat(64)]);
});

test('adoptAppToken refuses an org token: it is the organization server credential', () => {
  const session = fakeSession();
  const portal = new PortalAPI(fakeGql(() => ({})), session);
  assert.throws(() => portal.adoptAppToken(appToken(`cko_${'b'.repeat(64)}`)), /org token/);
  assert.throws(() => portal.adoptAppToken({ ...appToken(''), token: '' }), /no token/);
  assert.throws(() => portal.adoptAppToken(null), /no token/);
  assert.deepEqual(session.tokens, []);
});

test('exchangeManagedPlayerAssertion trades the assertion and stores the token', async () => {
  const gql = fakeGql(() => ({ exchangeManagedPlayerAssertion: appToken('c'.repeat(64)) }));
  const session = fakeSession();
  const portal = new PortalAPI(gql, session);
  const out = await portal.exchangeManagedPlayerAssertion({ appId: '7', assertion: 'h.p.s' });
  assert.equal(out.token, 'c'.repeat(64));
  assert.deepEqual(gql.calls, [
    {
      operation: 'ExchangeManagedPlayerAssertion',
      field: 'exchangeManagedPlayerAssertion',
      variables: { input: { appId: '7', assertion: 'h.p.s' } },
    },
  ]);
  assert.deepEqual(session.tokens, ['c'.repeat(64)]);
});

test('a refused assertion surfaces its reason; a refused mod is MANAGED_PLAYER_NOT_ALLOWED', async () => {
  const gql = fakeGql(() => {
    throw new errors.CrowdyGraphQLError([
      {
        message: 'The player assertion was rejected (replayed)',
        extensions: { code: 'ASSERTION_REJECTED', reason: 'replayed' },
      },
    ]);
  });
  const session = fakeSession();
  const portal = new PortalAPI(gql, session);
  const refusal = await portal
    .exchangeManagedPlayerAssertion({ appId: '7', assertion: 'h.p.s' })
    .catch((e) => e);
  assert.deepEqual(errors.assertionRejectedOf(refusal), { reason: 'replayed' });
  assert.equal(errors.assertionRejectedOf(new Error('x')), null);
  assert.deepEqual(session.tokens, []);

  const notAllowed = new errors.CrowdyGraphQLError([
    { message: 'no mods', extensions: { code: 'MANAGED_PLAYER_NOT_ALLOWED' } },
  ]);
  assert.equal(errors.managedPlayerNotAllowedOf(notAllowed), true);
  assert.equal(errors.managedPlayerNotAllowedOf(refusal), false);
  assert.equal(sdk.assertionRejectedOf, errors.assertionRejectedOf);
  assert.equal(sdk.MANAGED_PLAYER_NOT_ALLOWED_CODE, 'MANAGED_PLAYER_NOT_ALLOWED');
});

test("the organization's addendum refusal reads as its own, never as the player's clickwrap", async () => {
  const message =
    'Organization 7 has not accepted the current Org-Managed Players Addendum (managed-players-addendum-2026-10-21)';
  const orgRefusal = new errors.CrowdyGraphQLError([
    { message, extensions: { code: 'ORG_LEGAL_ACCEPTANCE_REQUIRED' } },
  ]);
  assert.equal(errors.orgLegalAcceptanceRequiredOf(orgRefusal), true);
  assert.equal(sdk.orgLegalAcceptanceRequiredOf, errors.orgLegalAcceptanceRequiredOf);
  assert.equal(sdk.ORG_LEGAL_ACCEPTANCE_REQUIRED_CODE, 'ORG_LEGAL_ACCEPTANCE_REQUIRED');
  // A managed player has no clickwrap to show; the player reader must not claim this one,
  // by its code or by a message that carries the org code's name.
  assert.equal(sdk.isLegalAcceptanceRequiredError(orgRefusal), false);
  assert.equal(
    sdk.isLegalAcceptanceRequiredError(new Error(`ORG_LEGAL_ACCEPTANCE_REQUIRED: ${message}`)),
    false,
  );
  const playerRefusal = new errors.CrowdyGraphQLError([
    { message: 'Accept the current terms', extensions: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } },
  ]);
  assert.equal(errors.orgLegalAcceptanceRequiredOf(playerRefusal), false);
  assert.equal(sdk.isLegalAcceptanceRequiredError(new Error('LEGAL_ACCEPTANCE_REQUIRED: x')), true);
});

test('managedPlayers sends each administration field with its arguments', async () => {
  const answers = {
    managedPlayers: { players: [], nextCursor: null },
    managedPlayer: null,
    provisionManagedPlayers: { created: 1, existing: 0, players: [] },
    updateManagedPlayer: { externalId: 'acct-1', disabled: true },
    endManagedPlayerSessions: true,
    deleteManagedPlayer: true,
    orgManagedPlayerSettings: { orgId: '3', enabled: true },
    orgSigningKeys: [],
    registerOrgSigningKey: { keyId: '11' },
    revokeOrgSigningKey: true,
    app: { appId: '7', managedPlayerModsEnabled: true },
    setAppManagedPlayerMods: true,
  };
  const gql = fakeGql((field) => ({ [field]: answers[field] }));
  const players = new ManagedPlayersAPI(gql);
  const jwk = { kty: 'OKP', crv: 'Ed25519', x: 'abc' };

  await players.list('3', { search: 'acct-', first: 20 });
  await players.get('3', 'acct-1');
  await players.provision({ orgId: '3', players: [{ externalId: 'acct-1' }] });
  await players.update({ orgId: '3', externalId: 'acct-1', disabled: true });
  assert.equal(await players.endSessions('3', 'acct-1'), true);
  assert.equal(await players.delete('3', 'acct-1'), true);
  await players.settings('3');
  await players.signingKeys('3');
  await players.registerSigningKey({ orgId: '3', kid: 'k1', algorithm: 'EdDSA', publicJwk: jwk, issuer: 'https://id.example' });
  await players.registerSigningKey({ orgId: '3', kid: 'k2', algorithm: 'EdDSA', publicJwk: JSON.stringify(jwk), issuer: 'https://id.example' });
  assert.equal(await players.revokeSigningKey('3', '11'), true);
  assert.equal(await players.appModsEnabled('7'), true);
  assert.equal(await players.setAppMods('7', false), true);

  assert.deepEqual(
    gql.calls.map((c) => [c.field, c.variables]),
    [
      ['managedPlayers', { orgId: '3', search: 'acct-', first: 20 }],
      ['managedPlayer', { orgId: '3', externalId: 'acct-1' }],
      ['provisionManagedPlayers', { input: { orgId: '3', players: [{ externalId: 'acct-1' }] } }],
      ['updateManagedPlayer', { input: { orgId: '3', externalId: 'acct-1', disabled: true } }],
      ['endManagedPlayerSessions', { orgId: '3', externalId: 'acct-1' }],
      ['deleteManagedPlayer', { orgId: '3', externalId: 'acct-1' }],
      ['orgManagedPlayerSettings', { orgId: '3' }],
      ['orgSigningKeys', { orgId: '3' }],
      ['registerOrgSigningKey', { input: { orgId: '3', kid: 'k1', algorithm: 'EdDSA', publicJwk: JSON.stringify(jwk), issuer: 'https://id.example' } }],
      ['registerOrgSigningKey', { input: { orgId: '3', kid: 'k2', algorithm: 'EdDSA', publicJwk: JSON.stringify(jwk), issuer: 'https://id.example' } }],
      ['revokeOrgSigningKey', { orgId: '3', keyId: '11' }],
      ['app', { appId: '7' }],
      ['setAppManagedPlayerMods', { appId: '7', enabled: false }],
    ],
  );
});

test('registerSigningKey refuses a private JWK before any request', async () => {
  const gql = fakeGql(() => ({ registerOrgSigningKey: { keyId: '1' } }));
  const players = new ManagedPlayersAPI(gql);
  const base = { orgId: '3', kid: 'k1', algorithm: 'EdDSA', issuer: 'https://id.example' };
  await assert.rejects(
    players.registerSigningKey({ ...base, publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc', d: 'secret' } }),
    /private member 'd'/,
  );
  await assert.rejects(
    players.registerSigningKey({ ...base, algorithm: 'RS256', publicJwk: JSON.stringify({ kty: 'RSA', n: 'n', e: 'AQAB', p: 'secret' }) }),
    /private member 'p'/,
  );
  assert.equal(gql.calls.length, 0);
});

test('appModsEnabled is false for an app the caller cannot see', async () => {
  const players = new ManagedPlayersAPI(fakeGql(() => ({ app: null })));
  assert.equal(await players.appModsEnabled('7'), false);
});

test('organizations.revokeToken sends endSessions only when asked', async () => {
  const gql = fakeGql(() => ({ revokeOrgToken: true }));
  const orgs = new OrganizationsAPI(gql);
  await orgs.revokeToken('5');
  await orgs.revokeToken('5', { endSessions: true });
  assert.deepEqual(
    gql.calls.map((c) => c.variables),
    [{ orgTokenId: '5' }, { orgTokenId: '5', endSessions: true }],
  );
});

test('the client exposes managedPlayers at the top level and under admin', () => {
  const client = sdk.createCrowdyClient({ httpUrl: 'https://game.invalid', wsUrl: 'wss://game.invalid' });
  try {
    assert.ok(client.managedPlayers instanceof ManagedPlayersAPI);
    assert.equal(client.admin.managedPlayers, client.managedPlayers);
    assert.equal(typeof client.portal.adoptAppToken, 'function');
    assert.equal(typeof client.portal.exchangeManagedPlayerAssertion, 'function');
  } finally {
    client.close();
  }
});

test('no SDK document mints with an org token or accepts the addendum: the first belongs on the organization server, the second to a person in Studio', () => {
  const fields = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.graphql')) {
        for (const def of parse(readFileSync(path, 'utf8')).definitions) {
          if (def.kind !== 'OperationDefinition') continue;
          for (const sel of def.selectionSet.selections) fields.push(sel.name.value);
        }
      }
    }
  };
  walk(join(repo, 'src', 'operations'));
  assert.ok(fields.includes('managedPlayers'), 'the documents were read');
  assert.equal(fields.includes('mintManagedPlayerToken'), false);
  assert.equal(fields.includes('acceptManagedPlayerTerms'), false);
  const inline = readFileSync(join(repo, 'src', 'domains', 'portal.ts'), 'utf8');
  assert.doesNotMatch(inline, /mintManagedPlayerToken\s*\(/);
  for (const domain of readdirSync(join(repo, 'src', 'domains'))) {
    const source = readFileSync(join(repo, 'src', 'domains', domain), 'utf8');
    assert.doesNotMatch(source, /acceptManagedPlayerTerms\s*\(/, domain);
  }
});
