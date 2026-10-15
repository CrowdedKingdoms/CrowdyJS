import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface TacticsUnitStats {
  hp: number;
  attack: number;
  defense: number;
  moves: number;
  range: number;
}

export interface TacticsUnit {
  id: number;
  team: 'players' | 'enemies';
  /** The player it belongs to; null for the hub's. */
  owner: number | null;
  x: number;
  z: number;
  hp: number;
  stats: TacticsUnitStats;
  moved: boolean;
  acted: boolean;
}

/** What the `battle` topic carries. */
export interface TacticsBattleView {
  phase: 'lobby' | 'players' | 'enemies' | 'won' | 'lost';
  round: number;
  width: number;
  height: number;
  obstacles: Array<[number, number]>;
  units: TacticsUnit[];
  players: number[];
  host: number | null;
  /** Players who ended this phase's turn. */
  ended_turn: number[];
  /** When the players' phase runs out (Unix ms). */
  phase_ends: number | null;
  log: string[];
}

/** Grid battles (the `tactics` starter): {@link battle} by key. */
export class TacticsKit {
  private readonly battles = new Map<string, TacticsBattle>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'tactics',
  ) {}

  battle(key: string): TacticsBattle {
    let b = this.battles.get(key);
    if (!b) {
      b = new TacticsBattle(this.runtime, this.nodeType, key);
      this.battles.set(key, b);
    }
    return b;
  }
}

/**
 * One battle in turns: each player's unit moves (within its move points, around obstacles and
 * units) and attacks once a phase; when every player ends their turn, or the phase's time runs
 * out, the hub's units act. The battle ends when one side has no unit standing.
 */
export class TacticsBattle {
  /** The `battle` topic: the whole battle. */
  readonly battle: HubState<TacticsBattleView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.battle = new HubState<TacticsBattleView>(runtime, nodeType, key, 'battle');
  }

  watch(): Promise<TacticsBattleView> {
    return this.battle.start();
  }

  unwatch(): Promise<void> {
    return this.battle.stop();
  }

  /** The player's units, as the mirror last saw them. */
  async myUnits(): Promise<TacticsUnit[]> {
    const me = await this.runtime.playerId();
    return (this.battle.get()?.units ?? []).filter((u) => me !== null && String(u.owner) === me);
  }

  /** @throws {KitError} `started`, `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  /** @throws {KitError} `forbidden` (the host starts it), `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /**
   * Moves the player's unit to `(x, z)`.
   * @throws {KitError} `not_your_turn`, `conflict` (it moved), `out_of_reach`, `not_member`.
   */
  move(x: number, z: number): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'move', { x, z }, { action: true });
  }

  /**
   * Attacks unit `target` with the player's unit.
   * @throws {KitError} `not_your_turn`, `conflict` (it attacked), `out_of_reach`, `forbidden` (its own side), `not_found`.
   */
  attack(target: number): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'attack', { target }, { action: true });
  }

  /** Ends the player's turn this phase. */
  endTurn(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'end_turn', null, { action: true });
  }
}
