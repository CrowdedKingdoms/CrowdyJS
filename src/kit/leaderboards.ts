import type { GameModelAPI } from '../domains/gameModel.js';
import type { EngineDetector } from './engine.js';
import type { Scalars } from '../generated/graphql.js';
import {
  leaderboardsNames,
  type LeaderboardsNames,
} from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link LeaderboardsKit}. Must match the deployed blueprint. */
export interface LeaderboardsKitOptions {
  /** The board engine module for server-computed rankings. Defaults to `'board-engine'`. */
  engineModuleName?: string;
  /** The `typePrefix` the leaderboards blueprint was deployed with. */
  typePrefix?: string;
}

/** A parsed view of one leaderboard entry. */
export interface KitLeaderboardEntry {
  containerId: string;
  displayName: string;
  ownerUserId: string | null;
  boardId: string;
  score: number;
  season: number;
  /** 1-based position AFTER client-side sorting (not the stamped `rank` property). */
  position: number;
}

/**
 * Runtime helpers for the {@link leaderboardsBlueprint} conventions: ensure
 * per-player entries, submit scores (trusted — host by default), and rank.
 * There is no server-side ORDER BY on container lists, so reads fetch a
 * board's entries and sort client-side — fine for the few hundred entries a
 * per-app board holds.
 *
 * Obtained via `client.kit(appId).leaderboards`.
 */
export class LeaderboardsKit {
  private readonly names: LeaderboardsNames;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    options: LeaderboardsKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.names = leaderboardsNames(options.typePrefix ?? '');
    this.engineModuleName = options.engineModuleName ?? 'board-engine';
  }

  private readonly engineModuleName: string;

  // -- Engine path (Wave 2): server-computed rankings --------------------------

  /**
   * Is a board compute engine deployed + enabled (cached per session)? When
   * true, rankings are computed SERVER-side (tie-aware ranks, percentiles,
   * pages) instead of the blueprint's client-sorted reads.
   */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.engineModuleName);
  }

  /** A server-ranked page (rank/percentile computed module-side). */
  async engineTop(boardId: string, page = 0, perPage = 10) {
    return this.engineInvoke('top', { boardId, page, perPage });
  }

  /** Your (or a subject's) server-computed ranked row. */
  async engineRankOf(boardId: string, subjectId?: string) {
    return this.engineInvoke('rank_of', subjectId ? { boardId, subjectId } : { boardId });
  }

  /** Submit YOUR OWN score (personal-best semantics) to an engine board. */
  async engineSubmitSelf(boardId: string, score: number) {
    return this.engineInvoke('submit_self', { boardId, score });
  }

  /** Frozen season snapshots (top rows per rolled season). */
  async engineSeasons(boardId: string) {
    return this.engineInvoke('seasons', { boardId });
  }

  private async engineInvoke(exportName: string, params: Record<string, unknown>) {
    if (!this.engines) {
      throw new Error('board engine unavailable: compute domain not wired');
    }
    const result = await this.engines.invoke(this.engineModuleName, exportName, params);
    if (!result.success) {
      throw new Error(`leaderboards.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }

  /** Find-or-create a player's entry on a board. */
  async ensureEntry(
    ownerUserId: Scalars['BigInt']['input'],
    boardId: string,
    options: { displayName?: string } = {},
  ) {
    const entries = await this.board(boardId);
    const mine = entries.find((e) => e.ownerUserId === String(ownerUserId));
    if (mine) {
      return this.gameModel.container({
        appId: this.appId,
        containerId: mine.containerId,
      });
    }
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.entryType,
      displayName: options.displayName ?? `${boardId} ${ownerUserId}`,
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(ownerUserId) },
        { key: 'board_id', valueType: 'string', valueJson: JSON.stringify(boardId) },
      ],
    });
  }

  /**
   * Submit a score — a **trusted** call (host by default per the blueprint's
   * `submitAuthority`). Resolves with the entry's (possibly kept-best)
   * score.
   */
  async submit(entryId: string, points: number): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.submitFn,
      selfContainerId: entryId,
      params: { points },
    });
  }

  /** All entries of one board, sorted best-first with 1-based positions. */
  async board(boardId: string): Promise<KitLeaderboardEntry[]> {
    const containers = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.entryType,
    });
    const rows = await Promise.all(
      containers.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          displayName: c.displayName,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          boardId: String(props.board_id ?? ''),
          score: Number(props.score ?? 0),
          season: Number(props.season ?? 1),
          position: 0,
        };
      }),
    );
    return rows
      .filter((r) => r.boardId === boardId)
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, position: i + 1 }));
  }

  /** The top `n` of a board (client-side ranking). */
  async top(boardId: string, n = 10): Promise<KitLeaderboardEntry[]> {
    return (await this.board(boardId)).slice(0, n);
  }

  /**
   * The entries around one player on a board (`radius` above and below),
   * for "your neighborhood" widgets.
   */
  async around(
    boardId: string,
    userId: Scalars['BigInt']['input'],
    radius = 2,
  ): Promise<KitLeaderboardEntry[]> {
    const entries = await this.board(boardId);
    const index = entries.findIndex((e) => e.ownerUserId === String(userId));
    if (index === -1) return [];
    return entries.slice(Math.max(0, index - radius), index + radius + 1);
  }

  /** The board's current season (max season across its entries; 1 when empty). */
  async season(boardId: string): Promise<number> {
    const entries = await this.board(boardId);
    return entries.reduce((max, e) => Math.max(max, e.season), 1);
  }
}
