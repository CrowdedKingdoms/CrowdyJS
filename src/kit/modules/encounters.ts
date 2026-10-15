import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface EncounterEnemy {
  id: number;
  kind: string;
  x: number;
  z: number;
  hp: number;
  max_hp: number;
  boss: boolean;
  /** Ticks until its next step. */
  wait: number;
}

export interface EncounterTower {
  x: number;
  z: number;
  owner: number;
}

/** What the `encounter` topic's snapshots carry. */
export interface EncounterView {
  phase: 'lobby' | 'running' | 'won' | 'lost';
  players: number[];
  width: number;
  height: number;
  spawn: [number, number];
  base: [number, number];
  base_hp: number;
  gold: number;
  /** The wave under way. */
  wave: number | null;
  waves: number;
  /** When the next wave starts, while one counts down (Unix ms). */
  next_wave_at: number | null;
  enemies: EncounterEnemy[];
  towers: EncounterTower[];
  boss_phase: number;
  /** Kills by player id (the keys are the ids as text). */
  kills: Record<string, number>;
}

/** Waves, towers and bosses (the `director` starter): {@link encounter} by key. */
export class EncountersKit {
  private readonly encounters = new Map<string, Encounter>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'director',
  ) {}

  encounter(key: string): Encounter {
    let e = this.encounters.get(key);
    if (!e) {
      e = new Encounter(this.runtime, this.nodeType, key);
      this.encounters.set(key, e);
    }
    return e;
  }
}

/**
 * One encounter: waves of enemies down a lane to the players' base, towers the players build (a
 * tower may not cut the lane), strikes on a cooldown, kills that pay gold, and a boss that changes
 * phase as it weakens. {@link view} mirrors the `encounter` topic: snapshots once a second while it
 * runs, and `event` messages (`type`: `wave_started`, `wave_cleared`, `boss_phase`, `won`, `lost`)
 * through `view.onEvent`.
 */
export class Encounter {
  readonly view: HubState<EncounterView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<EncounterView>(runtime, nodeType, key, 'encounter');
  }

  watch(): Promise<EncounterView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** @throws {KitError} `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  /** The first to join, or a developer. @throws {KitError} `forbidden`, `started`, `bad_request` (no way to the base). */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /**
   * Builds a tower at `(x, z)`; resolves with the gold left.
   * @throws {KitError} `blocks_lane`, `insufficient` (gold), `conflict` (taken), `bad_request`, `not_member`.
   */
  build(x: number, z: number): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'build', { x, z }, { action: true });
  }

  /** Strikes enemy `enemy`; resolves with its hp left. @throws {KitError} `cooldown`, `not_found`, `not_member`. */
  hit(enemy: number): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'hit', { enemy }, { action: true });
  }
}
