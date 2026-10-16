import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

/** A player's place on a board. */
export interface LeaderboardRank {
  rank: number;
  player: number;
  score: number;
}

/** What the `board` topic carries: the top of the board and the season. */
export interface LeaderboardView {
  season: number;
  /** When the season began (Unix ms). */
  season_started: number;
  /** Players with a score this season. */
  entries: number;
  top: LeaderboardRank[];
}

/** The season, and the last one's final standings. */
export interface LeaderboardSeason {
  season: number;
  started: number;
  entries: number;
  last: LeaderboardRank[];
}

/** A board's settings (developers). */
export interface LeaderboardConfig {
  /** `best` (by `order`), `sum` or `latest` submission. */
  keep?: 'best' | 'sum' | 'latest';
  /** `high` scores rank first (points) or `low` (times). */
  order?: 'high' | 'low';
  top_size?: number;
  /** A cron schedule that ends the season (`0 0 * * 1`: every Monday), or null for none. */
  season_cron?: string | null;
  max_entries?: number;
}

/** Leaderboards (the `leaderboard` starter): {@link board} by name. */
export class LeaderboardsKit {
  private readonly boards = new Map<string, LeaderboardHandle>();

  constructor(
    private readonly runtime: KitRuntime,
    private readonly nodeType = 'leaderboard',
  ) {}

  /** The board named `name` (`weekly-score`, `fastest-lap`, ...). */
  board(name: string): LeaderboardHandle {
    let b = this.boards.get(name);
    if (!b) {
      b = new LeaderboardHandle(this.runtime, this.nodeType, name);
      this.boards.set(name, b);
    }
    return b;
  }
}

/**
 * One board. The hub ranks players itself, and only other hubs and developers submit: a client
 * never sends its own score, the hub that decided the result does (a session, a race, a run).
 * {@link view} mirrors the `board` topic (at most once a second).
 */
export class LeaderboardHandle {
  /** The `board` topic: the top of the board and the season. */
  readonly view: HubState<LeaderboardView>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly name: string,
  ) {
    this.view = new HubState<LeaderboardView>(runtime, nodeType, name, 'board');
  }

  watch(): Promise<LeaderboardView> {
    return this.view.start();
  }

  unwatch(): Promise<void> {
    return this.view.stop();
  }

  /** A page of the board, best first. */
  top(options: { limit?: number; offset?: number } = {}): Promise<LeaderboardRank[]> {
    return this.runtime.call<LeaderboardRank[]>(this.nodeType, this.name, 'top', options);
  }

  /** The places around a player (the caller's own, without `player`). */
  around(options: { player?: number | string; radius?: number } = {}): Promise<LeaderboardRank[]> {
    const args: Record<string, unknown> = {};
    if (options.player !== undefined) args.player = Number(options.player);
    if (options.radius !== undefined) args.radius = options.radius;
    return this.runtime.call<LeaderboardRank[]>(this.nodeType, this.name, 'around', args);
  }

  /** The caller's own place, or null without a score this season. */
  me(): Promise<LeaderboardRank | null> {
    return this.runtime.call<LeaderboardRank | null>(this.nodeType, this.name, 'me');
  }

  season(): Promise<LeaderboardSeason> {
    return this.runtime.call<LeaderboardSeason>(this.nodeType, this.name, 'season');
  }

  /** Submits a score for `player`. Developers only (a developer kit); players are refused. */
  submit(player: number | string, score: number): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.name, 'submit', { player: Number(player), score }, { action: true });
  }

  /** Sets the board's config. Developers only. */
  configure(config: LeaderboardConfig): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.name, 'configure', config, { action: true });
  }

  /** Ends the season now; resolves with the new season. Developers only. */
  roll(): Promise<number> {
    return this.runtime.call<number>(this.nodeType, this.name, 'roll', null, { action: true });
  }
}
