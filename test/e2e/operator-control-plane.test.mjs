/**
 * Operator (control-plane) user-story e2e.
 *
 * Exercises the read side of `client.operator` (the cross-org platform-ops
 * surface) and the key permission negative: a non-operator account is forbidden.
 * Destructive/side-effecting operator mutations (release ingest/yank, secret
 * writes, deletion-protection) only run when CROWDY_TEST_OPERATOR_DESTRUCTIVE=1
 * because they write audit entries / GitHub / retarget deploys.
 *
 * Requires an operator persona: set CROWDY_OPERATOR_EMAIL/PASSWORD, or rely on
 * the local smoke stack where the seeded owner is also a super-admin/operator.
 * Management-only; auto-skips without the management e2e env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, clientConfig, skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { provisionOperator, registerUser } from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);
const destructive = process.env.CROWDY_TEST_OPERATOR_DESTRUCTIVE === '1';

test('operator: read control-plane surface (environments, versions, audit, users)', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  const op = await provisionOperator();
  client.setToken(op.token);
  try {
    const envs = await client.operator.environments({ page: 1, pageSize: 10 });
    assert.ok(Array.isArray(envs.rows), 'cpEnvironments returns a page of rows');
    assert.equal(typeof envs.total, 'number', 'page carries a total');

    const versions = await client.operator.environmentVersions();
    assert.ok(Array.isArray(versions.rows), 'cpEnvironmentVersions returns rows');

    const users = await client.operator.operatorUsers();
    assert.ok(Array.isArray(users) && users.length >= 1, 'operatorUsers lists at least the caller');

    const audit = await client.operator.audit({ limit: 25 });
    assert.ok(Array.isArray(audit), 'cpAudit returns entries');

    const secrets = await client.operator.secrets();
    assert.ok(Array.isArray(secrets), 'cpSecrets returns metadata rows (never plaintext)');
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
      () => client.operator.environments(),
      (err) => /FORBIDDEN|UNAUTHORIZED|SCOPE_MISSING/.test(err?.extensions?.code ?? err?.message ?? ''),
      'non-operator cpEnvironments is forbidden',
    );
  } finally {
    client.close();
  }
});

test(
  'operator: release ingest is idempotent-ish + auditable (destructive, gated)',
  { skip: skip ?? (destructive ? undefined : 'set CROWDY_TEST_OPERATOR_DESTRUCTIVE=1 to run'), timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await loadSdk();
    const client = createCrowdyClient(clientConfig());
    const op = await provisionOperator();
    client.setToken(op.token);
    try {
      // Re-ingest the current latest available version (force=false is a no-op
      // when it already exists, so this is safe to run repeatedly).
      const versions = await client.operator.environmentVersions();
      const latest = versions.latestAvailableVersion ?? versions.rows[0]?.version;
      assert.ok(latest, 'there is a version to ingest');
      const row = await client.operator.ingestEnvironmentVersion({ version: latest });
      assert.equal(row.version, latest, 'ingest returns the requested version row');
    } finally {
      client.close();
    }
  },
);
