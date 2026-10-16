import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface DuelSeat {
  player: number;
  wins: number;
  /** Whether this round's throw is in (never which). */
  thrown: boolean;
}

export interface DuelReveal {
  round: number;
  /** Each seat's throw, in seat order; null when it was not in on time. */
  hands: Array<string | null>;
  winner: number | null;
}

/** What the `duel` topic carries: who has thrown, never what, until the reveal. */
export interface DuelView {
  phase: 'waiting' | 'playing' | 'finished';
  seats: DuelSeat[];
  best_of: number;
  round: number;
  /** When this round closes (Unix ms). */
  deadline: number | null;
  last: DuelReveal | null;
  winner: number | null;
}

/** Two-player duels of hidden throws (the `minigame` starter): {@link duel} by table. */
export class MinigamesKit {
  private readonly duels = new Map<string, Duel>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'minigame',
  ) {}

  duel(key: string): Duel {
    let d = this.duels.get(key);
    if (!d) {
      d = new Duel(this.runtime, this.nodeType, key);
      this.duels.set(key, d);
    }
    return d;
  }
}

/**
 * One duel: the hub keeps each round's throws until both are in (or the round's time runs out),
 * then reveals them; the first to win a majority of `best_of` rounds wins. The starter's game is
 * rock, paper, scissors.
 */
export class Duel {
  readonly view: HubState<DuelView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<DuelView>(runtime, nodeType, key, 'duel');
  }

  watch(): Promise<DuelView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** Takes a seat; resolves with whether this seat started the first round. @throws {KitError} `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  /** Before the duel starts. @throws {KitError} `started`. */
  leave(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'leave', null, { action: true });
  }

  /**
   * The caller's hidden throw this round; resolves with whether it completed the round.
   * @throws {KitError} `conflict` (already in, or no round open), `bad_request` (not a hand), `not_member`.
   */
  throw(hand: string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'throw', { hand }, { action: true });
  }

  /** Once it is over: play again. @throws {KitError} `conflict`, `not_member`. */
  rematch(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'rematch', null, { action: true });
  }
}
