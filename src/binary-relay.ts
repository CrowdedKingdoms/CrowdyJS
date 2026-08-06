/**
 * Binary realtime relay transport (`crowdy-relay-v1`).
 *
 * Connects to the game-api's raw-WebSocket relay endpoint and exchanges
 * complete Buddy wire datagrams as BINARY frames — no GraphQL, JSON, or
 * base64 on the wire. Owned by {@link RealtimeClient}, which keeps the public
 * handler/dispatch surface identical across transports.
 *
 * Auth: the app token rides as a `bearer.<base64url(token)>` subprotocol
 * entry (browsers cannot set WebSocket headers). The server replies with one
 * TEXT `ready` frame carrying the session's `gameTokenId`, which becomes the
 * client-side HMAC signing context.
 */

import type { CrowdyLogger } from './logger.js';
import { silentLogger } from './logger.js';
import { CrowdyRealtimeError } from './errors.js';
import type { UdpNotification } from './realtime.js';
import {
  createSignContext,
  parseRelayFrame,
  type RelaySignContext,
} from './binary-wire.js';

export const RELAY_SUBPROTOCOL = 'crowdy-relay-v1';
const BEARER_PREFIX = 'bearer.';

/** Consecutive pre-ready failures before we declare the relay unavailable. */
const UNAVAILABLE_AFTER_FAILURES = 2;

/**
 * The same, for a relay that HAD been ready and then lost its socket.
 *
 * Higher than the pre-ready limit on purpose. Never having connected is
 * evidence about the endpoint; a working relay dropping once is evidence about
 * the network, and escalating on the first blip would move clients off healthy
 * instances during an ordinary reconnect.
 */
const UNAVAILABLE_AFTER_RECONNECT_FAILURES = 3;

export interface BinaryRelayCallbacks {
  getToken(): string | null;
  onNotification(notification: UdpNotification): void;
  onError(error: CrowdyRealtimeError): void;
  onStatus(
    status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
  ): void;
  /**
   * The relay endpoint looks permanently unavailable (older server, blocked
   * upgrade). The owner should fall back to the GraphQL transport.
   */
  onUnavailable(): void;
  /**
   * The server asked this client to move to another API instance — either it is
   * rebalancing load, or it is draining. The socket is still open, so this is
   * advice: acting on it promptly is better for the fleet, but ignoring it only
   * costs this client its share of an imbalance.
   */
  onReconnectDirective?(target: {
    httpUrl: string;
    wsUrl: string;
    reason: string;
  }): void;
}

/**
 * Would honouring `candidate` keep us on the same site as `current`?
 *
 * The directive arrives over an authenticated TLS socket, so the server saying
 * it is the server we already trust. This guards the next step instead: a
 * redirect must never be able to move a client onto an origin outside the
 * estate it is already talking to — otherwise one compromised instance could
 * walk an entire fleet's clients somewhere else, which is a much worse outcome
 * than an unbalanced fleet.
 *
 * Compares the last two labels, so `ck-api-4.pgc.prod.cp.cks-env.com` and
 * `ck.prod.cp.cks-env.com` match, and `evil.example.com` does not.
 */
export function isSameEstate(current: string, candidate: string): boolean {
  const host = (raw: string): string | null => {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  const a = host(current);
  const b = host(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const site = (h: string) => h.split('.').slice(-2).join('.');
  return site(a) === site(b) && site(a).includes('.');
}

export interface BinaryRelayConfig {
  /** Absolute ws(s) URL of the relay endpoint (e.g. `wss://host/realtime`). */
  url: string;
  retryAttempts?: number;
  retryInitialDelayMs?: number;
  retryMaxDelayMs?: number;
  logger?: CrowdyLogger;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export class BinaryRelayTransport {
  private readonly url: string;
  private readonly logger: CrowdyLogger;
  private readonly retryAttempts: number;
  private readonly retryInitialDelayMs: number;
  private readonly retryMaxDelayMs: number;

  private ws: WebSocket | null = null;
  private signContext: RelaySignContext | null = null;
  private desired = false;
  private appId: string | null = null;
  private retries = 0;
  private preReadyFailures = 0;
  private everReady = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    config: BinaryRelayConfig,
    private readonly callbacks: BinaryRelayCallbacks,
  ) {
    this.url = config.url;
    this.logger = config.logger ?? silentLogger;
    this.retryAttempts = config.retryAttempts ?? 8;
    this.retryInitialDelayMs = config.retryInitialDelayMs ?? 250;
    this.retryMaxDelayMs = config.retryMaxDelayMs ?? 5000;
  }

  /** True when the socket is open and the `ready` handshake completed. */
  isReady(): boolean {
    return (
      this.ws != null &&
      this.ws.readyState === WebSocket.OPEN &&
      this.signContext != null
    );
  }

  /** The session signing context (gameTokenId + HMAC key), once ready. */
  getSignContext(): RelaySignContext | null {
    return this.signContext;
  }

  connect(appId: string): void {
    this.desired = true;
    this.appId = appId;
    if (this.ws) return;
    this.open();
  }

  disconnect(): void {
    this.desired = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.generation += 1;
    const ws = this.ws;
    this.ws = null;
    this.signContext = null;
    if (ws) {
      try {
        ws.close(1000, 'client-disconnect');
      } catch {
        /* already closed */
      }
    }
    this.callbacks.onStatus('disconnected');
  }

  /** Restart (e.g. after a token refresh) while remaining desired. */
  restart(): void {
    if (!this.desired || this.appId == null) return;
    const appId = this.appId;
    this.disconnect();
    this.desired = true;
    this.appId = appId;
    this.open();
  }

  /** Send one pre-serialized Buddy datagram as a BINARY frame. */
  sendFrame(frame: Uint8Array): void {
    if (!this.isReady() || !this.ws) {
      throw new CrowdyRealtimeError('Binary relay is not connected', {
        code: 'BINARY_RELAY_UNAVAILABLE',
        retryable: true,
      });
    }
    this.ws.send(frame);
  }

  private open(): void {
    const token = this.callbacks.getToken();
    if (!token) {
      this.callbacks.onError(
        new CrowdyRealtimeError('Must be authenticated to open the binary relay', {
          code: 'AUTH_REQUIRED',
          retryable: false,
        }),
      );
      return;
    }
    if (typeof WebSocket === 'undefined') {
      this.logger.warn?.(
        'No global WebSocket implementation; binary relay unavailable',
      );
      this.callbacks.onUnavailable();
      return;
    }

    const generation = ++this.generation;
    this.callbacks.onStatus(this.retries > 0 ? 'reconnecting' : 'connecting');

    const separator = this.url.includes('?') ? '&' : '?';
    const url = `${this.url}${separator}appId=${encodeURIComponent(this.appId ?? '')}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, [
        RELAY_SUBPROTOCOL,
        `${BEARER_PREFIX}${base64UrlEncode(token)}`,
      ]);
    } catch (error) {
      this.logger.error?.('Binary relay socket construction failed', error);
      this.preReadyFailures += 1;
      this.maybeRetry(generation);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.signContext = null;

    let sawReady = false;

    ws.onmessage = (event: MessageEvent) => {
      if (generation !== this.generation) return;
      const data: unknown = event.data;
      if (typeof data === 'string') {
        this.handleControlFrame(data, generation).catch((error) => {
          this.logger.error?.('Binary relay handshake failed', error);
        });
        if (!sawReady) sawReady = true;
        return;
      }
      if (data instanceof ArrayBuffer) {
        for (const notification of parseRelayFrame(new Uint8Array(data))) {
          this.callbacks.onNotification(notification);
        }
      }
    };

    ws.onerror = () => {
      if (generation !== this.generation) return;
      this.logger.warn?.('Binary relay socket error');
    };

    ws.onclose = (event: CloseEvent) => {
      if (generation !== this.generation) return;
      this.ws = null;
      const hadReady = this.signContext != null || sawReady;
      this.signContext = null;

      if (!this.desired) {
        this.callbacks.onStatus('disconnected');
        return;
      }

      if (!hadReady) {
        this.preReadyFailures += 1;
        // Two different failures hide behind "the handshake did not complete",
        // and for a long time only one of them could ever escalate:
        //
        //   never ready at all  - the relay is not available at this endpoint,
        //                         so fall back to the GraphQL transport.
        //   ready before, not now - the INSTANCE went away. This is the case
        //                         re-discovery exists for, and `!everReady`
        //                         excluded it.
        //
        // The consequence was that only a client which had never worked could
        // ever be moved. A client that was healthy and whose ck-api instance
        // then died retried that one dead address forever, silently: onclose
        // fell through to maybeRetry, onUnavailable was never called, and so
        // the re-discovery path below it never ran no matter how the caller had
        // configured discoveryUrl. Measured on pgc-prod on 2026-08-06 — four
        // bots pinned to a stopped instance never attempted to move.
        const limit = this.everReady
          ? UNAVAILABLE_AFTER_RECONNECT_FAILURES
          : UNAVAILABLE_AFTER_FAILURES;
        if (this.preReadyFailures >= limit) {
          this.logger.warn?.(
            this.everReady
              ? `Binary relay lost and not re-established after ${this.preReadyFailures} attempts (close ${event.code}); the instance is probably gone`
              : `Binary relay unavailable after ${this.preReadyFailures} failed handshakes (close ${event.code}); falling back`,
          );
          this.desired = false;
          this.callbacks.onUnavailable();
          return;
        }
      } else {
        this.retries = 0;
      }

      this.maybeRetry(generation);
    };
  }

  private async handleControlFrame(
    data: string,
    generation: number,
  ): Promise<void> {
    let frame: {
      type?: string;
      gameTokenId?: string;
      gameApiUrl?: string;
      gameApiWsUrl?: string;
      reason?: string;
    };
    try {
      frame = JSON.parse(data) as typeof frame;
    } catch {
      return;
    }

    if (frame.type === 'reconnect') {
      this.handleReconnectDirective(frame);
      return;
    }

    // Anything else we do not recognise is ignored on purpose: the server may
    // add control frames, and an older client must keep working when it does.
    if (frame.type !== 'ready' || !frame.gameTokenId) return;

    const token = this.callbacks.getToken();
    if (!token) return;
    const ctx = await createSignContext(BigInt(frame.gameTokenId), token);
    if (generation !== this.generation) return;

    this.signContext = ctx;
    this.everReady = true;
    this.preReadyFailures = 0;
    this.retries = 0;
    this.callbacks.onStatus('connected');
  }

  /**
   * The server wants this client on a different instance.
   *
   * Refusing a malformed or off-estate target is not a failure worth surfacing
   * to the application: the current connection is still working, so the correct
   * behaviour is to stay put and say so in the log.
   */
  private handleReconnectDirective(frame: {
    gameApiUrl?: string;
    gameApiWsUrl?: string;
    reason?: string;
  }): void {
    const httpUrl = frame.gameApiUrl;
    const wsUrl = frame.gameApiWsUrl;
    if (!httpUrl || !wsUrl) {
      this.logger.warn?.('Ignoring a reconnect directive with no target');
      return;
    }
    if (!isSameEstate(this.url, wsUrl)) {
      this.logger.warn?.(
        `Ignoring a reconnect directive pointing outside this estate: ${wsUrl}`,
      );
      return;
    }
    this.logger.info?.(
      `Server asked us to move to ${httpUrl} (${frame.reason ?? 'unspecified'})`,
    );
    this.callbacks.onReconnectDirective?.({
      httpUrl,
      wsUrl,
      reason: frame.reason ?? 'rebalance',
    });
  }

  private maybeRetry(generation: number): void {
    if (!this.desired || generation !== this.generation) return;
    if (this.retries >= this.retryAttempts) {
      this.desired = false;
      this.callbacks.onError(
        new CrowdyRealtimeError('Binary relay reconnect attempts exhausted', {
          code: 'BINARY_RELAY_RECONNECT_EXHAUSTED',
          retryable: false,
        }),
      );
      this.callbacks.onStatus('disconnected');
      return;
    }
    const delay = Math.min(
      this.retryMaxDelayMs,
      this.retryInitialDelayMs * 2 ** this.retries,
    );
    const jitter = Math.floor(Math.random() * this.retryInitialDelayMs);
    this.retries += 1;
    this.callbacks.onStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.desired && generation === this.generation) this.open();
    }, delay + jitter);
  }
}
