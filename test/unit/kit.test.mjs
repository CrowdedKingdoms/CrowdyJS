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

  // ownerIdKind 'string' (BWF-style mirrors): string property with "" for
  // sale, to_string comparisons in guards, and a string owner write on buy.
  const bwf = plotBlueprint({
    rentable: true,
    ownerIdKind: 'string',
    currencyProperty: 'xp',
  });
  const owner = bwf.propertyDefinitions.find((p) => p.key === 'owner_user_id');
  assert.equal(owner.valueType, 'string');
  assert.equal(owner.defaultValueJson, '""');
  const bwfBuy = bwf.functions.find((f) => f.name === 'buy_plot');
  assert.match(
    JSON.parse(bwfBuy.invokePolicyJson).expression,
    /ref\(\$wallet_id\)\.owner_user_id == to_string\(\$caller_user_id\)/,
  );
  assert.match(JSON.parse(bwfBuy.invokePolicyJson).expression, /xp >= self\.price/);
  assert.equal(
    bwfBuy.mutations.find((m) => m.property === 'owner_user_id').expression,
    'to_string($caller_user_id)',
  );
  const bwfEvict = bwf.functions.find((f) => f.name === 'evict_plot');
  assert.equal(
    JSON.parse(bwfEvict.invokePolicyJson).expression,
    'self.owner_user_id == to_string($caller_user_id)',
  );
  // Default stays the kit-standard int.
  const intOwner = simple.propertyDefinitions.find((p) => p.key === 'owner_user_id');
  assert.equal(intOwner.valueType, 'int');
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

test('progressionBlueprint generates the fn: level curve, skills, achievements, rating', async () => {
  const { progressionBlueprint, progressionNames } = await loadSdk();

  const bp = progressionBlueprint({ skillPointsPerLevel: 2, initialRating: 1200 });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['Progress', 'SkillDef', 'SkillRank', 'AchievementDef', 'AchievementUnlock'],
  );

  // The XP curve is ONE internal function read via fn: calls.
  const curve = bp.functions.find((f) => f.name === 'xp_for_level');
  assert.equal(curve.invokeScope, 'internal');
  assert.equal(curve.returnExpression, '100 * $level * $level');

  // grant_xp: trusted (server scope default); ordered mutations — xp first,
  // then skill points, then the level bump, all reading the fn: helper.
  const grant = bp.functions.find((f) => f.name === 'grant_xp');
  assert.equal(grant.invokeScope, 'server');
  assert.deepEqual(
    grant.mutations.map((m) => m.property),
    ['xp', 'skill_points', 'level'],
  );
  assert.match(
    grant.mutations[2].expression,
    /if\(self\.xp >= fn:xp_for_level\(self\.level \+ 1\), self\.level \+ 1, self\.level\)/,
  );
  assert.match(grant.mutations[1].expression, /\+ if\(.*, 2, 0\)/);

  // Rating defaults + host-gated adjust.
  const rating = bp.propertyDefinitions.find(
    (p) => p.containerTypeName === 'Progress' && p.key === 'rating',
  );
  assert.equal(rating.defaultValueJson, '1200');
  const adjust = bp.functions.find((f) => f.name === 'adjust_rating');
  assert.deepEqual(JSON.parse(adjust.invokePolicyJson), { type: 'is_host' });
  assert.match(adjust.mutations[0].expression, /max\(0, self\.rating \+ \$delta\)/);

  // spend_skill_point: cost, max rank, and prerequisite chain guards.
  const buy = bp.functions.find((f) => f.name === 'spend_skill_point');
  assert.deepEqual(
    buy.parameters.map((p) => p.name),
    ['progress_id', 'def_id', 'prereq_id'],
  );
  const buyGuard = JSON.parse(buy.invokePolicyJson).expression;
  assert.match(buyGuard, /ref\(\$progress_id\)\.skill_points >= ref\(\$def_id\)\.cost/);
  assert.match(buyGuard, /self\.rank < ref\(\$def_id\)\.max_rank/);
  assert.match(
    buyGuard,
    /if\(ref\(\$def_id\)\.requires_skill_id == "", true, ref\(\$prereq_id\)\.skill_id == ref\(\$def_id\)\.requires_skill_id && ref\(\$prereq_id\)\.rank >= 1/,
  );
  // The spend and the rank-up are one transaction.
  assert.deepEqual(buy.mutations.map((m) => m.property), ['skill_points', 'rank']);

  // unlock_achievement: threshold guard, idempotent unlock.
  const unlock = bp.functions.find((f) => f.name === 'unlock_achievement');
  assert.match(
    JSON.parse(unlock.invokePolicyJson).expression,
    /ref\(\$progress_id\)\.xp >= ref\(\$def_id\)\.threshold/,
  );

  // Prefix + custom curve + authority variants.
  const pvp = progressionBlueprint({
    typePrefix: 'Pvp',
    xpAuthority: 'automation',
    xpForLevelExpression: '50 * $level',
  });
  assert.equal(progressionNames('Pvp').grantXpFn, 'pvp_grant_xp');
  const pvpGrant = pvp.functions.find((f) => f.name === 'pvp_grant_xp');
  assert.equal(pvpGrant.autonomousInvocable, true);
  assert.match(pvpGrant.mutations[2].expression, /fn:pvp_xp_for_level/);
  assert.equal(
    pvp.functions.find((f) => f.name === 'pvp_xp_for_level').returnExpression,
    '50 * $level',
  );
});

test('lootBlueprint unrolls weighted tables and wires event-triggered drops', async () => {
  const { lootBlueprint, lootNames, lootRollFn } = await loadSdk();

  const bp = lootBlueprint({
    tables: [
      {
        tableId: 'goblin',
        entries: [
          { itemId: 'coin', weight: 3 },
          { itemId: 'sword', weight: 1, minQty: 1, maxQty: 2 },
        ],
      },
      { tableId: 'chest', entries: [{ itemId: 'gem', weight: 1, minQty: 2 }] },
    ],
    drops: [
      {
        name: 'goblin-drop',
        tableId: 'goblin',
        onEvent: 'function_invoked',
        functionName: 'mob_died',
        debounceMs: 1000,
      },
    ],
  });

  assert.equal(bp.containerTypes[0].typeName, 'LootRoll');
  assert.equal(bp.containerTypes[0].instantiableBy, 'member');

  // The weighted selection is a build-time unrolled chain over ONE stored
  // seed: rand() first, then item, then quantity — exact distribution.
  const roll = bp.functions.find((f) => f.name === 'roll_goblin');
  assert.deepEqual(
    roll.mutations.map((m) => m.property),
    ['seed', 'rolled_item_id', 'rolled_qty'],
  );
  assert.equal(roll.mutations[0].expression, 'rand()');
  assert.equal(
    roll.mutations[1].expression,
    'if(self.seed < 0.75, "coin", "sword")',
  );
  assert.equal(
    roll.mutations[2].expression,
    'if(self.rolled_item_id == "coin", 1, rand_int(1, 2))',
  );
  // Trusted by default (server scope), single-roll guarded, and rollable by
  // the drop automation.
  assert.equal(roll.invokeScope, 'server');
  assert.equal(roll.autonomousInvocable, true);
  const rollPolicy = JSON.parse(roll.invokePolicyJson);
  assert.match(
    rollPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.table_id == "goblin" && self\.rolled_item_id == ""/,
  );

  // Single-entry table: constant expressions, no drop wiring.
  const chest = bp.functions.find((f) => f.name === 'roll_chest');
  assert.equal(chest.mutations[1].expression, '"gem"');
  assert.equal(chest.mutations[2].expression, '2');
  assert.equal(chest.autonomousInvocable, undefined);

  // claim_roll: atomic single-claim + grant, owner + item-match guarded.
  const claim = bp.functions.find((f) => f.name === 'claim_roll');
  const claimGuard = JSON.parse(claim.invokePolicyJson).expression;
  assert.match(claimGuard, /not\(self\.claimed\)/);
  assert.match(claimGuard, /ref\(\$to_stack_id\)\.item_id == self\.rolled_item_id/);
  assert.deepEqual(claim.mutations.map((m) => m.property), ['claimed', 'quantity']);

  // Event drop: rolls a pooled unrolled LootRoll of that table.
  const drop = bp.automations.find((a) => a.name === 'goblin-drop');
  assert.equal(drop.functionName, 'roll_goblin');
  assert.equal(drop.triggerType, 'event');
  assert.deepEqual(JSON.parse(drop.selectorJson), {
    selfWhere: [
      { key: 'table_id', op: '==', value: 'goblin' },
      { key: 'rolled_item_id', op: '==', value: '' },
    ],
    pick: 'random',
  });
  assert.deepEqual(bp.automationTriggers[0], {
    automationName: 'goblin-drop',
    onEvent: 'function_invoked',
    functionName: 'mob_died',
    debounceMs: 1000,
  });

  assert.equal(lootNames('Dungeon').rollType, 'DungeonLootRoll');
  assert.equal(lootRollFn('goblin', 'Dungeon'), 'dungeon_roll_goblin');

  assert.throws(() => lootBlueprint({ tables: [] }), /at least one table/);
  assert.throws(
    () =>
      lootBlueprint({
        tables: [
          {
            tableId: 'big',
            entries: Array.from({ length: 17 }, (_, i) => ({
              itemId: `i${i}`,
              weight: 1,
            })),
          },
        ],
      }),
    /1-16 entries/,
  );
  assert.throws(
    () =>
      lootBlueprint({
        tables: [{ tableId: 't', entries: [{ itemId: 'x', weight: 1 }] }],
        drops: [{ name: 'd', tableId: 'other', onEvent: 'function_invoked' }],
      }),
    /unknown table/,
  );
});

test('questsBlueprint generates progress, atomic claim, and the daily cron reset', async () => {
  const { questsBlueprint, questsNames } = await loadSdk();

  const bp = questsBlueprint({
    advanceOn: [
      {
        name: 'advance-on-craft',
        questId: 'craft_10',
        onEvent: 'function_invoked',
        functionName: 'consume_stack',
        amount: 2,
      },
    ],
  });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['QuestDef', 'QuestProgress'],
  );
  assert.equal(bp.containerTypes[0].instantiableBy, 'admin');
  assert.equal(bp.containerTypes[1].instantiableBy, 'member');

  // advance_quest: trusted, clamped, completion computed server-side; the
  // event automation requires autonomousInvocable.
  const advance = bp.functions.find((f) => f.name === 'advance_quest');
  assert.equal(advance.invokeScope, 'server');
  assert.equal(advance.autonomousInvocable, true);
  assert.equal(
    advance.mutations[0].expression,
    'min(self.target, self.count + max(0, $amount))',
  );
  assert.equal(advance.mutations[1].expression, 'self.count >= self.target');

  // claim_reward: single transaction — claimed flag + item grant + currency
  // grant; guards cover completion, double-claim, def match, and ownership.
  const claim = bp.functions.find((f) => f.name === 'claim_reward');
  assert.deepEqual(
    claim.parameters.map((p) => p.name),
    ['def_id', 'to_stack_id', 'wallet_id'],
  );
  const claimGuard = JSON.parse(claim.invokePolicyJson).expression;
  assert.match(claimGuard, /self\.count >= self\.target/);
  assert.match(claimGuard, /not\(self\.claimed\)/);
  assert.match(claimGuard, /ref\(\$def_id\)\.quest_id == self\.quest_id/);
  assert.deepEqual(
    claim.mutations.map((m) => m.property),
    ['claimed', 'quantity', 'gold'],
  );
  assert.match(
    claim.mutations[1].expression,
    /if\(ref\(\$to_stack_id\)\.item_id == ref\(\$def_id\)\.reward_item_id, ref\(\$def_id\)\.reward_qty, 0\)/,
  );

  // Daily reset: cron automation over daily progress rows.
  const reset = bp.automations.find((a) => a.name === 'daily-quest-reset');
  assert.equal(reset.scheduleKind, 'cron');
  assert.equal(reset.cronExpr, '0 0 * * *');
  assert.equal(reset.targetTypeName, 'QuestProgress');
  assert.deepEqual(JSON.parse(reset.selectorJson), {
    selfWhere: [{ key: 'daily', op: '==', value: true }],
  });
  const resetFn = bp.functions.find((f) => f.name === 'reset_daily');
  assert.deepEqual(JSON.parse(resetFn.invokePolicyJson), { type: 'is_automation' });
  assert.deepEqual(
    resetFn.mutations.map((m) => m.property),
    ['count', 'completed', 'claimed'],
  );

  // Event-driven advance automation.
  const onCraft = bp.automations.find((a) => a.name === 'advance-on-craft');
  assert.equal(onCraft.functionName, 'advance_quest');
  assert.deepEqual(JSON.parse(onCraft.paramsJson), { amount: 2 });
  assert.deepEqual(JSON.parse(onCraft.selectorJson).selfWhere, [
    { key: 'quest_id', op: '==', value: 'craft_10' },
    { key: 'completed', op: '==', value: false },
  ]);
  assert.deepEqual(bp.automationTriggers[0], {
    automationName: 'advance-on-craft',
    onEvent: 'function_invoked',
    functionName: 'consume_stack',
  });

  // Prefix + custom currency/cron variants.
  const seasonal = questsBlueprint({
    typePrefix: 'Seasonal',
    currencyProperty: 'gems',
    dailyResetCron: '0 5 * * *',
  });
  assert.equal(questsNames('Seasonal').claimFn, 'seasonal_claim_reward');
  const seasonalClaim = seasonal.functions.find(
    (f) => f.name === 'seasonal_claim_reward',
  );
  assert.equal(seasonalClaim.mutations[2].property, 'gems');
  assert.equal(
    seasonal.automations.find((a) => a.name === 'seasonal-daily-quest-reset').cronExpr,
    '0 5 * * *',
  );
});

test('combatBlueprint generates attacks, the effect-tick join automation, and mode options', async () => {
  const { combatBlueprint, combatNames } = await loadSdk();

  const bp = combatBlueprint({ hostSynced: true });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['Combatant', 'StatusEffect'],
  );

  // attack: owner-gated with alive guards; damage formula + death flip are
  // both server-side mutations on the target.
  const attack = bp.functions.find((f) => f.name === 'attack');
  const attackPolicy = JSON.parse(attack.invokePolicyJson);
  assert.ok(attackPolicy.rules.some((r) => r.type === 'owner_of_self'));
  assert.match(
    attackPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.alive && ref\(\$target_id\)\.alive/,
  );
  assert.equal(
    attack.mutations[0].expression,
    'max(0, ref($target_id).hp - max(1, self.attack - ref($target_id).defense))',
  );
  assert.equal(attack.mutations[1].expression, 'ref($target_id).hp > 0');

  // Effect tick: automation-only fn whose selector JOINS the effect to its
  // target combatant via combat_key == self.target_key and binds $target.
  const tick = bp.functions.find((f) => f.name === 'effect_tick');
  assert.equal(tick.autonomousInvocable, true);
  assert.deepEqual(JSON.parse(tick.invokePolicyJson), { type: 'is_automation' });
  const auto = bp.automations.find((a) => a.name === 'effect-tick');
  assert.equal(auto.intervalMs, 5000);
  assert.deepEqual(JSON.parse(auto.selectorJson), {
    selfWhere: [{ key: 'ticks_left', op: '>', value: 0 }],
    ofType: 'Combatant',
    where: [{ key: 'combat_key', op: '==', value: 'self.target_key' }],
    bindAs: { ref: 'target' },
  });

  // hostSynced adds the is_host-gated durable sync.
  const sync = bp.functions.find((f) => f.name === 'sync_combatant');
  assert.deepEqual(JSON.parse(sync.invokePolicyJson), { type: 'is_host' });
  assert.equal(sync.mutations[0].expression, 'clamp($hp, 0, self.max_hp)');

  // respawn: owner + dead-only.
  const respawn = bp.functions.find((f) => f.name === 'respawn');
  assert.match(
    JSON.parse(respawn.invokePolicyJson).rules.find((r) => r.type === 'condition')
      .expression,
    /not\(self\.alive\)/,
  );

  // turnBased threads is_current_turn into player actions; hostSynced off
  // omits the sync fn; reviveGroup adds the group-gated revive.
  const arena = combatBlueprint({
    typePrefix: 'Arena',
    turnBased: true,
    combatantInstantiableBy: 'admin',
    reviveGroup: { groupId: '42', permission: 'healer' },
    effectTickIntervalMs: 10000,
  });
  assert.equal(combatNames('Arena').attackFn, 'arena_attack');
  const arenaAttack = arena.functions.find((f) => f.name === 'arena_attack');
  assert.ok(
    JSON.parse(arenaAttack.invokePolicyJson).rules.some(
      (r) => r.type === 'is_current_turn',
    ),
  );
  assert.equal(
    arena.containerTypes.find((t) => t.typeName === 'ArenaCombatant').instantiableBy,
    'admin',
  );
  assert.equal(arena.functions.find((f) => f.name === 'arena_sync_combatant'), undefined);
  const revive = arena.functions.find((f) => f.name === 'arena_revive');
  assert.deepEqual(
    JSON.parse(revive.invokePolicyJson).rules[0],
    { type: 'group_permission', groupId: '42', permission: 'healer' },
  );
  assert.equal(
    arena.automations.find((a) => a.name === 'arena-effect-tick').intervalMs,
    10000,
  );
});

test('matchesBlueprint generates lifecycle functions with channel notifications and turn ticks', async () => {
  const { matchesBlueprint, matchesNames } = await loadSdk();

  const bp = matchesBlueprint({ turnTick: { intervalMs: 15000 } });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['MatchMeta', 'Score'],
  );

  // Lifecycle functions: creator-or-host gated, state-machine guarded, and
  // each declares the notify-to-pull channel ping.
  const start = bp.functions.find((f) => f.name === 'start_match');
  const startPolicy = JSON.parse(start.invokePolicyJson);
  assert.equal(startPolicy.type, 'and');
  const orRule = startPolicy.rules.find((r) => r.type === 'or');
  assert.deepEqual(orRule.rules.map((r) => r.type), ['is_host', 'condition']);
  assert.match(
    orRule.rules[1].expression,
    /self\.creator_user_id == \$caller_user_id/,
  );
  assert.match(
    startPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.state == "lobby"/,
  );
  assert.deepEqual(start.notifications, [
    {
      kind: 'channel',
      args: [
        { name: 'channel_id', expression: 'self.channel_id' },
        { name: 'payload', expression: '"match_changed"' },
      ],
    },
  ]);
  assert.deepEqual(
    start.mutations.map((m) => [m.property, m.expression]),
    [['state', '"active"'], ['round', '1']],
  );

  const end = bp.functions.find((f) => f.name === 'end_match');
  assert.equal(end.parameters[0].name, 'winner_user_id');
  assert.equal(end.notifications.length, 1);

  // score_points: host-gated by default.
  const score = bp.functions.find((f) => f.name === 'score_points');
  assert.deepEqual(JSON.parse(score.invokePolicyJson), { type: 'is_host' });

  // Turn tick: the wall-clock-free timer — interval automation bumping
  // tick_count on active matches only.
  const tick = bp.automations.find((a) => a.name === 'match-turn-tick');
  assert.equal(tick.intervalMs, 15000);
  assert.deepEqual(JSON.parse(tick.selectorJson), {
    selfWhere: [{ key: 'state', op: '==', value: 'active' }],
  });
  const tickFn = bp.functions.find((f) => f.name === 'turn_tick');
  assert.equal(tickFn.autonomousInvocable, true);
  assert.equal(tickFn.mutations[0].expression, 'self.tick_count + 1');

  // No turnTick → no tick surface; server-refereed scoring variant.
  const ranked = matchesBlueprint({ typePrefix: 'Ranked', scoreAuthority: 'server' });
  assert.equal(matchesNames('Ranked').startFn, 'ranked_start_match');
  assert.equal(ranked.automations, undefined);
  assert.equal(ranked.functions.find((f) => f.name === 'ranked_turn_tick'), undefined);
  assert.equal(
    ranked.functions.find((f) => f.name === 'ranked_score_points').invokeScope,
    'server',
  );
});

test('decksBlueprint generates owner-visibility hidden hands and position dealing', async () => {
  const { decksBlueprint, decksNames } = await loadSdk();

  const bp = decksBlueprint();
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['CardDef', 'CardInstance'],
  );

  // The two-property hidden-info trick: card_id is owner-visible only,
  // revealed_card_id is public and empty until played.
  const cardId = bp.propertyDefinitions.find(
    (p) => p.containerTypeName === 'CardInstance' && p.key === 'card_id',
  );
  assert.equal(cardId.visibility, 'owner');
  const revealed = bp.propertyDefinitions.find(
    (p) => p.containerTypeName === 'CardInstance' && p.key === 'revealed_card_id',
  );
  assert.equal(revealed.visibility, undefined);
  assert.equal(revealed.defaultValueJson, '""');

  // draw: owner + deck-zone guard; play: reveal + zone flip in one txn.
  const draw = bp.functions.find((f) => f.name === 'draw_card');
  const drawPolicy = JSON.parse(draw.invokePolicyJson);
  assert.ok(drawPolicy.rules.some((r) => r.type === 'owner_of_self'));
  assert.match(
    drawPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.zone == "deck"/,
  );
  const play = bp.functions.find((f) => f.name === 'play_card');
  assert.deepEqual(
    play.mutations.map((m) => [m.property, m.expression]),
    [
      ['zone', '"board"'],
      ['revealed_card_id', 'self.card_id'],
    ],
  );

  // Shuffle: manual type-fan-out automation dealing rand_int positions to
  // deck-zone cards (the supported server-side shuffle pattern).
  const assign = bp.functions.find((f) => f.name === 'assign_position');
  assert.equal(assign.autonomousInvocable, true);
  assert.equal(assign.mutations[0].expression, 'rand_int(0, 1000000)');
  const shuffle = bp.automations.find((a) => a.name === 'deck-shuffle');
  assert.equal(shuffle.triggerType, 'manual');
  assert.equal(shuffle.maxTargets, 200);
  assert.deepEqual(JSON.parse(shuffle.selectorJson), {
    selfWhere: [{ key: 'zone', op: '==', value: 'deck' }],
  });

  // turnBased threads is_current_turn into the player actions.
  const tarot = decksBlueprint({ typePrefix: 'Tarot', turnBased: true, shuffleMaxTargets: 78 });
  assert.equal(decksNames('Tarot').drawFn, 'tarot_draw_card');
  assert.ok(
    JSON.parse(
      tarot.functions.find((f) => f.name === 'tarot_draw_card').invokePolicyJson,
    ).rules.some((r) => r.type === 'is_current_turn'),
  );
  assert.equal(
    tarot.automations.find((a) => a.name === 'tarot-deck-shuffle').maxTargets,
    78,
  );
});

test('worldsimBlueprint generates clock/regen/growth/wave automations with spatial notify', async () => {
  const { worldsimBlueprint, worldsimNames } = await loadSdk();

  const bp = worldsimBlueprint({ waves: { intervalMs: 30000, growth: 2 } });
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['WorldState', 'ResourceNode', 'Crop', 'WaveSpawner'],
  );

  // World clock: automation-only, wraps hour/bumps day, re-rolls weather,
  // and pushes a spatial time-changed ping (no polling for the sky).
  const clock = bp.functions.find((f) => f.name === 'advance_time');
  assert.equal(clock.autonomousInvocable, true);
  assert.deepEqual(JSON.parse(clock.invokePolicyJson), { type: 'is_automation' });
  assert.equal(
    clock.mutations.find((m) => m.property === 'time_of_day').expression,
    '(self.time_of_day + 1) % 24',
  );
  assert.equal(
    clock.mutations.find((m) => m.property === 'day').expression,
    'if(self.time_of_day >= 23, self.day + 1, self.day)',
  );
  assert.ok(clock.mutations.some((m) => m.property === 'weather'));
  assert.equal(clock.notifications.length, 1);
  assert.equal(clock.notifications[0].kind, 'spatial');
  const notifyArgs = Object.fromEntries(
    clock.notifications[0].args.map((a) => [a.name, a.expression]),
  );
  assert.equal(notifyArgs.chunk_x, 'self.cx');
  assert.equal(notifyArgs.state, 'to_string(self.time_of_day)');
  assert.equal(notifyArgs.distance, '8');

  // set_weather: not(allow) denies everyone — app admins bypass.
  const setWeather = bp.functions.find((f) => f.name === 'set_weather');
  assert.deepEqual(JSON.parse(setWeather.invokePolicyJson), {
    type: 'not',
    rule: { type: 'allow' },
  });

  // Node regen: clamped tick over depleted nodes only.
  const regen = bp.functions.find((f) => f.name === 'regen_node');
  assert.equal(
    regen.mutations[0].expression,
    'min(self.max_amount, self.amount + self.regen_rate)',
  );
  const regenAuto = bp.automations.find((a) => a.name === 'node-regen');
  assert.deepEqual(JSON.parse(regenAuto.selectorJson), {
    selfWhere: [{ key: 'amount', op: '<', value: 'self.max_amount' }],
  });

  // gather_node: atomic node decrement + stack grant with item/owner guards.
  const gather = bp.functions.find((f) => f.name === 'gather_node');
  const gatherGuard = JSON.parse(gather.invokePolicyJson).expression;
  assert.match(gatherGuard, /self\.amount >= \$amount/);
  assert.match(gatherGuard, /ref\(\$to_stack_id\)\.item_id == self\.resource_item_id/);

  // Crops: growth automation + atomic harvest that resets the stage.
  const harvest = bp.functions.find((f) => f.name === 'harvest');
  const harvestPolicy = JSON.parse(harvest.invokePolicyJson);
  assert.ok(harvestPolicy.rules.some((r) => r.type === 'owner_of_self'));
  assert.match(
    harvestPolicy.rules.find((r) => r.type === 'condition').expression,
    /self\.stage >= self\.max_stage/,
  );
  assert.deepEqual(harvest.mutations.map((m) => m.property), ['stage', 'quantity']);

  // Waves: counters only — spawning stays host-side.
  const wave = bp.functions.find((f) => f.name === 'spawn_wave');
  assert.equal(wave.mutations[1].expression, 'self.next_wave_size + 2');
  assert.equal(bp.automations.find((a) => a.name === 'wave-spawner').intervalMs, 30000);

  // Feature toggles + prefix + custom day length.
  const farm = worldsimBlueprint({
    typePrefix: 'Farm',
    time: { intervalMs: 30000, hoursPerDay: 12, weather: false },
    nodes: false,
  });
  assert.equal(worldsimNames('Farm').cropType, 'FarmCrop');
  assert.equal(
    farm.containerTypes.find((t) => t.typeName === 'FarmResourceNode'),
    undefined,
  );
  const farmClock = farm.functions.find((f) => f.name === 'farm_advance_time');
  assert.equal(
    farmClock.mutations.find((m) => m.property === 'time_of_day').expression,
    '(self.time_of_day + 1) % 12',
  );
  assert.equal(farmClock.mutations.find((m) => m.property === 'weather'), undefined);
  assert.equal(farm.functions.find((f) => f.name === 'farm_set_weather'), undefined);

  assert.throws(
    () => worldsimBlueprint({ time: false, nodes: false, crops: false }),
    /every feature disabled/,
  );
});

test('guildBlueprint composes a group-gated hall with a guild-bank inventory', async () => {
  const { guildBlueprint, guildNames, mergeBlueprints } = await loadSdk();

  const bp = guildBlueprint({ guildGroupId: '77', hallPermission: 'use_hall' });
  // Composition: the hall lock and the bank inventory in ONE blueprint.
  assert.deepEqual(
    bp.containerTypes.map((t) => t.typeName),
    ['GuildHall', 'GuildBankInventory', 'GuildBankItemStack'],
  );
  const open = bp.functions.find((f) => f.name === 'open_guild_hall');
  assert.deepEqual(JSON.parse(open.invokePolicyJson), {
    type: 'group_permission',
    groupId: '77',
    permission: 'use_hall',
  });
  assert.ok(bp.functions.some((f) => f.name === 'guild_bank_grant_stack'));

  const names = guildNames();
  assert.equal(names.hallType, 'GuildHall');
  assert.equal(names.bankInventoryType, 'GuildBankInventory');
  assert.equal(names.openHallFn, 'open_guild_hall');

  // The composite still merges cleanly next to a default inventory.
  const { inventoryBlueprint } = await loadSdk();
  const merged = mergeBlueprints('1', [inventoryBlueprint(), bp]);
  assert.ok(merged.seedInput.containerTypes.length >= 5);

  // No bank variant + missing group id validation.
  const noBank = guildBlueprint({ guildGroupId: '77', bank: false });
  assert.deepEqual(noBank.containerTypes.map((t) => t.typeName), ['GuildHall']);
  assert.throws(() => guildBlueprint({ guildGroupId: '' }), /requires guildGroupId/);
});

test('leaderboardsBlueprint generates trusted submits and season rolls', async () => {
  const { leaderboardsBlueprint, leaderboardsNames } = await loadSdk();

  const bp = leaderboardsBlueprint({ seasonCron: '0 0 1 * *' });
  assert.equal(bp.containerTypes[0].typeName, 'LeaderboardEntry');

  // submit_score: host-gated by default, keeps the best score.
  const submit = bp.functions.find((f) => f.name === 'submit_score');
  assert.deepEqual(JSON.parse(submit.invokePolicyJson), { type: 'is_host' });
  assert.equal(submit.mutations[0].expression, 'max(self.score, $points)');

  // Season roll: cron automation over every entry.
  const roll = bp.functions.find((f) => f.name === 'roll_season');
  assert.equal(roll.autonomousInvocable, true);
  assert.deepEqual(
    roll.mutations.map((m) => [m.property, m.expression]),
    [
      ['season', 'self.season + 1'],
      ['score', '0'],
      ['rank', '0'],
    ],
  );
  const auto = bp.automations.find((a) => a.name === 'season-roll');
  assert.equal(auto.scheduleKind, 'cron');
  assert.equal(auto.cronExpr, '0 0 1 * *');
  assert.equal(auto.targetTypeName, 'LeaderboardEntry');

  // Authority + overwrite + no-season variants.
  const arena = leaderboardsBlueprint({
    typePrefix: 'Arena',
    submitAuthority: 'automation',
    keepBest: false,
  });
  assert.equal(leaderboardsNames('Arena').submitFn, 'arena_submit_score');
  const arenaSubmit = arena.functions.find((f) => f.name === 'arena_submit_score');
  assert.equal(arenaSubmit.autonomousInvocable, true);
  assert.deepEqual(JSON.parse(arenaSubmit.invokePolicyJson), { type: 'is_automation' });
  assert.equal(arenaSubmit.mutations[0].expression, '$points');
  assert.equal(arena.automations, undefined);
});

test('featureGate + policyExtra monetization-gate existing builders', async () => {
  const { featureGate, andPolicies, plotBlueprint, lockBlueprint } = await loadSdk();

  assert.deepEqual(featureGate('vip'), { type: 'tier_feature', feature: 'vip' });
  // andPolicies skips empties and composes rules.
  assert.deepEqual(andPolicies({ type: 'allow' }, undefined), { type: 'allow' });
  assert.deepEqual(andPolicies({ type: 'allow' }, featureGate('vip')), {
    type: 'and',
    rules: [{ type: 'allow' }, { type: 'tier_feature', feature: 'vip' }],
  });

  // Plot buys gated on a paid tier feature; rent left open.
  const plots = plotBlueprint({
    rentable: true,
    buyPolicyExtra: featureGate('land_owner'),
  });
  const buyPolicy = JSON.parse(
    plots.functions.find((f) => f.name === 'buy_plot').invokePolicyJson,
  );
  assert.equal(buyPolicy.type, 'and');
  assert.deepEqual(buyPolicy.rules[1], {
    type: 'tier_feature',
    feature: 'land_owner',
  });
  const rentPolicy = JSON.parse(
    plots.functions.find((f) => f.name === 'rent_plot').invokePolicyJson,
  );
  assert.equal(rentPolicy.type, 'condition');

  // VIP door: authorities OR'd, then the gate AND'ed on top.
  const door = lockBlueprint({
    objectTypeName: 'VipDoor',
    authority: [{ kind: 'owner' }, { kind: 'key' }],
    policyExtra: featureGate('vip'),
  });
  const openPolicy = JSON.parse(
    door.functions.find((f) => f.name === 'open_vip_door').invokePolicyJson,
  );
  assert.equal(openPolicy.type, 'and');
  assert.equal(openPolicy.rules[0].type, 'or');
  assert.deepEqual(openPolicy.rules[1], { type: 'tier_feature', feature: 'vip' });
});

test('kitInvoke maps FORBIDDEN GraphQL errors from older servers to success:false', async () => {
  const { kitInvoke, CrowdyGraphQLError } = await loadSdk();

  // Older cks-game-api builds throw FORBIDDEN for invoke policy denials
  // instead of resolving with success:false — the kit maps that onto the
  // documented result contract.
  const denialMessage = "You are not authorized to invoke 'open_door'";
  const forbidden = new CrowdyGraphQLError([
    { message: denialMessage, extensions: { code: 'FORBIDDEN' } },
  ]);
  const result = await kitInvoke(
    { invoke: async () => { throw forbidden; } },
    { appId: '1', functionName: 'open_door', selfContainerId: 'door-1' },
  );
  assert.equal(result.success, false);
  assert.equal(result.errorMessage, denialMessage);
  assert.equal(result.returnValue, undefined);
  // The raw result is synthesized (no server payload exists for this case).
  assert.equal(result.raw.success, false);
  assert.equal(result.raw.functionName, 'open_door');
  assert.equal(result.raw.errorMessage, denialMessage);
  assert.deepEqual(result.raw.mutationsApplied, []);

  // Any other GraphQL error code still throws unchanged.
  const unauthenticated = new CrowdyGraphQLError([
    { message: 'token expired', extensions: { code: 'UNAUTHENTICATED' } },
  ]);
  await assert.rejects(
    kitInvoke(
      { invoke: async () => { throw unauthenticated; } },
      { appId: '1', functionName: 'open_door', selfContainerId: 'door-1' },
    ),
    (err) => err === unauthenticated,
  );

  // Non-GraphQL errors (network etc.) also propagate unchanged.
  await assert.rejects(
    kitInvoke(
      { invoke: async () => { throw new Error('connection refused'); } },
      { appId: '1', functionName: 'open_door', selfContainerId: 'door-1' },
    ),
    /connection refused/,
  );

  // The normal resolved path is unaffected.
  const ok = await kitInvoke(
    {
      invoke: async () => ({
        eventId: 'e-1',
        functionName: 'open_door',
        success: true,
        returnValueJson: '{"opened":true}',
        errorMessage: null,
        mutationsApplied: [],
      }),
    },
    { appId: '1', functionName: 'open_door', selfContainerId: 'door-1' },
  );
  assert.equal(ok.success, true);
  assert.deepEqual(ok.returnValue, { opened: true });
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
