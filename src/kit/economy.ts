import type { GameModelAPI } from '../domains/gameModel.js';
import type { Scalars, SeedPropertyInput } from '../generated/graphql.js';
import {
  economyCurrencyFn,
  economyNames,
  type EconomyNames,
} from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link EconomyKit}. Must match the deployed economy blueprint. */
export interface EconomyKitOptions {
  /** The `typePrefix` the economy blueprint was deployed with. */
  typePrefix?: string;
  /** The `currencies` the blueprint was deployed with. Defaults to `['gold']`. */
  currencies?: string[];
}

/** A parsed view of one wallet. */
export interface KitWallet {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  /** Balance per currency property. */
  balances: Record<string, number>;
}

/** A parsed view of one shop listing. */
export interface KitShopListing {
  containerId: string;
  displayName: string;
  itemId: string;
  price: number;
  stock: number;
  maxStock: number;
}

/** A parsed view of one escrow trade offer. */
export interface KitTradeOffer {
  containerId: string;
  displayName: string;
  /** The offer creator (server-assigned container owner). */
  fromUserId: string | null;
  toUserId: number;
  giveStackId: string;
  receiveStackId: string;
  giveItemId: string;
  giveQty: number;
  wantItemId: string;
  wantQty: number;
  status: string;
}

/** A parsed view of one market listing. */
export interface KitMarketListing {
  containerId: string;
  displayName: string;
  /** The seller (server-assigned container owner). */
  sellerUserId: string | null;
  stackId: string;
  itemId: string;
  quantity: number;
  price: number;
  active: boolean;
}

/**
 * Runtime helpers for the {@link economyBlueprint} conventions: wallets with
 * per-currency balances, shop purchases, escrow trades, and player market
 * listings. Every movement of currency or items is a single gated invoke —
 * balances, stock, item identity, and ownership are all verified
 * server-side, and a denial resolves with `success: false` (never an
 * exception).
 *
 * `earn` is a trusted grant: with the default blueprint authority
 * (`'server'`) it succeeds only for app admins — call it from studio/backend
 * code, or drive grants through automations instead.
 *
 * Obtained via `client.kit(appId).economy`.
 */
export class EconomyKit {
  private readonly names: EconomyNames;
  private readonly typePrefix: string;
  private readonly currencies: string[];

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: EconomyKitOptions = {},
  ) {
    this.typePrefix = options.typePrefix ?? '';
    this.names = economyNames(this.typePrefix);
    this.currencies = options.currencies ?? ['gold'];
  }

  private get defaultCurrency(): string {
    return this.currencies[0];
  }

  /**
   * Find the player's wallet, creating it when absent (member-instantiable;
   * the server assigns ownership to the caller). Sets the `owner_user_id`
   * mirror property the blueprint's guards read.
   *
   * @param ownerUserId - The calling player's user id (decimal string).
   */
  async ensureWallet(
    ownerUserId: Scalars['BigInt']['input'],
    options: { displayName?: string; sessionId?: string } = {},
  ) {
    const existing = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.walletType,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    });
    const mine = existing.find(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    if (mine) return mine;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.walletType,
      displayName: options.displayName ?? `Wallet ${ownerUserId}`,
      ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(ownerUserId) },
      ],
    });
  }

  /** Read one currency balance (default: the blueprint's first currency). */
  async balance(walletId: string, currency?: string): Promise<number> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      walletId,
    );
    return Number(props[currency ?? this.defaultCurrency] ?? 0);
  }

  /** Read a wallet with every configured currency balance parsed. */
  async wallet(walletId: string): Promise<KitWallet> {
    const container = await this.gameModel.container({
      appId: this.appId,
      containerId: walletId,
    });
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      walletId,
    );
    const balances: Record<string, number> = {};
    for (const c of this.currencies) balances[c] = Number(props[c] ?? 0);
    return {
      containerId: container.containerId,
      displayName: container.displayName,
      ownerUserId: container.ownerUserId != null ? String(container.ownerUserId) : null,
      balances,
    };
  }

  /**
   * Mint currency into a wallet — a **trusted** grant (default blueprint
   * authority: app admins only). Resolves with the new balance.
   */
  async earn(
    walletId: string,
    amount: number,
    currency?: string,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: economyCurrencyFn(
        'earn',
        currency ?? this.defaultCurrency,
        this.typePrefix,
      ),
      selfContainerId: walletId,
      params: { amount },
    });
  }

  /**
   * Spend currency from the caller's own wallet. The server refuses to
   * overdraw. Resolves with the new balance.
   */
  async spend(
    walletId: string,
    amount: number,
    currency?: string,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: economyCurrencyFn(
        'spend',
        currency ?? this.defaultCurrency,
        this.typePrefix,
      ),
      selfContainerId: walletId,
      params: { amount },
    });
  }

  /** Shop (admin-priced listings; atomic buys). */
  readonly shop = {
    /**
     * Create a shop listing (admin — the type is admin-instantiable).
     * `maxStock` feeds the optional restock automation.
     */
    create: async (input: {
      displayName: string;
      itemId: string;
      price: number;
      stock?: number;
      maxStock?: number;
      properties?: SeedPropertyInput[];
    }) => {
      return this.gameModel.createContainer({
        appId: this.appId,
        typeName: this.names.listingType,
        displayName: input.displayName,
        properties: [
          { key: 'item_id', valueType: 'string', valueJson: JSON.stringify(input.itemId) },
          { key: 'price', valueType: 'int', valueJson: String(input.price) },
          { key: 'stock', valueType: 'int', valueJson: String(input.stock ?? 0) },
          {
            key: 'max_stock',
            valueType: 'int',
            valueJson: String(input.maxStock ?? input.stock ?? 0),
          },
          ...(input.properties ?? []),
        ],
      });
    },

    /** List shop listings with parsed state. */
    list: async (): Promise<KitShopListing[]> => {
      const containers = await this.gameModel.containers({
        appId: this.appId,
        typeName: this.names.listingType,
      });
      return Promise.all(
        containers.map(async (c) => {
          const props = await kitContainerProperties(
            this.gameModel,
            String(this.appId),
            c.containerId,
          );
          return {
            containerId: c.containerId,
            displayName: c.displayName,
            itemId: String(props.item_id ?? ''),
            price: Number(props.price ?? 0),
            stock: Number(props.stock ?? 0),
            maxStock: Number(props.max_stock ?? 0),
          };
        }),
      );
    },

    /**
     * Buy one unit: wallet debit + stock decrement + item grant into
     * `toStackId` (a stack of the listed item), all in one transaction.
     * Resolves with the wallet's remaining balance.
     */
    buy: async (input: {
      listingId: string;
      walletId: string;
      toStackId: string;
    }): Promise<KitInvokeResult<number>> => {
      return kitInvoke<number>(this.gameModel, {
        appId: String(this.appId),
        functionName: this.names.buyListingFn,
        selfContainerId: input.listingId,
        params: { wallet_id: input.walletId, to_stack_id: input.toStackId },
      });
    },
  };

  /** Escrow trades (player↔player item swaps, atomic on accept). */
  readonly trades = {
    /**
     * Create a trade offer to another player. The stacks named here are the
     * OFFERER's: `giveStackId` is the escrowed source, `receiveStackId`
     * receives the wanted items when the trade is accepted. The offer's
     * container ownership (server-assigned to the caller) is what the accept
     * guards trust — a forged offer over someone else's stacks can never be
     * accepted.
     */
    offer: async (input: {
      toUserId: Scalars['BigInt']['input'];
      giveStackId: string;
      giveItemId: string;
      giveQty: number;
      wantItemId: string;
      wantQty: number;
      receiveStackId: string;
      displayName?: string;
      sessionId?: string;
    }) => {
      return this.gameModel.createContainer({
        appId: this.appId,
        typeName: this.names.tradeType,
        displayName:
          input.displayName ??
          `Trade ${input.giveQty}x ${input.giveItemId} for ${input.wantQty}x ${input.wantItemId}`,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        properties: [
          { key: 'to_user_id', valueType: 'int', valueJson: String(input.toUserId) },
          {
            key: 'give_stack_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.giveStackId),
          },
          {
            key: 'receive_stack_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.receiveStackId),
          },
          {
            key: 'give_item_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.giveItemId),
          },
          { key: 'give_qty', valueType: 'int', valueJson: String(input.giveQty) },
          {
            key: 'want_item_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.wantItemId),
          },
          { key: 'want_qty', valueType: 'int', valueJson: String(input.wantQty) },
        ],
      });
    },

    /**
     * Accept a trade as the invited player, supplying YOUR two stacks: the
     * one paying the wanted items and the one receiving the given items. The
     * offerer's stacks come from the offer record. All four quantity writes
     * commit atomically or not at all.
     */
    accept: async (input: {
      offerId: string;
      wantStackId: string;
      toGiveStackId: string;
    }): Promise<KitInvokeResult<string>> => {
      const offer = await this.trades.get(input.offerId);
      return kitInvoke<string>(this.gameModel, {
        appId: String(this.appId),
        functionName: this.names.acceptTradeFn,
        selfContainerId: input.offerId,
        params: {
          give_stack_id: offer.giveStackId,
          to_give_stack_id: input.toGiveStackId,
          want_stack_id: input.wantStackId,
          to_want_stack_id: offer.receiveStackId,
        },
      });
    },

    /** Cancel an open trade (either party may). */
    cancel: async (offerId: string): Promise<KitInvokeResult<string>> => {
      return kitInvoke<string>(this.gameModel, {
        appId: String(this.appId),
        functionName: this.names.cancelTradeFn,
        selfContainerId: offerId,
        params: {},
      });
    },

    /** Read one trade offer with parsed state. */
    get: async (offerId: string): Promise<KitTradeOffer> => {
      const container = await this.gameModel.container({
        appId: this.appId,
        containerId: offerId,
      });
      return this.toTrade(
        container.containerId,
        container.displayName,
        container.ownerUserId != null ? String(container.ownerUserId) : null,
      );
    },

    /** List trades the user created or was invited to (open ones first). */
    listMine: async (userId: Scalars['BigInt']['input']): Promise<KitTradeOffer[]> => {
      const containers = await this.gameModel.containers({
        appId: this.appId,
        typeName: this.names.tradeType,
      });
      const all = await Promise.all(
        containers.map((c) =>
          this.toTrade(
            c.containerId,
            c.displayName,
            c.ownerUserId != null ? String(c.ownerUserId) : null,
          ),
        ),
      );
      const uid = String(userId);
      return all
        .filter((t) => t.fromUserId === uid || String(t.toUserId) === uid)
        .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'));
    },
  };

  /** Player market (list a stack for currency; atomic purchases). */
  readonly market = {
    /**
     * List items for sale: names YOUR escrowed source stack and the ask
     * price. Payment lands straight in your wallet when someone buys.
     */
    list: async (input: {
      stackId: string;
      itemId: string;
      quantity: number;
      price: number;
      displayName?: string;
      sessionId?: string;
    }) => {
      return this.gameModel.createContainer({
        appId: this.appId,
        typeName: this.names.marketType,
        displayName:
          input.displayName ?? `${input.quantity}x ${input.itemId} for ${input.price}`,
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        properties: [
          {
            key: 'stack_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.stackId),
          },
          {
            key: 'item_id',
            valueType: 'string',
            valueJson: JSON.stringify(input.itemId),
          },
          { key: 'quantity', valueType: 'int', valueJson: String(input.quantity) },
          { key: 'price', valueType: 'int', valueJson: String(input.price) },
        ],
      });
    },

    /** Browse market listings (active ones only by default). */
    browse: async (
      options: { includeInactive?: boolean } = {},
    ): Promise<KitMarketListing[]> => {
      const containers = await this.gameModel.containers({
        appId: this.appId,
        typeName: this.names.marketType,
      });
      const all = await Promise.all(
        containers.map(async (c) => {
          const props = await kitContainerProperties(
            this.gameModel,
            String(this.appId),
            c.containerId,
          );
          return {
            containerId: c.containerId,
            displayName: c.displayName,
            sellerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
            stackId: String(props.stack_id ?? ''),
            itemId: String(props.item_id ?? ''),
            quantity: Number(props.quantity ?? 0),
            price: Number(props.price ?? 0),
            active: props.active === true,
          };
        }),
      );
      return options.includeInactive ? all : all.filter((l) => l.active);
    },

    /**
     * Buy a market listing: pays the seller's wallet and transfers the items
     * into `toStackId` in one transaction. The seller's wallet and source
     * stack are resolved from the listing. Resolves with the buyer wallet's
     * remaining balance.
     */
    buy: async (input: {
      listingId: string;
      walletId: string;
      toStackId: string;
    }): Promise<KitInvokeResult<number>> => {
      const container = await this.gameModel.container({
        appId: this.appId,
        containerId: input.listingId,
      });
      const props = await kitContainerProperties(
        this.gameModel,
        String(this.appId),
        input.listingId,
      );
      if (container.ownerUserId == null) {
        throw new Error('Market listing has no seller (unowned container)');
      }
      const sellerWallet = await this.ensureSellerWallet(String(container.ownerUserId));
      return kitInvoke<number>(this.gameModel, {
        appId: String(this.appId),
        functionName: this.names.buyMarketFn,
        selfContainerId: input.listingId,
        params: {
          wallet_id: input.walletId,
          seller_wallet_id: sellerWallet,
          from_stack_id: String(props.stack_id ?? ''),
          to_stack_id: input.toStackId,
        },
      });
    },

    /** Take a listing down (seller only). */
    cancel: async (listingId: string): Promise<KitInvokeResult<boolean>> => {
      return kitInvoke<boolean>(this.gameModel, {
        appId: String(this.appId),
        functionName: this.names.cancelMarketFn,
        selfContainerId: listingId,
        params: {},
      });
    },
  };

  /** Find an existing wallet container id for a user (no creation). */
  private async ensureSellerWallet(sellerUserId: string): Promise<string> {
    const wallets = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.walletType,
    });
    const wallet = wallets.find(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === sellerUserId,
    );
    if (!wallet) {
      throw new Error(
        `Seller ${sellerUserId} has no ${this.names.walletType}; they must ensureWallet() before selling`,
      );
    }
    return wallet.containerId;
  }

  private async toTrade(
    containerId: string,
    displayName: string,
    ownerUserId: string | null,
  ): Promise<KitTradeOffer> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      containerId,
    );
    return {
      containerId,
      displayName,
      fromUserId: ownerUserId,
      toUserId: Number(props.to_user_id ?? 0),
      giveStackId: String(props.give_stack_id ?? ''),
      receiveStackId: String(props.receive_stack_id ?? ''),
      giveItemId: String(props.give_item_id ?? ''),
      giveQty: Number(props.give_qty ?? 0),
      wantItemId: String(props.want_item_id ?? ''),
      wantQty: Number(props.want_qty ?? 0),
      status: String(props.status ?? ''),
    };
  }
}
