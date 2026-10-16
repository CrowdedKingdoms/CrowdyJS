import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';
import { WritableKitStore, type KitStore } from '../store.js';

/** A player's place in a queue, as the matchmaker's `status` (and every change) answers it. */
export type MatchPlace =
  | { state: 'idle' }
  | { state: 'party'; leader: number; members: number[]; confirmed: number[]; expires_in_ms: number }
  | { state: 'queued'; rating: number; waited_ms: number; window: number }
  | { state: 'proposed'; players: number[]; accepted: number[]; expires_in_ms: number }
  | { state: 'matched'; session: string };

/** What the `queue` topic carries: how many, never who. */
export interface MatchQueueCounts {
  waiting: number;
  proposals: number;
  forming: number;
}

/** A queue's settings (developers). */
export interface MatchmakerConfig {
  players_per_match?: number;
  /** The rating difference a player accepts at first, and how it widens each second. */
  window?: number;
  widen_per_sec?: number;
  max_window?: number;
  accept_ms?: number;
  /** How long a party has for its members to confirm. */
  party_ms?: number;
}

/** Joining a queue: alone, as a party's leader (`party`: the others), or confirming (`leader`). */
export interface MatchJoin {
  rating: number;
  party?: ReadonlyArray<number | string>;
  leader?: number | string;
}

/** Where the matchmaker hubs are: type `matchmaker`, one per queue name, in the starter pack. */
export interface MatchmakingKitOptions {
  nodeType?: string;
}

/** Matchmaking queues (the `matchmaker` starter): {@link queue} by name. */
export class MatchmakingKit {
  private readonly queues = new Map<string, MatchQueue>();
  private readonly nodeType: string;

  constructor(
    private readonly runtime: KitRuntime,
    options: MatchmakingKitOptions = {},
  ) {
    this.nodeType = options.nodeType ?? 'matchmaker';
  }

  /** The queue named `name` (`ranked`, `casual`, ...), one per name. */
  queue(name: string): MatchQueue {
    let q = this.queues.get(name);
    if (!q) {
      q = new MatchQueue(this.runtime, this.nodeType, name);
      this.queues.set(name, q);
    }
    return q;
  }
}

const ACTIVE: ReadonlySet<MatchPlace['state']> = new Set(['party', 'queued', 'proposed']);

/**
 * One queue. Every call's answer updates {@link place}; {@link watch} keeps it current while
 * the player waits (the queue never names its players on its topic, so a waiting client asks)
 * and fires {@link onMatched} with the session key once a match is made.
 */
export class MatchQueue {
  /** The `queue` topic: how many are waiting. */
  readonly counts: HubState<MatchQueueCounts>;
  private readonly placeStore = new WritableKitStore<MatchPlace>({ state: 'idle' });
  private readonly matchedListeners = new Set<(session: string) => void>();
  private lastMatched: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly name: string,
  ) {
    this.counts = new HubState<MatchQueueCounts>(runtime, nodeType, name, 'queue');
  }

  /** The player's place, as last answered. */
  get place(): KitStore<MatchPlace> {
    return this.placeStore;
  }

  private settle(p: MatchPlace): MatchPlace {
    this.placeStore.set(p);
    if (p.state === 'matched' && p.session !== this.lastMatched) {
      this.lastMatched = p.session;
      for (const l of [...this.matchedListeners]) l(p.session);
    }
    return p;
  }

  /**
   * Joins the queue (or updates the rating). With `party`, the caller leads a party of them;
   * each member then joins with `leader`, and the party queues once all have.
   * @throws {KitError} `conflict` (a match to accept), `limit` (party size), `forbidden`, `full`.
   */
  async join(req: MatchJoin): Promise<MatchPlace> {
    const args: Record<string, unknown> = { rating: req.rating };
    if (req.party?.length) args.party = req.party.map(Number);
    if (req.leader !== undefined) args.leader = Number(req.leader);
    return this.settle(await this.runtime.call<MatchPlace>(this.nodeType, this.name, 'join', args, { action: true }));
  }

  /** Leaves the queue, a forming party, or a proposed match (the party leaves with you). */
  async leave(): Promise<boolean> {
    const left = await this.runtime.call<boolean>(this.nodeType, this.name, 'leave', null, { action: true });
    this.settle({ state: 'idle' });
    return left;
  }

  /** Accepts the proposed match; the answer is `matched` once everyone has. */
  async accept(): Promise<MatchPlace> {
    return this.settle(await this.runtime.call<MatchPlace>(this.nodeType, this.name, 'accept', null, { action: true }));
  }

  /** Declines the proposed match; the others go back to the queue. */
  async decline(): Promise<boolean> {
    const done = await this.runtime.call<boolean>(this.nodeType, this.name, 'decline', null, { action: true });
    this.settle({ state: 'idle' });
    return done;
  }

  /** Asks for the player's place. */
  async status(): Promise<MatchPlace> {
    return this.settle(await this.runtime.call<MatchPlace>(this.nodeType, this.name, 'status'));
  }

  /** Sets the queue's config. Developers only (a developer kit). */
  configure(config: MatchmakerConfig): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.name, 'configure', config, { action: true });
  }

  /**
   * Asks for the player's place every `intervalMs` (default 2 000) while they wait in a party,
   * the queue or a proposal. Returns the function that stops it.
   */
  watch(intervalMs = 2_000): () => void {
    this.unwatch();
    this.timer = setInterval(() => {
      if (ACTIVE.has(this.placeStore.get().state)) void this.status().catch(() => undefined);
    }, Math.max(500, intervalMs));
    return () => this.unwatch();
  }

  unwatch(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Called with the session key when a match is made for the player. */
  onMatched(listener: (session: string) => void): () => void {
    this.matchedListeners.add(listener);
    return () => this.matchedListeners.delete(listener);
  }
}
