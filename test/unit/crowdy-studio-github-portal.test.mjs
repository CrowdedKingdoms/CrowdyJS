/**
 * GitHub App OAuth uses `code` + `state` too. completeEntry must not treat
 * those as Overworld portal codes or the play token is overwritten.
 * Observed 2026-09-08: callback HTML stays on ck-api; query may still carry
 * github=connected if a client ever lands on the game origin.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { PortalAPI } = await import('../../dist/domains/portal.js');
const { AuthState } = await import('../../dist/auth-state.js');

function portalThatMustNotExchange() {
  return new PortalAPI(
    {
      async request() {
        throw new Error('must not exchange GitHub OAuth as a portal code');
      },
    },
    new AuthState(),
  );
}

test('completeEntry returns null for github / installation_id / setup_action even with code+state', async () => {
  const portal = portalThatMustNotExchange();
  assert.equal(
    await portal.completeEntry('?code=github-code&state=hmac&github=connected'),
    null,
  );
  assert.equal(
    await portal.completeEntry('?code=github-code&state=hmac&installation_id=4833099'),
    null,
  );
  assert.equal(
    await portal.completeEntry('?code=github-code&state=hmac&setup_action=install'),
    null,
  );
});

test('completeEntry still exchanges a plain portal code', async () => {
  const calls = [];
  const portal = new PortalAPI(
    {
      async request(_doc, variables) {
        calls.push(variables);
        return {
          exchangePortalCode: {
            token: 'play-token',
            gameTokenId: '1',
            appId: '84070698573312',
            expiresAt: 'later',
            gameApiUrl: 'https://play.invalid',
            gameApiWsUrl: 'wss://play.invalid',
          },
        };
      },
    },
    new AuthState(),
  );
  const token = await portal.completeEntry('?code=portal-code&state=');
  assert.equal(token.token, 'play-token');
  assert.equal(calls.length, 1);
});
