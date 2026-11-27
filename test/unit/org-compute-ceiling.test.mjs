/**
 * `exec.orgComputeCeiling` (18.41.0, OI-2026-11-25-006): what each of an organization's apps
 * may run of compute modules in one datacenter, readable by a member with
 * `view_compute_diagnostics` on the organization (Application API v2.88.0). The operator's
 * `setOrgComputeCeiling` is not wrapped: `sdk-audience.test.mjs` keeps it out.
 *
 * And `managedPlayers.settings` selects the organization's fleet limits (OI-2026-11-26-010
 * item 6), which the schema has carried since Application API v2.89.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchema, validate } from 'graphql';

const { ExecAPI } = await import('../../dist/domains/exec.js');
const { ManagedPlayersAPI } = await import('../../dist/domains/managedPlayers.js');
const generated = await import('../../dist/generated/graphql.js');

const schema = buildSchema(readFileSync(fileURLToPath(new URL('../../schema.gql', import.meta.url)), 'utf8'));

/** A GraphQL client that records each operation, what it selected, and answers from `answers`. */
function recorder(answers) {
  const calls = [];
  return {
    calls,
    request: async (document, variables) => {
      const operation = document.definitions.find((d) => d.kind === 'OperationDefinition');
      const field = operation.selectionSet.selections[0];
      calls.push({
        name: operation.name.value,
        kind: operation.operation,
        field: field.name.value,
        selected: field.selectionSet.selections.map((s) => s.name.value),
        variables,
      });
      return answers[operation.name.value];
    },
  };
}

test('exec.orgComputeCeiling reads the ceiling with every field, and returns it without __typename', async () => {
  const ceiling = {
    __typename: 'OrgComputeCeiling',
    orgId: '31',
    maxInstances: 4096,
    maxReservedMb: 256064,
    operatorSet: true,
    funded: true,
    defaultMaxInstances: 64,
    defaultMaxReservedMb: 65536,
    reason: 'a mesh of game servers',
    updatedAt: '2026-11-25T17:44:00.000Z',
  };
  const gql = recorder({ OrgComputeCeiling: { orgComputeCeiling: ceiling } });
  const exec = new ExecAPI(gql);

  const { __typename, ...plain } = ceiling;
  assert.deepEqual(await exec.orgComputeCeiling('31'), plain);
  assert.deepEqual(gql.calls, [
    {
      name: 'OrgComputeCeiling',
      kind: 'query',
      field: 'orgComputeCeiling',
      selected: [
        'orgId',
        'maxInstances',
        'maxReservedMb',
        'operatorSet',
        'funded',
        'defaultMaxInstances',
        'defaultMaxReservedMb',
        'reason',
        'updatedAt',
      ],
      variables: { orgId: '31' },
    },
  ]);
});

test('the default ceiling of an organization no operator set anything for', async () => {
  const gql = recorder({
    OrgComputeCeiling: {
      orgComputeCeiling: {
        __typename: 'OrgComputeCeiling',
        orgId: '32',
        maxInstances: 64,
        maxReservedMb: 65536,
        operatorSet: false,
        funded: false,
        defaultMaxInstances: 64,
        defaultMaxReservedMb: 65536,
        reason: null,
        updatedAt: null,
      },
    },
  });
  const ceiling = await new ExecAPI(gql).orgComputeCeiling('32');
  assert.equal(ceiling.operatorSet, false);
  assert.equal(ceiling.funded, false);
  assert.equal(ceiling.reason, null);
  assert.equal(ceiling.updatedAt, null);
  assert.equal(ceiling.maxInstances, ceiling.defaultMaxInstances);
});

test('the document is valid against the release\'s schema, and selects every field the type has', () => {
  assert.deepEqual(validate(schema, generated.OrgComputeCeilingDocument), []);
  const fields = Object.keys(schema.getType('OrgComputeCeiling').getFields()).sort();
  const operation = generated.OrgComputeCeilingDocument.definitions[0];
  const selected = operation.selectionSet.selections[0].selectionSet.selections.map((s) => s.name.value).sort();
  assert.deepEqual(selected, fields);
});

test('a refusal reaches the caller as the API sent it', async () => {
  const refusal = new Error("Missing org permission 'view_compute_diagnostics'");
  const exec = new ExecAPI({
    request: async () => {
      throw refusal;
    },
  });
  await assert.rejects(exec.orgComputeCeiling('31'), (error) => error === refusal);
});

test('managedPlayers.settings selects the organization\'s fleet limits', async () => {
  const settings = {
    __typename: 'OrgManagedPlayerSettings',
    orgId: '3',
    enabled: true,
    maxPlayers: '10000',
    playerCount: '12',
    mintsPerMinute: 600,
    defaultSessionTtlSeconds: 86400,
    maxSessionTtlSeconds: 2592000,
    fleetSessionsEnabled: true,
    maxFleetSessions: 512,
    maxFleetPlayers: 256,
    termsVersion: '2026-11-10',
    termsUrl: 'https://crowdedkingdoms.com/legal/org-managed-players',
    termsAccepted: true,
    termsAcceptedVersion: '2026-11-10',
    termsAcceptedAt: '2026-11-10T03:00:00.000Z',
    termsAcceptedByUserId: '9',
    viewerMayAcceptTerms: false,
  };
  const gql = recorder({ OrgManagedPlayerSettings: { orgManagedPlayerSettings: settings } });
  const answer = await new ManagedPlayersAPI(gql).settings('3');
  assert.equal(answer.fleetSessionsEnabled, true);
  assert.equal(answer.maxFleetSessions, 512);
  assert.equal(answer.maxFleetPlayers, 256);
  const [call] = gql.calls;
  assert.equal(call.field, 'orgManagedPlayerSettings');
  for (const field of ['fleetSessionsEnabled', 'maxFleetSessions', 'maxFleetPlayers']) {
    assert.ok(call.selected.includes(field), `settings selects ${field}`);
  }
  assert.deepEqual(validate(schema, generated.OrgManagedPlayerSettingsDocument), []);
});
