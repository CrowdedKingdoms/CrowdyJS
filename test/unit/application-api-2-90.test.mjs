/**
 * What 18.41.0 wraps of Application API v2.90.0, and the ceiling on a server's `retryAfterMs`.
 *
 * - `userId` on every app-token answer the SDK returns (`AppTokenResponse.userId`).
 * - `managedPlayers.deleteMany`: up to 100 players in one call, each with its outcome.
 * - `refreshFleetSession`'s `currentServer` names an `ip4` or an `ip6`, exactly one.
 * - The SDK waits 30 seconds at most on a server's `retryAfterMs`.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { buildSchema, parse, validate } from 'graphql';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const sdk = await import('../../dist/index.js');
const { PortalAPI } = await import('../../dist/domains/portal.js');
const { ManagedPlayersAPI } = await import('../../dist/domains/managedPlayers.js');
const { FleetSessionsAPI } = await import('../../dist/domains/fleetSessions.js');
const { droppedReadWaitMs } = await import('../../dist/dropped-read.js');
const generated = await import('../../dist/generated/graphql.js');
const { FleetSession } = await import('../../dist/fleet/index.js');

const repo = fileURLToPath(new URL('../../', import.meta.url));
const schema = buildSchema(readFileSync(`${repo}schema.gql`, 'utf8'));

/** A GraphQL client that records each operation and answers from `answer(field, variables)`. */
function recorder(answer) {
  const calls = [];
  return {
    calls,
    request: async (document, variables) => {
      const operation = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = operation.selectionSet.selections[0];
      const call = {
        document,
        name: operation.name.value,
        field: field.name.value,
        selected: field.selectionSet?.selections.map((s) => s.alias?.value ?? s.name.value) ?? [],
        variables,
      };
      calls.push(call);
      return { [call.field]: answer(call.field, variables) };
    },
  };
}

// ---------------------------------------------------------------------------
// userId on the app-token answers
// ---------------------------------------------------------------------------

const TOKEN_ANSWER = {
  token: 't'.repeat(64),
  gameTokenId: '9001',
  userId: '4242',
  appId: '7',
  expiresAt: '2026-11-27T12:00:00.000Z',
  applicationApiUrl: null,
  applicationApiWsUrl: null,
  gameApiUrl: null,
  gameApiWsUrl: null,
  discoveryUrl: null,
  launchUrl: null,
  runtimeGate: { status: 'ACTIVE', reason: null },
};

test('every app-token answer the SDK returns selects userId and hands it back', async () => {
  const gql = recorder(() => ({ ...TOKEN_ANSWER, authorizedServer: null }));
  const session = { setToken() {}, getToken: () => 'session' };
  const portal = new PortalAPI(gql, session);

  const minted = await portal.mintAppToken('7');
  const refreshed = await portal.refresh();
  const refreshedOnServer = await portal.refresh({ ip4: '203.0.113.7', clientPort: 9091 });
  const asserted = await portal.exchangeManagedPlayerAssertion({ appId: '7', assertion: 'a.b.c' });
  const minecraft = await portal.signInWithMinecraft({
    appId: '7',
    username: 'Steve',
    serverId: 'a'.repeat(40),
    birthDate: '2000-01-01',
    country: 'US',
    acceptedDocuments: [],
  });
  for (const answer of [minted, refreshed, refreshedOnServer, asserted, minecraft]) {
    assert.equal(answer.userId, '4242');
  }

  assert.deepEqual(
    gql.calls.map((c) => c.field),
    ['mintAppToken', 'refreshAppToken', 'refreshAppToken', 'exchangeManagedPlayerAssertion', 'signInWithMinecraft'],
  );
  for (const call of gql.calls) {
    assert.ok(call.selected.includes('userId'), `${call.name} selects userId`);
    assert.deepEqual(validate(schema, call.document), [], `${call.name} is valid against the release's schema`);
  }
});

test('the portal code exchange answers an app token with userId too, from the one field list', () => {
  const source = readFileSync(`${repo}src/domains/portal.ts`, 'utf8');
  const fields = source.match(/const APP_TOKEN_FIELDS\s*=\s*\n?\s*'([^']+)'/);
  assert.ok(fields, 'APP_TOKEN_FIELDS not found');
  assert.match(fields[1], /\buserId\b/);
  const documents = source.split('\n').filter((line) => /`mutation \w+/.test(line) && line.includes('${APP_TOKEN_FIELDS}'));
  // mintAppToken, exchangePortalCode, refreshAppToken twice, exchangeManagedPlayerAssertion, signInWithMinecraft.
  assert.equal(documents.length, 6);
  for (const line of documents) {
    const text = line.trim().replace(/^`|`,?$/g, '').replace('${APP_TOKEN_FIELDS}', fields[1]);
    assert.deepEqual(validate(schema, parse(text)), [], text.slice(0, 60));
  }
  // The schema says every one of the six answers is an AppTokenResponse with a userId.
  assert.equal(String(schema.getType('AppTokenResponse').getFields().userId.type), 'BigInt!');
});

// ---------------------------------------------------------------------------
// managedPlayers.deleteMany
// ---------------------------------------------------------------------------

test('deleteMany sends one deleteManagedPlayers and returns each outcome', async () => {
  const answer = {
    __typename: 'DeleteManagedPlayersResult',
    deleted: 1,
    notFound: 1,
    held: 1,
    players: [
      { __typename: 'ManagedPlayerDeletionResult', externalId: 'acct-1', outcome: 'DELETED' },
      { __typename: 'ManagedPlayerDeletionResult', externalId: 'acct-2', outcome: 'NOT_FOUND' },
      { __typename: 'ManagedPlayerDeletionResult', externalId: 'acct-3', outcome: 'LEGAL_HOLD' },
    ],
  };
  const gql = recorder(() => answer);
  const players = new ManagedPlayersAPI(gql);
  const result = await players.deleteMany('3', ['acct-1', 'acct-2', 'acct-3']);
  assert.deepEqual(result, {
    deleted: 1,
    notFound: 1,
    held: 1,
    players: [
      { externalId: 'acct-1', outcome: 'DELETED' },
      { externalId: 'acct-2', outcome: 'NOT_FOUND' },
      { externalId: 'acct-3', outcome: 'LEGAL_HOLD' },
    ],
  });
  const [call] = gql.calls;
  assert.equal(call.name, 'DeleteManagedPlayers');
  assert.deepEqual(call.variables, { input: { orgId: '3', externalIds: ['acct-1', 'acct-2', 'acct-3'] } });
  assert.deepEqual(call.selected, ['deleted', 'notFound', 'held', 'players']);
  assert.deepEqual(validate(schema, generated.DeleteManagedPlayersDocument), []);
  assert.deepEqual(
    schema.getType('ManagedPlayerDeletion').getValues().map((v) => v.name),
    ['DELETED', 'NOT_FOUND', 'LEGAL_HOLD'],
  );
});

test('deleteMany refuses no ids and more than 100 before any request, and names none', async () => {
  const gql = recorder(() => assert.fail('no request'));
  const players = new ManagedPlayersAPI(gql);
  assert.equal(sdk.MANAGED_PLAYERS_DELETE_MAX, 100);
  await assert.rejects(players.deleteMany('3', []), /takes 1 to 100 external ids, and was given 0$/);
  const ids = Array.from({ length: 101 }, (_, i) => `secret-looking-id-${i}`);
  await assert.rejects(players.deleteMany('3', ids), (error) => {
    assert.ok(error instanceof RangeError);
    assert.match(error.message, /and was given 101$/);
    assert.ok(!error.message.includes('secret-looking-id'));
    return true;
  });
  await assert.rejects(players.deleteMany('3', 'acct-1'), /was given 0$/);
  assert.equal(gql.calls.length, 0);
  // 100 is taken.
  const full = recorder(() => ({ deleted: 100, notFound: 0, held: 0, players: [] }));
  assert.equal((await new ManagedPlayersAPI(full).deleteMany('3', ids.slice(0, 100))).deleted, 100);
});

// ---------------------------------------------------------------------------
// refreshFleetSession's currentServer: ip4 or ip6
// ---------------------------------------------------------------------------

test('fleetCurrentServer names exactly one address: ip4 when there is one, ip6 otherwise', () => {
  assert.deepEqual(sdk.fleetCurrentServer({ ip4: '203.0.113.7', ip6: '2001:db8::7', clientPort: 9091 }), {
    ip4: '203.0.113.7',
    clientPort: 9091,
  });
  assert.deepEqual(sdk.fleetCurrentServer({ ip4: '', ip6: '2001:db8::7', clientPort: 9091 }), { ip6: '2001:db8::7', clientPort: 9091 });
  assert.deepEqual(sdk.fleetCurrentServer({ ip6: '2001:db8::7', clientPort: 9091 }), { ip6: '2001:db8::7', clientPort: 9091 });
  // A session answer's `server` as it is: its other fields are left out.
  assert.deepEqual(
    sdk.fleetCurrentServer({ serverId: 'rt-1', ip4: '203.0.113.7', ip6: '', clientPort: 9091, status: 'ReadyForClients', clients: 3 }),
    { ip4: '203.0.113.7', clientPort: 9091 },
  );
  assert.throws(() => sdk.fleetCurrentServer({ ip4: '', ip6: null, clientPort: 9091 }), RangeError);
});

test('fleetSessions.refresh sends the one address, and the input is valid against the schema', async (t) => {
  const real = globalThis.window;
  // `refresh` runs only where the runtime says it is a server: Node here.
  assert.equal(real, undefined);
  const gql = recorder(() => ({ token: 'f'.repeat(64), gameTokenId: '9001', appId: '7', expiresAt: '', maxPlayers: 256, server: {} }));
  const fleetSessions = new FleetSessionsAPI(gql);
  await fleetSessions.refresh({ appId: '7', gameTokenId: '9001', currentServer: { ip4: '', ip6: '2001:db8::7', clientPort: 9091 } });
  await fleetSessions.refresh({ appId: '7', gameTokenId: '9001', currentServer: { ip4: '203.0.113.7', ip6: '2001:db8::7', clientPort: 9091 } });
  await fleetSessions.refresh({ appId: '7', gameTokenId: '9001' });
  assert.deepEqual(
    gql.calls.map((c) => c.variables.input),
    [
      { appId: '7', gameTokenId: '9001', currentServer: { ip6: '2001:db8::7', clientPort: 9091 } },
      { appId: '7', gameTokenId: '9001', currentServer: { ip4: '203.0.113.7', clientPort: 9091 } },
      { appId: '7', gameTokenId: '9001' },
    ],
  );
  const input = schema.getType('FleetCurrentServerInput').getFields();
  assert.deepEqual(Object.keys(input).sort(), ['clientPort', 'ip4', 'ip6']);
  assert.equal(String(input.ip4.type), 'String');
  assert.equal(String(input.ip6.type), 'String');
  t.diagnostic('FleetCurrentServerInput takes ip4 or ip6');
});

test('FleetSession.refreshInput names the address the session connected to', async () => {
  const session = (server) =>
    new FleetSession({
      session: { token: 'f'.repeat(64), gameTokenId: '9001', appId: '7', expiresAt: null, maxPlayers: 8, server },
      tickIntervalMs: 0,
      socket: () => ({ send() {}, close() {} }),
    });
  assert.deepEqual(session({ ip4: '203.0.113.7', ip6: '2001:db8::7', clientPort: 9091 }).refreshInput(), {
    appId: '7',
    gameTokenId: '9001',
    currentServer: { ip4: '203.0.113.7', clientPort: 9091 },
  });
  // No IPv4 address: the session connects over ip6 and names it (until 18.41.0 it named none).
  assert.deepEqual(session({ ip4: '', ip6: '2001:db8::7', clientPort: 9091 }).refreshInput(), {
    appId: '7',
    gameTokenId: '9001',
    currentServer: { ip6: '2001:db8::7', clientPort: 9091 },
  });
});

// ---------------------------------------------------------------------------
// The wait on a server's retryAfterMs
// ---------------------------------------------------------------------------

const busy = (retryAfterMs) =>
  new sdk.CrowdyUserCodeFaultError([
    { message: 'the platform is busy', extensions: { code: 'PLATFORM_BUSY', blame: 'PLATFORM', retryable: true, retryAfterMs } },
  ]);

test('retryWaitMs: nothing for zero or below, the hint up to 30 seconds, and 30 seconds for anything longer', () => {
  assert.equal(sdk.MAX_RETRY_AFTER_WAIT_MS, 30_000);
  assert.equal(sdk.retryWaitMs(0), 0);
  assert.equal(sdk.retryWaitMs(-1), 0);
  assert.equal(sdk.retryWaitMs(-86_400_000), 0);
  assert.equal(sdk.retryWaitMs(200), 200);
  assert.equal(sdk.retryWaitMs(10_000), 10_000);
  assert.equal(sdk.retryWaitMs(30_000), 30_000);
  assert.equal(sdk.retryWaitMs(30_001), 30_000);
  assert.equal(sdk.retryWaitMs(86_400_000), 30_000);
  assert.equal(sdk.retryWaitMs(Number.MAX_SAFE_INTEGER), 30_000);
  assert.equal(sdk.retryWaitMs(Infinity), 30_000);
  assert.equal(sdk.retryWaitMs(Number.NaN), 0);
  assert.equal(sdk.retryWaitMs(undefined), 0);
  assert.equal(sdk.retryWaitMs(null), 0);
  assert.equal(sdk.retryWaitMs('5000'), 0);
  // The reader still returns what the server sent.
  assert.deepEqual(sdk.platformBusyOf(busy(86_400_000)), { retryAfterMs: 86_400_000 });
});

test('a dropped read waits the hint, never below the poll interval and never above 30 seconds', () => {
  assert.equal(droppedReadWaitMs(busy(86_400_000), 1_500), 30_000);
  assert.equal(droppedReadWaitMs(busy(0), 1_500), 1_500);
  assert.equal(droppedReadWaitMs(busy(-5_000), 1_500), 1_500);
  assert.equal(droppedReadWaitMs(busy(4_700), 1_500), 4_700);
  assert.equal(droppedReadWaitMs(busy(200), 1_500), 1_500);
  // A poll interval of the caller's own that is longer than the ceiling is the caller's.
  assert.equal(droppedReadWaitMs(busy(86_400_000), 60_000), 60_000);
  assert.equal(droppedReadWaitMs(new Error('not a refusal'), 2_000), 2_000);
});

test('waitForModBuild waits 30 seconds on a hint of a day, and its own interval on zero and below', async (t) => {
  for (const [hint, expected] of [
    [86_400_000, 30_000],
    [0, 2_000],
    [-9_000, 2_000],
  ]) {
    const delays = [];
    const timers = mock.method(globalThis, 'setTimeout', (fn, ms) => {
      delays.push(ms);
      queueMicrotask(fn);
      return 0;
    });
    try {
      const script = [busy(hint), 'succeeded'];
      const exec = new sdk.ExecAPI({
        request: async () => {
          const next = script.shift();
          if (next instanceof Error) throw next;
          return { execModBuildStatus: { __typename: 'ExecBuild', buildId: 'b1', status: next, kind: 'exec', log: null, artifacts: [] } };
        },
      });
      const built = await exec.waitForModBuild('42', 'b1');
      assert.equal(built.status, 'succeeded');
    } finally {
      timers.mock.restore();
    }
    assert.deepEqual(delays, [expected], `a hint of ${hint} ms`);
  }
  t.diagnostic('the Studio controller waits through the same droppedReadWaitMs');
});

test('a gateway\u2019s "retry in N ms" is held to the same ceiling', () => {
  const error = (text) => new sdk.CrowdyExecError('Busy', text);
  assert.equal(error('rate limited: 120 calls in 10 s; retry in 4200 ms').retryAfterMs, 4_200);
  assert.equal(error('rate limited: 120 calls in 10 s; retry in 999999999999 ms').retryAfterMs, 30_000);
  assert.equal(error('rate limited: 120 calls in 10 s; retry in 0 ms').retryAfterMs, 0);
  assert.equal(error('rate limited: 120 calls in 10 s').retryAfterMs, undefined);
  assert.equal(error('busy').retryAfterMs, undefined);
});
