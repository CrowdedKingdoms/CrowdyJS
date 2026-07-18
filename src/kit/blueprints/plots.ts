import type {
  FunctionParamInput,
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  andPolicies,
  kitPolicyJson,
  toSnakeCase,
  type KitBlueprint,
  type KitInvokePolicy,
} from './core.js';

/** Options for {@link plotBlueprint}. */
export interface PlotBlueprintOptions {
  /** Plot container type name. Defaults to `'Plot'`. */
  typeName?: string;
  /**
   * Runtime permission keys buying/renting grants on the plot's grid.
   * Defaults to `['access', 'update_voxel_data']`.
   */
  permissionKeys?: string[];
  /** Currency property on the wallet container. Defaults to `'gold'`. */
  currencyProperty?: string;
  /**
   * Property on the wallet container mirroring its owner's user id (the
   * standard kit convention, since expressions can't read container
   * ownership). Defaults to `'owner_user_id'`.
   */
  walletOwnerProperty?: string;
  /**
   * Also generate `rent_plot`: a TTL grant priced by the plot's `rent_price`
   * property, expiring after `rent_ttl_seconds`. Defaults to false.
   */
  rentable?: boolean;
  /**
   * Extra policy rule AND'ed into `buy_plot` — e.g.
   * `featureGate('land_owner')` to sell land only to a paid tier.
   */
  buyPolicyExtra?: KitInvokePolicy;
  /** Extra policy rule AND'ed into `rent_plot`. */
  rentPolicyExtra?: KitInvokePolicy;
}

/** Names derived by {@link plotBlueprint} for a given plot type. */
export interface PlotNames {
  plotType: string;
  buyFn: string;
  rentFn: string;
  evictFn: string;
}

/** Compute the type/function names a plot blueprint (and its runtime helper) uses. */
export function plotNames(typeName = 'Plot'): PlotNames {
  const snake = toSnakeCase(typeName);
  return {
    plotType: typeName,
    buyFn: `buy_${snake}`,
    rentFn: `rent_${snake}`,
    evictFn: `evict_${snake}`,
  };
}

/**
 * Blueprint for **sellable/rentable land**: a `Plot` container mapping a world
 * [grid](../../domains/gameApps.js) to a price, whose `buy`/`rent` functions
 * consume currency AND grant runtime grid permissions in one transaction (via
 * permission effects) — the canonical read+write permission loop. Buying sets
 * the plot's `owner_user_id`; renting grants with a TTL; `evict` revokes.
 * The grants are enforced by the replication layer on movement/voxel writes
 * immediately at commit. Requires game-api v0.13.11+ (effects) — pair with
 * chunk-permission locks (v0.13.12+) for doors that honor the purchase.
 *
 * Runtime counterpart: `client.kit(appId).plots`.
 */
export function plotBlueprint(options: PlotBlueprintOptions = {}): KitBlueprint {
  const names = plotNames(options.typeName);
  const keys = options.permissionKeys ?? ['access', 'update_voxel_data'];
  const currency = options.currencyProperty ?? 'gold';
  const walletOwner = options.walletOwnerProperty ?? 'owner_user_id';
  const rentable = options.rentable ?? false;

  const walletParam: FunctionParamInput[] = [
    { name: 'wallet_id', valueType: 'container_ref', required: true },
  ];
  const walletGuard = (priceExpr: string, extra?: KitInvokePolicy) =>
    kitPolicyJson(
      andPolicies(
        {
          type: 'condition',
          expression: `ref($wallet_id).${walletOwner} == $caller_user_id && ref($wallet_id).${currency} >= ${priceExpr}`,
        },
        extra,
      ),
    );

  const propertyDefinitions: SeedPropertyDefInput[] = [
    { containerTypeName: names.plotType, key: 'grid_id', valueType: 'int' },
    { containerTypeName: names.plotType, key: 'price', valueType: 'int', defaultValueJson: '0' },
    {
      containerTypeName: names.plotType,
      key: 'owner_user_id',
      valueType: 'int',
      defaultValueJson: '0',
    },
  ];
  if (rentable) {
    propertyDefinitions.push(
      {
        containerTypeName: names.plotType,
        key: 'rent_price',
        valueType: 'int',
        defaultValueJson: '0',
      },
      {
        containerTypeName: names.plotType,
        key: 'rent_ttl_seconds',
        valueType: 'int',
        defaultValueJson: '86400',
      },
    );
  }

  const functions: SeedFunctionInput[] = [
    {
      name: names.buyFn,
      containerTypeName: names.plotType,
      returnType: 'int',
      parameters: walletParam,
      mutations: [
        {
          target: 'ref($wallet_id)',
          property: currency,
          expression: `ref($wallet_id).${currency} - self.price`,
        },
        { target: 'self', property: 'owner_user_id', expression: '$caller_user_id' },
      ],
      permissionEffects: [
        {
          action: 'grant',
          permissionKeys: keys,
          userExpression: '$caller_user_id',
          gridIdExpression: 'self.grid_id',
        },
      ],
      returnExpression: `ref($wallet_id).${currency}`,
      invokePolicyJson: walletGuard('self.price', options.buyPolicyExtra),
      description:
        'Buy this plot: spend the price AND receive grid permissions atomically.',
    },
    {
      name: names.evictFn,
      containerTypeName: names.plotType,
      parameters: [{ name: 'target_user_id', valueType: 'int', required: true }],
      mutations: [],
      permissionEffects: [
        {
          action: 'revoke',
          permissionKeys: keys,
          userExpression: '$target_user_id',
          gridIdExpression: 'self.grid_id',
        },
      ],
      invokePolicyJson: kitPolicyJson({
        type: 'condition',
        expression: 'self.owner_user_id == $caller_user_id',
      }),
      description: "Revoke a user's permissions on this plot (owner-gated; admins bypass).",
    },
  ];
  if (rentable) {
    functions.push({
      name: names.rentFn,
      containerTypeName: names.plotType,
      returnType: 'int',
      parameters: walletParam,
      mutations: [
        {
          target: 'ref($wallet_id)',
          property: currency,
          expression: `ref($wallet_id).${currency} - self.rent_price`,
        },
      ],
      permissionEffects: [
        {
          action: 'grant',
          permissionKeys: keys,
          userExpression: '$caller_user_id',
          gridIdExpression: 'self.grid_id',
          ttlSecondsExpression: 'self.rent_ttl_seconds',
        },
      ],
      returnExpression: `ref($wallet_id).${currency}`,
      invokePolicyJson: walletGuard('self.rent_price', options.rentPolicyExtra),
      description:
        'Rent this plot: spend the rent AND receive an expiring grid grant atomically.',
    });
  }

  return {
    name: names.plotType,
    containerTypes: [
      {
        typeName: names.plotType,
        displayName: names.plotType,
        instantiableBy: 'admin',
        description: 'A sellable/rentable plot of land mapped to a world grid.',
      },
    ],
    propertyDefinitions,
    functions,
  };
}
