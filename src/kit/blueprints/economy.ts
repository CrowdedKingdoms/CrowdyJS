import type {
  SeedFunctionInput,
  SeedPropertyDefInput,
} from '../../generated/graphql.js';
import {
  kitPolicyJson,
  ownerEquals,
  ownerEqualsCaller,
  ownerMirrorProperty,
  toSnakeCase,
  trustedAuthorityFields,
  type KitAutomationSpec,
  type KitBlueprint,
  type KitOwnerIdKind,
  type KitTrustedAuthority,
} from './core.js';

/** Options for {@link economyBlueprint}. */
export interface EconomyBlueprintOptions {
  /**
   * Prefix applied to the container type names (`'Black'` → `BlackWallet` /
   * `BlackShopListing` / …) and, snake-cased, to the function names
   * (`black_earn_gold`, …). Lets several economies coexist. Defaults to none.
   */
  typePrefix?: string;
  /**
   * Currency property names on the wallet, one int property (default 0) per
   * entry, each with `earn_<c>` / `spend_<c>` functions. Defaults to
   * `['gold']`.
   */
  currencies?: string[];
  /**
   * The wallet currency shops and market listings are priced in. Defaults to
   * the first entry of `currencies`. (Expressions cannot pick a wallet
   * property dynamically, so one deployment trades in one currency; deploy a
   * prefixed second blueprint for a second shop currency.)
   */
  shopCurrency?: string;
  /**
   * Who may mint currency via `earn_<c>`. Trusted grants should be `'server'`
   * (app admins / studio backend, the default), `'host'`, or
   * `'automation'` — never plain players. Defaults to `'server'`.
   */
  earnAuthority?: KitTrustedAuthority;
  /**
   * How `owner_user_id` mirrors are typed on the stack containers this
   * economy guards (see the kit owner-mirroring convention). Defaults to
   * `'int'` (the kit standard).
   */
  ownerIdKind?: KitOwnerIdKind;
  /**
   * When set, adds a `restock_listing` automation that periodically raises
   * every listing's `stock` (by `amount`, clamped to `max_stock`) — the NPC
   * trader restock pattern.
   */
  restock?: { intervalMs: number; amount?: number };
}

/** Names derived by {@link economyBlueprint} for a given prefix. */
export interface EconomyNames {
  walletType: string;
  listingType: string;
  tradeType: string;
  marketType: string;
  /** Snake-cased function-name prefix (empty without a `typePrefix`). */
  fnPrefix: string;
  buyListingFn: string;
  acceptTradeFn: string;
  cancelTradeFn: string;
  buyMarketFn: string;
  cancelMarketFn: string;
  restockFn: string;
  restockAutomation: string;
}

/** Compute the type/function names an economy blueprint (and its runtime helper) uses. */
export function economyNames(typePrefix = ''): EconomyNames {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return {
    walletType: `${typePrefix}Wallet`,
    listingType: `${typePrefix}ShopListing`,
    tradeType: `${typePrefix}TradeOffer`,
    marketType: `${typePrefix}MarketListing`,
    fnPrefix,
    buyListingFn: `${fnPrefix}buy_listing`,
    acceptTradeFn: `${fnPrefix}accept_trade`,
    cancelTradeFn: `${fnPrefix}cancel_trade`,
    buyMarketFn: `${fnPrefix}buy_market_listing`,
    cancelMarketFn: `${fnPrefix}cancel_market_listing`,
    restockFn: `${fnPrefix}restock_listing`,
    restockAutomation: `${fnPrefix.replace(/_/g, '-')}shop-restock`,
  };
}

/** The earn/spend function name for one currency. */
export function economyCurrencyFn(
  verb: 'earn' | 'spend',
  currency: string,
  typePrefix = '',
): string {
  const fnPrefix = typePrefix ? `${toSnakeCase(typePrefix)}_` : '';
  return `${fnPrefix}${verb}_${toSnakeCase(currency)}`;
}

/**
 * Blueprint for a server-authoritative **economy**: per-player `Wallet`
 * containers (one int property per currency), an admin `ShopListing` catalog
 * with an atomic `buy_listing` (wallet debit + stock decrement + item grant
 * in ONE invoke), escrow `TradeOffer` swaps, and a player-to-player
 * `MarketListing` flow (buyer wallet → seller wallet + stack transfer, all
 * in one transaction).
 *
 * Anti-duplication is structural: every movement of currency or items is a
 * single function invocation whose condition guards check balances, stock,
 * item identity, and ownership mirrors server-side — never split a spend and
 * a grant across two invokes. Trusted mints (`earn_<c>`) default to
 * `invokeScope: "server"` (app admins only).
 *
 * Trade/market guards verify stack ownership through the kit-standard
 * `owner_user_id` mirror property on the stack type (the inventory blueprint
 * defines it; set it via `InventoryKit.createStack({ ownerUserId })`), and
 * pin the offer creator via the injected `$self_owner_id` — the server-truth
 * owner of the offer/listing container.
 *
 * Runtime counterpart: `client.kit(appId).economy`.
 */
export function economyBlueprint(
  options: EconomyBlueprintOptions = {},
): KitBlueprint {
  const {
    typePrefix = '',
    currencies = ['gold'],
    ownerIdKind = 'int',
    earnAuthority = 'server',
  } = options;
  if (currencies.length === 0) {
    throw new Error('economyBlueprint requires at least one currency');
  }
  const currency = options.shopCurrency ?? currencies[0];
  if (!currencies.includes(currency)) {
    throw new Error(
      `economyBlueprint shopCurrency '${currency}' must be one of the declared currencies`,
    );
  }
  const names = economyNames(typePrefix);
  const kind = ownerIdKind;

  const propertyDefinitions: SeedPropertyDefInput[] = [
    // Wallet: owner mirror + one balance property per currency.
    ownerMirrorProperty(names.walletType, kind),
    ...currencies.map((c) => ({
      containerTypeName: names.walletType,
      key: c,
      valueType: 'int',
      defaultValueJson: '0',
      description: `Balance of the '${c}' currency.`,
    })),
    // Shop listing catalog row.
    {
      containerTypeName: names.listingType,
      key: 'item_id',
      valueType: 'string',
      description: 'The item this listing sells (matched against stack item_id).',
    },
    {
      containerTypeName: names.listingType,
      key: 'price',
      valueType: 'int',
      defaultValueJson: '0',
      description: `Price per unit in '${currency}'.`,
    },
    {
      containerTypeName: names.listingType,
      key: 'stock',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Units remaining; buying decrements atomically.',
    },
    {
      containerTypeName: names.listingType,
      key: 'max_stock',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Restock ceiling used by the shop-restock automation.',
    },
    // Escrow trade offer.
    {
      containerTypeName: names.tradeType,
      key: 'to_user_id',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'The user invited to accept this trade.',
    },
    {
      containerTypeName: names.tradeType,
      key: 'give_stack_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: "Container id of the offerer's escrowed source stack.",
    },
    {
      containerTypeName: names.tradeType,
      key: 'receive_stack_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: "Container id of the offerer's stack that receives the wanted items.",
    },
    {
      containerTypeName: names.tradeType,
      key: 'give_item_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Item the offerer gives.',
    },
    {
      containerTypeName: names.tradeType,
      key: 'give_qty',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Quantity the offerer gives.',
    },
    {
      containerTypeName: names.tradeType,
      key: 'want_item_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Item the offerer wants in return.',
    },
    {
      containerTypeName: names.tradeType,
      key: 'want_qty',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Quantity the offerer wants in return.',
    },
    {
      containerTypeName: names.tradeType,
      key: 'status',
      valueType: 'string',
      defaultValueJson: '"open"',
      description: "Trade lifecycle: 'open' | 'accepted' | 'cancelled'.",
    },
    // Market listing.
    {
      containerTypeName: names.marketType,
      key: 'stack_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: "Container id of the seller's escrowed source stack.",
    },
    {
      containerTypeName: names.marketType,
      key: 'item_id',
      valueType: 'string',
      defaultValueJson: '""',
      description: 'Item being sold.',
    },
    {
      containerTypeName: names.marketType,
      key: 'quantity',
      valueType: 'int',
      defaultValueJson: '0',
      description: 'Units transferred to the buyer on purchase.',
    },
    {
      containerTypeName: names.marketType,
      key: 'price',
      valueType: 'int',
      defaultValueJson: '0',
      description: `Ask price in '${currency}' paid straight into the seller's wallet.`,
    },
    {
      containerTypeName: names.marketType,
      key: 'active',
      valueType: 'bool',
      defaultValueJson: 'true',
      description: 'False once bought or cancelled.',
    },
  ];

  const functions: SeedFunctionInput[] = [];

  // earn/spend per currency.
  for (const c of currencies) {
    functions.push({
      name: economyCurrencyFn('earn', c, typePrefix),
      containerTypeName: names.walletType,
      returnType: 'int',
      parameters: [
        {
          name: 'amount',
          valueType: 'int',
          required: true,
          description: 'Units to add (negative values are ignored).',
        },
      ],
      mutations: [
        { target: 'self', property: c, expression: `self.${c} + max(0, $amount)` },
      ],
      returnExpression: `self.${c}`,
      ...trustedAuthorityFields(earnAuthority),
      description: `Mint '${c}' into this wallet — a trusted grant (default: app admins via server scope).`,
    });
    functions.push({
      name: economyCurrencyFn('spend', c, typePrefix),
      containerTypeName: names.walletType,
      returnType: 'int',
      parameters: [
        {
          name: 'amount',
          valueType: 'int',
          required: true,
          description: 'Units to deduct; must not exceed the balance.',
        },
      ],
      mutations: [
        { target: 'self', property: c, expression: `self.${c} - $amount` },
      ],
      returnExpression: `self.${c}`,
      invokePolicyJson: kitPolicyJson({
        type: 'and',
        rules: [
          { type: 'owner_of_self' },
          {
            type: 'condition',
            expression: `$amount > 0 && self.${c} >= $amount`,
          },
        ],
      }),
      description: `Spend '${c}' from the caller's own wallet; refuses to overdraw.`,
    });
  }

  // Shop: atomic wallet debit + stock decrement + item grant.
  functions.push({
    name: names.buyListingFn,
    containerTypeName: names.listingType,
    returnType: 'int',
    parameters: [
      {
        name: 'wallet_id',
        valueType: 'container_ref',
        required: true,
        description: "The buyer's wallet (must be owned by the caller).",
      },
      {
        name: 'to_stack_id',
        valueType: 'container_ref',
        required: true,
        description: 'A stack of the listed item that receives the unit.',
      },
    ],
    mutations: [
      {
        target: 'ref($wallet_id)',
        property: currency,
        expression: `ref($wallet_id).${currency} - self.price`,
      },
      { target: 'self', property: 'stock', expression: 'self.stock - 1' },
      {
        target: 'ref($to_stack_id)',
        property: 'quantity',
        expression: 'ref($to_stack_id).quantity + 1',
      },
    ],
    returnExpression: `ref($wallet_id).${currency}`,
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression: [
        'self.stock > 0',
        ownerEqualsCaller('ref($wallet_id).owner_user_id', kind),
        `ref($wallet_id).${currency} >= self.price`,
        'ref($to_stack_id).item_id == self.item_id',
      ].join(' && '),
    }),
    description:
      'Buy one unit: wallet debit, stock decrement, and item grant in one transaction — money duplication is structurally impossible.',
  });

  // Escrow trade: atomic four-stack swap. $self_owner_id (injected,
  // unspoofable) is the offer creator, so a forged offer cannot drain a
  // third party's stacks.
  functions.push({
    name: names.acceptTradeFn,
    containerTypeName: names.tradeType,
    returnType: 'string',
    parameters: [
      {
        name: 'give_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The offerer's escrowed source stack (must match the recorded give_stack_id).",
      },
      {
        name: 'to_give_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The acceptor's stack that receives the given items.",
      },
      {
        name: 'want_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The acceptor's stack that pays the wanted items.",
      },
      {
        name: 'to_want_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The offerer's stack that receives the wanted items (must match the recorded receive_stack_id).",
      },
    ],
    mutations: [
      {
        target: 'ref($give_stack_id)',
        property: 'quantity',
        expression: 'ref($give_stack_id).quantity - self.give_qty',
      },
      {
        target: 'ref($to_give_stack_id)',
        property: 'quantity',
        expression: 'ref($to_give_stack_id).quantity + self.give_qty',
      },
      {
        target: 'ref($want_stack_id)',
        property: 'quantity',
        expression: 'ref($want_stack_id).quantity - self.want_qty',
      },
      {
        target: 'ref($to_want_stack_id)',
        property: 'quantity',
        expression: 'ref($to_want_stack_id).quantity + self.want_qty',
      },
      { target: 'self', property: 'status', expression: '"accepted"' },
    ],
    returnExpression: 'self.status',
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression: [
        'self.status == "open"',
        'self.to_user_id == $caller_user_id',
        '$give_stack_id == self.give_stack_id',
        '$to_want_stack_id == self.receive_stack_id',
        ownerEquals('ref($give_stack_id).owner_user_id', '$self_owner_id', kind),
        'ref($give_stack_id).item_id == self.give_item_id',
        'ref($give_stack_id).quantity >= self.give_qty',
        ownerEqualsCaller('ref($to_give_stack_id).owner_user_id', kind),
        'ref($to_give_stack_id).item_id == self.give_item_id',
        ownerEqualsCaller('ref($want_stack_id).owner_user_id', kind),
        'ref($want_stack_id).item_id == self.want_item_id',
        'ref($want_stack_id).quantity >= self.want_qty',
        ownerEquals('ref($to_want_stack_id).owner_user_id', '$self_owner_id', kind),
        'ref($to_want_stack_id).item_id == self.want_item_id',
      ].join(' && '),
    }),
    description:
      'Accept an escrow trade: both stack pairs swap atomically after ownership/item/quantity guards; any failure rolls the whole swap back.',
  });
  functions.push({
    name: names.cancelTradeFn,
    containerTypeName: names.tradeType,
    returnType: 'string',
    mutations: [{ target: 'self', property: 'status', expression: '"cancelled"' }],
    returnExpression: 'self.status',
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression:
        'self.status == "open" && ($self_owner_id == $caller_user_id || self.to_user_id == $caller_user_id)',
    }),
    description: 'Cancel an open trade (either party may).',
  });

  // Market: wallet→wallet payment + stack transfer, one invoke, 5 mutations.
  functions.push({
    name: names.buyMarketFn,
    containerTypeName: names.marketType,
    returnType: 'int',
    parameters: [
      {
        name: 'wallet_id',
        valueType: 'container_ref',
        required: true,
        description: "The buyer's wallet (must be owned by the caller).",
      },
      {
        name: 'seller_wallet_id',
        valueType: 'container_ref',
        required: true,
        description: "The seller's wallet that receives the payment.",
      },
      {
        name: 'from_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The seller's escrowed source stack (must match the recorded stack_id).",
      },
      {
        name: 'to_stack_id',
        valueType: 'container_ref',
        required: true,
        description: "The buyer's stack that receives the items.",
      },
    ],
    mutations: [
      {
        target: 'ref($wallet_id)',
        property: currency,
        expression: `ref($wallet_id).${currency} - self.price`,
      },
      {
        target: 'ref($seller_wallet_id)',
        property: currency,
        expression: `ref($seller_wallet_id).${currency} + self.price`,
      },
      {
        target: 'ref($from_stack_id)',
        property: 'quantity',
        expression: 'ref($from_stack_id).quantity - self.quantity',
      },
      {
        target: 'ref($to_stack_id)',
        property: 'quantity',
        expression: 'ref($to_stack_id).quantity + self.quantity',
      },
      { target: 'self', property: 'active', expression: 'false' },
    ],
    returnExpression: `ref($wallet_id).${currency}`,
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression: [
        'self.active',
        ownerEqualsCaller('ref($wallet_id).owner_user_id', kind),
        `ref($wallet_id).${currency} >= self.price`,
        ownerEquals('ref($seller_wallet_id).owner_user_id', '$self_owner_id', kind),
        '$from_stack_id == self.stack_id',
        ownerEquals('ref($from_stack_id).owner_user_id', '$self_owner_id', kind),
        'ref($from_stack_id).item_id == self.item_id',
        'ref($from_stack_id).quantity >= self.quantity',
        ownerEqualsCaller('ref($to_stack_id).owner_user_id', kind),
        'ref($to_stack_id).item_id == self.item_id',
      ].join(' && '),
    }),
    description:
      "Buy a market listing: buyer wallet → seller wallet payment plus the stack transfer, all atomic; the listing deactivates in the same transaction.",
  });
  functions.push({
    name: names.cancelMarketFn,
    containerTypeName: names.marketType,
    returnType: 'bool',
    mutations: [{ target: 'self', property: 'active', expression: 'false' }],
    returnExpression: 'self.active',
    invokePolicyJson: kitPolicyJson({
      type: 'condition',
      expression: 'self.active && $self_owner_id == $caller_user_id',
    }),
    description: 'Take a market listing down (seller only).',
  });

  const automations: KitAutomationSpec[] = [];
  if (options.restock) {
    functions.push({
      name: names.restockFn,
      containerTypeName: names.listingType,
      returnType: 'int',
      parameters: [
        {
          name: 'amount',
          valueType: 'int',
          required: true,
          description: 'Units to add per tick (clamped to max_stock).',
        },
      ],
      mutations: [
        {
          target: 'self',
          property: 'stock',
          expression: 'min(self.max_stock, self.stock + max(0, $amount))',
        },
      ],
      returnExpression: 'self.stock',
      invokePolicyJson: kitPolicyJson({ type: 'is_automation' }),
      autonomousInvocable: true,
      description: 'Server-driven shop restock tick (automation-only).',
    });
    automations.push({
      name: names.restockAutomation,
      functionName: names.restockFn,
      targetMode: 'type',
      targetTypeName: names.listingType,
      triggerType: 'schedule',
      scheduleKind: 'interval',
      intervalMs: options.restock.intervalMs,
      maxTargets: 32,
      selectorJson: JSON.stringify({
        selfWhere: [{ key: 'stock', op: '<', value: 'self.max_stock' }],
      }),
      paramsJson: JSON.stringify({ amount: options.restock.amount ?? 1 }),
      description: 'Periodically restocks shop listings below their max_stock.',
    });
  }

  return {
    name: names.walletType,
    containerTypes: [
      {
        typeName: names.walletType,
        displayName: names.walletType,
        instantiableBy: 'member',
        description: 'A per-player wallet holding currency balances.',
      },
      {
        typeName: names.listingType,
        displayName: names.listingType,
        instantiableBy: 'admin',
        description: 'A studio-priced shop listing (catalog row) players buy from.',
      },
      {
        typeName: names.tradeType,
        displayName: names.tradeType,
        instantiableBy: 'member',
        description: 'A player-to-player escrow trade offer, swapped atomically on accept.',
      },
      {
        typeName: names.marketType,
        displayName: names.marketType,
        instantiableBy: 'member',
        description: 'A player market listing paid straight into the seller wallet.',
      },
    ],
    propertyDefinitions,
    functions,
    ...(automations.length ? { automations } : {}),
  };
}
