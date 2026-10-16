import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export interface InstanceRoom {
  kind: 'fight' | 'treasure' | 'rest' | 'boss';
  /** What a fight here takes. */
  power: number;
  done: boolean;
}

export interface InstanceMember {
  player: number;
  hp: number;
  max_hp: number;
  power: number;
}

/** What the `run` topic carries. */
export interface InstanceRunView {
  phase: 'unopened' | 'running' | 'cleared' | 'wiped' | 'abandoned' | 'expired';
  owner: number | null;
  /** The run's seed: the same seed lays out the same floors. */
  seed: number;
  floor: number;
  floors: number;
  /** The room the party is at on this floor. */
  room: number;
  rooms: InstanceRoom[];
  members: InstanceMember[];
  invited: number[];
  gold: number;
  relics: string[];
  /** The grid reserved for the run, when the hub's config has a volume. */
  grid: number | null;
  log: string[];
}

/** Private runs for one party (the `instance` starter): {@link run} by key. */
export class InstancesKit {
  private readonly runs = new Map<string, InstanceRun>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'instance',
  ) {}

  /** The run with key `key` (a key the game makes up, one per run). */
  run(key: string): InstanceRun {
    let r = this.runs.get(key);
    if (!r) {
      r = new InstanceRun(this.runtime, this.nodeType, key);
      this.runs.set(key, r);
    }
    return r;
  }
}

/**
 * One run: a party plays down floors the hub generates from the run's seed, the hub resolves each
 * room, a party with nobody standing is wiped (permadeath), and a run nobody touches expires. A
 * cleared or wiped run posts each member's depth to a leaderboard when the hub's config names one.
 */
export class InstanceRun {
  readonly view: HubState<InstanceRunView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.view = new HubState<InstanceRunView>(runtime, nodeType, key, 'run');
  }

  watch(): Promise<InstanceRunView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /**
   * Opens the run as its owner (a developer kit opens one for `party`); resolves with its seed.
   * @throws {KitError} `started`, `bad_request` (party size), `conflict` (its grid could not be reserved).
   */
  open(options: { seed?: number; party?: ReadonlyArray<number | string> } = {}): Promise<number> {
    const args: Record<string, unknown> = {};
    if (options.seed !== undefined) args.seed = options.seed;
    if (options.party?.length) args.party = options.party.map(Number);
    return this.runtime.call<number>(this.nodeType, this.key, 'open', args, { action: true });
  }

  /** The owner invites a player. @throws {KitError} `forbidden`, `full`. */
  invite(player: number | string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'invite', { player: Number(player) }, { action: true });
  }

  /** An invited player joins. @throws {KitError} `forbidden`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  /**
   * Resolves the room the party is at; resolves with what happened, as the log has it.
   * @throws {KitError} `not_member`, `forbidden` (the caller is down), `conflict` (descend first), `finished`.
   */
  enter(): Promise<string> {
    return this.runtime.call<string>(this.nodeType, this.key, 'enter', null, { action: true });
  }

  /** The owner leads the party to the next floor; resolves with it. @throws {KitError} `not_ready` (rooms left), `forbidden`. */
  descend(): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'descend', null, { action: true });
  }

  /** The owner (or a developer) ends the run. */
  abandon(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'abandon', null, { action: true });
  }
}
