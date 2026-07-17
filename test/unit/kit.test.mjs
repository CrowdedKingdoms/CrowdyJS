/**
 * Offline unit tests for the Game Kit blueprint builders and the deploy-time
 * merge. Blueprints are pure data generators — no network involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

test('inventoryBlueprint generates owner-gated types and functions', async () => {
  const { inventoryBlueprint, inventoryNames } = await loadSdk();

  const bp = inventoryBlueprint({ maxSlots: 30, slotCount: 40 });
  const typeNames = bp.containerTypes.map((t) => t.typeName);
  assert.deepEqual(typeNames, ['Inventory', 'ItemStack']);
  assert.ok(bp.containerTypes.every((t) => t.instantiableBy === 'member'));

  const maxSlots = bp.propertyDefinitions.find((p) => p.key === 'max_slots');
  assert.equal(maxSlots.defaultValueJson, '30');

  const fnNames = bp.functions.map((f) => f.name);
  assert.deepEqual(fnNames, ['grant_stack', 'consume_stack', 'move_stack', 'transfer_stack']);

  // Every function is owner-gated.
  for (const fn of bp.functions) {
    const policy = JSON.parse(fn.invokePolicyJson);
    const hasOwner =
      policy.type === 'owner_of_self' ||
      (policy.type === 'and' && policy.rules.some((r) => r.type === 'owner_of_self'));
    assert.ok(hasOwner, `${fn.name} should require owner_of_self`);
  }

  // consume/transfer carry a server-side quantity guard.
  const consume = bp.functions.find((f) => f.name === 'consume_stack');
  const consumePolicy = JSON.parse(consume.invokePolicyJson);
  const guard = consumePolicy.rules.find((r) => r.type === 'condition');
  assert.match(guard.expression, /self\.quantity >= \$amount/);

  // move clamps to the configured slot bound.
  const move = bp.functions.find((f) => f.name === 'move_stack');
  assert.match(move.mutations[0].expression, /clamp\(\$to_slot, 0, 39\)/);

  // Prefixed variant renames types and functions.
  const bank = inventoryBlueprint({ typePrefix: 'Bank' });
  assert.deepEqual(
    bank.containerTypes.map((t) => t.typeName),
    ['BankInventory', 'BankItemStack'],
  );
  assert.ok(bank.functions.every((f) => f.name.startsWith('bank_')));
  assert.equal(inventoryNames('Bank').grantFn, 'bank_grant_stack');
});

test('lockBlueprint maps authority sources onto invoke policies', async () => {
  const { lockBlueprint } = await loadSdk();

  // Key-gated door: key type + required_key_id + condition policy + key param.
  const door = lockBlueprint({ objectTypeName: 'Door', authority: { kind: 'key' } });
  assert.deepEqual(
    door.containerTypes.map((t) => t.typeName),
    ['Door', 'DoorKey'],
  );
  const open = door.functions.find((f) => f.name === 'open_door');
  assert.ok(open, 'open_door should exist');
  assert.equal(open.parameters[0].name, 'key_id');
  assert.equal(open.parameters[0].valueType, 'container_ref');
  const policy = JSON.parse(open.invokePolicyJson);
  assert.equal(policy.type, 'condition');
  assert.match(policy.expression, /ref\(\$key_id\)\.key_id == self\.required_key_id/);
  assert.match(policy.expression, /owner_user_id == \$caller_user_id/);

  // Owner-gated chest: no key type, owner_of_self, no params.
  const chest = lockBlueprint({ objectTypeName: 'Chest', authority: { kind: 'owner' } });
  assert.deepEqual(chest.containerTypes.map((t) => t.typeName), ['Chest']);
  const openChest = chest.functions.find((f) => f.name === 'open_chest');
  assert.deepEqual(JSON.parse(openChest.invokePolicyJson), { type: 'owner_of_self' });
  assert.equal(openChest.parameters.length, 0);

  // Grid-gated gate: grid_permission leaf with the grid pinned.
  const gate = lockBlueprint({
    objectTypeName: 'AreaGate',
    authority: { kind: 'gridPermission', key: 'access', gridId: '7' },
  });
  const openGate = gate.functions.find((f) => f.name === 'open_area_gate');
  assert.deepEqual(JSON.parse(openGate.invokePolicyJson), {
    type: 'grid_permission',
    key: 'access',
    gridId: '7',
  });

  // Multiple authorities are OR'd.
  const shared = lockBlueprint({
    objectTypeName: 'Vault',
    authority: [
      { kind: 'owner' },
      { kind: 'groupPermission', groupId: '42', permission: 'use_chest' },
    ],
  });
  const openVault = shared.functions.find((f) => f.name === 'open_vault');
  const vaultPolicy = JSON.parse(openVault.invokePolicyJson);
  assert.equal(vaultPolicy.type, 'or');
  assert.deepEqual(
    vaultPolicy.rules.map((r) => r.type),
    ['owner_of_self', 'group_permission'],
  );

  assert.throws(() => lockBlueprint({ authority: [] }), /at least one authority/);
});

test('npcBlueprint generates autonomous functions, automations, and triggers', async () => {
  const { npcBlueprint } = await loadSdk();

  const bp = npcBlueprint({
    behaviors: [
      {
        name: 'npc-wander',
        role: 'wanderer',
        trigger: { intervalMs: 60000 },
        maxTargets: 4,
        mutations: [
          { target: 'self', property: 'x', expression: 'self.x + rand_int(-2, 2)' },
        ],
      },
      {
        name: 'guard-response',
        trigger: { onEvent: 'function_invoked', functionName: 'commit_crime', debounceMs: 2000 },
        selector: { selfWhere: [{ key: 'role', op: '==', value: 'guard' }] },
        mutations: [
          { target: 'self', property: 'behavior_state', expression: '"alert"' },
        ],
      },
    ],
  });

  assert.equal(bp.containerTypes[0].typeName, 'Npc');
  assert.equal(bp.containerTypes[0].instantiableBy, 'admin');
  const propKeys = bp.propertyDefinitions.map((p) => p.key);
  for (const key of ['role', 'x', 'y', 'z', 'behavior_state', 'health']) {
    assert.ok(propKeys.includes(key), `default property ${key} should exist`);
  }

  // Behaviors become autonomous, automation-only functions.
  assert.deepEqual(bp.functions.map((f) => f.name), ['npc_wander', 'guard_response']);
  for (const fn of bp.functions) {
    assert.equal(fn.autonomousInvocable, true);
    assert.deepEqual(JSON.parse(fn.invokePolicyJson), { type: 'is_automation' });
  }

  // Interval behavior → schedule automation with a role selector.
  const wander = bp.automations.find((a) => a.name === 'npc-wander');
  assert.equal(wander.triggerType, 'schedule');
  assert.equal(wander.scheduleKind, 'interval');
  assert.equal(wander.intervalMs, 60000);
  assert.equal(wander.targetMode, 'type');
  assert.equal(wander.targetTypeName, 'Npc');
  assert.equal(wander.maxTargets, 4);
  assert.deepEqual(JSON.parse(wander.selectorJson), {
    selfWhere: [{ key: 'role', op: '==', value: 'wanderer' }],
  });

  // Event behavior → event automation + trigger row.
  const guard = bp.automations.find((a) => a.name === 'guard-response');
  assert.equal(guard.triggerType, 'event');
  assert.equal(bp.automationTriggers.length, 1);
  assert.deepEqual(bp.automationTriggers[0], {
    automationName: 'guard-response',
    onEvent: 'function_invoked',
    functionName: 'commit_crime',
    debounceMs: 2000,
  });

  assert.throws(() => npcBlueprint({ behaviors: [] }), /at least one behavior/);
});

test('mergeBlueprints combines payloads and rejects collisions', async () => {
  const { inventoryBlueprint, lockBlueprint, npcBlueprint, mergeBlueprints } =
    await loadSdk();

  const blueprints = [
    inventoryBlueprint(),
    lockBlueprint({ objectTypeName: 'Door', authority: { kind: 'key' } }),
    npcBlueprint({
      behaviors: [
        {
          name: 'npc-wander',
          trigger: { intervalMs: 60000 },
          mutations: [{ target: 'self', property: 'x', expression: 'self.x + 1' }],
        },
      ],
    }),
  ];

  const merged = mergeBlueprints('1', blueprints);
  assert.equal(merged.seedInput.appId, '1');
  assert.deepEqual(
    merged.seedInput.containerTypes.map((t) => t.typeName),
    ['Inventory', 'ItemStack', 'Door', 'DoorKey', 'Npc'],
  );
  assert.ok(merged.seedInput.functions.length >= 7);
  assert.equal(merged.automations.length, 1);
  assert.equal(merged.automations[0].appId, '1');
  assert.equal(merged.automationTriggers.length, 0);

  // Session scoping flows into the seed input.
  const scoped = mergeBlueprints('1', [inventoryBlueprint()], { sessionId: 's-1' });
  assert.equal(scoped.seedInput.sessionId, 's-1');

  // Colliding type names across blueprints are rejected up front.
  assert.throws(
    () => mergeBlueprints('1', [inventoryBlueprint(), inventoryBlueprint()]),
    /redefines container type 'Inventory'/,
  );

  // Distinct prefixes make two inventory systems coexist.
  const twoInventories = mergeBlueprints('1', [
    inventoryBlueprint(),
    inventoryBlueprint({ typePrefix: 'Bank' }),
  ]);
  assert.equal(twoInventories.seedInput.containerTypes.length, 4);
});

test('kitPolicyJson serializes policy trees', async () => {
  const { kitPolicyJson } = await loadSdk();
  const json = kitPolicyJson({
    type: 'and',
    rules: [
      { type: 'owner_of_self' },
      { type: 'grid_permission', key: 'access', gridId: '7' },
    ],
  });
  assert.deepEqual(JSON.parse(json), {
    type: 'and',
    rules: [
      { type: 'owner_of_self' },
      { type: 'grid_permission', key: 'access', gridId: '7' },
    ],
  });
});
