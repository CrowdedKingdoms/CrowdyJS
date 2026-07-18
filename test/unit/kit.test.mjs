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

test('lockBlueprint chunkPermission authority gates by the object location', async () => {
  const { lockBlueprint } = await loadSdk();

  const gate = lockBlueprint({
    objectTypeName: 'PlotDoor',
    authority: { kind: 'chunkPermission', key: 'access', mode: 'smallest' },
  });
  // The object carries its own chunk coordinates.
  const keys = gate.propertyDefinitions.map((p) => p.key);
  for (const k of ['cx', 'cy', 'cz']) assert.ok(keys.includes(k), `${k} property`);
  const open = gate.functions.find((f) => f.name === 'open_plot_door');
  const policy = JSON.parse(open.invokePolicyJson);
  assert.equal(policy.type, 'condition');
  assert.match(
    policy.expression,
    /has_chunk_permission\(\$caller_user_id, "access", self\.cx, self\.cy, self\.cz, "smallest"\)/,
  );

  // Default mode is 'first' (enforcement parity).
  const dflt = lockBlueprint({
    objectTypeName: 'Door',
    authority: { kind: 'chunkPermission', key: 'access' },
  });
  const openDflt = dflt.functions.find((f) => f.name === 'open_door');
  assert.match(JSON.parse(openDflt.invokePolicyJson).expression, /"first"\)$/);
});

test('plotBlueprint generates the buy/rent/evict permission-effect loop', async () => {
  const { plotBlueprint, plotNames } = await loadSdk();

  const bp = plotBlueprint({ rentable: true });
  assert.equal(bp.containerTypes[0].typeName, 'Plot');
  assert.equal(bp.containerTypes[0].instantiableBy, 'admin');
  const propKeys = bp.propertyDefinitions.map((p) => p.key);
  for (const k of ['grid_id', 'price', 'owner_user_id', 'rent_price', 'rent_ttl_seconds']) {
    assert.ok(propKeys.includes(k), `property ${k}`);
  }

  const buy = bp.functions.find((f) => f.name === 'buy_plot');
  assert.ok(buy, 'buy_plot exists');
  // Wallet guard: ownership + price, checked server-side.
  const buyPolicy = JSON.parse(buy.invokePolicyJson);
  assert.equal(buyPolicy.type, 'condition');
  assert.match(buyPolicy.expression, /owner_user_id == \$caller_user_id/);
  assert.match(buyPolicy.expression, /gold >= self\.price/);
  // Spend + ownership mutation + transactional grant.
  assert.match(buy.mutations[0].expression, /gold - self\.price/);
  assert.deepEqual(buy.permissionEffects, [
    {
      action: 'grant',
      permissionKeys: ['access', 'update_voxel_data'],
      userExpression: '$caller_user_id',
      gridIdExpression: 'self.grid_id',
    },
  ]);

  const rent = bp.functions.find((f) => f.name === 'rent_plot');
  assert.equal(rent.permissionEffects[0].ttlSecondsExpression, 'self.rent_ttl_seconds');

  const evict = bp.functions.find((f) => f.name === 'evict_plot');
  assert.equal(evict.permissionEffects[0].action, 'revoke');
  assert.equal(evict.permissionEffects[0].userExpression, '$target_user_id');

  // Non-rentable variant omits the rent surface.
  const simple = plotBlueprint();
  assert.equal(simple.functions.find((f) => f.name === 'rent_plot'), undefined);
  assert.equal(plotNames('LandPlot').buyFn, 'buy_land_plot');
});

test('npcBlueprint selector carries permission predicates through to selectorJson', async () => {
  const { npcBlueprint } = await loadSdk();
  const bp = npcBlueprint({
    behaviors: [
      {
        name: 'guard-response',
        trigger: { intervalMs: 30000 },
        selector: {
          selfWhere: [{ key: 'role', op: '==', value: 'guard' }],
          pick: 'nearest',
          ofType: 'PlayerAvatar',
          candidatePermissionWhere: [
            {
              userFrom: { property: 'owner_user_id' },
              op: 'lacks',
              key: 'access',
              grid: { property: 'grid_id' },
            },
          ],
          bindAs: { ref: 'target_id' },
        },
        mutations: [
          { target: 'self', property: 'behavior_state', expression: '"alert"' },
        ],
      },
    ],
  });
  const selector = JSON.parse(bp.automations[0].selectorJson);
  assert.equal(selector.candidatePermissionWhere[0].op, 'lacks');
  assert.deepEqual(selector.candidatePermissionWhere[0].grid, { property: 'grid_id' });
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

test('economyBlueprint generates wallets, shop, escrow trades, and market', async () => {
  const { economyBlueprint, economyNames, economyCurrencyFn } = await loadSdk();

  const bp = economyBlueprint({
    currencies: ['gold', 'gems'],
    restock: { intervalMs: 60000, amount: 5 },
  });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['Wallet', 'ShopListing', 'TradeOffer', 'MarketListing'],
  );
  // Player-instantiable wallet/trade/market; admin-priced shop catalog.
  assert.equal(bp.containerTypes.find((t) => t.typeName === 'Wallet').instantiableBy, 'member');
  assert.equal(bp.containerTypes.find((t) => t.typeName === 'ShopListing').instantiableBy, 'admin');

  // One balance property per currency, plus the owner mirror.
  const walletProps = bp.propertyDefinitions
    .filter((p) => p.containerTypeName === 'Wallet')
    .map((p) => p.key);
  assert.deepEqual(walletProps, ['owner_user_id', 'gold', 'gems']);

  // earn is a trusted grant: server scope by default; spend is owner+guarded.
  const earn = bp.functions.find((f) => f.name === 'earn_gold');
  assert.equal(earn.invokeScope, 'server');
  assert.match(earn.mutations[0].expression, /self\.gold \+ max\(0, \$amount\)/);
  const spend = bp.functions.find((f) => f.name === 'spend_gems');
  const spendPolicy = JSON.parse(spend.invokePolicyJson);
  assert.equal(spendPolicy.type, 'and');
  assert.ok(spendPolicy.rules.some((r) => r.type === 'owner_of_self'));
  assert.match(
    spendPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.gems >= \$amount/,
  );
  assert.equal(economyCurrencyFn('earn', 'gems'), 'earn_gems');

  // buy_listing: single transaction — debit, stock decrement, item grant.
  const buy = bp.functions.find((f) => f.name === 'buy_listing');
  assert.deepEqual(
    buy.parameters.map((p) => p.name),
    ['wallet_id', 'to_stack_id'],
  );
  const buyGuard = JSON.parse(buy.invokePolicyJson).expression;
  assert.match(buyGuard, /self\.stock > 0/);
  assert.match(buyGuard, /ref\(\$wallet_id\)\.owner_user_id == \$caller_user_id/);
  assert.match(buyGuard, /ref\(\$wallet_id\)\.gold >= self\.price/);
  assert.match(buyGuard, /ref\(\$to_stack_id\)\.item_id == self\.item_id/);
  assert.equal(buy.mutations.length, 3);
  assert.equal(buy.mutations[1].property, 'stock');

  // accept_trade: atomic four-stack swap pinned to the recorded escrow refs
  // and the server-truth offer creator ($self_owner_id).
  const accept = bp.functions.find((f) => f.name === 'accept_trade');
  const acceptGuard = JSON.parse(accept.invokePolicyJson).expression;
  assert.match(acceptGuard, /self\.status == "open"/);
  assert.match(acceptGuard, /self\.to_user_id == \$caller_user_id/);
  assert.match(acceptGuard, /\$give_stack_id == self\.give_stack_id/);
  assert.match(acceptGuard, /\$to_want_stack_id == self\.receive_stack_id/);
  assert.match(acceptGuard, /ref\(\$give_stack_id\)\.owner_user_id == \$self_owner_id/);
  assert.match(acceptGuard, /ref\(\$want_stack_id\)\.quantity >= self\.want_qty/);
  assert.equal(accept.mutations.length, 5);
  assert.equal(accept.mutations[4].property, 'status');

  // buy_market_listing: buyer wallet → seller wallet + stack transfer.
  const market = bp.functions.find((f) => f.name === 'buy_market_listing');
  assert.equal(market.mutations.length, 5);
  const marketGuard = JSON.parse(market.invokePolicyJson).expression;
  assert.match(marketGuard, /ref\(\$seller_wallet_id\)\.owner_user_id == \$self_owner_id/);
  assert.match(marketGuard, /\$from_stack_id == self\.stack_id/);
  assert.match(market.mutations[1].expression, /ref\(\$seller_wallet_id\)\.gold \+ self\.price/);

  // Restock automation: interval fan-out over understocked listings.
  const restock = bp.automations.find((a) => a.name === 'shop-restock');
  assert.equal(restock.functionName, 'restock_listing');
  assert.equal(restock.intervalMs, 60000);
  assert.deepEqual(JSON.parse(restock.selectorJson), {
    selfWhere: [{ key: 'stock', op: '<', value: 'self.max_stock' }],
  });
  assert.deepEqual(JSON.parse(restock.paramsJson), { amount: 5 });
  const restockFn = bp.functions.find((f) => f.name === 'restock_listing');
  assert.equal(restockFn.autonomousInvocable, true);
  assert.deepEqual(JSON.parse(restockFn.invokePolicyJson), { type: 'is_automation' });

  // Prefix + authority + ownerIdKind variants.
  const black = economyBlueprint({
    typePrefix: 'Black',
    earnAuthority: 'automation',
    ownerIdKind: 'string',
  });
  assert.equal(economyNames('Black').walletType, 'BlackWallet');
  const blackEarn = black.functions.find((f) => f.name === 'black_earn_gold');
  assert.equal(blackEarn.autonomousInvocable, true);
  assert.deepEqual(JSON.parse(blackEarn.invokePolicyJson), { type: 'is_automation' });
  const blackBuy = black.functions.find((f) => f.name === 'black_buy_listing');
  assert.match(
    JSON.parse(blackBuy.invokePolicyJson).expression,
    /ref\(\$wallet_id\)\.owner_user_id == to_string\(\$caller_user_id\)/,
  );

  assert.throws(() => economyBlueprint({ currencies: [] }), /at least one currency/);
  assert.throws(
    () => economyBlueprint({ shopCurrency: 'gems' }),
    /must be one of the declared currencies/,
  );
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
