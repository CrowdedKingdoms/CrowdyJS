/**
 * Basic abuse / malicious-input e2e against the management surface: bad and
 * revoked tokens, account-enumeration resistance, and that injection-ish /
 * oversized inputs are handled with structured errors (never a 5xx / stack
 * leak). Management-only; auto-skips without the management e2e env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, clientConfig, skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { registerUser, gqlManagementRaw } from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);
const rid = () => Math.random().toString(36).slice(2, 10);

test('auth: a garbage bearer token is rejected as UNAUTHENTICATED', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  client.setToken('not-a-real-token.deadbeef');
  try {
    await assert.rejects(
      () => client.organizations.mine(),
      (err) => /UNAUTHENTICATED|FORBIDDEN/.test(err?.extensions?.code ?? err?.message ?? ''),
      'a forged token cannot read protected data',
    );
  } finally {
    client.close();
  }
});

test('auth: a revoked (logged-out) token no longer authorizes', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  const user = await registerUser();
  client.setToken(user.token);
  try {
    await client.organizations.mine(); // works while valid
    await client.auth.logout(); // revokes the session server-side
    client.setToken(user.token); // re-attach the now-revoked token
    await assert.rejects(
      () => client.organizations.mine(),
      (err) => /UNAUTHENTICATED|FORBIDDEN/.test(err?.extensions?.code ?? err?.message ?? ''),
      'a revoked token is rejected',
    );
  } finally {
    client.close();
  }
});

test('auth: login-link requests are enumeration-resistant', { skip, timeout: 60_000 }, async () => {
  // Passwordless (v8): password reset/resend are gone. The enumeration-resistance
  // property now lives on requestLoginLink, which must report sent=true whether
  // or not the email maps to an account.
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  try {
    const unknown = `crowdy-nobody-${rid()}@test.invalid`;
    const res = await client.auth.requestLoginLink({ email: unknown });
    assert.equal(res.sent, true, 'login link always reports sent (no enumeration)');
  } finally {
    client.close();
  }
});

test('auth: a forged session token fails closed (cannot read the current user)', { skip, timeout: 60_000 }, async () => {
  // Passwordless: there is no password to get "wrong". The equivalent fail-closed
  // property is that a bogus identity session token cannot read protected data.
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  client.setToken(`forged-session-${rid()}.deadbeef`);
  try {
    await assert.rejects(
      () => client.users.me(),
      (err) => /UNAUTHENTICATED|FORBIDDEN/.test(err?.extensions?.code ?? err?.message ?? ''),
      'a forged session token cannot read me',
    );
  } finally {
    client.close();
  }
});

test('input: injection-ish and oversized values yield structured errors, not 5xx', { skip, timeout: 60_000 }, async () => {
  const owner = await registerUser();
  // Org slug with SQL/script metacharacters: the server must reject with a
  // structured validation error (or sanitize), never crash with a 5xx.
  const inj = await gqlManagementRaw(
    `mutation($i: CreateOrganizationInput!){ createOrganization(input:$i){ orgId } }`,
    { i: { name: `rob'); DROP TABLE users;--`, slug: `<script>alert(1)</script>` } },
    owner.token,
  );
  assert.ok(inj.status < 500, `injection-ish input must not 5xx (got ${inj.status})`);
  assert.ok(inj.body?.data !== undefined || (inj.body?.errors?.length ?? 0) > 0, 'returns a structured GraphQL envelope');

  // Oversized field: a 200k-char name should be rejected with a structured
  // error, not crash the server.
  const huge = await gqlManagementRaw(
    `mutation($i: CreateOrganizationInput!){ createOrganization(input:$i){ orgId } }`,
    { i: { name: 'x'.repeat(200_000), slug: `e2e-huge-${rid()}` } },
    owner.token,
  );
  assert.ok(huge.status < 500, `oversized input must not 5xx (got ${huge.status})`);
});
