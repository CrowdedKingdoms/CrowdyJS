import { HubState, PrivateState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';
import type { EconBundle } from './player.js';

export interface VendorOfferView {
  item: string;
  price: EconBundle;
  /** Left on the shelf; null for no limit. */
  stock: number | null;
  per_player: number | null;
  /** What the vendor pays for one; null when it does not buy them. */
  buys_for: EconBundle | null;
}

export interface VendorView {
  id: string;
  offers: VendorOfferView[];
  restocked_at: number;
}

export interface MarketQuote {
  bid: number | null;
  ask: number | null;
  last: number | null;
}

/** What the `market` topic carries. */
export interface MarketView {
  vendors: VendorView[];
  currency: string;
  quotes: Record<string, MarketQuote>;
  open_trades: number;
  pending_steps: number;
}

export interface MarketBook {
  item: string;
  currency: string;
  /** `[price, count]` a level, best first. */
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  last: number | null;
}

export interface MarketOrder {
  id: number;
  player: number;
  item: string;
  side: 'buy' | 'sell';
  price: number;
  count: number;
  /** What is still open. */
  open: number;
  /** The hold that backs it, in the player's hub. */
  hold: string;
}

export interface MarketPlaced {
  order: number;
  /** `[price, count]` it traded at once. */
  fills: Array<[number, number]>;
  open: number;
}

export interface MarketTradeSide {
  bundle: EconBundle;
  hold: string | null;
  accepted: boolean;
}

export interface MarketTrade {
  id: number;
  players: [number, number];
  sides: [MarketTradeSide, MarketTradeSide];
  state: 'open' | 'settling' | 'done' | 'cancelled';
  expires_at: number;
  offers: number;
}

const TOPIC = 'market';

/** One market hub's mirrors and calls, shared by its market, shop and trade handles. */
export class MarketCore {
  readonly view: HubState<MarketView>;
  /** The caller's open orders, read again when the market says they moved. */
  readonly orders: PrivateState<MarketOrder[]>;
  /** The caller's open and settling trades. */
  readonly trades: PrivateState<MarketTrade[]>;

  constructor(
    readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<MarketView>(runtime, nodeType, key, TOPIC);
    const source = { nodeType, key, topic: TOPIC };
    this.orders = new PrivateState(runtime, { ...source, what: 'orders', read: () => runtime.call<MarketOrder[]>(nodeType, key, 'orders') });
    this.trades = new PrivateState(runtime, { ...source, what: 'trades', read: () => runtime.call<MarketTrade[]>(nodeType, key, 'trades') });
  }

  change<T>(method: string, args: unknown): Promise<T> {
    return this.runtime.call<T>(this.nodeType, this.key, method, args, { action: true });
  }
}

/** Markets' order books (the `market` starter): {@link at} a market by its name. */
export class MarketsKit {
  constructor(private readonly core: (key: string) => MarketCore) {}

  at(key = 'town'): MarketHandle {
    return new MarketHandle(this.core(key));
  }
}

/**
 * A market's order books: limit orders matched at price-time priority. An order holds what it
 * offers in the player's own hub until it fills or is cancelled; the market moves each fill
 * between the two players' hubs.
 */
export class MarketHandle {
  constructor(private readonly core: MarketCore) {}

  get view(): HubState<MarketView> {
    return this.core.view;
  }

  get orders(): PrivateState<MarketOrder[]> {
    return this.core.orders;
  }

  async watch(): Promise<MarketView> {
    const [view] = await Promise.all([this.core.view.start(), this.core.orders.start()]);
    return view;
  }

  async unwatch(): Promise<void> {
    await Promise.all([this.core.view.stop(), this.core.orders.stop()]);
  }

  book(item: string): Promise<MarketBook> {
    return this.core.runtime.call<MarketBook>(this.core.nodeType, this.core.key, 'book', { item });
  }

  /**
   * Places a limit order; a buy holds `price * count` of the market's currency, a sell the items.
   * @throws {KitError} `insufficient`, `limit` (open orders), `not_found` (no book), `unavailable`.
   */
  order(order: { item: string; side: 'buy' | 'sell'; price: number; count: number }): Promise<MarketPlaced> {
    return this.core.change<MarketPlaced>('order', order);
  }

  /** Cancels an open order; what it still holds comes back. @throws {KitError} `not_found`. */
  cancel(order: number): Promise<boolean> {
    return this.core.change<boolean>('cancel', { order });
  }
}

/** Markets' vendors (the `market` starter): {@link at} a market by its name. */
export class ShopsKit {
  constructor(private readonly core: (key: string) => MarketCore) {}

  at(key = 'town'): ShopHandle {
    return new ShopHandle(this.core(key));
  }
}

/** A market's vendors: fixed prices, stock that restocks, a limit per player. */
export class ShopHandle {
  constructor(private readonly core: MarketCore) {}

  get view(): HubState<MarketView> {
    return this.core.view;
  }

  watch(): Promise<MarketView> {
    return this.core.view.start();
  }

  unwatch(): Promise<void> {
    return this.core.view.stop();
  }

  vendors(): Promise<VendorView[]> {
    return this.core.runtime.call<VendorView[]>(this.core.nodeType, this.core.key, 'vendors');
  }

  /** Buys `count` (one by default). @throws {KitError} `insufficient` (gold or stock), `limit`, `full`, `not_found`, `unavailable`. */
  buy(vendor: string, item: string, count?: number): Promise<EconBundle> {
    return this.core.change<EconBundle>('buy', count === undefined ? { vendor, item } : { vendor, item, count });
  }

  /** Sells `count` (one by default). @throws {KitError} `forbidden` (it does not buy them), `insufficient`, `unavailable`. */
  sell(vendor: string, item: string, count?: number): Promise<EconBundle> {
    return this.core.change<EconBundle>('sell', count === undefined ? { vendor, item } : { vendor, item, count });
  }
}

/** Trades between two players at a market: {@link at} a market by its name. */
export class TradesKit {
  constructor(private readonly core: (key: string) => MarketCore) {}

  at(key = 'town'): TradeDesk {
    return new TradeDesk(this.core(key));
  }
}

/**
 * Trades between two players: each offers a bundle, held in their own hub; when both accept
 * the last offers, the market moves each to the other. A changed offer clears both acceptances.
 */
export class TradeDesk {
  constructor(private readonly core: MarketCore) {}

  get mine(): PrivateState<MarketTrade[]> {
    return this.core.trades;
  }

  async watch(): Promise<MarketTrade[]> {
    return this.core.trades.start();
  }

  unwatch(): Promise<void> {
    return this.core.trades.stop();
  }

  /** Opens a trade with `player`; resolves with its id. */
  open(player: number | string): Promise<number> {
    return this.core.change<number>('trade', { with: Number(player) });
  }

  /** Offers `bundle` (held at once; an empty one withdraws). @throws {KitError} `insufficient`, `forbidden`, `finished`. */
  offer(trade: number, bundle: Partial<EconBundle>): Promise<boolean> {
    return this.core.change<boolean>('offer', { trade, bundle });
  }

  /** Accepts the offers as they stand; resolves with the trade's state. @throws {KitError} `not_ready`, `finished`. */
  accept(trade: number): Promise<MarketTrade['state']> {
    return this.core.change<MarketTrade['state']>('accept', { trade });
  }

  /** Calls it off; what each offered comes back. */
  decline(trade: number): Promise<boolean> {
    return this.core.change<boolean>('decline', { trade });
  }
}
