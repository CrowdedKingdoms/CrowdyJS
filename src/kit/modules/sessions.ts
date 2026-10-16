import { HubState } from '../mirror.js';
import type { KitRuntime } from '../runtime.js';

export type SessionPhase = 'lobby' | 'playing' | 'finished';

export interface SessionConfig {
  min_players: number;
  max_players: number;
  turn_ms: number;
  target_score: number;
  max_rounds: number;
  /** A lobby nobody joins closes after this long. */
  lobby_idle_ms: number;
}

export interface SessionMove {
  player: number;
  round: number;
  /** null when the player ran out of time. */
  points: number | null;
}

/** A session as everyone sees it: what `state` answers and the `session` topic carries. */
export interface SessionState {
  config: SessionConfig;
  phase: SessionPhase;
  /** Only these players may join, when set (a matchmaker's reservation). */
  reserved: number[];
  players: number[];
  ready: number[];
  connected: number[];
  host: number | null;
  turn: number;
  round: number;
  /** Scores by player id (the keys are the ids as text). */
  scores: Record<string, number>;
  winner: number | null;
  moves: SessionMove[];
}

/** Where the session hubs are: type `session`, one per session key, in the starter pack. */
export interface SessionsKitOptions {
  nodeType?: string;
}

/** Game sessions (the `session` starter): {@link open} one by its key. */
export class SessionsKit {
  private readonly sessions = new Map<string, GameSessionHandle>();
  private readonly nodeType: string;

  constructor(
    private readonly runtime: KitRuntime,
    options: SessionsKitOptions = {},
  ) {
    this.nodeType = options.nodeType ?? 'session';
  }

  /** The session with key `key` (a matchmaker's `matched.session`, or one a game names). */
  open(key: string): GameSessionHandle {
    let s = this.sessions.get(key);
    if (!s) {
      s = new GameSessionHandle(this.runtime, this.nodeType, key);
      this.sessions.set(key, s);
    }
    return s;
  }
}

/** Whose turn it is in `state`, while it plays. */
export function sessionTurn(state: SessionState | undefined): number | null {
  if (!state || state.phase !== 'playing') return null;
  return state.players[state.turn] ?? null;
}

/**
 * One session from lobby to result: join, ready up, the host starts, players act in turn
 * under a time limit, and the hub keeps the score and names the winner. {@link state} mirrors
 * the `session` topic; every change is a snapshot on it.
 */
export class GameSessionHandle {
  /** The `session` topic: the whole session. {@link watch} starts it. */
  readonly state: HubState<SessionState>;

  constructor(
    private readonly runtime: KitRuntime,
    readonly nodeType: string,
    readonly key: string,
  ) {
    this.state = new HubState<SessionState>(runtime, nodeType, key, 'session');
  }

  /** Mirrors the session; resolves with it. */
  watch(): Promise<SessionState> {
    return this.state.start();
  }

  unwatch(): Promise<void> {
    return this.state.stop();
  }

  /** Whose turn it is, as the mirror last saw it. */
  currentTurn(): number | null {
    return sessionTurn(this.state.get());
  }

  /** Whether it is the player's turn, as the mirror last saw it. */
  async isMyTurn(): Promise<boolean> {
    const me = await this.runtime.playerId();
    const turn = this.currentTurn();
    return me !== null && turn !== null && String(turn) === me;
  }

  /** @throws {KitError} `started`, `reserved`, `full`. */
  join(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'join', null, { action: true });
  }

  leave(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'leave', null, { action: true });
  }

  /** @throws {KitError} `not_member` (join the lobby first). */
  ready(ready = true): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'ready', { ready }, { action: true });
  }

  /**
   * Starts the session (the host, once everyone is ready).
   * @throws {KitError} `forbidden` (not the host), `not_ready`, `too_few_players`, `started`.
   */
  startGame(): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'start', null, { action: true });
  }

  /**
   * Plays the player's move (the starter's is `{ points }`, 0 to 3); resolves with whether play
   * goes on. Sent with an action id: a move resent after a lost reply is played once.
   * @throws {KitError} `not_your_turn`, `invalid_move` (the game's rule).
   */
  act<A extends object = { points: number }>(action: A): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'act', action, { action: true });
  }

  /** Changes the config: the host in the lobby, or a developer. */
  configure(config: Partial<SessionConfig>): Promise<boolean> {
    return this.runtime.call<boolean>(this.nodeType, this.key, 'configure', config, { action: true });
  }
}
