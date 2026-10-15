import {
  CrowdyExecError,
  type ExecAPI,
  type ExecConnectOptions,
  type ExecConnection,
  type ExecPushHandler,
} from '../domains/exec.js';
import { KitError, newActionId, withActionId } from './protocol.js';

/** Subscriptions one connection holds at most (the gateway refuses the next). */
export const KIT_SUBSCRIPTIONS_MAX = 256;

/** How a {@link KitRuntime} reaches the app's hubs. */
export interface KitRuntimeOptions {
  /** Use this connection rather than opening one. The kit does not close it. */
  connection?: ExecConnection;
  /** How the kit opens its connection: affinity (`nodeType`, `key`), timeouts, a WebSocket. */
  connect?: ExecConnectOptions;
  /**
   * Connect as one of the app's developers (`exec.connectAsDeveloper`, the org's
   * `manage_compute`, an identity session rather than an app token): what admin endpoints
   * (`configure`, `schedule`, ...) need.
   */
  developer?: boolean;
  /**
   * Calls, subscriptions and unsubscriptions the kit sends in one window at most. The gateway
   * takes 120 per 10 s from a player and refuses the rest `Busy`; the default, 100, keeps the
   * kit under it with room for the game's own calls.
   */
  callBudget?: number;
  /** The budget's window, in milliseconds. Default 10 000. */
  budgetWindowMs?: number;
  /**
   * Times a call is sent again when it did not run (`Busy`, `RateLimited`), or, when it
   * carries an action id, after an unknown outcome (`DeadlineExceeded`, `Unavailable`,
   * `Moved`). Default 2.
   */
  retries?: number;
  /** The player's id, to match `changed` messages; asked of `users.me` when absent. */
  playerId?: string | number;
}

/** Per call: the action id, and the reply timeout. */
export interface KitCallOptions {
  /**
   * Send an `action_id` so a resend is answered once: `true` for a fresh one, or the id to
   * use (for a deliberate retry of an earlier attempt).
   */
  action?: boolean | string;
  /** How long to wait for the reply, in milliseconds (the connection's default otherwise). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A token bucket: `capacity` tokens a window, refilled continuously. */
class Budget {
  private tokens: number;
  private last = Date.now();
  private blockedUntil = 0;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
  ) {
    this.tokens = capacity;
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) * this.capacity) / this.windowMs);
    this.last = now;
  }

  async take(): Promise<void> {
    for (;;) {
      const wait = this.blockedUntil - Date.now();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.ceil(((1 - this.tokens) * this.windowMs) / this.capacity));
    }
  }

  /** The gateway said to wait: nothing is sent until `ms` from now. */
  hold(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
    this.tokens = 0;
  }
}

/**
 * The kit's way to the app's hubs: one {@link ExecConnection} shared by every kit module,
 * opened when first needed. It paces what it sends to a budget below the gateway's limit,
 * sends a call again when that is safe (it did not run, or it carries an action id the hub
 * answers once), counts subscriptions under the gateway's cap, and turns a hub's coded
 * refusal into a {@link KitError}.
 */
export class KitRuntime {
  private conn: ExecConnection | null = null;
  private connecting: Promise<ExecConnection> | null = null;
  private ended: string | null = null;
  private readonly budget: Budget;
  private readonly retries: number;
  private readonly subs = new Map<string, number>();
  private readonly reconnectListeners = new Set<(host: string) => void>();
  private readonly endedListeners = new Set<(reason: string) => void>();
  private me: Promise<string | null> | null = null;

  constructor(
    readonly appId: string,
    private readonly exec: ExecAPI | undefined,
    private readonly options: KitRuntimeOptions = {},
    private readonly whoAmI?: () => Promise<string | null>,
  ) {
    this.budget = new Budget(Math.max(1, options.callBudget ?? 100), Math.max(1, options.budgetWindowMs ?? 10_000));
    this.retries = Math.max(0, options.retries ?? 2);
  }

  /** The connection, opened on first use. */
  async connection(): Promise<ExecConnection> {
    if (this.ended !== null) throw new CrowdyExecError('Denied', `access ended: ${this.ended}`);
    if (this.conn) return this.conn;
    if (!this.connecting) {
      this.connecting = this.open().catch((e) => {
        this.connecting = null;
        throw e;
      });
    }
    return this.connecting;
  }

  private async open(): Promise<ExecConnection> {
    let c = this.options.connection;
    if (!c) {
      if (!this.exec) throw new CrowdyExecError('Unavailable', 'the kit has no exec client to connect with');
      c = this.options.developer
        ? await this.exec.connectAsDeveloper(this.appId, this.options.connect)
        : await this.exec.connect(this.appId, this.options.connect);
    }
    c.onReconnect((host) => {
      for (const l of [...this.reconnectListeners]) l(host);
    });
    c.onAccessEnded((reason) => {
      this.ended = reason;
      for (const l of [...this.endedListeners]) l(reason);
    });
    this.conn = c;
    return c;
  }

  /** The player's id, from the options or `users.me`; null when neither knows it. */
  async playerId(): Promise<string | null> {
    if (this.options.playerId !== undefined) return String(this.options.playerId);
    if (!this.me) {
      this.me = this.whoAmI ? this.whoAmI().catch(() => null) : Promise.resolve(null);
    }
    return this.me;
  }

  /**
   * Calls a hub's endpoint, `args` as MessagePack, and returns the decoded reply.
   * @throws {KitError} for a hub's coded refusal; {@link CrowdyExecError} for the platform's.
   */
  async call<T = unknown>(
    nodeType: string,
    key: string,
    method: string,
    args?: unknown,
    options: KitCallOptions = {},
  ): Promise<T> {
    const actionId = options.action === true ? newActionId() : typeof options.action === 'string' ? options.action : undefined;
    const sent = actionId ? withActionId(args, actionId) : args;
    for (let attempt = 0; ; attempt++) {
      await this.budget.take();
      const conn = await this.connection();
      try {
        return await conn.call<T>(nodeType, key, method, sent, { timeoutMs: options.timeoutMs });
      } catch (e) {
        const err = KitError.from(e);
        if (attempt < this.retries && err instanceof CrowdyExecError && !(err instanceof KitError)) {
          if (err.status === 'Busy' && err.rateLimited) {
            this.budget.hold(err.retryAfterMs ?? 1_000);
            continue;
          }
          const didNotRun = err.status === 'Busy' || err.status === 'RateLimited';
          const unknown = err.status === 'DeadlineExceeded' || err.status === 'Unavailable' || err.status === 'Moved';
          if (didNotRun || (actionId && unknown)) {
            await sleep(Math.min(2_000, 200 * 2 ** attempt) * (0.5 + Math.random() / 2));
            continue;
          }
        }
        throw err;
      }
    }
  }

  /**
   * Receives what a hub publishes on `topic`. Returns the function that stops this handler
   * (and the subscription with the last one).
   * @throws {KitError} `limit` past {@link KIT_SUBSCRIPTIONS_MAX} subscriptions.
   */
  async subscribe<T = unknown>(
    nodeType: string,
    key: string,
    topic: string,
    onPush: ExecPushHandler<T>,
  ): Promise<() => Promise<void>> {
    const k = `${nodeType}\u0000${key}\u0000${topic}`;
    const held = this.subs.get(k) ?? 0;
    if (held === 0) {
      if (this.subs.size >= KIT_SUBSCRIPTIONS_MAX) {
        throw new KitError('limit', `a connection holds at most ${KIT_SUBSCRIPTIONS_MAX} subscriptions`);
      }
      await this.budget.take();
    }
    const conn = await this.connection();
    const stop = await conn.subscribe<T>(nodeType, key, topic, onPush);
    this.subs.set(k, (this.subs.get(k) ?? 0) + 1);
    let stopped = false;
    return async () => {
      if (stopped) return;
      stopped = true;
      const left = (this.subs.get(k) ?? 1) - 1;
      if (left > 0) {
        this.subs.set(k, left);
      } else {
        this.subs.delete(k);
        await this.budget.take();
      }
      await stop();
    };
  }

  /** How many distinct topics the kit subscribes to. */
  get subscriptions(): number {
    return this.subs.size;
  }

  /** Called with the new host after the connection reconnects; kit mirrors resync then. */
  onReconnect(listener: (host: string) => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  /** Called once when the player's access ended (close code 4403); nothing reconnects. */
  onAccessEnded(listener: (reason: string) => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  /** Closes the connection the kit opened (not one it was given). */
  close(): void {
    if (this.conn && !this.options.connection) this.conn.close();
    this.conn = null;
    this.connecting = null;
    this.subs.clear();
  }
}
