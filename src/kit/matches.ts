import type { ChannelsAPI } from '../domains/channels.js';
import type { EngineDetector } from './engine.js';
import type { GameModelAPI } from '../domains/gameModel.js';
import type { UdpAPI } from '../domains/udp.js';
import type { Scalars } from '../generated/graphql.js';
import { encodeBase64, generateCrowdyUuid } from '../utils.js';
import { matchesNames, type MatchesNames } from './blueprints/index.js';
import {
  kitContainerProperties,
  kitInvoke,
  type KitInvokeResult,
} from './shared.js';

/** Options for {@link MatchesKit}. Must match the deployed matches blueprint. */
export interface MatchesKitOptions {
  /**
   * The compute module driving server-side match lifecycle when the app
   * runs an engine. Defaults to `'match-engine'`.
   */
  engineModuleName?: string;
  /** The `typePrefix` the matches blueprint was deployed with. */
  typePrefix?: string;
  /**
   * The 32-ASCII-char actor uuid used as the sender id on channel pings.
   * Defaults to a random uuid per kit instance.
   */
  actorUuid?: string;
}

/** A parsed view of one match. */
export interface KitMatch {
  /** The session backing the match (participants + turn order). */
  sessionId: string;
  /** The MatchMeta container id (the `self` of the lifecycle functions). */
  metaId: string;
  displayName: string;
  creatorUserId: number;
  mode: string;
  state: string;
  round: number;
  maxPlayers: number;
  winnerUserId: number;
  /** The per-match notification channel (0 when none was wired). */
  channelId: string;
  /** Present when the blueprint was deployed with `turnTick`. */
  tickCount?: number;
  /**
   * The current turn's sequence number. Present only when the blueprint was
   * deployed with `turnTimer`, which is how the helpers detect that turns
   * carry a deadline.
   */
  turnSeq?: number;
  /** The highest turn sequence whose deadline elapsed. See {@link turnExpired}. */
  turnExpiredSeq?: number;
}

/**
 * Whether the match's current turn has run out of time — true once the
 * deadline for the open turn has fired. Always false for a match deployed
 * without `turnTimer`, and false for a deadline stranded by an earlier turn,
 * since those record a lower sequence than the one now open.
 */
export function turnExpired(match: KitMatch): boolean {
  if (match.turnSeq === undefined || match.turnExpiredSeq === undefined) return false;
  return match.turnSeq > 0 && match.turnExpiredSeq >= match.turnSeq;
}

/** One row of the match standings. */
export interface KitMatchScore {
  containerId: string;
  ownerUserId: string | null;
  points: number;
}

/**
 * Runtime helpers for the {@link matchesBlueprint} conventions: sessions ARE
 * the match primitive — `create` makes a session + a `MatchMeta` + a
 * per-match channel; turn order goes through the platform's session-turn
 * authority; lifecycle functions ping the channel post-commit and
 * {@link onMatchChanged} wraps the notify-to-pull loop (subscribe →
 * `"match_changed"` ping → re-pull state).
 *
 * Obtained via `client.kit(appId).matches`.
 */
export class MatchesKit {
  private readonly names: MatchesNames;
  private readonly actorUuid: string;
  private readonly engineModuleName: string;

  constructor(
    private readonly appId: Scalars['BigInt']['input'],
    private readonly gameModel: GameModelAPI,
    private readonly channels: ChannelsAPI | undefined,
    private readonly udp: UdpAPI | undefined,
    options: MatchesKitOptions = {},
    private readonly engines?: EngineDetector,
  ) {
    this.names = matchesNames(options.typePrefix ?? '');
    this.engineModuleName = options.engineModuleName ?? 'match-engine';
    this.actorUuid = options.actorUuid ?? generateCrowdyUuid();
  }

  private requireChannels(): ChannelsAPI {
    if (!this.channels) {
      throw new Error(
        'kit.matches needs the channels domain — construct the kit via client.kit(appId)',
      );
    }
    return this.channels;
  }

  private requireUdp(): UdpAPI {
    if (!this.udp) {
      throw new Error(
        'kit.matches needs the udp domain — construct the kit via client.kit(appId)',
      );
    }
    return this.udp;
  }

  /**
   * Create a match: a session (the platform match primitive), a per-match
   * notification channel, and the session-scoped `MatchMeta`.
   *
   * @param input.creatorUserId - The calling player's user id (stored so the
   *   creator may start/advance/end the match).
   */
  async create(input: {
    creatorUserId: Scalars['BigInt']['input'];
    mode?: string;
    maxPlayers?: number;
    displayName?: string;
  }): Promise<KitMatch> {
    const session = await this.gameModel.createSession({
      appId: this.appId,
      name: input.displayName ?? `match-${input.mode ?? 'default'}`,
    });
    const channel = await this.requireChannels().create({
      appId: this.appId,
      name: `match-${session.sessionId}`,
      description: 'Per-match notification channel (kit.matches notify-to-pull).',
    });
    const meta = await this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.metaType,
      displayName: input.displayName ?? `Match ${session.sessionId}`,
      sessionId: session.sessionId,
      properties: [
        {
          key: 'creator_user_id',
          valueType: 'int',
          valueJson: String(input.creatorUserId),
        },
        { key: 'mode', valueType: 'string', valueJson: JSON.stringify(input.mode ?? '') },
        {
          key: 'max_players',
          valueType: 'int',
          valueJson: String(input.maxPlayers ?? 0),
        },
        { key: 'channel_id', valueType: 'int', valueJson: String(channel.groupId) },
      ],
    });
    return this.toMatch(meta.containerId, session.sessionId, meta.displayName);
  }

  /** List joinable matches (metas still in the lobby state). */
  async open(): Promise<KitMatch[]> {
    const metas = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.metaType,
    });
    const matches = await Promise.all(
      metas
        .filter((m) => m.sessionId != null)
        .map((m) => this.toMatch(m.containerId, String(m.sessionId), m.displayName)),
    );
    return matches.filter((m) => m.state === 'lobby');
  }

  /** Read one match by its MatchMeta container. */
  async get(metaId: string): Promise<KitMatch> {
    const meta = await this.gameModel.container({
      appId: this.appId,
      containerId: metaId,
    });
    return this.toMatch(
      meta.containerId,
      meta.sessionId != null ? String(meta.sessionId) : '',
      meta.displayName,
    );
  }

  /** Join a match: session participation + the notification channel. */
  async join(match: KitMatch) {
    const participant = await this.gameModel.joinSession({
      appId: this.appId,
      sessionId: match.sessionId,
    });
    if (match.channelId !== '0' && match.channelId !== '') {
      await this.requireChannels().join(match.channelId);
    }
    return participant;
  }

  /** Start the match (creator or host). Pings the match channel post-commit. */
  async start(match: KitMatch): Promise<KitInvokeResult<string>> {
    return kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.startFn,
      selfContainerId: match.metaId,
      sessionId: match.sessionId,
      params: {},
    });
  }

  /** Advance to the next round (creator or host). */
  async advanceRound(match: KitMatch): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.advanceRoundFn,
      selfContainerId: match.metaId,
      sessionId: match.sessionId,
      params: {},
    });
  }

  /** Whether it is `userId`'s session turn right now. */
  async myTurn(
    match: KitMatch,
    userId: Scalars['BigInt']['input'],
  ): Promise<boolean> {
    const session = await this.gameModel.session({
      appId: this.appId,
      sessionId: match.sessionId,
    });
    return (
      session.currentTurnUserId != null &&
      String(session.currentTurnUserId) === String(userId)
    );
  }

  /**
   * Pass the turn to the next player via the platform's session-turn
   * authority (current holder, host, or admin — enforced by the service),
   * then ping the match channel so everyone re-pulls.
   *
   * For a match deployed with `turnTimer`, this opens the incoming turn first
   * so it arrives with a deadline already running. Opening it before the
   * handover also means the outgoing holder is still the session's turn user,
   * which is what authorizes them to do it.
   */
  async endTurn(match: KitMatch, nextUserId: Scalars['BigInt']['input']) {
    if (match.turnSeq !== undefined) await this.beginTurn(match);
    const session = await this.gameModel.setSessionTurn({
      appId: this.appId,
      sessionId: match.sessionId,
      userId: nextUserId,
    });
    await this.notifyChanged(match);
    return session;
  }

  /**
   * Open a turn and arm its deadline (`turnTimer` deployments only) — the
   * deadline replaces any still pending for this match. `endTurn` calls this
   * for you; call it directly to give the current player a fresh clock, e.g.
   * after granting extra time.
   */
  async beginTurn(match: KitMatch): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.beginTurnFn,
      selfContainerId: match.metaId,
      sessionId: match.sessionId,
      params: {},
    });
  }

  /**
   * Cancel the pending turn deadline for this match, if any. Returns how many
   * timers were dropped. Ending a match already strands its deadline, so this
   * is only needed when you want turns to stop being timed while play
   * continues.
   */
  async cancelTurnDeadline(match: KitMatch): Promise<number> {
    return this.gameModel.cancelTimer({
      appId: this.appId,
      dedupeKey: `match_turn:${match.metaId}`,
    });
  }

  /** Find-or-create a player's session-scoped Score row. */
  async ensureScore(match: KitMatch, ownerUserId: Scalars['BigInt']['input']) {
    const scores = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.scoreType,
      sessionId: match.sessionId,
    });
    const mine = scores.find(
      (c) => c.ownerUserId != null && String(c.ownerUserId) === String(ownerUserId),
    );
    if (mine) return mine;
    return this.gameModel.createContainer({
      appId: this.appId,
      typeName: this.names.scoreType,
      displayName: `Score ${ownerUserId}`,
      sessionId: match.sessionId,
      properties: [
        { key: 'owner_user_id', valueType: 'int', valueJson: String(ownerUserId) },
      ],
    });
  }

  /**
   * Add points to a Score row — trusted (host-refereed by default).
   * Resolves with the new points.
   */
  async score(
    match: KitMatch,
    scoreId: string,
    points: number,
  ): Promise<KitInvokeResult<number>> {
    return kitInvoke<number>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.scoreFn,
      selfContainerId: scoreId,
      sessionId: match.sessionId,
      params: { points },
    });
  }

  /** The match standings, highest points first (client-side sort). */
  async standings(match: KitMatch): Promise<KitMatchScore[]> {
    const scores = await this.gameModel.containers({
      appId: this.appId,
      typeName: this.names.scoreType,
      sessionId: match.sessionId,
    });
    const rows = await Promise.all(
      scores.map(async (c) => {
        const props = await kitContainerProperties(
          this.gameModel,
          String(this.appId),
          c.containerId,
        );
        return {
          containerId: c.containerId,
          ownerUserId: c.ownerUserId != null ? String(c.ownerUserId) : null,
          points: Number(props.points ?? 0),
        };
      }),
    );
    return rows.sort((a, b) => b.points - a.points);
  }

  /**
   * Finish the match and record the winner (creator or host). Also drops the
   * pending turn deadline on a `turnTimer` match — `end_match` already
   * strands it, so this just saves the pointless fire and channel ping.
   */
  async finish(
    match: KitMatch,
    winnerUserId: Scalars['BigInt']['input'],
  ): Promise<KitInvokeResult<string>> {
    const result = await kitInvoke<string>(this.gameModel, {
      appId: String(this.appId),
      functionName: this.names.endFn,
      selfContainerId: match.metaId,
      sessionId: match.sessionId,
      params: { winner_user_id: Number(winnerUserId) },
    });
    if (result.success && match.turnSeq !== undefined) {
      await this.cancelTurnDeadline(match);
    }
    return result;
  }

  /**
   * Manually ping the match channel with `"match_changed"` (the lifecycle
   * functions do this automatically via their declared notifications; use
   * this after out-of-band changes such as `endTurn`).
   */
  async notifyChanged(match: KitMatch): Promise<boolean> {
    if (match.channelId === '0' || match.channelId === '') return false;
    return this.requireUdp().sendChannelMessage({
      channelId: match.channelId,
      uuid: this.actorUuid,
      payload: encodeBase64(new TextEncoder().encode('match_changed')),
    });
  }

  /**
   * The notify-to-pull loop, wrapped: subscribe to the app's notifications,
   * and on every ping of THIS match's channel re-pull the match state and
   * hand it to `callback`. Returns the unsubscribe function.
   */
  onMatchChanged(match: KitMatch, callback: (match: KitMatch) => void): () => void {
    return this.requireUdp().subscribe(
      {
        channelMessage: (notification) => {
          if (String(notification.channelId) !== String(match.channelId)) return;
          void this.get(match.metaId).then(callback);
        },
      },
      String(this.appId),
    );
  }

  private async toMatch(
    metaId: string,
    sessionId: string,
    displayName: string,
  ): Promise<KitMatch> {
    const props = await kitContainerProperties(
      this.gameModel,
      String(this.appId),
      metaId,
    );
    return {
      sessionId,
      metaId,
      displayName,
      creatorUserId: Number(props.creator_user_id ?? 0),
      mode: String(props.mode ?? ''),
      state: String(props.state ?? ''),
      round: Number(props.round ?? 0),
      maxPlayers: Number(props.max_players ?? 0),
      winnerUserId: Number(props.winner_user_id ?? 0),
      channelId: String(props.channel_id ?? '0'),
      ...(props.tick_count !== undefined
        ? { tickCount: Number(props.tick_count) }
        : {}),
      ...(props.turn_seq !== undefined ? { turnSeq: Number(props.turn_seq) } : {}),
      ...(props.turn_expired_seq !== undefined
        ? { turnExpiredSeq: Number(props.turn_expired_seq) }
        : {}),
    };
  }

  // -- Engine path (Wave 2): server-driven lifecycle over the match engine --

  /**
   * Is a match compute engine deployed + enabled (cached per session)? When
   * true the engine owns transitions (ready checks, turn order + timeouts,
   * authoritative scoring); the blueprint's creator-driven functions remain
   * for model-only deployments.
   */
  engineAvailable(): Promise<boolean> {
    if (!this.engines) return Promise.resolve(false);
    return this.engines.has(this.engineModuleName);
  }

  /**
   * Declare ready on an engine match (a MatchMeta container id). The match
   * starts server-side once every expected player is ready.
   */
  async engineReady(matchId: string) {
    return this.engineInvoke('ready', { matchId });
  }

  /** Submit your move (the engine validates the turn + resolves). */
  async engineSubmitMove(matchId: string, params: Record<string, unknown> = {}) {
    return this.engineInvoke('submit_move', { matchId, ...params });
  }

  /** Forfeit an engine match. */
  async engineForfeit(matchId: string) {
    return this.engineInvoke('forfeit', { matchId });
  }

  /** The engine's live view: turn holder, timers, standings, summary. */
  async engineStatus(matchId: string) {
    return this.engineInvoke('status', { matchId });
  }

  /**
   * Resolve a matchmaking proposal to the match the engine created for it
   * (poll after everyone accepts; see `kit.matchmaking`).
   */
  async findByProposal(proposalId: string): Promise<string | null> {
    if (!this.engines) return null;
    const result = await this.engines.invoke(this.engineModuleName, 'find_by_proposal', {
      proposalId,
    });
    return result.success ? String(result.body.matchId ?? '') || null : null;
  }

  private async engineInvoke(exportName: string, params: Record<string, unknown>) {
    if (!this.engines) {
      throw new Error('match engine unavailable: compute domain not wired');
    }
    const result = await this.engines.invoke(this.engineModuleName, exportName, params);
    if (!result.success) {
      throw new Error(`matches.${exportName} failed: ${result.reason ?? 'unknown'}`);
    }
    return result.body;
  }
}
