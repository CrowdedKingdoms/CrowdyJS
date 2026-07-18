/**
 * The World Session — the wiring hub of the World Stores layer.
 *
 * `createWorldSession(client, appId, config)` opens at most ONE
 * `udpNotifications` subscription and fans every notification out to the
 * stores you configured (decode once, route everywhere), replacing the
 * hand-written "NetworkManager singleton" pattern every game rebuilds.
 * Stores are opt-in twice over: only configured stores are constructed
 * (runtime), and only imported store modules end up in your bundle
 * (compile time — the layer lives behind the `@crowdedkingdoms/crowdyjs/stores`
 * subpath and the core client never imports it).
 *
 * Render-loop contract: stores never touch `requestAnimationFrame`. Writes
 * happen in WebSocket message handlers (not throttled in hidden tabs) and
 * reads are synchronous snapshots, so a paused render loop simply catches up
 * on resume. Timer-driven behaviors run on the session {@link Ticker} — pass
 * `workerTicker()` to keep them at full rate in backgrounded tabs.
 */

import type { AvatarsAPI } from '../domains/avatars.js';
import type { ChunksAPI } from '../domains/chunks.js';
import type { GameModelAPI } from '../domains/gameModel.js';
import type { HostAPI } from '../domains/host.js';
import type { StateAPI } from '../domains/state.js';
import type { UdpAPI } from '../domains/udp.js';
import type { UdpNotificationHandlers } from '../realtime.js';
import { intervalTicker, type Ticker } from './ticker.js';

/**
 * The sub-clients the stores compose — structurally satisfied by a
 * `CrowdyClient`, so `createWorldSession(client, appId, ...)` just works;
 * tests pass stubs.
 */
export interface WorldStoresClient {
  udp: UdpAPI;
  chunks: ChunksAPI;
  state: StateAPI;
  avatars: AvatarsAPI;
  host: HostAPI;
  gameModel: GameModelAPI;
}

/** The kinds of outbound sends the session can attribute errors to. */
export type SentPacketKind =
  | 'actorUpdate'
  | 'voxelUpdate'
  | 'text'
  | 'clientEvent'
  | 'audio'
  | 'singleActorMessage'
  | 'channelMessage';

/** A record of one outbound send, kept so errors can be attributed. */
export interface SentPacketRecord {
  kind: SentPacketKind;
  sequenceNumber: number;
  sentAt: number;
  /** The sending actor uuid, when the send had one. */
  uuid?: string;
  /** Optional app-relevant detail (voxel coords, channel id, …). */
  detail?: Record<string, unknown>;
}

/** A listener registration on the session's notification bus. */
export type BusKey = keyof UdpNotificationHandlers;

/**
 * The internal context handed to each store: the shared notification bus
 * (lazy single subscription), the shared ticker, send tracking, and the
 * domains. Exposed for custom store implementations; regular apps never
 * touch it.
 */
export interface WorldSessionContext {
  readonly appId: string;
  readonly client: WorldStoresClient;
  readonly ticker: Ticker;
  /**
   * Listen for one notification kind. The first listener opens the shared
   * `udpNotifications` subscription; disposing the session closes it.
   * @returns An off function for this listener.
   */
  on<K extends BusKey>(key: K, listener: NonNullable<UdpNotificationHandlers[K]>): () => void;
  /**
   * Record an outbound send so a later `GenericErrorResponse` with the same
   * `sequenceNumber` can be attributed (consumed by the error store; a no-op
   * until one registers).
   */
  trackSend(record: SentPacketRecord): void;
  /** Replace the send-tracking sink (registered by the error store). */
  setSendTracker(sink: (record: SentPacketRecord) => void): void;
  /** Register cleanup to run on session dispose. */
  onDispose(cleanup: () => void): void;
}

/** All handler keys the fan-out dispatches (mirrors {@link UdpNotificationHandlers}). */
const BUS_KEYS: BusKey[] = [
  'actorUpdate',
  'actorUpdateResponse',
  'voxelUpdate',
  'voxelUpdateResponse',
  'audio',
  'text',
  'clientEvent',
  'serverEvent',
  'singleActorMessage',
  'channelMessage',
  'genericError',
  'connectionEvent',
  'any',
  'error',
];

/**
 * The session core: one lazy subscription, a per-kind listener registry, a
 * shared ticker, send tracking, and dispose. Store modules build on this via
 * their `attach*` factories; `createWorldSession` composes them.
 */
export class WorldSessionCore implements WorldSessionContext {
  readonly appId: string;
  readonly client: WorldStoresClient;
  readonly ticker: Ticker;

  private readonly listeners = new Map<BusKey, Set<(n: never) => void>>();
  private readonly cleanups: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  private sendTracker: ((record: SentPacketRecord) => void) | null = null;
  private readonly ownsTicker: boolean;
  private disposed = false;

  constructor(client: WorldStoresClient, appId: string, ticker?: Ticker) {
    this.client = client;
    this.appId = appId;
    this.ownsTicker = ticker === undefined;
    this.ticker = ticker ?? intervalTicker();
  }

  on<K extends BusKey>(
    key: K,
    listener: NonNullable<UdpNotificationHandlers[K]>,
  ): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener as (n: never) => void);
    this.ensureSubscribed();
    return () => {
      set.delete(listener as (n: never) => void);
    };
  }

  trackSend(record: SentPacketRecord): void {
    this.sendTracker?.(record);
  }

  setSendTracker(sink: (record: SentPacketRecord) => void): void {
    this.sendTracker = sink;
  }

  onDispose(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  /** Close the subscription, cancel timers, and run store cleanups. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // Cleanup must never mask other cleanups.
      }
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
    if (this.ownsTicker) this.ticker.dispose();
  }

  /** Open the single shared subscription on first listener. */
  private ensureSubscribed(): void {
    if (this.unsubscribe || this.disposed) return;
    const handlers: UdpNotificationHandlers = {};
    for (const key of BUS_KEYS) {
      (handlers as Record<string, unknown>)[key] = (notification: never) => {
        const set = this.listeners.get(key);
        if (!set) return;
        for (const listener of [...set]) {
          try {
            listener(notification);
          } catch {
            // One listener's throw must not starve the others.
          }
        }
      };
    }
    this.unsubscribe = this.client.udp.subscribe(handlers, this.appId);
  }
}

/**
 * Base configuration every session accepts; store-specific keys are added by
 * the store modules (see `createWorldSession` in `stores/index.ts`).
 */
export interface WorldSessionBaseConfig {
  /**
   * Scheduler for timer-driven store behaviors (send loop, reaping,
   * write-back, heartbeats). Defaults to `intervalTicker()`; pass
   * `workerTicker()` to keep full rate in backgrounded browser tabs. A
   * caller-supplied ticker is NOT disposed with the session.
   */
  ticker?: Ticker;
}
