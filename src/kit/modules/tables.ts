import { HubState, PrivateState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

/** The last thing done at a table. */
export interface CardPlayed {
  player: number;
  card: string | null;
  /** `play`, `draw` or `pass`. */
  action: string;
}

/** What the `table` topic carries: the public table, never a hand. */
export interface CardTableView {
  phase: 'lobby' | 'playing' | 'finished';
  players: number[];
  host: number | null;
  /** Cards in each player's hand, by player id (the keys are the ids as text). */
  hand_counts: Record<string, number>;
  top: string | null;
  /** The suit in play (an eight names one). */
  suit: string | null;
  draw_count: number;
  turn: number | null;
  turn_ends: number | null;
  last: CardPlayed | null;
  winner: number | null;
  scores: Record<string, number>;
}

/** The caller's hand, as `hand` answers it. */
export interface CardHand {
  cards: string[];
  /** The cards the rule lets them play now. */
  playable: string[];
  /** Whether they drew this turn (and may pass). */
  drawn: boolean;
}

/** Card tables (the `deck` starter): {@link table} by key. */
export class TablesKit {
  private readonly tables = new Map<string, CardTable>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'deck',
  ) {}

  table(key: string): CardTable {
    let t = this.tables.get(key);
    if (!t) {
      t = new CardTable(this.runtime, this.nodeType, key);
      this.tables.set(key, t);
    }
    return t;
  }
}

/**
 * One table with true hidden information: the deck and every hand live in the hub, and a player
 * reads only their own hand ({@link hand}, read again whenever the hub's `changed` message names
 * them). The starter's game is crazy eights.
 */
export class CardTable {
  /** The `table` topic: the public table. */
  readonly table: HubState<CardTableView>;
  /** The caller's hand: never on the topic. */
  readonly hand: PrivateState<CardHand>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.table = new HubState<CardTableView>(runtime, nodeType, key, 'table');
    this.hand = new PrivateState<CardHand>(runtime, {
      nodeType,
      key,
      topic: 'table',
      what: 'hand',
      read: () => runtime.call<CardHand>(nodeType, key, 'hand'),
    });
  }

  /** Mirrors the table and the caller's hand. */
  async watch(): Promise<CardTableView> {
    const [view] = await Promise.all([this.table.start(), this.hand.start()]);
    return view;
  }

  async unwatch(): Promise<void> {
    await Promise.all([this.table.stop(), this.hand.stop()]);
  }

  /** @throws {KitError} `started`, `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  leave(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'leave', null, { action: true });
  }

  /** Deals (the host, from two players). @throws {KitError} `forbidden`, `too_few_players`, `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /**
   * Plays a card from the caller's hand; an eight names `suit` (`S`, `H`, `D` or `C`).
   * @throws {KitError} `not_your_turn`, `not_found` (not in the hand), `not_playable` (the rule),
   *   `bad_request` (an eight without a suit).
   */
  play(card: string, suit?: string): Promise<boolean> {
    const args = suit === undefined ? { card } : { card, suit };
    return this.runtime.call<boolean>(this.nodeType, this.key, 'play', args, { action: true });
  }

  /** Draws a card (once a turn). @throws {KitError} `not_your_turn`, `conflict`, `empty`. */
  draw(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'draw', null, { action: true });
  }

  /** Passes, after drawing. @throws {KitError} `conflict` (draw first). */
  pass(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'pass', null, { action: true });
  }
}
