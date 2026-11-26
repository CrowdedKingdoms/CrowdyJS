/**
 * Fleet sessions, the Application API's part (v2.89.0): `openFleetSession`,
 * `refreshFleetSession`, `closeFleetSession` and `execConnectAsServer`, each with the
 * organization's org token as the bearer, from a server the organization runs.
 *
 * A stub `fetch` stands in for the API, so each case reads the request the SDK really sends
 * (document, variables, bearer) and the error the SDK really raises for a refusal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'graphql';

const sdk = await import('../../dist/index.js');
const { createCrowdyClient, CrowdyError, CrowdyGraphQLError } = sdk;

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORG_TOKEN = `cko_${'k'.repeat(64)}`;

const SESSION = {
  token: 'f'.repeat(64),
  gameTokenId: '9001',
  appId: '7',
  expiresAt: '2026-11-26T18:00:00.000Z',
  maxPlayers: 256,
  server: { serverId: 'rt-1', ip4: '203.0.113.7', ip6: '', clientPort: 9000, status: 'ReadyForClients', clients: 12 },
};

/** A client for an organization's server, and the requests it sent to the stub. */
function serverClient(respond) {
  const requests = [];
  const client = createCrowdyClient({
    httpUrl: 'https://ck.example.test',
    wsUrl: 'wss://ck.example.test',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      const op = parse(body.query).definitions.find((d) => d.kind === 'OperationDefinition');
      const request = {
        url: String(url),
        authorization: new Headers(init.headers).get('authorization'),
        operation: op.name?.value,
        field: op.selectionSet.selections[0].name.value,
        variables: body.variables,
        query: body.query,
      };
      requests.push(request);
      const answer = respond(request);
      return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  client.setToken(ORG_TOKEN);
  return { client, requests };
}

const refusal = (code, extensions = {}, message = 'refused') => ({
  errors: [{ message, extensions: { code, ...extensions } }],
  data: null,
});

test('open sends openFleetSession with the org token and returns the answer', async (t) => {
  const { client, requests } = serverClient(() => ({ data: { openFleetSession: SESSION } }));
  t.after(() => client.close());
  const opened = await client.fleetSessions.open('7');
  assert.deepEqual(opened, SESSION);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, 'https://ck.example.test/graphql');
  assert.equal(request.authorization, `Bearer ${ORG_TOKEN}`);
  assert.equal(request.operation, 'OpenFleetSession');
  assert.equal(request.field, 'openFleetSession');
  assert.deepEqual(request.variables, { input: { appId: '7' } });
  for (const field of ['token', 'gameTokenId', 'appId', 'expiresAt', 'maxPlayers', 'ip4', 'ip6', 'clientPort']) {
    assert.match(request.query, new RegExp(`\\b${field}\\b`), `the document selects ${field}`);
  }
  assert.equal(client.admin.fleetSessions, client.fleetSessions, 'admin.fleetSessions is the same sub-client');
});

test('refresh names the server the session is on, or none after a move was ordered', async (t) => {
  const moved = { ...SESSION, expiresAt: '2026-11-27T06:00:00.000Z', server: { ...SESSION.server, ip4: '203.0.113.9' } };
  const { client, requests } = serverClient(() => ({ data: { refreshFleetSession: moved } }));
  t.after(() => client.close());

  const stayed = await client.fleetSessions.refresh({
    appId: '7',
    gameTokenId: '9001',
    currentServer: { ip4: '203.0.113.7', clientPort: 9000 },
  });
  assert.deepEqual(stayed, moved);
  assert.equal(requests[0].operation, 'RefreshFleetSession');
  assert.equal(requests[0].authorization, `Bearer ${ORG_TOKEN}`);
  assert.deepEqual(requests[0].variables, {
    input: { appId: '7', gameTokenId: '9001', currentServer: { ip4: '203.0.113.7', clientPort: 9000 } },
  });

  await client.fleetSessions.refresh({ appId: '7', gameTokenId: '9001' });
  assert.deepEqual(requests[1].variables, { input: { appId: '7', gameTokenId: '9001' } });
});

test('close resolves true for a session that was ended and false when there was none', async (t) => {
  let ended = true;
  const { client, requests } = serverClient(() => ({ data: { closeFleetSession: ended } }));
  t.after(() => client.close());
  assert.equal(await client.fleetSessions.close({ appId: '7', gameTokenId: '9001' }), true);
  // Already closed, or opened with another org token of the same organization.
  ended = false;
  assert.equal(await client.fleetSessions.close({ appId: '7', gameTokenId: '9001' }), false);
  assert.equal(requests[0].operation, 'CloseFleetSession');
  assert.equal(requests[0].authorization, `Bearer ${ORG_TOKEN}`);
  assert.deepEqual(requests[0].variables, { input: { appId: '7', gameTokenId: '9001' } });
});

test('serverEndpoint sends execConnectAsServer with the placement it wants', async (t) => {
  const endpoint = {
    gatewayUrl: 'wss://ckx-1.exec.example.test',
    token: 'connect-token',
    host: 'ckx-1',
    expiresAt: '2026-11-25T18:01:00.000Z',
  };
  const { client, requests } = serverClient(() => ({ data: { execConnectAsServer: endpoint } }));
  t.after(() => client.close());
  assert.deepEqual(await client.exec.serverEndpoint('7', { nodeType: 'player', key: 'p-42' }), endpoint);
  assert.equal(requests[0].operation, 'ExecConnectAsServer');
  assert.equal(requests[0].field, 'execConnectAsServer');
  assert.equal(requests[0].authorization, `Bearer ${ORG_TOKEN}`);
  assert.deepEqual(requests[0].variables, { appId: '7', nodeType: 'player', key: 'p-42' });
  await client.exec.serverEndpoint('7');
  assert.deepEqual(requests[1].variables, { appId: '7' });
});

const CALLS = [
  ['fleetSessions.open', (c) => c.fleetSessions.open('7')],
  ['fleetSessions.refresh', (c) => c.fleetSessions.refresh({ appId: '7', gameTokenId: '9001' })],
  ['fleetSessions.close', (c) => c.fleetSessions.close({ appId: '7', gameTokenId: '9001' })],
  ['exec.serverEndpoint', (c) => c.exec.serverEndpoint('7')],
];

test('each refusal is told apart by extensions.code, on every call', async (t) => {
  const readers = {
    ORG_TOKEN_REQUIRED: sdk.orgTokenRequiredOf,
    FLEET_SESSION_LIMIT: sdk.fleetSessionLimitOf,
    NOT_FOUND: sdk.fleetSessionNotFoundOf,
    ORG_LEGAL_ACCEPTANCE_REQUIRED: sdk.orgLegalAcceptanceRequiredOf,
  };
  assert.equal(sdk.ORG_TOKEN_REQUIRED_CODE, 'ORG_TOKEN_REQUIRED');
  assert.equal(sdk.FLEET_SESSION_LIMIT_CODE, 'FLEET_SESSION_LIMIT');
  assert.equal(sdk.NOT_FOUND_CODE, 'NOT_FOUND');
  assert.equal(sdk.PLATFORM_BUSY_CODE, 'PLATFORM_BUSY');

  for (const [name, call] of CALLS) {
    for (const code of Object.keys(readers)) {
      const { client } = serverClient(() => refusal(code));
      t.after(() => client.close());
      const error = await call(client).catch((e) => e);
      assert.ok(error instanceof CrowdyGraphQLError, `${name} raises a CrowdyGraphQLError for ${code}`);
      assert.equal(error.code, code, `${name}: error.code`);
      for (const [other, reader] of Object.entries(readers)) {
        assert.equal(reader(error), other === code, `${name}: ${other} reader on ${code}`);
      }
      assert.equal(sdk.platformBusyOf(error), null, `${name}: ${code} is not PLATFORM_BUSY`);
    }
    // FORBIDDEN (fleet sessions switched off, a missing scope, an app outside the token's
    // list) has no reader of its own: it is the error's code.
    const { client } = serverClient(() => refusal('FORBIDDEN'));
    t.after(() => client.close());
    const forbidden = await call(client).catch((e) => e);
    assert.equal(forbidden.code, 'FORBIDDEN');
    for (const reader of Object.values(readers)) assert.equal(reader(forbidden), false);
  }
});

test('PLATFORM_BUSY carries retryAfterMs, on every call', async (t) => {
  for (const [name, call] of CALLS) {
    const { client, requests } = serverClient(() =>
      refusal('PLATFORM_BUSY', { blame: 'PLATFORM', retryable: true, retryAfterMs: 1375 }),
    );
    t.after(() => client.close());
    const error = await call(client).catch((e) => e);
    assert.ok(error instanceof CrowdyGraphQLError, name);
    assert.deepEqual(sdk.platformBusyOf(error), { retryAfterMs: 1375 }, name);
    assert.deepEqual(sdk.playerFaultOf(error), { code: 'PLATFORM_BUSY', blame: 'PLATFORM', retryable: true }, name);
    assert.equal(sdk.orgTokenRequiredOf(error), false);
    assert.equal(requests.length, 1, `${name}: a mutation is not sent again by the SDK`);
  }
  // No wait named: 0, never undefined or NaN.
  const noWait = new CrowdyGraphQLError([{ message: 'busy', extensions: { code: 'PLATFORM_BUSY' } }]);
  assert.deepEqual(sdk.platformBusyOf(noWait), { retryAfterMs: 0 });
  const odd = new CrowdyGraphQLError([{ message: 'busy', extensions: { code: 'PLATFORM_BUSY', retryAfterMs: 'soon' } }]);
  assert.deepEqual(sdk.platformBusyOf(odd), { retryAfterMs: 0 });
  // The busy entry is read wherever it sits in the errors.
  const later = new CrowdyGraphQLError([
    { message: 'a', extensions: { code: 'BAD_USER_INPUT' } },
    { message: 'b', extensions: { code: 'PLATFORM_BUSY', retryAfterMs: 1900 } },
  ]);
  assert.deepEqual(sdk.platformBusyOf(later), { retryAfterMs: 1900 });
  assert.equal(sdk.platformBusyOf(new Error('x')), null);
});

test('the calls refuse to run in a browser page, before any request', async (t) => {
  const { client, requests } = serverClient(() => ({ data: { openFleetSession: SESSION } }));
  t.after(() => client.close());
  globalThis.window = globalThis;
  globalThis.document = {};
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  for (const [name, call] of [...CALLS, ['exec.connectAsServer', (c) => c.exec.connectAsServer('7')]]) {
    const error = await call(client).catch((e) => e);
    assert.ok(error instanceof CrowdyError, name);
    assert.match(error.message, /org token, which never goes into a browser page or a game client/, name);
  }
  assert.equal(requests.length, 0, 'the org token was put on no request');
});

test('the SDK still wraps no org-token sign-in: the mint stays a request your server makes', () => {
  const names = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.graphql')) {
        for (const def of parse(readFileSync(path, 'utf8')).definitions) {
          if (def.kind !== 'OperationDefinition') continue;
          for (const sel of def.selectionSet.selections) names.push(sel.name.value);
        }
      }
    }
  };
  walk(join(repo, 'src', 'operations'));
  for (const field of ['openFleetSession', 'refreshFleetSession', 'closeFleetSession', 'execConnectAsServer']) {
    assert.ok(names.includes(field), `${field} is wrapped`);
  }
  assert.equal(names.includes('mintManagedPlayerToken'), false);
});
