import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * A native client's refresh names the server it is on (ck-api v1.83.7).
 *
 * A Buddy drops datagrams for a token it was never told about, and until v1.83.7 the
 * only thing that told it was `serverWithLeastClients` -- so every 30-minute refresh
 * was a re-placement. `refresh(currentServer)` asks the API to install the NEW token
 * on the current server and selects `authorizedServer` so the caller knows whether it
 * may keep its socket. The no-argument form is unchanged, so browser clients (UDP
 * proxy) and clients against an older API are untouched.
 */
const source = readFileSync(
  new URL('../../src/domains/portal.ts', import.meta.url),
  'utf8',
);

test('the on-server refresh passes currentServer and selects authorizedServer', () => {
  const line = source
    .split('\n')
    .find((l) => l.includes('mutation RefreshAppTokenOnServer'));
  assert.ok(line, 'no RefreshAppTokenOnServer document');
  assert.match(line, /\$currentServer: CurrentServerInput/);
  assert.match(line, /refreshAppToken\(currentServer: \$currentServer\)/);
  assert.match(line, /\$\{APP_TOKEN_FIELDS\}/);
  assert.match(line, /authorizedServer \{ ip4 clientPort \}/);
});

test('the plain refresh is unchanged, so an older API and browser clients keep working', () => {
  const line = source
    .split('\n')
    .find((l) => l.includes('mutation RefreshAppToken {'));
  assert.ok(line, 'no plain RefreshAppToken document');
  assert.doesNotMatch(line, /currentServer|authorizedServer/);
});

test('PortalAPI.refresh routes by whether a server was named', async () => {
  const { PortalAPI } = await import('../../dist/domains/portal.js');
  const calls = [];
  const api = {
    request: async (doc, vars) => {
      calls.push({ vars, text: JSON.stringify(doc).includes('RefreshAppTokenOnServer') });
      return {
        refreshAppToken: {
          token: 't2',
          gameTokenId: '9',
          appId: '7',
          expiresAt: '2026-09-06T00:00:00.000Z',
          gameApiUrl: null,
          gameApiWsUrl: null,
          discoveryUrl: null,
          launchUrl: null,
          authorizedServer: vars.currentServer ? { ip4: vars.currentServer.ip4, clientPort: vars.currentServer.clientPort } : null,
        },
      };
    },
  };
  const tokens = [];
  const session = { setToken: (t) => tokens.push(t) };
  const portal = new PortalAPI(api, session);

  const kept = await portal.refresh({ ip4: '10.0.0.5', clientPort: 9091 });
  assert.equal(calls[0].text, true);
  assert.deepEqual(calls[0].vars, { currentServer: { ip4: '10.0.0.5', clientPort: 9091 } });
  assert.deepEqual(kept.authorizedServer, { ip4: '10.0.0.5', clientPort: 9091 });

  const plain = await portal.refresh();
  assert.equal(calls[1].text, false);
  assert.equal(plain.authorizedServer, null);
  assert.deepEqual(tokens, ['t2', 't2']);
});
