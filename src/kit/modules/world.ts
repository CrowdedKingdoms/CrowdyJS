import { CollectionMirror, HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

/** What the `world` topic carries: the world's conditions now. */
export interface WorldConditions {
  /** 0 at midnight, 0.5 at noon. */
  time_of_day: number;
  night: boolean;
  /** `clear`, `rain`, `storm` or `fog` in the starter. */
  weather: string;
  /** The active liveops events' modifiers; where events overlap they multiply. */
  modifiers: Record<string, number>;
}

/** A resource node, as `state` lists it. */
export interface WorldResourceNode {
  id: number;
  amount: number;
  /** When it grows back (Unix ms), while it is empty. */
  regrow_at: number | null;
}

/** A liveops event: between `start_ms` and `end_ms` its modifiers apply. */
export interface WorldLiveopsEvent {
  name: string;
  start_ms: number;
  end_ms: number;
  modifiers?: Record<string, number>;
}

/** What the world hub's `state` answers. */
export interface WorldView {
  conditions: WorldConditions;
  /** Game time since the world began, advanced only while it runs. */
  clock_ms: number;
  nodes: WorldResourceNode[];
  events: WorldLiveopsEvent[];
  /** Players in the app. */
  online: number;
}

/** Where the world hub is: the root hub, `world` with an empty key, in the starter pack. */
export interface WorldKitOptions {
  nodeType?: string;
  key?: string;
}

/**
 * The root world hub (the `world-tick` starter): its clock, weather and liveops modifiers as a
 * mirrored {@link conditions} topic, its resource nodes as a mirrored {@link nodes} collection,
 * harvesting, and for developers the liveops schedule. The root hub takes 50 calls a second for
 * the whole app, so read it from the mirrors (`conditions.start()`), not by polling `state`.
 */
export class WorldKit {
  /** The `world` topic: conditions now. `start()` it to keep it current. */
  readonly conditions: HubState<WorldConditions>;
  /** The `nodes` topic: each resource node's `amount` and `regrow_at`, by node id. */
  readonly nodes: CollectionMirror;
  private readonly nodeType: string;
  private readonly key: string;

  constructor(
    private readonly runtime: KitRuntime,
    options: WorldKitOptions = {},
  ) {
    this.nodeType = options.nodeType ?? 'world';
    this.key = options.key ?? '';
    this.conditions = new HubState<WorldConditions>(runtime, this.nodeType, this.key, 'world');
    this.nodes = new CollectionMirror(runtime, this.nodeType, this.key, 'nodes');
  }

  /** Everything the world shows: conditions, clock, nodes, events, players online. */
  state(): Promise<WorldView> {
    return this.runtime.call<WorldView>(this.nodeType, this.key, 'state');
  }

  /**
   * Takes one from resource node `node`; resolves with what it holds now.
   * @throws {KitError} `cooldown`, `empty` (it grows back), `not_found`.
   */
  harvest(node: number): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.key, 'harvest', { node }, { action: true });
  }

  /** Schedules (or replaces) a liveops event. Developers only (a developer kit). */
  schedule(event: WorldLiveopsEvent): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'schedule', event, { action: true });
  }

  /** Cancels a liveops event; resolves with whether there was one. Developers only. */
  cancel(name: string): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'cancel', { name }, { action: true });
  }
}
