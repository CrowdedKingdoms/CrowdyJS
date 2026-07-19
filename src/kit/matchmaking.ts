import type { Scalars } from '../generated/graphql.js';
import type { EngineDetector } from './engine.js';

/** Options for {@link MatchmakingKit}. */
export interface MatchmakingKitOptions {
  /** The matchmaking module name. Defaults to `'matchmaking'`. */
  moduleName?: string;
}

/** Your queue status: where you are queued and any live proposal. */
export interface KitQueueStatus {
  queuedIn: string | null;
  proposal: {
    proposalId: string;
    mode: string;
    players: string[];
    accepted: string[];
    handedOff: boolean;
  } | null;
  queueDepth: number;
  rating: number;
}

/**
 * Runtime helpers for the matchmaking engine (Wave 2): rating-bucketed
 * queues with widening windows, party blocks, and accept-gated proposals
 * that hand off to the match layer over compute events. After everyone
 * accepts, resolve the created match with `kit.matches.findByProposal`.
 *
 * Obtained via `client.kit(appId).matchmaking`.
 */
export class MatchmakingKit {
  private readonly moduleName: string;

  constructor(
    _appId: Scalars['BigInt']['input'],
    private readonly engines: EngineDetector,
    options: MatchmakingKitOptions = {},
  ) {
    this.moduleName = options.moduleName ?? 'matchmaking';
  }

  /** Is the matchmaking engine deployed + enabled (cached per session)? */
  engineAvailable(): Promise<boolean> {
    return this.engines.has(this.moduleName);
  }

  /**
   * Join a queue (optionally with a party block that must match together,
   * and an explicit rating for games that keep rating on the progression
   * layer).
   */
  async queueJoin(input: { mode?: string; rating?: number; party?: string[] } = {}) {
    return this.invoke('queue_join', input as Record<string, unknown>);
  }

  /** Leave your queue (all modes, or one with `mode`). */
  async queueLeave(mode?: string) {
    return this.invoke('queue_leave', mode ? { mode } : {});
  }

  /** Your queue/proposal status. */
  async queueStatus(mode?: string): Promise<KitQueueStatus> {
    const body = await this.invoke('queue_status', mode ? { mode } : {});
    return {
      queuedIn: body.queuedIn != null ? String(body.queuedIn) : null,
      proposal: (body.proposal as KitQueueStatus['proposal']) ?? null,
      queueDepth: Number(body.queueDepth ?? 0),
      rating: Number(body.rating ?? 0),
    };
  }

  /** Accept a proposal; when everyone has, the match handoff fires. */
  async accept(proposalId: string) {
    return this.invoke('accept', { proposalId });
  }

  /** Report the decided result (Elo-lite rating update + proposal close). */
  async reportResult(proposalId: string, winnerUserId: string) {
    return this.invoke('report_result', { proposalId, winnerUserId });
  }

  /** Engine totals (queues/proposals/rated players). */
  async status() {
    return this.invoke('status', {});
  }

  private async invoke(exportName: string, params: Record<string, unknown>) {
    const result = await this.engines.invoke(this.moduleName, exportName, params);
    if (!result.success) {
      throw new Error(`matchmaking.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
