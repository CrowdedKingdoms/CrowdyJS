/**
 * Operator (platform-policy) user-story e2e.
 *
 * As of v13 (unified galaxy API) `client.operator` is reduced to the platform
 * compute ceilings — infrastructure operations (environments, change orders,
 * secrets, releases, audit) moved to the separate infra-control-plane service
 * with its own auth. This suite exercises the surviving read plus the key
 * permission negative: a non-operator account is forbidden.
 *
 * Requires an operator persona: set CROWDY_OPERATOR_EMAIL (passwordless), or rely
 * on the local smoke stack where the seeded owner is also a super-admin/operator.
 * Management-only; auto-skips without the management e2e env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, clientConfig, skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { provisionOperator, registerUser } from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);

test('operator: read the platform compute ceilings', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  const op = await provisionOperator();
  client.setToken(op.token);
  try {
    const ceilings = await client.operator.computePlatformCeilings();
    assert.ok(ceilings && typeof ceilings === 'object', 'ceilings row returned');
    assert.ok('maxModules' in ceilings, 'ceilings carry the per-knob fields');
  } finally {
    client.close();
  }
});

test('operator: a non-operator account is forbidden', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  const regular = await registerUser(); // fresh account, no operator bit
  client.setToken(regular.token);
  try {
    await assert.rejects(
      () => client.operator.computePlatformCeilings(),
      (err) => /FORBIDDEN|UNAUTHORIZED|SCOPE_MISSING/.test(err?.extensions?.code ?? err?.message ?? ''),
      'non-operator ceilings read is forbidden',
    );
  } finally {
    client.close();
  }
});
