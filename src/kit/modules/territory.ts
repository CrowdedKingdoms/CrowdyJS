import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface TerritoryPoint {
  id: string;
  owner: string | null;
  /** The faction pressing a capture, and how far it is, 0 to 1. */
  capturing: string | null;
  progress: number;
  /** Members on the point at the last scan, by faction. */
  present: Record<string, number>;
}

/** What the `territory` topic carries. */
export interface TerritoryView {
  phase: 'open' | 'won';
  points: TerritoryPoint[];
  scores: Record<string, number>;
  /** Members by faction. */
  members: Record<string, number>;
  winner: string | null;
}

export interface ZoneContender {
  player: number;
  hp: number;
  /** Outside the circle at the last scan. */
  outside: boolean;
  /** 1 for the winner; set as each player is eliminated. */
  place: number | null;
}

/** What the `zone` topic carries. */
export interface ZoneView {
  phase: 'lobby' | 'running' | 'finished';
  /** The circle's centre, in chunks. */
  center: [number, number];
  radius: number;
  /** The phase under way, and the radius it shrinks to. */
  stage: number | null;
  next_radius: number | null;
  players: ZoneContender[];
  alive: number;
  winner: number | null;
}

/** Control points and shrinking circles (the `territory` starter, types `territory` and `zone`). */
export class TerritoryKit {
  private readonly maps = new Map<string, TerritoryMap>();
  private readonly zones = new Map<string, ZoneMatch>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly territoryType = 'territory',
    private readonly zoneType = 'zone',
  ) {}

  /** The war on map `key`. */
  map(key: string): TerritoryMap {
    let m = this.maps.get(key);
    if (!m) {
      m = new TerritoryMap(this.runtime, this.territoryType, key);
      this.maps.set(key, m);
    }
    return m;
  }

  /** The circle of match `key`. */
  zone(key: string): ZoneMatch {
    let z = this.zones.get(key);
    if (!z) {
      z = new ZoneMatch(this.runtime, this.zoneType, key);
      this.zones.set(key, z);
    }
    return z;
  }
}

/**
 * One war over a map's control points: a faction captures a point by having more members standing
 * on it than any other (the hub reads where players are; a client never says it is on a point),
 * a capture decays when nobody presses it, each point held pays its faction, and the first to the
 * winning score wins. `view.onEvent` hears `captured`, `income` and `won`.
 */
export class TerritoryMap {
  readonly view: HubState<TerritoryView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<TerritoryView>(runtime, nodeType, key, 'territory');
  }

  watch(): Promise<TerritoryView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** Joins a faction, once: a player keeps theirs. @throws {KitError} `conflict`, `bad_request`, `full`. */
  join(faction: string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', { faction }, { action: true });
  }

  /** A new war. Developers only. */
  reset(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'reset', null, { action: true });
  }
}

/**
 * One match's circle: it holds, then shrinks, phase by phase, and wears down every player outside
 * it (the hub reads where players are) until one is left. `view.onEvent` hears `warning`,
 * `shrinking`, `settled`, `final`, `eliminated` and `won`.
 */
export class ZoneMatch {
  readonly view: HubState<ZoneView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<ZoneView>(runtime, nodeType, key, 'zone');
  }

  watch(): Promise<ZoneView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** @throws {KitError} `started`, `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  /** The first to join, or a developer. @throws {KitError} `forbidden`, `not_ready`, `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }
}
