import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  trustedAuthorityFields,
  type KitAutomationSpec,
  type KitAutomationTriggerSpec,
  type KitBlueprint,
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** One weighted entry of a loot table. */
export interface LootEntrySpec {
  itemId: string;
  /** Relative weight (> 0); probabilities are weights normalized per table. */
  weight: number;
  /** Minimum quantity granted. Defaults to 1. */
  minQty?: number;
  /** Maximum quantity granted. Defaults to `minQty`. */
  maxQty?: number;
}

/** One loot table, unrolled into a single expression at blueprint-build time. */
export interface LootTableSpec {
  /** Stable table identifier; also derives the roll function name. */
  tableId: string;
  /** 1–16 weighted entries (the expression parser caps chain length). */
  entries: LootEntrySpec[];
}

/** An event-triggered drop: rolls a pooled LootRoll when a model event fires. */
export interface LootDropSpec {
  /** Automation name (unique per app), e.g. `'goblin-drop'`. */
  name: string;
  /** The table to roll. */
  tableId: string;
  /** The model event that triggers the drop (e.g. a `mob_died` function). */
  onEvent: 'function_invoked' | 'property_changed' | 'container_created';
  functionName?: string;
  containerTypeName?: string;
  propertyKey?: string;
  /**
   * `property_changed` only: which writes roll the drop. Properties mutated
   * by kit functions (a mob's `hp` reaching 0, say) need `'function'` or
   * `'any'`; the default `'direct'` only sees client `setProperty` calls.
   */
  writeSource?: 'direct' | 'function' | 'any';
  debounceMs?: number;
  /** Rolls per event. Defaults to 1. */
  maxTargets?: number;
}

/** Options for {@link lootBlueprint}. */
export interface LootBlueprintOptions {
  /** Prefix for the type/function names. Defaults to none. */
  typePrefix?: string;
  /** The loot tables; entries are unrolled into expressions at build time. */
  tables: LootTableSpec[];
  /**
   * Who may roll. Defaults to `'server'` (app admins / studio backend);
   * automations configured via `drops` may always roll (trusted automations
   * bypass invoke policies, and the roll functions are marked
   * `autonomousInvocable` when drops reference their table).
   */
  rollAuthority?: KitTrustedAuthority;
  /**
   * Event-triggered drops: each rolls an UNROLLED pooled `LootRoll` container
   * of its table when the event fires (automations mutate — they cannot
   * create containers — so keep a small pool of pre-created rolls per table).
   */
  drops?: LootDropSpec[];
  /** Owner-mirror typing (see the kit convention). Defaults to `'int'`. */
  ownerIdKind?: KitOwnerIdKind;
}

/** Names derived by {@link lootBlueprint} for a given prefix. */
export interface LootNames {
  rollType: string;
  claimFn: string;
  /** Snake-cased function-name prefix (empty without a `typePrefix`). */
  fnPrefix: string;
}

/** Compute the type/function names a loot blueprint (and its runtime helper) uses. */
export function lootNames(typePrefix = ''): LootNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    rollType: `${typePrefix}LootRoll`,
    claimFn: `${fnPrefix}claim_roll`,
    fnPrefix,
  };
}

/** The roll function name for one table. */
export function lootRollFn(tableId: string, typePrefix = ''): string {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return `${fnPrefix}roll_${toSnakeCase(tableId)}`;
}

/** Format a probability threshold as an expression float literal. */
function floatLiteral(n: number): string {
  const s = String(n);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

/**
 * Unroll a weighted table into a nested-if chain over the stored roll seed:
 * `if(self.seed < t1, "a", if(self.seed < t2, "b", "c"))` with cumulative
 * normalized thresholds. Expressions are loop-free, so the selection chain
 * is generated at BUILD time — one `rand()` is stored first and every branch
 * reads that same seed, keeping the distribution exact.
 */
function unrollItemChain(entries: LootEntrySpec[]): string {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let expr = JSON.stringify(entries[entries.length - 1].itemId);
  for (let i = entries.length - 2; i >= 0; i--) {
    // Threshold below which entries[0..i] win; nested back-to-front.
    const cumulative = entries.slice(0, i + 1).reduce((sum, e) => sum + e.weight, 0);
    expr = `if(self.seed < ${floatLiteral(cumulative / total)}, ${JSON.stringify(entries[i].itemId)}, ${expr})`;
  }
  return expr;
}

/** Unroll the per-item quantity chain, keyed on the already-rolled item id. */
function unrollQtyChain(entries: LootEntrySpec[]): string {
  const qtyExpr = (e: LootEntrySpec) => {
    const min = e.minQty ?? 1;
    const max = e.maxQty ?? min;
    return max > min ? `rand_int(${min}, ${max})` : String(min);
  };
  let expr = qtyExpr(entries[entries.length - 1]);
  for (let i = entries.length - 2; i >= 0; i--) {
    expr = `if(self.rolled_item_id == ${JSON.stringify(entries[i].itemId)}, ${qtyExpr(entries[i])}, ${expr})`;
  }
  return expr;
}

/**
 * Blueprint for **loot tables & drops**: weighted tables are unrolled into
 * pure expressions at blueprint-build time (the expression language is
 * loop-free), rolled server-side into durable `LootRoll` containers, and
 * claimed atomically into an item stack. Covers chest rolls, mob drops, and
 * gacha pulls.
 *
 * Flow: create a `LootRoll` (member) for a table → `roll_<table>` (trusted:
 * server scope by default, or an event automation via `drops`) stores a
 * single `rand()` seed and resolves item + quantity from it in one
 * transaction → the owner claims with `claim_roll`, which marks the roll
 * claimed AND grants the stack in the same invoke (no double-claim, no
 * client-chosen rewards).
 *
 * Runtime counterpart: `client.kit(appId).loot`.
 */
export function lootBlueprint(options: LootBlueprintOptions): KitBlueprint {
  const {
    typePrefix = '',
    tables,
    rollAuthority = 'server',
    drops = [],
    ownerIdKind: kind = 'int',
  } = options;
  if (!tables.length) {
    throw new Error('lootBlueprint requires at least one table');
  }
  for (const table of tables) {
    if (table.entries.length < 1 || table.entries.length > 16) {
      throw new Error(
        `lootBlueprint table '${table.tableId}' must have 1-16 entries (parser-limit-aware unrolling)`,
      );
    }
    if (table.entries.some((e) => !(e.weight > 0))) {
      throw new Error(
        `lootBlueprint table '${table.tableId}' entries must have weight > 0`,
      );
    }
  }
  const tableIds = new Set(tables.map((t) => t.tableId));
  for (const drop of drops) {
    if (!tableIds.has(drop.tableId)) {
      throw new Error(
        `lootBlueprint drop '${drop.name}' references unknown table '${drop.tableId}'`,
      );
    }
  }
  const names = lootNames(typePrefix);
  const droppedTables = new Set(drops.map((d) => d.tableId));

  const propertyDefinitions: SeedPropertyDefInput[] = [
    ownerMirrorProperty(names.rollType, kind),
    {
      containerTypeName: names.rollType,
      key: 'table_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The loot table this roll draws from.',
    },
    {
      containerTypeName: names.rollType,
      key: 'seed',
      valueType: 'float',
      defaultValueJson: '0',
      description: 'The stored rand() seed the weighted selection reads (audit-friendly).',
    },
    {
      containerTypeName: names.rollType,
      key: 'rolled_item_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'The rolled item (empty until rolled; a roll cannot re-roll).',
    },
    {
      containerTypeName: names.rollType,
      key: 'rolled_qty',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'The rolled quantity.',
    },
    {
      containerTypeName: names.rollType,
      key: 'claimed',
      valueType: 'bool',
      defaultValueJson: 'false',
      description: 'True once claimed into a stack (single-claim guard).',
    },
  ];

  const functions: SeedFunctionInput[] = tables.map((table) => {
    const auth = trustedAuthorityFields(
      rollAuthority,
      `self.table_id == ${JSON.stringify(table.tableId)} && self.rolled_item_id == ""`,
    );
    return {
      name: lootRollFn(table.tableId, typePrefix),
      containerTypeName: names.rollType,
      returnType: 'string',
      mutations: [
        { target: 'self', property: 'seed', expression: 'rand()' },
        {
          target: 'self',
          property: 'rolled_item_id',
          expression: unrollItemChain(table.entries),
        },
        {
          target: 'self',
          property: 'rolled_qty',
          expression: unrollQtyChain(table.entries),
        },
      ],
      returnExpression: 'self.rolled_item_id',
      ...auth,
      ...(droppedTables.has(table.tableId) ? { autonomousInvocable: true } : {}),
      description: `Roll the '${table.tableId}' loot table: stores one rand() seed, then resolves item and quantity from it in one transaction (unrolled weighted selection).`,
    };
  });

  functions.push({
    name: names.claimFn,
    containerTypeName: names.rollType,
    returnType: 'int',
    parameters: [
      {
        name: 'to_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "A caller-owned stack of the rolled item that receives the quantity.",
      },
    ],
    mutations: [
      { target: 'self', property: 'claimed', expression: 'true' },
      {
        target: 'ref($to_stack_id)',
        property: 'quantity',
        expression: 'ref($to_stack_id).quantity + self.rolled_qty',
      },
    ],
    returnExpression: 'self.rolled_qty',
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression: [
        ownerEqualsCaller('self.owner_user_id', kind),
        'not(self.claimed)',
        'self.rolled_item_id != ""',
        'ref($to_stack_id).item_id == self.rolled_item_id',
        ownerEqualsCaller('ref($to_stack_id).owner_user_id', kind),
      ].join(' && '),
    }),
    description:
      'Claim a rolled loot into a stack: the claimed flag and the grant commit atomically, so a roll can never be claimed twice.',
  });

  const automations: KitAutomationSpec[] = [];
  const automationTriggers: KitAutomationTriggerSpec[] = [];
  for (const drop of drops) {
    automations.push({
      name: drop.name,
      functionName: lootRollFn(drop.tableId, typePrefix),
      targetMode: 'type',
      targetTypeName: names.rollType,
      triggerType: 'event',
      maxTargets: drop.maxTargets ?? 1,
      selectorJson: JSON.stringify({
        selfWhere: [
          { key: 'table_id', op: '==', value: drop.tableId },
          { key: 'rolled_item_id', op: '==', value: '' },
        ],
        pick: 'random',
      }),
      description: `Event-triggered '${drop.tableId}' drop: rolls a pooled unrolled LootRoll when the event fires.`,
    });
    automationTriggers.push({
      automationName: drop.name,
      onEvent: drop.onEvent,
      ...(drop.functionName !== undefined ? { functionName: drop.functionName } : {}),
      ...(drop.containerTypeName !== undefined
        ? { containerTypeName: drop.containerTypeName }
        : {}),
      ...(drop.propertyKey !== undefined ? { propertyKey: drop.propertyKey } : {}),
      ...(drop.writeSource !== undefined ? { writeSource: drop.writeSource } : {}),
      ...(drop.debounceMs !== undefined ? { debounceMs: drop.debounceMs } : {}),
    });
  }

  return {
    name: names.rollType,
    containerTypes: [
      {
        typeName: names.rollType,
        displayName: names.rollType,
        instantiableBy: 'member',
        description:
          'One durable loot roll: seeded, resolved, and claimed entirely server-side.',
      },
    ],
    propertyDefinitions,
    functions,
    ...(automations.length ? { automations, automationTriggers } : {}),
  };
}
