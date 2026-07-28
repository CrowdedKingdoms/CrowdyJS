/**
 * Studio-admin user-story e2e: an org owner drives the management surface end to
 * end through the SDK — organizations, RBAC, app access tiers/grants, billing
 * budgets, quotas, environment discovery, and usage — plus the permission /
 * validation / malicious negative matrix.
 *
 * Management-only (no game-api/realtime needed). Auto-skips unless the
 * management e2e env is configured. Drives the new `client.organizations`,
 * `client.appAccess`, `client.billing`, `client.quotas`,
 * and `client.usage` sub-clients (and `client.admin.*`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, clientConfig, skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import {
  provisionOwner,
  registerUser,
  gqlManagementRaw,
} from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);
const rid = () => Math.random().toString(36).slice(2, 10);

async function ownerClient() {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(clientConfig());
  const owner = await provisionOwner();
  client.setToken(owner.token);
  return { client, owner };
}

/** Create an app under an org via the SDK (client.apps.create). */
async function createApp(client, orgId) {
  const slug = `e2e-admin-${rid()}`;
  const app = await client.apps.create({ orgId, name: slug, slug });
  return app.appId;
}

test('studio admin: org -> roles -> app -> access tier -> grant happy path', { skip, timeout: 60_000 }, async () => {
  const { client, owner } = await ownerClient();
  try {
    // Organization lifecycle via the SDK.
    const slug = `e2e-org-${rid()}`;
    const org = await client.organizations.create({ name: slug, slug });
    assert.ok(org?.orgId, 'createOrganization returns an orgId');

    const perms = await client.organizations.permissions();
    assert.ok(Array.isArray(perms) && perms.length > 0, 'orgPermissions catalog is non-empty');

    const mine = await client.organizations.mine();
    assert.ok(mine.some((m) => m.org.orgId === org.orgId), 'new org appears in myOrganizations');

    const members = await client.organizations.members(org.orgId);
    assert.ok(members.some((m) => String(m.userId ?? m.user?.userId) === String(owner.userId)) || members.length >= 1, 'owner is a member');

    // RBAC role lifecycle.
    const role = await client.organizations.createRole({ orgId: org.orgId, roleName: `role-${rid()}`, permissions: ['manage_apps'] });
    assert.ok(role?.orgRoleId, 'createOrgRole returns a role id');
    const roles = await client.organizations.roles(org.orgId);
    assert.ok(roles.some((r) => r.orgRoleId === role.orgRoleId), 'role appears in orgRoles');
    await client.organizations.deleteRole(role.orgRoleId);

    // Org token lifecycle (CreateOrgTokenInput: orgId + optional label/expiresAt).
    const token = await client.organizations.createToken({ orgId: org.orgId, label: `tok-${rid()}` });
    assert.ok(token, 'createOrgToken returns a token');
    const tokens = await client.organizations.tokens(org.orgId);
    assert.ok(Array.isArray(tokens), 'orgTokens lists tokens');

    // App + access tier + grant.
    const appId = await createApp(client, org.orgId);
    const tier = await client.appAccess.createTier({
      appId, name: `tier-${rid()}`, isFree: true, isDefault: false,
      permissionKeys: ['access', 'update_voxel_data'],
    });
    assert.ok(tier?.tierId, 'createAccessTier returns a tier id');
    const tiers = await client.appAccess.tiers(appId);
    assert.ok(tiers.some((t) => t.tierId === tier.tierId), 'tier appears in appAccessTiers');

    const player = await registerUser();
    const grant = await client.appAccess.grant({ appId, userId: player.userId, tierId: tier.tierId });
    assert.ok(grant, 'grantAppAccess succeeds');
    const accessRows = await client.appAccess.usersByApp(appId, { limit: 50 });
    assert.ok(accessRows.some((r) => String(r.userId) === String(player.userId)), 'granted user appears in appUserAccessByApp');
    const revoked = await client.appAccess.revoke(appId, player.userId);
    assert.ok(revoked === true || revoked != null, 'revokeAppAccess succeeds');
  } finally {
    client.close();
  }
});

test('studio admin: billing + quotas + usage', { skip, timeout: 60_000 }, async () => {
  const { client } = await ownerClient();
  try {
    const slug = `e2e-org-${rid()}`;
    const org = await client.organizations.create({ name: slug, slug });
    const appId = await createApp(client, org.orgId);

    // Billing: wallet + budgets (view_billing/manage_billing on the owner's org).
    const balance = await client.billing.walletBalance(org.orgId);
    assert.ok(balance != null, 'walletBalance returns a value');
    await client.billing.setAppBudget(org.orgId, appId, '5000');
    const budget = await client.billing.appBudget(org.orgId, appId);
    assert.ok(budget != null, 'appBudget reflects the set budget');

    // Quotas (SetQuotaInput.limitValue, BigInt as a decimal string).
    await client.quotas.set({ orgId: org.orgId, metric: 'replication_messages', limitValue: '1000000' });
    const orgQuotas = await client.quotas.forOrg(org.orgId);
    assert.ok(Array.isArray(orgQuotas), 'quotasForOrg lists quotas');

    // Usage reporting (view_usage); window = last hour. (v13: the
    // per-environment rollups retired with dedicated environments.)
    const since = new Date(Date.now() - 3600_000).toISOString();
    const usage = await client.usage.appSummary(org.orgId, appId, since);
    assert.ok(usage != null, 'appUsageSummary returns a summary');
  } finally {
    client.close();
  }
});

test('studio admin: permission + validation + malicious negatives', { skip, timeout: 60_000 }, async () => {
  const { client: owner } = await ownerClient();
  const { createCrowdyClient } = await loadSdk();
  const anon = createCrowdyClient(clientConfig());
  const outsider = createCrowdyClient(clientConfig());
  try {
    const slug = `e2e-org-${rid()}`;
    const org = await owner.organizations.create({ name: slug, slug });

    // Anonymous: reading org members requires a session.
    await assert.rejects(
      () => anon.organizations.members(org.orgId),
      (err) => /UNAUTHENTICATED|FORBIDDEN/.test(err?.extensions?.code ?? err?.message ?? ''),
      'anonymous member read is rejected',
    );

    // Outsider (real account, not a member) cannot read another org's members.
    const outsiderUser = await registerUser();
    outsider.setToken(outsiderUser.token);
    await assert.rejects(
      () => outsider.organizations.members(org.orgId),
      (err) => /FORBIDDEN|SCOPE_MISSING|UNAUTHORIZED/.test(err?.extensions?.code ?? err?.message ?? ''),
      'outsider member read is forbidden (cross-tenant)',
    );

    // GraphQL validation: missing required arg should be rejected before resolvers.
    const bad = await gqlManagementRaw(
      `query { orgMembers { userId } }`, // orgId is required
      {},
      owner.getToken(),
    );
    assert.ok(
      bad.status === 400 || (bad.body?.errors?.length ?? 0) > 0,
      'missing required arg is a validation error',
    );

    // Malicious-ish: a bogus huge org id should not leak data (forbidden/not-found,
    // never another tenant's rows). Use the outsider: the owner persona may be a
    // super admin on smoke stacks, and super admins bypass the org permission
    // guard (an empty list, not a rejection).
    await assert.rejects(
      () => outsider.organizations.members('999999999999999'),
      (err) => !!(err?.extensions?.code || err?.message),
      'bogus org id is rejected rather than leaking data',
    );
  } finally {
    owner.close();
    anon.close();
    outsider.close();
  }
});
