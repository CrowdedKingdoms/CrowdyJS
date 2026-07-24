import { print } from 'graphql';
import { createClient, type Client } from 'graphql-ws';
import type { SessionStore } from './session.js';
import type { CrowdyLogger } from './logger.js';
import { silentLogger } from './logger.js';
import { CrowdyRealtimeError } from './errors.js';
import type { LbCookieStore } from './lb-cookie-store.js';
import type { RealtimeMetrics } from './metrics.js';
import { payloadBytesOf } from './metrics.js';
import {
  UdpNotificationsDocument,
  type UdpNotificationsSubscription,
} from './generated/graphql.js';

/**
 * Lifecycle state of the realtime WebSocket connection, as reported by
 * {@link RealtimeClient.status} and {@link RealtimeClient.onStatus}.
 *
 * - `idle` — created but never connected; no socket open yet.
 * - `connecting` — opening the socket / performing the initial handshake.
 * - `connected` — the subscription is live and receiving notifications.
 * - `reconnecting` — the socket dropped (or a retry is in progress) while a
 *   connection is still desired; backoff is running and it will resubscribe.
 * - `disconnected` — intentionally closed (e.g. {@link RealtimeClient.disconnect}
 *   or the last subscriber unsubscribing).
 * - `failed` — a fatal, non-retryable error (e.g. not authenticated, or a
 *   non-retryable `RealtimeConnectionEvent` such as `APP_ID_REQUIRED`); it will
 *   not reconnect on its own.
 */
export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

/**
 * Any single message delivered on the `udpNotifications` subscription — the
 * union of every spatial echo/fan-out notification plus `GenericErrorResponse`
 * and `RealtimeConnectionEvent`. This is the codegen-derived (canonical)
 * shape, narrowed to the non-null payload; discriminate the members by their
 * `__typename`.
 */
export type UdpNotification = NonNullable<
  UdpNotificationsSubscription['udpNotifications']
>;

/**
 * The members of {@link UdpNotification} that carry a `sequenceNumber` and can
 * therefore be correlated back to the send that produced them — the spatial
 * echoes/fan-out (actor/voxel/audio/text/event notifications and responses,
 * single-actor and channel messages) plus `GenericErrorResponse`. Excludes
 * `RealtimeConnectionEvent`, which has no sequence number.
 *
 * {@link RealtimeClient.waitForSequence} resolves with one of these when a
 * matching success arrives (it rejects instead when the match is a
 * `GenericErrorResponse`), which is what powers the `...AndWait` spatial sends.
 */
export type SpatialNotification = Extract<
  UdpNotification,
  { sequenceNumber: number }
>;

/**
 * Per-notification callbacks passed to `client.udp.subscribe(handlers, appId)`
 * (or `client.world(appId).subscribe`). Every handler is optional — supply
 * only the ones you care about. Each key maps a notification's GraphQL
 * `__typename` to its callback, except {@link any} and {@link error}, which are
 * special (see below).
 *
 * Handlers are dispatched synchronously as messages arrive, and exceptions
 * thrown inside one are caught and logged so a single bad handler can't tear
 * down the stream. For each notification {@link any} runs first, then the
 * matching typed handler.
 */
export interface UdpNotificationHandlers {
  /**
   * Another actor's position/state changed within your area of interest —
   * the spatial fan-out of someone else's `sendActorUpdate`. `state` is
   * base64-encoded actor state.
   */
  actorUpdate?: (notification: Extract<UdpNotification, { __typename?: 'ActorUpdateNotification' }>) => void;
  /**
   * Legacy handler for `ActorUpdateResponse`. Current game servers never emit
   * this type; the echo of your own actor update arrives as an
   * `ActorUpdateNotification` (see {@link actorUpdate}), which is what
   * `sendActorUpdateAndWait` correlates to via `sequenceNumber`. Retained for
   * backward compatibility.
   */
  actorUpdateResponse?: (notification: Extract<UdpNotification, { __typename?: 'ActorUpdateResponse' }>) => void;
  /**
   * A voxel changed within range — the fan-out of another client's voxel edit.
   * `voxelState` is base64-encoded.
   */
  voxelUpdate?: (notification: Extract<UdpNotification, { __typename?: 'VoxelUpdateNotification' }>) => void;
  /**
   * Legacy handler for `VoxelUpdateResponse`. Current game servers never emit
   * this type; the echo of your own voxel update arrives as a
   * `VoxelUpdateNotification` (see {@link voxelUpdate}), which is what
   * `sendVoxelUpdateAndWait` correlates to via `sequenceNumber`. Retained for
   * backward compatibility.
   */
  voxelUpdateResponse?: (notification: Extract<UdpNotification, { __typename?: 'VoxelUpdateResponse' }>) => void;
  /**
   * A nearby client sent a voice/audio packet; `audioData` is base64-encoded
   * compressed audio (decode with {@link decodeBase64}).
   */
  audio?: (notification: Extract<UdpNotification, { __typename?: 'ClientAudioNotification' }>) => void;
  /** A nearby client sent a text/chat message (`text` is UTF-8). */
  text?: (notification: Extract<UdpNotification, { __typename?: 'ClientTextNotification' }>) => void;
  /**
   * A nearby client emitted a custom client event (a client-defined
   * `eventType` with a base64 `state` payload).
   */
  clientEvent?: (notification: Extract<UdpNotification, { __typename?: 'ClientEventNotification' }>) => void;
  /**
   * A server-originated spatial event broadcast to a region (e.g. world or NPC
   * events), shaped like a client event (`eventType` + base64 `state`).
   */
  serverEvent?: (notification: Extract<UdpNotification, { __typename?: 'ServerEventNotification' }>) => void;
  /**
   * A direct actor-to-actor message addressed specifically to you; `payload`
   * is base64. There is no sender echo, so this only ever arrives on the
   * recipient's subscription.
   */
  singleActorMessage?: (notification: Extract<UdpNotification, { __typename?: 'SingleActorMessageNotification' }>) => void;
  /**
   * A message broadcast on a channel (group) you're subscribed to; `payload`
   * is base64 and opaque to the server.
   */
  channelMessage?: (notification: Extract<UdpNotification, { __typename?: 'ChannelMessageNotification' }>) => void;
  /**
   * An asynchronous error for a previously sent datagram. Correlate it to the
   * originating send via `sequenceNumber` and read `errorCode`
   * ({@link UdpErrorCode}) for the reason. The matching `...AndWait` promise
   * rejects on this; the handler still fires for observability.
   */
  genericError?: (notification: Extract<UdpNotification, { __typename?: 'GenericErrorResponse' }>) => void;
  /**
   * A connection-lifecycle event from the game-api (handshake / auth /
   * routing), carrying `status`, `code`, `message`, and `retryable`. A
   * non-retryable event such as `code: 'APP_ID_REQUIRED'` means the
   * subscription was rejected and will not be retried automatically.
   */
  connectionEvent?: (notification: Extract<UdpNotification, { __typename?: 'RealtimeConnectionEvent' }>) => void;
  /**
   * SDK-level realtime failures surfaced as a {@link CrowdyRealtimeError}
   * (socket error, auth token cleared, subscription failed, wait timeout).
   * This is a **client-side** signal, not a server notification.
   */
  error?: (error: CrowdyRealtimeError) => void;
  /**
   * Catch-all invoked for **every** notification, before the specific typed
   * handler above. Handy for logging, metrics, or custom dispatch.
   */
  any?: (notification: UdpNotification) => void;
}

/**
 * Tuning options for {@link RealtimeClient} (the WebSocket subscription layer),
 * passed through from `CrowdyClient`'s `realtime` config. Every field is
 * optional and has a default.
 */
export interface RealtimeConfig {
  /**
   * WebSocket URL of the game-api GraphQL endpoint (e.g.
   * `wss://game.example.com/graphql`). Used when {@link wsEndpoint} is not set;
   * falls back to `ws://localhost:3000/graphql` when both are omitted.
   */
  wsUrl?: string;
  /** Alias for {@link wsUrl}; used only when {@link wsUrl} is not provided. */
  wsEndpoint?: string;
  /**
   * Maximum number of automatic reconnect attempts after the socket drops
   * before giving up. Defaults to `8`.
   */
  retryAttempts?: number;
  /**
   * Base delay in **milliseconds** for the exponential reconnect backoff (also
   * the upper bound of the random jitter added to each wait). Defaults to
   * `250`.
   */
  retryInitialDelayMs?: number;
  /**
   * Ceiling in **milliseconds** for the reconnect backoff, so the delay never
   * grows past this between attempts. Defaults to `5000`.
   */
  retryMaxDelayMs?: number;
  /**
   * Default time in **milliseconds** a `...AndWait` send waits for its matching
   * echo before timing out (overridable per call via
   * {@link RealtimeClient.waitForSequence}). Defaults to `5000`.
   */
  waitTimeoutMs?: number;
  /** Optional logger for realtime diagnostics. Defaults to a silent logger. */
  logger?: CrowdyLogger;
  /**
   * Sticky-LB cookie jar shared with the game-api HTTP client. When set in
   * Node, the WebSocket upgrade forwards `cks_ga` so HTTP mutations and the
   * subscription land on the same game-api upstream.
   */
  lbCookieStore?: LbCookieStore;
}

interface PendingWait {
  resolve(notification: SpatialNotification): void;
  reject(error: CrowdyRealtimeError): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Manages the single WebSocket subscription to the game-api's
 * `udpNotifications` stream — the realtime layer behind `client.udp` and
 * `client.realtime`. It opens the socket lazily on the first {@link subscribe},
 * authenticates with the shared session token, scopes the session to one
 * `appId`, reconnects with jittered exponential backoff, re-reads the token and
 * resubscribes on reconnect, fans each notification out to the registered
 * {@link UdpNotificationHandlers}, and resolves `...AndWait` sends via
 * {@link waitForSequence}.
 *
 * The connection lifecycle is observable through {@link status} /
 * {@link onStatus} ({@link RealtimeStatus}). A realtime session is scoped to a
 * single app, so run one client per app (sharing the same token store) for a
 * player who is in multiple apps at once.
 *
 * You normally interact with this through `client.udp` / `client.realtime`
 * rather than constructing it directly.
 */
export class RealtimeClient {
  private readonly wsUrl: string;
  private readonly logger: CrowdyLogger;
  private readonly retryAttempts: number;
  private readonly retryInitialDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly waitTimeoutMs: number;
  private readonly lbCookieStore?: LbCookieStore;
  private client: Client | null = null;
  private release: (() => void) | null = null;
  private desired = false;
  private statusValue: RealtimeStatus = 'idle';
  private readonly statusListeners = new Set<(status: RealtimeStatus) => void>();
  private readonly subscribers = new Map<string, UdpNotificationHandlers>();
  private readonly pending = new Map<number, PendingWait[]>();
  private nextSubscriberId = 1;
  // App this realtime session is scoped to. Sent in connectionParams so the
  // game-api only fans this app's spatial notifications to this subscription.
  // The game-api rejects subscriptions that arrive without it.
  private subscribedAppId: string | null = null;
  private opening: Promise<void> | null = null;

  /**
   * @param config - Reconnect/timeout/endpoint tuning; see
   *   {@link RealtimeConfig}.
   * @param session - Shared session store. The client reads the Bearer token
   *   from it for the connection handshake and watches it for changes: clearing
   *   the token tears the connection down (emitting an `AUTH_CLEARED`
   *   {@link CrowdyRealtimeError}), while a token change made while connected
   *   forces a reconnect using the new token.
   * @param metrics - Optional traffic counters (`client.metrics`); each
   *   delivered notification is recorded once, regardless of subscriber count.
   */
  constructor(
    config: RealtimeConfig = {},
    private readonly session: SessionStore,
    private readonly metrics?: RealtimeMetrics,
  ) {
    this.wsUrl = config.wsUrl || config.wsEndpoint || 'ws://localhost:3000/graphql';
    this.logger = config.logger ?? silentLogger;
    this.retryAttempts = config.retryAttempts ?? 8;
    this.retryInitialDelayMs = config.retryInitialDelayMs ?? 250;
    this.retryMaxDelayMs = config.retryMaxDelayMs ?? 5000;
    this.waitTimeoutMs = config.waitTimeoutMs ?? 5000;
    this.lbCookieStore = config.lbCookieStore;

    this.session.onChange((token) => {
      if (!this.desired) return;
      if (!token) {
        this.disconnect();
        this.dispatchError(
          new CrowdyRealtimeError('Realtime disconnected because the session token was cleared', {
            code: 'AUTH_CLEARED',
            retryable: false,
          }),
        );
        return;
      }
      this.restart();
    });
  }

  /**
   * The current connection state.
   *
   * @returns The latest {@link RealtimeStatus}.
   */
  status(): RealtimeStatus {
    return this.statusValue;
  }

  /**
   * Subscribe to connection-state changes. The listener is invoked
   * **immediately** with the current status, then again on every transition.
   *
   * @param listener - Called with each new {@link RealtimeStatus}.
   * @returns An unsubscribe function that removes the listener.
   */
  onStatus(listener: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Mark the connection as desired and open the subscription if it isn't
   * already open. You usually don't call this directly — {@link subscribe}
   * calls it for you; use it (or `client.realtime.connect()`) only to pre-warm
   * the socket.
   *
   * @throws {CrowdyRealtimeError} `AUTH_REQUIRED` if there is no session token.
   */
  connect(): void {
    this.desired = true;
    this.ensureSubscription();
  }

  /**
   * Close the socket and stop wanting a connection. Outstanding
   * {@link waitForSequence} promises are left intact (they will time out on
   * their own); use {@link close} to also reject those and drop all
   * subscribers. Safe to call when already disconnected.
   */
  disconnect(): void {
    this.desired = false;
    this.release?.();
    this.release = null;
    this.client?.dispose();
    this.client = null;
    this.setStatus('disconnected');
  }

  /**
   * Fully tear down the client: {@link disconnect}, drop all notification
   * subscribers, and reject every outstanding {@link waitForSequence} promise
   * with a non-retryable {@link CrowdyRealtimeError}. Call this when disposing
   * the SDK instance.
   */
  close(): void {
    this.disconnect();
    this.subscribers.clear();
    this.rejectAllPending(new CrowdyRealtimeError('Realtime client closed', { retryable: false }));
  }

  /**
   * Register a set of {@link UdpNotificationHandlers} and ensure the realtime
   * connection is open, scoping the session to `appId`. The game-api requires
   * an app id and rejects an app-agnostic subscription with a
   * `RealtimeConnectionEvent` (`code: 'APP_ID_REQUIRED'`).
   *
   * Multiple handler sets can be registered at once; the returned function
   * unregisters this one, and the socket closes automatically once the last
   * subscriber unsubscribes.
   *
   * @param handlers - Callbacks for the notification types you care about.
   * @param appId - The app to scope this realtime session to (decimal id;
   *   coerced to a string). Required.
   * @returns An unsubscribe function that removes these handlers (and
   *   disconnects when none remain).
   */
  subscribe(handlers: UdpNotificationHandlers, appId: string): () => void {
    // appId is required by the type; guard for JS callers so a missing value
    // is sent as "no app" (cleanly rejected by the game-api) rather than the
    // literal string "undefined".
    this.subscribedAppId = appId != null ? String(appId) : null;
    const id = `s${this.nextSubscriberId++}`;
    this.subscribers.set(id, handlers);
    this.connect();
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0 && this.desired) {
        this.disconnect();
      }
    };
  }

  /**
   * Return a promise that resolves when a notification carrying the given
   * `sequenceNumber` arrives — the mechanism behind the `...AndWait` spatial
   * sends. Resolves with the matching {@link SpatialNotification}, or rejects
   * if that match is a `GenericErrorResponse` or the wait times out.
   *
   * @param sequenceNumber - The sequence number to wait for (as allocated by
   *   {@link SequenceAllocator} and stamped on the send).
   * @param timeoutMs - How long to wait before rejecting, in milliseconds.
   *   Defaults to the configured {@link RealtimeConfig.waitTimeoutMs}.
   * @returns The matching spatial notification.
   * @throws {CrowdyRealtimeError} `UDP_SEQUENCE_TIMEOUT` (retryable) on timeout,
   *   or carrying the server `errorCode` when the match is a
   *   `GenericErrorResponse`.
   */
  waitForSequence(
    sequenceNumber: number,
    timeoutMs = this.waitTimeoutMs,
  ): Promise<SpatialNotification> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removePending(sequenceNumber, wait);
        reject(
          new CrowdyRealtimeError(
            `Timed out waiting for UDP response sequence ${sequenceNumber}`,
            { code: 'UDP_SEQUENCE_TIMEOUT', retryable: true },
          ),
        );
      }, timeoutMs);
      const wait: PendingWait = { resolve, reject, timer };
      const waits = this.pending.get(sequenceNumber) ?? [];
      waits.push(wait);
      this.pending.set(sequenceNumber, waits);
    });
  }

  private ensureSubscription(): void {
    if (this.release) return;
    if (this.opening) return;

    const token = this.session.getToken();
    if (!token) {
      const error = new CrowdyRealtimeError('Must be authenticated to subscribe', {
        code: 'AUTH_REQUIRED',
        retryable: false,
      });
      this.setStatus('failed');
      this.dispatchError(error);
      throw error;
    }

    this.opening = this.openSubscription(token)
      .catch((error) => {
        const realtimeError =
          error instanceof CrowdyRealtimeError
            ? error
            : new CrowdyRealtimeError('Failed to open realtime subscription', {
                code: 'SUBSCRIPTION_FAILED',
                retryable: true,
                cause: error,
              });
        this.logger.error?.('Realtime subscription open failed', realtimeError);
        this.dispatchError(realtimeError);
        if (this.desired) {
          this.setStatus('reconnecting');
        } else {
          this.setStatus('failed');
        }
      })
      .finally(() => {
        this.opening = null;
      });
  }

  private async openSubscription(token: string): Promise<void> {
    if (this.lbCookieStore) {
      try {
        await this.lbCookieStore.primeFromGraphql({
          endpoint: this.wsUrl,
          token,
        });
      } catch (error) {
        // Sticky cookie is best-effort. Under game-api overload the prime
        // fetch often times out; throwing here used to surface as an uncaught
        // AbortError and kill Node load-test workers (all bots on that process).
        this.logger.warn?.(
          'LB cookie prime failed; continuing without sticky cookie',
          error,
        );
      }
    }

    this.setStatus('connecting');
    const webSocketImpl = createStickyWebSocketImpl(this.lbCookieStore);
    this.client = createClient({
      url: this.wsUrl,
      lazy: true,
      retryAttempts: this.retryAttempts,
      ...(webSocketImpl ? { webSocketImpl } : {}),
      connectionParams: () => {
        const currentToken = this.session.getToken();
        if (!currentToken) return {};
        const params: Record<string, string> = {
          Authorization: `Bearer ${currentToken}`,
        };
        if (this.subscribedAppId != null) params.appId = this.subscribedAppId;
        return params;
      },
      retryWait: async (retries) => {
        this.setStatus('reconnecting');
        const delay = Math.min(
          this.retryMaxDelayMs,
          this.retryInitialDelayMs * 2 ** retries,
        );
        const jitter = Math.floor(Math.random() * this.retryInitialDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      },
      on: {
        connected: () => this.setStatus('connected'),
        closed: () => {
          if (this.desired) {
            this.setStatus('reconnecting');
          } else {
            this.setStatus('disconnected');
          }
        },
        error: (error) => {
          this.logger.error?.('Realtime WebSocket error', error);
          this.dispatchError(
            new CrowdyRealtimeError('Realtime WebSocket error', {
              code: 'WEBSOCKET_ERROR',
              retryable: true,
              cause: error,
            }),
          );
        },
      },
    });

    this.release = this.client.subscribe(
      { query: print(UdpNotificationsDocument) },
      {
        next: (message) => {
          const data = message.data as UdpNotificationsSubscription | undefined;
          const notification = data?.udpNotifications;
          if (notification) this.dispatch(notification);
          if (message.errors?.length) {
            this.dispatchError(
              new CrowdyRealtimeError(message.errors[0]?.message ?? 'Subscription error', {
                code: 'SUBSCRIPTION_ERROR',
                retryable: true,
                cause: message.errors,
              }),
            );
          }
        },
        error: (error) => {
          this.setStatus('failed');
          this.dispatchError(
            new CrowdyRealtimeError('Realtime subscription failed', {
              code: 'SUBSCRIPTION_FAILED',
              retryable: true,
              cause: error,
            }),
          );
        },
        complete: () => {
          this.release = null;
          if (this.desired) {
            this.setStatus('reconnecting');
            this.ensureSubscription();
          }
        },
      },
    );
  }

  private restart(): void {
    this.release?.();
    this.release = null;
    this.client?.dispose();
    this.client = null;
    this.ensureSubscription();
  }

  private dispatch(notification: UdpNotification): void {
    this.metrics?.recordReceived(
      notificationKind(notification.__typename),
      payloadBytesOf(notification as Record<string, unknown>),
    );
    this.resolvePending(notification);

    // A non-retryable connection event (e.g. APP_ID_REQUIRED, AUTH_REQUIRED)
    // means the server completed the subscription and resubscribing would just
    // be rejected again. Stop wanting the connection so the `complete` handler
    // doesn't immediately reopen it (lazy graphql-ws then closes the socket).
    if (
      notification.__typename === 'RealtimeConnectionEvent' &&
      notification.retryable === false
    ) {
      this.desired = false;
      this.setStatus('failed');
    }

    for (const handlers of [...this.subscribers.values()]) {
      try {
        handlers.any?.(notification);
        switch (notification.__typename) {
          case 'ActorUpdateNotification':
            handlers.actorUpdate?.(notification);
            break;
          case 'ActorUpdateResponse':
            handlers.actorUpdateResponse?.(notification);
            break;
          case 'VoxelUpdateNotification':
            handlers.voxelUpdate?.(notification);
            break;
          case 'VoxelUpdateResponse':
            handlers.voxelUpdateResponse?.(notification);
            break;
          case 'ClientAudioNotification':
            handlers.audio?.(notification);
            break;
          case 'ClientTextNotification':
            handlers.text?.(notification);
            break;
          case 'ClientEventNotification':
            handlers.clientEvent?.(notification);
            break;
          case 'ServerEventNotification':
            handlers.serverEvent?.(notification);
            break;
          case 'SingleActorMessageNotification':
            handlers.singleActorMessage?.(notification);
            break;
          case 'ChannelMessageNotification':
            handlers.channelMessage?.(notification);
            break;
          case 'GenericErrorResponse':
            handlers.genericError?.(notification);
            break;
          case 'RealtimeConnectionEvent':
            handlers.connectionEvent?.(notification);
            break;
        }
      } catch (error) {
        this.logger.error?.('Realtime notification handler threw', error);
      }
    }
  }

  private resolvePending(notification: UdpNotification): void {
    if (!('sequenceNumber' in notification)) return;
    const waits = this.pending.get(notification.sequenceNumber);
    if (!waits?.length) return;
    this.pending.delete(notification.sequenceNumber);

    for (const wait of waits) {
      clearTimeout(wait.timer);
      if (notification.__typename === 'GenericErrorResponse') {
        wait.reject(
          new CrowdyRealtimeError(`UDP request failed: ${notification.errorCode}`, {
            code: notification.errorCode,
            retryable: false,
          }),
        );
      } else {
        wait.resolve(notification);
      }
    }
  }

  private removePending(sequenceNumber: number, wait: PendingWait): void {
    const waits = this.pending.get(sequenceNumber);
    if (!waits) return;
    const next = waits.filter((candidate) => candidate !== wait);
    if (next.length) {
      this.pending.set(sequenceNumber, next);
    } else {
      this.pending.delete(sequenceNumber);
    }
  }

  private rejectAllPending(error: CrowdyRealtimeError): void {
    for (const waits of this.pending.values()) {
      for (const wait of waits) {
        clearTimeout(wait.timer);
        wait.reject(error);
      }
    }
    this.pending.clear();
  }

  private dispatchError(error: CrowdyRealtimeError): void {
    for (const handlers of [...this.subscribers.values()]) {
      handlers.error?.(error);
    }
  }

  private setStatus(status: RealtimeStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of [...this.statusListeners]) {
      listener(status);
    }
  }
}

/** GraphQL `__typename` → the handler-style kind name used by `client.metrics`. */
const NOTIFICATION_KINDS: Record<string, string> = {
  ActorUpdateNotification: 'actorUpdate',
  ActorUpdateResponse: 'actorUpdateResponse',
  VoxelUpdateNotification: 'voxelUpdate',
  VoxelUpdateResponse: 'voxelUpdateResponse',
  ClientAudioNotification: 'audio',
  ClientTextNotification: 'text',
  ClientEventNotification: 'clientEvent',
  ServerEventNotification: 'serverEvent',
  SingleActorMessageNotification: 'singleActorMessage',
  ChannelMessageNotification: 'channelMessage',
  GenericErrorResponse: 'genericError',
  RealtimeConnectionEvent: 'connectionEvent',
};

function notificationKind(typename: string | undefined): string {
  if (!typename) return 'unknown';
  return NOTIFICATION_KINDS[typename] ?? typename;
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions?.node === 'string'
  );
}

/**
 * Node `ws` does not send browser cookies on upgrade. When a sticky cookie jar
 * is configured, wrap `ws` so `cks_ga` rides on the handshake.
 */
function createStickyWebSocketImpl(
  lbCookieStore?: LbCookieStore,
): unknown | undefined {
  if (!lbCookieStore || !isNodeRuntime()) return undefined;
  const cookieStore = lbCookieStore;
  // Node `ws` accepts a third options arg with `headers`; DOM typings do not.
  const NodeWebSocket = WebSocket as unknown as {
    new (
      url: string,
      protocols?: string | string[],
      options?: { headers?: Record<string, string> },
    ): WebSocket;
  };
  return class StickyLbWebSocket extends NodeWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      const cookie = cookieStore.headerValue();
      super(url, protocols, cookie ? { headers: { Cookie: cookie } } : undefined);
    }
  };
}
