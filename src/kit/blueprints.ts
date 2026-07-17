import type {
  FunctionMutationInput,
  FunctionParamInput,
  Scalars,
  SeedContainerInput,
  SeedContainerTypeInput,
  SeedEdgeInput,
  SeedFunctionInput,
  SeedGameModelInput,
  SeedPropertyDefInput,
  UpsertAutomationInput,
  UpsertAutomationTriggerInput,
} from '../generated/graphql.js';

/**
 * A composable invoke-policy rule tree, mirroring the server's authority
 * rules (see the Game API "Game Models → Authority" guide). Serialized with
 * {@link kitPolicyJson} into the `invokePolicyJson` a function carries.
 */
export type KitInvokePolicy =
  | { type: 'allow' }
  | { type: 'owner_of_self' }
  | { type: 'is_host' }
  | { type: 'is_current_turn' }
  | { type: 'is_participant' }
  | { type: 'is_automation' }
  | { type: 'tier_feature'; feature: string }
  | { type: 'group_permission'; groupId: string; permission?: string }
  | { type: 'grid_permission'; key: string; gridId?: string }
  | { type: 'condition'; expression: string }
  | { type: 'and'; rules: KitInvokePolicy[] }
  | { type: 'or'; rules: KitInvokePolicy[] }
  | { type: 'not'; rule: KitInvokePolicy };

/** Serialize a {@link KitInvokePolicy} tree to the wire `invokePolicyJson`. */
export function kitPolicyJson(policy: KitInvokePolicy): string {
  return JSON.stringify(policy);
}

/** An automation spec inside a blueprint (the `appId` is bound at deploy). */
export type KitAutomationSpec = Omit<UpsertAutomationInput, 'appId'>;

/** An automation event-trigger spec inside a blueprint. */
export type KitAutomationTriggerSpec = Omit<UpsertAutomationTriggerInput, 'appId'>;

/**
 * A **blueprint**: a self-contained, declarative bundle of game-model
 * definitions (container types, property defs, functions), optional seed
 * instances, and optional automations that together implement one game
 * concept (an inventory system, a lockable object, an NPC archetype).
 *
 * Blueprints are plain data — build them with {@link inventoryBlueprint},
 * {@link lockBlueprint}, {@link npcBlueprint}, or by hand — then load them
 * into an app with `client.kit(appId).deploy([...])` (requires the app-admin
 * `manage_apps` permission). Deployment is idempotent: seeding upserts
 * definitions and `upsertAutomation` keys on the automation name.
 */
export interface KitBlueprint {
  /** A short identifier used in error messages (e.g. `'inventory'`). */
  name: string;
  containerTypes?: SeedContainerTypeInput[];
  propertyDefinitions?: SeedPropertyDefInput[];
  functions?: SeedFunctionInput[];
  /** Optional shared/world containers to seed (catalog data, world objects). */
  containers?: SeedContainerInput[];
  /** Optional edges between seeded containers (by `tempId`). */
  edges?: SeedEdgeInput[];
  /** Server-driven automations to upsert after the seed. */
  automations?: KitAutomationSpec[];
  /** Event triggers to attach to the automations. */
  automationTriggers?: KitAutomationTriggerSpec[];
}

/** Convert `PascalCase`/`camelCase` to `snake_case` for derived names. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** Options for {@link inventoryBlueprint}. */
export interface InventoryBlueprintOptions {
  /**
   * Prefix applied to the container type names (e.g. `'Bank'` →
   * `BankInventory` / `BankItemStack`) and, snake-cased, to the function
   * names (`bank_grant_stack`, …). Lets several independent inventory systems
   * coexist in one app. Defaults to none.
   */
  typePrefix?: string;
  /** Default `max_slots` on new inventories. Defaults to 24. */
  maxSlots?: number;
  /** Exclusive upper bound for stack `slot` indexes. Defaults to 64. */
  slotCount?: number;
}

/** Names derived by {@link inventoryBlueprint} for a given prefix. */
export interface InventoryNames {
  inventoryType: string;
  stackType: string;
  grantFn: string;
  consumeFn: string;
  moveFn: string;
  transferFn: string;
  containsEdge: string;
}

/** Compute the type/function names an inventory blueprint (and its runtime helper) uses. */
export function inventoryNames(typePrefix = ''): InventoryNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    inventoryType: `${typePrefix}Inventory`,
    stackType: `${typePrefix}ItemStack`,
    grantFn: `${fnPrefix}grant_stack`,
    consumeFn: `${fnPrefix}consume_stack`,
    moveFn: `${fnPrefix}move_stack`,
    transferFn: `${fnPrefix}transfer_stack`,
    containsEdge: 'inventory_contains',
  };
}

/**
 * Blueprint for a server-authoritative **inventory**: a per-player
 * `Inventory` container plus `ItemStack` containers (`item_id`, `quantity`,
 * `slot`), and owner-gated functions to grant, consume, move, and transfer
 * stacks. Quantity guards live in the invoke policies, so an untrusted client
 * can never overdraw or touch another player's items.
 *
 * Runtime counterpart: `client.kit(appId).inventory`.
 */
export function inventoryBlueprint(
  options: InventoryBlueprintOptions = {},
): KitBlueprint {
  const { typePrefix = '', maxSlots = 24, slotCount = 64 } = options;
  const names = inventoryNames(typePrefix);
  const ownerOnly = kitPolicyJson({ type: 'owner_of_self' });

  return {
    name: names.inventoryType,
    containerTypes: [
      {
        typeName: names.inventoryType,
        displayName: names.inventoryType,
        instantiableBy: 'member',
        description: 'A bag of item stacks owned by one player.',
      },
      {
        typeName: names.stackType,
        displayName: names.stackType,
        instantiableBy: 'member',
        description: 'One stack of a single item type in an inventory slot.',
      },
    ],
    propertyDefinitions: [
      {
        containerTypeName: names.inventoryType,
        key: 'max_slots',
        valueType: 'int',
        defaultValueJson: String(maxSlots),
      },
      { containerTypeName: names.stackType, key: 'item_id', valueType: 'string' },
      {
        containerTypeName: names.stackType,
        key: 'quantity',
        valueType: 'int',
        defaultValueJson: '0',
      },
      {
        containerTypeName: names.stackType,
        key: 'slot',
        valueType: 'int',
        defaultValueJson: '0',
      },
    ],
    functions: [
      {
        name: names.grantFn,
        containerTypeName: names.stackType,
        returnType: 'int',
        parameters: [{ name: 'amount', valueType: 'int', required: true }],
        mutations: [
          {
            target: 'self',
            property: 'quantity',
            expression: 'self.quantity + max(0, $amount)',
          },
        ],
        returnExpression: 'self.quantity',
        invokePolicyJson: ownerOnly,
        description: 'Add items to a stack the caller owns.',
      },
      {
        name: names.consumeFn,
        containerTypeName: names.stackType,
        returnType: 'int',
        parameters: [{ name: 'amount', valueType: 'int', required: true }],
        mutations: [
          { target: 'self', property: 'quantity', expression: 'self.quantity - $amount' },
        ],
        returnExpression: 'self.quantity',
        invokePolicyJson: kitPolicyJson({
          type: 'and',
          rules: [
            { type: 'owner_of_self' },
            {
              type: 'condition',
              expression: '$amount > 0 && self.quantity >= $amount',
            },
          ],
        }),
        description: 'Spend items from a stack; refuses to overdraw.',
      },
      {
        name: names.moveFn,
        containerTypeName: names.stackType,
        returnType: 'int',
        parameters: [{ name: 'to_slot', valueType: 'int', required: true }],
        mutations: [
          {
            target: 'self',
            property: 'slot',
            expression: `clamp($to_slot, 0, ${slotCount - 1})`,
          },
        ],
        returnExpression: 'self.slot',
        invokePolicyJson: ownerOnly,
        description: 'Move a stack to another slot.',
      },
      {
        name: names.transferFn,
        containerTypeName: names.stackType,
        returnType: 'int',
        parameters: [
          { name: 'to_id', valueType: 'container_ref', required: true },
          { name: 'amount', valueType: 'int', required: true },
        ],
        mutations: [
          { target: 'self', property: 'quantity', expression: 'self.quantity - $amount' },
          {
            target: 'ref($to_id)',
            property: 'quantity',
            expression: 'ref($to_id).quantity + $amount',
          },
        ],
        returnExpression: 'self.quantity',
        invokePolicyJson: kitPolicyJson({
          type: 'and',
          rules: [
            { type: 'owner_of_self' },
            {
              type: 'condition',
              expression:
                '$amount > 0 && self.quantity >= $amount && ref($to_id).item_id == self.item_id',
            },
          ],
        }),
        description:
          'Atomically move items between two stacks of the same item type.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Lockable objects (keys / doors / chests / area permissions)
// ---------------------------------------------------------------------------

/**
 * The authority source that may operate a lockable object. Several may be
 * combined (any one grants access — they are OR'd):
 *
 * - `owner` — only the container's owner (`owner_of_self`); "only the owner
 *   of this chest can open it".
 * - `key` — the caller must own a matching key item; "if a player has key 1
 *   they can open door 1". Adds a required `key_id` (`container_ref`) param.
 * - `gridPermission` — the caller must hold a runtime grid permission; ties
 *   the object to a world region ("movement permission on chunk X opens the
 *   doors in it").
 * - `groupPermission` — the caller must be in a team/group (optionally with a
 *   specific group permission).
 * - `custom` — any hand-written {@link KitInvokePolicy} rule.
 */
export type LockAuthority =
  | { kind: 'owner' }
  | { kind: 'key' }
  | { kind: 'gridPermission'; key: string; gridId?: string }
  | { kind: 'groupPermission'; groupId: string; permission?: string }
  | { kind: 'custom'; rule: KitInvokePolicy };

/** Options for {@link lockBlueprint}. */
export interface LockBlueprintOptions {
  /**
   * Container type name for the lockable object (`Door`, `Chest`, `Gate`, …).
   * Also drives the function names (`open_door` / `close_door`). Defaults to
   * `'Lockable'`.
   */
  objectTypeName?: string;
  /** Key item type name (only used with a `key` authority). Defaults to `<objectTypeName>Key`. */
  keyTypeName?: string;
  /** One or more authority sources; any one grants access. */
  authority: LockAuthority | LockAuthority[];
}

/** Names derived by {@link lockBlueprint} for a given object type. */
export interface LockNames {
  objectType: string;
  keyType: string;
  openFn: string;
  closeFn: string;
}

/** Compute the type/function names a lock blueprint (and its runtime helper) uses. */
export function lockNames(
  objectTypeName = 'Lockable',
  keyTypeName?: string,
): LockNames {
  const snake = toSnakeCase(objectTypeName);
  return {
    objectType: objectTypeName,
    keyType: keyTypeName ?? `${objectTypeName}Key`,
    openFn: `open_${snake}`,
    closeFn: `close_${snake}`,
  };
}

function lockAuthorityRule(authority: LockAuthority): KitInvokePolicy {
  switch (authority.kind) {
    case 'owner':
      return { type: 'owner_of_self' };
    case 'key':
      // Container ownership is not readable from expressions, so the key
      // mirrors its owner into an `owner_user_id` property; the condition
      // verifies both the match and the ownership server-side.
      return {
        type: 'condition',
        expression:
          'ref($key_id).key_id == self.required_key_id && ref($key_id).owner_user_id == $caller_user_id',
      };
    case 'gridPermission':
      return {
        type: 'grid_permission',
        key: authority.key,
        ...(authority.gridId !== undefined ? { gridId: authority.gridId } : {}),
      };
    case 'groupPermission':
      return {
        type: 'group_permission',
        groupId: authority.groupId,
        ...(authority.permission !== undefined
          ? { permission: authority.permission }
          : {}),
      };
    case 'custom':
      return authority.rule;
  }
}

/**
 * Blueprint for a **lockable game object** (door, chest, gate, switch) whose
 * `open`/`close` functions are gated by a configurable authority source:
 * ownership, a key item the caller must hold, a runtime grid permission, a
 * team/group permission, or any custom policy rule. Multiple authorities are
 * OR'd, so "the owner, or anyone with the right key" is one blueprint.
 *
 * Runtime counterpart: `client.kit(appId).objects`.
 */
export function lockBlueprint(options: LockBlueprintOptions): KitBlueprint {
  const authorities = Array.isArray(options.authority)
    ? options.authority
    : [options.authority];
  if (authorities.length === 0) {
    throw new Error('lockBlueprint requires at least one authority source');
  }
  const names = lockNames(options.objectTypeName, options.keyTypeName);
  const usesKey = authorities.some((a) => a.kind === 'key');

  const rules = authorities.map(lockAuthorityRule);
  const policy: KitInvokePolicy =
    rules.length === 1 ? rules[0] : { type: 'or', rules };
  const policyJson = kitPolicyJson(policy);

  const parameters: FunctionParamInput[] = usesKey
    ? [{ name: 'key_id', valueType: 'container_ref', required: true }]
    : [];

  const containerTypes: SeedContainerTypeInput[] = [
    {
      typeName: names.objectType,
      displayName: names.objectType,
      instantiableBy: 'admin',
      description: 'A lockable world object operated through gated functions.',
    },
  ];
  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: names.objectType,
      key: 'is_open',
      valueType: 'bool',
      defaultValueJson: 'false',
    },
  ];

  if (usesKey) {
    propertyDefinitions.push({
      containerTypeName: names.objectType,
      key: 'required_key_id',
      valueType: 'string',
    });
    containerTypes.push({
      typeName: names.keyType,
      displayName: names.keyType,
      instantiableBy: 'admin',
      description: 'A key item granting access to matching lockable objects.',
    });
    propertyDefinitions.push(
      { containerTypeName: names.keyType, key: 'key_id', valueType: 'string' },
      {
        containerTypeName: names.keyType,
        key: 'owner_user_id',
        valueType: 'int',
      },
    );
  }

  const openMutation: FunctionMutationInput = {
    target: 'self',
    property: 'is_open',
    expression: 'true',
  };
  const closeMutation: FunctionMutationInput = {
    target: 'self',
    property: 'is_open',
    expression: 'false',
  };

  return {
    name: names.objectType,
    containerTypes,
    propertyDefinitions,
    functions: [
      {
        name: names.openFn,
        containerTypeName: names.objectType,
        returnType: 'bool',
        parameters,
        mutations: [openMutation],
        returnExpression: 'self.is_open',
        invokePolicyJson: policyJson,
        description: `Open a ${names.objectType}; the invoke policy decides who may.`,
      },
      {
        name: names.closeFn,
        containerTypeName: names.objectType,
        returnType: 'bool',
        parameters,
        mutations: [closeMutation],
        returnExpression: 'self.is_open',
        invokePolicyJson: policyJson,
        description: `Close a ${names.objectType}; same authority as opening.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

/** A trigger for an NPC behavior: a schedule (interval or cron) or a model event. */
export type NpcBehaviorTrigger =
  | { intervalMs: number }
  | { cronExpr: string }
  | {
      onEvent: 'function_invoked' | 'property_changed' | 'container_created';
      functionName?: string;
      containerTypeName?: string;
      propertyKey?: string;
      debounceMs?: number;
    };

/** One server-driven NPC behavior: a model function plus the automation that drives it. */
export interface NpcBehaviorSpec {
  /**
   * Automation name (unique per app), e.g. `'npc-wander'`. Also derives the
   * default function name (`npc_wander`).
   */
  name: string;
  /** Entry-point function name. Defaults to the snake-cased behavior name. */
  functionName?: string;
  /** The property writes the behavior performs each tick. */
  mutations: FunctionMutationInput[];
  /** Typed parameters (bind them from a selector or static `paramsJson`). */
  parameters?: FunctionParamInput[];
  /** What makes the behavior run. */
  trigger: NpcBehaviorTrigger;
  /**
   * Selector choosing/filtering targets and binding params (see the Game API
   * "Autonomous Processes → Selectors" guide). JSON-encoded at deploy.
   */
  selector?: Record<string, unknown>;
  /**
   * Convenience: only NPCs whose `role` property equals this act (adds a
   * `selfWhere` filter when no explicit `selector` is given).
   */
  role?: string;
  /** Fan-out cap per run. Defaults to 8. */
  maxTargets?: number;
  /** Static params merged into every call. */
  params?: Record<string, unknown>;
  /** Identity the automation acts as; omit for a trusted server caller. */
  runAsUserId?: Scalars['BigInt']['input'];
}

/** Options for {@link npcBlueprint}. */
export interface NpcBlueprintOptions {
  /** NPC container type name. Defaults to `'Npc'`. */
  typeName?: string;
  /**
   * Extra property definitions beyond the defaults (`role`, `x`, `y`, `z`,
   * `behavior_state`, `health`). `containerTypeName` is filled in.
   */
  extraProperties?: Omit<SeedPropertyDefInput, 'containerTypeName'>[];
  /** The server-driven behaviors this NPC archetype has. */
  behaviors: NpcBehaviorSpec[];
}

/** Compute the function/automation names an NPC behavior deploys under. */
export function npcBehaviorFunctionName(behavior: NpcBehaviorSpec): string {
  return behavior.functionName ?? toSnakeCase(behavior.name);
}

/**
 * Blueprint for an **NPC archetype**: an admin-instantiable container type
 * holding the NPC's durable state, one `autonomousInvocable` model function
 * per behavior (gated `is_automation` so players cannot puppet them), and the
 * automations + event triggers that drive those behaviors on the server.
 *
 * Runtime counterpart: `client.kit(appId).npcs`.
 */
export function npcBlueprint(options: NpcBlueprintOptions): KitBlueprint {
  const typeName = options.typeName ?? 'Npc';
  if (options.behaviors.length === 0) {
    throw new Error('npcBlueprint requires at least one behavior');
  }

  const propertyDefinitions: SeedPropertyDefInput[] = [
    {
      containerTypeName: typeName,
      key: 'role',
      valueType: 'string',
      defaultValueJson: '""',
    },
    { containerTypeName: typeName, key: 'x', valueType: 'float', defaultValueJson: '0' },
    { containerTypeName: typeName, key: 'y', valueType: 'float', defaultValueJson: '0' },
    { containerTypeName: typeName, key: 'z', valueType: 'float', defaultValueJson: '0' },
    {
      containerTypeName: typeName,
      key: 'behavior_state',
      valueType: 'string',
      defaultValueJson: '"idle"',
    },
    {
      containerTypeName: typeName,
      key: 'health',
      valueType: 'int',
      defaultValueJson: '100',
    },
    ...(options.extraProperties ?? []).map((p) => ({
      ...p,
      containerTypeName: typeName,
    })),
  ];

  const functions: SeedFunctionInput[] = [];
  const automations: KitAutomationSpec[] = [];
  const automationTriggers: KitAutomationTriggerSpec[] = [];

  for (const behavior of options.behaviors) {
    const functionName = npcBehaviorFunctionName(behavior);
    functions.push({
      name: functionName,
      containerTypeName: typeName,
      parameters: behavior.parameters,
      mutations: behavior.mutations,
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description: `Server-driven NPC behavior for the '${behavior.name}' automation.`,
    });

    const selector =
      behavior.selector ??
      (behavior.role !== undefined
        ? { selfWhere: [{ key: 'role', op: '==', value: behavior.role }] }
        : undefined);

    const automation: KitAutomationSpec = {
      name: behavior.name,
      functionName,
      targetMode: 'type',
      targetTypeName: typeName,
      maxTargets: behavior.maxTargets ?? 8,
      ...(selector ? { selectorJson: JSON.stringify(selector) } : {}),
      ...(behavior.params ? { paramsJson: JSON.stringify(behavior.params) } : {}),
      ...(behavior.runAsUserId !== undefined
        ? { runAsUserId: behavior.runAsUserId }
        : {}),
    };

    if ('intervalMs' in behavior.trigger) {
      automation.triggerType = 'schedule';
      automation.scheduleKind = 'interval';
      automation.intervalMs = behavior.trigger.intervalMs;
    } else if ('cronExpr' in behavior.trigger) {
      automation.triggerType = 'schedule';
      automation.scheduleKind = 'cron';
      automation.cronExpr = behavior.trigger.cronExpr;
    } else {
      automation.triggerType = 'event';
      automationTriggers.push({
        automationName: behavior.name,
        onEvent: behavior.trigger.onEvent,
        ...(behavior.trigger.functionName !== undefined
          ? { functionName: behavior.trigger.functionName }
          : {}),
        ...(behavior.trigger.containerTypeName !== undefined
          ? { containerTypeName: behavior.trigger.containerTypeName }
          : {}),
        ...(behavior.trigger.propertyKey !== undefined
          ? { propertyKey: behavior.trigger.propertyKey }
          : {}),
        ...(behavior.trigger.debounceMs !== undefined
          ? { debounceMs: behavior.trigger.debounceMs }
          : {}),
      });
    }

    automations.push(automation);
  }

  return {
    name: typeName,
    containerTypes: [
      {
        typeName,
        displayName: typeName,
        instantiableBy: 'admin',
        description: 'A server-driven non-player character.',
      },
    ],
    propertyDefinitions,
    functions,
    automations,
    automationTriggers,
  };
}

// ---------------------------------------------------------------------------
// Merging / deployment payloads
// ---------------------------------------------------------------------------

/** The wire payloads {@link mergeBlueprints} produces for one deployment. */
export interface MergedBlueprints {
  seedInput: SeedGameModelInput;
  automations: UpsertAutomationInput[];
  automationTriggers: UpsertAutomationTriggerInput[];
}

/**
 * Merge blueprints into a single `gameModelSeed` payload plus the automation
 * upserts, rejecting duplicate type, property, function, or automation names
 * across blueprints (a duplicate almost always means two blueprints need
 * distinct prefixes/type names).
 */
export function mergeBlueprints(
  appId: Scalars['BigInt']['input'],
  blueprints: KitBlueprint[],
  options: { sessionId?: string } = {},
): MergedBlueprints {
  const containerTypes: SeedContainerTypeInput[] = [];
  const propertyDefinitions: SeedPropertyDefInput[] = [];
  const functions: SeedFunctionInput[] = [];
  const containers: SeedContainerInput[] = [];
  const edges: SeedEdgeInput[] = [];
  const automations: UpsertAutomationInput[] = [];
  const automationTriggers: UpsertAutomationTriggerInput[] = [];

  const seenTypes = new Map<string, string>();
  const seenProps = new Map<string, string>();
  const seenFunctions = new Map<string, string>();
  const seenAutomations = new Map<string, string>();
  const seenTempIds = new Map<string, string>();

  const claim = (
    seen: Map<string, string>,
    key: string,
    blueprintName: string,
    kind: string,
  ) => {
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Blueprint '${blueprintName}' redefines ${kind} '${key}' already defined by blueprint '${existing}'`,
      );
    }
    seen.set(key, blueprintName);
  };

  for (const blueprint of blueprints) {
    for (const type of blueprint.containerTypes ?? []) {
      claim(seenTypes, type.typeName, blueprint.name, 'container type');
      containerTypes.push(type);
    }
    for (const prop of blueprint.propertyDefinitions ?? []) {
      claim(
        seenProps,
        `${prop.containerTypeName}.${prop.key}`,
        blueprint.name,
        'property',
      );
      propertyDefinitions.push(prop);
    }
    for (const fn of blueprint.functions ?? []) {
      claim(seenFunctions, fn.name, blueprint.name, 'function');
      functions.push(fn);
    }
    for (const container of blueprint.containers ?? []) {
      claim(seenTempIds, container.tempId, blueprint.name, 'container tempId');
      containers.push(container);
    }
    edges.push(...(blueprint.edges ?? []));
    for (const automation of blueprint.automations ?? []) {
      claim(seenAutomations, automation.name, blueprint.name, 'automation');
      automations.push({ ...automation, appId });
    }
    for (const trigger of blueprint.automationTriggers ?? []) {
      automationTriggers.push({ ...trigger, appId });
    }
  }

  const seedInput: SeedGameModelInput = {
    appId,
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(containerTypes.length ? { containerTypes } : {}),
    ...(propertyDefinitions.length ? { propertyDefinitions } : {}),
    ...(functions.length ? { functions } : {}),
    ...(containers.length ? { containers } : {}),
    ...(edges.length ? { edges } : {}),
  };

  return { seedInput, automations, automationTriggers };
}
