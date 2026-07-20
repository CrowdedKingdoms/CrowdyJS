import type { SeedPropertyDefInput } from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  type KitBlueprint,
  type KitOwnerIdKind,
} from './core.js';

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
  /**
   * Recipes compiled into atomic Model functions. Each generated function
   * consumes every input stack and grants the output stack in ONE
   * transaction; all refs must be caller-owned and item ids must match.
   */
  recipes?: InventoryRecipeSpec[];
  /** Item-for-item offers compiled into atomic barter functions. */
  barters?: InventoryBarterSpec[];
  /** Owner mirror representation. Defaults to `int`; legacy worlds may use `string`. */
  ownerIdKind?: KitOwnerIdKind;
  /**
   * Who may instantiate ItemStack rows. Defaults to `member` for backwards
   * compatibility; competitive games should use `admin` and create empty
   * stacks through a trusted compute/bootstrap path.
   */
  stackInstantiableBy?: 'member' | 'admin';
  /**
   * Who may call the generic grant function. `owner` preserves the original
   * sandbox-friendly behavior; competitive games should use `server` and
   * grant only through trusted transactions/referees.
   */
  grantAuthority?: 'owner' | 'server';
}

export interface InventoryRecipeSpec {
  recipeId: string;
  inputs: Array<{ itemId: string; quantity: number }>;
  output: { itemId: string; quantity: number };
}

export interface InventoryBarterSpec {
  barterId: string;
  pay: { itemId: string; quantity: number };
  receive: { itemId: string; quantity: number };
}

export function inventoryCraftFunctionName(recipeId: string, typePrefix = ''): string {
  const prefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return `${prefix}craft_${toSnakeCase(recipeId)}`;
}

export function inventoryBarterFunctionName(barterId: string, typePrefix = ''): string {
  const prefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return `${prefix}barter_${toSnakeCase(barterId)}`;
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
  const {
    typePrefix = '',
    maxSlots = 24,
    slotCount = 64,
    recipes = [],
    barters = [],
    ownerIdKind = 'int',
    stackInstantiableBy = 'member',
    grantAuthority = 'owner',
  } = options;
  const names = inventoryNames(typePrefix);
  const ownerOnly = kitPolicyJson({ type: 'owner_of_self' });
  for (const recipe of recipes) {
    if (recipe.inputs.length === 0 || recipe.inputs.length > 6) {
      throw new Error(`inventory recipe '${recipe.recipeId}' must have 1-6 inputs`);
    }
  }

  const recipeFunctions = recipes.map((recipe) => {
    const inputParams = recipe.inputs.map((_, index) => ({
      name: `input_${index}_id`,
      valueType: 'container_ref',
      required: true,
    }));
    const guards = recipe.inputs.flatMap((input, index) => [
      ownerEqualsCaller(`ref($input_${index}_id).owner_user_id`, ownerIdKind),
      `ref($input_${index}_id).item_id == "${input.itemId}"`,
      `ref($input_${index}_id).quantity >= ${input.quantity}`,
    ]);
    guards.push(ownerEqualsCaller('ref($output_id).owner_user_id', ownerIdKind));
    guards.push(`ref($output_id).item_id == "${recipe.output.itemId}"`);
    return {
      name: inventoryCraftFunctionName(recipe.recipeId, typePrefix),
      containerTypeName: names.inventoryType,
      returnType: 'int',
      parameters: [
        ...inputParams,
        { name: 'output_id', valueType: 'container_ref', required: true },
      ],
      mutations: [
        ...recipe.inputs.map((input, index) => ({
          target: `ref($input_${index}_id)`,
          property: 'quantity',
          expression: `ref($input_${index}_id).quantity - ${input.quantity}`,
        })),
        {
          target: 'ref($output_id)',
          property: 'quantity',
          expression: `ref($output_id).quantity + ${recipe.output.quantity}`,
        },
      ],
      returnExpression: 'ref($output_id).quantity',
      invokePolicyJson: kitPolicyJson({
        type: 'and',
        rules: [
          { type: 'owner_of_self' },
          { type: 'condition', expression: guards.join(' && ') },
        ],
      }),
      autonomousInvocable: true,
      description: `Atomically craft '${recipe.recipeId}': consume all inputs and grant the output, or write nothing.`,
    };
  });

  const barterFunctions = barters.map((barter) => ({
    name: inventoryBarterFunctionName(barter.barterId, typePrefix),
    containerTypeName: names.inventoryType,
    returnType: 'int',
    parameters: [
      { name: 'pay_id', valueType: 'container_ref', required: true },
      { name: 'receive_id', valueType: 'container_ref', required: true },
    ],
    mutations: [
      {
        target: 'ref($pay_id)',
        property: 'quantity',
        expression: `ref($pay_id).quantity - ${barter.pay.quantity}`,
      },
      {
        target: 'ref($receive_id)',
        property: 'quantity',
        expression: `ref($receive_id).quantity + ${barter.receive.quantity}`,
      },
    ],
    returnExpression: 'ref($receive_id).quantity',
    invokePolicyJson: kitPolicyJson({
      type: 'and',
      rules: [
        { type: 'owner_of_self' },
        {
          type: 'condition',
          expression: [
            ownerEqualsCaller('ref($pay_id).owner_user_id', ownerIdKind),
            `ref($pay_id).item_id == "${barter.pay.itemId}"`,
            `ref($pay_id).quantity >= ${barter.pay.quantity}`,
            ownerEqualsCaller('ref($receive_id).owner_user_id', ownerIdKind),
            `ref($receive_id).item_id == "${barter.receive.itemId}"`,
          ].join(' && '),
        },
      ],
    }),
    autonomousInvocable: true,
    description: `Atomically execute barter '${barter.barterId}', or write nothing.`,
  }));

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
        instantiableBy: stackInstantiableBy,
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
      ownerMirrorProperty(names.stackType, ownerIdKind),
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
    ] satisfies SeedPropertyDefInput[],
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
        invokePolicyJson:
          grantAuthority === 'server'
            ? kitPolicyJson({ type: 'is_automation' })
            : ownerOnly,
        invokeScope: grantAuthority === 'server' ? 'internal' : undefined,
        autonomousInvocable: grantAuthority === 'server' ? true : undefined,
        description:
          grantAuthority === 'server'
            ? 'Trusted server/compute grant; players cannot mint items.'
            : 'Add items to a stack the caller owns.',
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
      ...recipeFunctions,
      ...barterFunctions,
    ],
  };
}
