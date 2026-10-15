import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface RaceGate {
  x: number;
  z: number;
  radius: number;
}

export interface RaceRacer {
  player: number;
  x: number;
  z: number;
  lap: number;
  /** The gate the racer must pass next. */
  next_gate: number;
  best_lap_ms: number | null;
  place: number | null;
  total_ms: number | null;
  did_not_finish: boolean;
}

/** What the `race` topic carries. */
export interface RaceView {
  phase: 'lobby' | 'countdown' | 'racing' | 'finished';
  course_id: string;
  gates: RaceGate[];
  laps: number;
  /** When the race starts (Unix ms), once counting down. */
  go_at: number | null;
  /** When the rest's time is up, once the winner is in. */
  closes_at: number | null;
  racers: RaceRacer[];
}

/** The winner's run: `[ms from the start, x, y, z, yaw]` frames to race against. */
export interface RaceGhost {
  player: number;
  total_ms: number;
  frames: Array<[number, number, number, number, number]>;
}

export interface BallPlayer {
  player: number;
  team: 'red' | 'blue';
  x: number;
  z: number;
}

export interface BallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  holder: number | null;
  held_since: number;
  last_touch: number | null;
}

/** What the `ball` topic carries. */
export interface BallView {
  phase: 'lobby' | 'playing' | 'finished';
  width: number;
  depth: number;
  goal_width: number;
  ball: BallState;
  players: BallPlayer[];
  /** Red's, then blue's. */
  score: [number, number];
  ends_at: number | null;
  winner: 'red' | 'blue' | null;
}

/** Races and ball games (the `racing` starter, types `race` and `ball`). */
export class RacingKit {
  private readonly races = new Map<string, Race>();
  private readonly matches = new Map<string, BallMatch>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly raceType = 'race',
    private readonly ballType = 'ball',
  ) {}

  /** The race with key `key`. */
  race(key: string): Race {
    let r = this.races.get(key);
    if (!r) {
      r = new Race(this.runtime, this.raceType, key);
      this.races.set(key, r);
    }
    return r;
  }

  /** The ball game with key `key`. */
  ball(key: string): BallMatch {
    let m = this.matches.get(key);
    if (!m) {
      m = new BallMatch(this.runtime, this.ballType, key);
      this.matches.set(key, m);
    }
    return m;
  }
}

/**
 * One race: a course of gates passed in order, a countdown, laps and splits, places in finishing
 * order, and a ghost of the winner's run. A client reports where its racer is ({@link pos}, a few
 * times a second) and the hub times the positions its movement warden kept. `view.onEvent` hears
 * `go`, `timing` (with its `stage`: `started`, `checkpoint`, `lap`, `finished`), `violation` and
 * `finished`.
 */
export class Race {
  readonly view: HubState<RaceView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<RaceView>(runtime, nodeType, key, 'race');
  }

  watch(): Promise<RaceView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** @throws {KitError} `started`, `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  leave(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'leave', null, { action: true });
  }

  /** Starts the countdown (the first to join, or a developer). @throws {KitError} `forbidden`, `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /** Reports where the racer is; resolves with the position the hub kept. */
  pos(x: number, z: number): Promise<[number, number]> {
    return this.runtime.call<[number, number]>(this.nodeType, this.key, 'pos', { x, z });
  }

  /** The winner's run, once there is one. */
  ghost(): Promise<RaceGhost | null> {
    return this.runtime.call<RaceGhost | null>(this.nodeType, this.key, 'ghost');
  }
}

/**
 * One ball game: two teams, a ball the hub moves (passes, shots, friction, the side walls),
 * possession (claim a loose ball near it, or take it from an opponent whose protection is over), a
 * goal in each end wall. `view.onEvent` hears `claimed`, `passed`, `shot`, `goal`, `violation` and
 * `finished`.
 */
export class BallMatch {
  readonly view: HubState<BallView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<BallView>(runtime, nodeType, key, 'ball');
  }

  watch(): Promise<BallView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** @throws {KitError} `bad_request` (red or blue), `full`, `started`. */
  join(team: 'red' | 'blue'): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', { team }, { action: true });
  }

  /** @throws {KitError} `forbidden`, `not_ready` (each team needs a player), `started`. */
  start(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /** Reports where the player is; resolves with the position the hub kept. */
  pos(x: number, z: number): Promise<[number, number]> {
    return this.runtime.call<[number, number]>(this.nodeType, this.key, 'pos', { x, z });
  }

  /** Claims the ball. @throws {KitError} `out_of_reach`, `cooldown` (too soon, or its holder's protection), `conflict` (a teammate has it). */
  claim(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'claim', null, { action: true });
  }

  /** Passes to a teammate. @throws {KitError} `conflict` (not the holder), `bad_request` (not a teammate). */
  pass(to: number | string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'pass', { to: Number(to) }, { action: true });
  }

  /** Shoots toward `(x, z)`. @throws {KitError} `conflict` (not the holder). */
  shoot(x: number, z: number): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'shoot', { x, z }, { action: true });
  }
}
