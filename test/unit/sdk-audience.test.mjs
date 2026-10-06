/**
 * The SDK is for normal clients and designed for production: players, developers and
 * org-admins. It wraps no root field that only a super-admin or a platform operator can call
 * (operator decision, 2026-09-28); platform tooling calls those fields directly.
 *
 * Two nets, because the schema has no structured marker for either role: the fields the game
 * API guards with @RequiresSuperAdmin / @RequiresOperator / an inline super-admin check, and
 * any root field whose description says it is operator- or super-admin-only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchema, parse } from 'graphql';
import { QuotasAPI } from '../../dist/index.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** cks-game-api dev (da1179f9): root fields only a super-admin or an operator can call. */
const PLATFORM_ONLY = [
  // super-admin
  'setSuperAdmin',
  'setOperator',
  'setEarlyAccessOverride',
  'updateUserType',
  'forceLogoutUser',
  'usersPaginated',
  'usersConnection',
  'checkouts',
  'checkoutsConnection',
  'paymentEvents',
  'paymentEventsConnection',
  'setOrgStatus',
  'setAppVisibility',
  // operator
  'cpBillingCreditOverbill',
  'cpSetCrowdyStudioAgentAppKill',
  'cpSetCrowdyStudioAgentPlatformPolicy',
  'creditOrgWallet',
  'forgetEmailDeliverability',
  'reinstateOrganization',
  'retireOrganization',
  'runSharedUsageBillingTick',
  'sendTestEmail',
  'setBillingRate',
  'setHostedGameListing',
  'setOrgBillingExempt',
  'takeDownHostedGame',
  'agentRateCards',
  'allHostedGames',
  'billingExemptOrgs',
  'billingRateCard',
  'cpBillingInvariantRuns',
  'cpBillingReconciliations',
  'cpBillingWriteOffs',
  'cpCrowdyStudioAgentPlatformPolicy',
  'emailDeliverability',
  'retiredOrganizations',
];

/** How the schema's descriptions say a field is for super-admins or operators only. */
const PLATFORM_ONLY_DESCRIPTION =
  /\b(operator|super[- ]?admins?)( only\b|:)|\brestricted to super[- ]?admins?\b|\brequires a super[- ]?admin\b/i;

function operationDocuments() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.graphql')) files.push(path);
    }
  };
  walk(join(repo, 'src', 'operations'));
  return files;
}

/** Every root field an SDK document selects, with the file that selects it. */
function wrappedRootFields() {
  const out = [];
  for (const file of operationDocuments()) {
    for (const def of parse(readFileSync(file, 'utf8')).definitions) {
      if (def.kind !== 'OperationDefinition') continue;
      for (const sel of def.selectionSet.selections) {
        if (sel.kind === 'Field') out.push({ field: sel.name.value, file: relative(repo, file) });
      }
    }
  }
  return out;
}

test('no SDK document names a root field only a super-admin or operator can call', () => {
  const schema = buildSchema(readFileSync(join(repo, 'schema.gql'), 'utf8'));
  const described = new Set();
  for (const type of [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]) {
    for (const field of Object.values(type?.getFields() ?? {})) {
      if (PLATFORM_ONLY_DESCRIPTION.test((field.description ?? '').replace(/\s+/g, ' '))) {
        described.add(field.name);
      }
    }
  }
  const wrapped = wrappedRootFields();
  assert.ok(wrapped.length > 100, 'the documents were read');
  const offenders = wrapped
    .filter(({ field }) => PLATFORM_ONLY.includes(field) || described.has(field))
    .map(({ field, file }) => `${field} (${file})`);
  assert.deepEqual(offenders, [], 'call these from platform tooling, not the SDK');
});

test('the description rule sees the platform-only fields and not the org-admin ones', () => {
  const schema = buildSchema(readFileSync(join(repo, 'schema.gql'), 'utf8'));
  const describedAs = (name) => {
    const field = schema.getQueryType().getFields()[name] ?? schema.getMutationType().getFields()[name];
    assert.ok(field, `${name} is in the schema`);
    return PLATFORM_ONLY_DESCRIPTION.test((field.description ?? '').replace(/\s+/g, ' '));
  };
  for (const name of ['setOrgStatus', 'retireOrganization', 'emailDeliverability', 'allHostedGames', 'checkouts']) {
    assert.equal(describedAs(name), true, name);
  }
  // Org-admin fields whose descriptions mention super admins only as a bypass.
  for (const name of ['orgMembers', 'inviteOrgMember', 'createApp', 'myCheckouts']) {
    assert.equal(describedAs(name), false, name);
  }
});

test('quotas.set refuses a platform-global rule before any request', async () => {
  const requests = [];
  const quotas = new QuotasAPI({
    async request(_doc, variables) {
      requests.push(variables);
      return { setQuota: { quotaId: '1' } };
    },
  });
  await assert.rejects(
    quotas.set({ metric: 'replication_messages', limitValue: 10 }),
    /needs an appId or an orgId/,
  );
  await assert.rejects(
    quotas.set({ tierId: '7', metric: 'replication_messages', limitValue: 10 }),
    /needs an appId or an orgId/,
  );
  assert.equal(requests.length, 0);
  await quotas.set({ orgId: '3', metric: 'replication_messages', limitValue: 10 });
  await quotas.set({ appId: '4', tierId: '7', metric: 'replication_messages', limitValue: 10 });
  assert.equal(requests.length, 2);
});
