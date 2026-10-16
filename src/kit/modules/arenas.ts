import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface ArenaFighter {
  player: number;
  class: string;
  x: number;
  z: number;
  hp: number;
  max_hp: number;
  /** What casts spend; it regenerates. */
  resource: number;
  statuses: string[];
  kills: number;
  deaths: number;
  /** Down, until the respawn. */
  down: boolean;
}

export interface ArenaShot {
  ability: string;
  caster: number;
  x: number;
  z: number;
}

export interface ArenaBlast {
  ability: string;
  caster: number;
  x: number;
  z: number;
  radius: number;
  /** When it goes off (Unix ms). */
  at: number;
}

/** What the `arena` topic's snapshots carry. */
export interface ArenaView {
  phase: 'waiting' | 'running' | 'finished';
  width: number;
  depth: number;
  fighters: ArenaFighter[];
  projectiles: ArenaShot[];
  areas: ArenaBlast[];
  kill_target: number;
  ends_at: number | null;
  winner: number | null;
}

/** Real-time arenas (the `arena` starter): {@link arena} by key. */
export class ArenasKit {
  private readonly arenas = new Map<string, ArenaMatch>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'arena',
  ) {}

  arena(key: string): ArenaMatch {
    let a = this.arenas.get(key);
    if (!a) {
      a = new ArenaMatch(this.runtime, this.nodeType, key);
      this.arenas.set(key, a);
    }
    return a;
  }
}

/**
 * One arena: players fight with their class's abilities and the hub referees every hit. A
 * client reports where its player is ({@link move}, a few times a second) and the hub keeps what
 * the class's speed allows; casts are checked for cooldown, resource and range, and land as the hub
 * decides. {@link view} mirrors the `arena` topic (up to five snapshots a second); its `event`
 * messages (`type`: `cast`, `impact`, `kill`, `respawn`, `violation`, `removed`, `finished`) come
 * through `view.onEvent`.
 */
export class ArenaMatch {
  readonly view: HubState<ArenaView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<ArenaView>(runtime, nodeType, key, 'arena');
  }

  watch(): Promise<ArenaView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** Joins as `heroClass` (the starter's are `warrior` and `mage`). @throws {KitError} `bad_request`, `full`, `started`. */
  join(heroClass: string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', { class: heroClass }, { action: true });
  }

  leave(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'leave', null, { action: true });
  }

  /** The first to join, or a developer. @throws {KitError} `forbidden`, `not_ready` (one fighter), `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /**
   * Reports where the player is; resolves with the position the hub kept (a move too fast is cut
   * short, a jump refused). Not sent with an action id: the next report replaces it.
   * @throws {KitError} `forbidden` (removed for movement the warden refused), `conflict` (down).
   */
  move(x: number, z: number): Promise<[number, number]> {
    return this.runtime.call<[number, number]>(this.nodeType, this.key, 'move', { x, z });
  }

  /**
   * Casts `ability` aimed at `(x, z)`; resolves with whether a hit-scan strike hit someone at once
   * (a projectile or an area lands later, as an `impact` event).
   * @throws {KitError} `cooldown`, `insufficient` (resource), `out_of_reach`, `not_found` (not the class's).
   */
  cast(ability: string, x: number, z: number): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'cast', { ability, x, z }, { action: true });
  }
}
