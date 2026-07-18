import type { SeedPropertyDefInput } from '../../generated/graphql.js';
import { kitPolicyJson, toSnakeCase, type KitBlueprint } from './core.js';

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
        key: 'owner_user_id',
        valueType: 'int',
        defaultValueJson: '0',
        description:
          "Mirror of the stack owner's user id (kit convention), read by cross-container guards such as the economy trade/market functions.",
      },
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
