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
  BUNDLE_LENGTH_PREFIX_BYTES,
  bundleSizeOf,
  createSignContext,
  packMessageBundle,
  parseRelayFrame,
  RELAY_MAX_BUNDLE_MEMBER_BYTES,
  RELAY_MAX_BUNDLE_MEMBERS,
  RELAY_MAX_DATAGRAM_BYTES,
  type RelaySignContext,
  serializeClientCapabilities,
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
 * Compares the last two labels, so `ck-api-or-4.prod.crowdedkingdoms.com` and
 * `ck.prod.crowdedkingdoms.com` match, and `evil.example.com` does not.
 *
 * TWO LABELS IS COARSER THAN IT LOOKS, AND IT GOT MORE VISIBLE RATHER THAN WORSE.
 * Every tier now sits under one brand root, so "the last two labels" is
 * `crowdedkingdoms.com` for all of them and a redirect could in principle move a prod
 * client onto a dev host. That was equally true before the 2026-08 root migration --
 * the tiers shared a single root then too -- so this is a long-standing property the
 * rename exposed, not one it introduced. It still does the job it was written for:
 * stopping a compromised instance walking clients to an unrelated domain. Narrowing
 * it to the tier is a deliberate change with its own blast radius (it would refuse
 * legitimate cross-datacenter redirects if a tier ever spans roots) and belongs in
 * its own reviewed diff, not in a rename.
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
  /**
   * Pack the datagrams sent within {@link bundleWindowMs} into one
   * MESSAGE_BUNDLE frame (the server does the same on the downlink). A lone
   * message goes out unwrapped. Requires a replication server that accepts
   * client bundles (Buddy v0.27.0+). Defaults to `true`; `false` sends every
   * message as its own frame, as CrowdyJS did before 17.1.
   */
  bundleSends?: boolean;
  /**
   * How long a pending bundle waits for more messages before it is flushed, in
   * milliseconds. Defaults to `1`. `0` flushes on the next macrotask with no
   * deliberate wait, so sends made in one synchronous burst still share a
   * frame. Ignored when {@link bundleSends} is false.
   */
  bundleWindowMs?: number;
  /**
   * Tell the server what this client can read (`CLIENT_CAPABILITIES`, Buddy
   * v0.30.0) on every `ready` and every {@link capabilitiesIntervalMs} after,
   * so its bundles arrive signed once instead of per member. Default true; a
   * server older than v0.30.0 ignores the message.
   */
  advertiseCapabilities?: boolean;
  /** Re-advertise period in ms (default 15 000). */
  capabilitiesIntervalMs?: number;
}

/** Uplink counters kept by the relay transport (see {@link BinaryRelayTransport.stats}). */
export interface BinaryRelaySendStats {
  /** Messages accepted for sending (each `sendFrame` call). */
  messagesSent: number;
  /** BINARY frames handed to the socket; at most `messagesSent`. */
  framesSent: number;
  /** Frames that were MESSAGE_BUNDLE wrappers (two or more members). */
  bundlesSent: number;
  /** Bytes handed to the socket, framing included. */
  bytesSent: number;
  /**
   * Messages that were pending in a bundle when the socket went away before
   * the window closed. UDP would have lost them too; the count says how often.
   */
  messagesDropped: number;
}

/**
 * True in a browser whose document is hidden (background tab). Browsers clamp
 * timers there, so the bundle window cannot be honoured; the transport flushes
 * each send immediately instead. False outside a document (Node, workers).
 */
function documentIsHidden(): boolean {
  const doc = (globalThis as { document?: { visibilityState?: string } }).document;
  return doc?.visibilityState === 'hidden';
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

  // Outbound MESSAGE_BUNDLE (config.bundleSends). sendFrame() appends the
  // signed datagram it is given; the bundle leaves when the window timer fires,
  // when the next message would not fit, on flushSends(), and on disconnect.
  private readonly bundleSends: boolean;
  private readonly bundleWindowMs: number;
  private readonly advertiseCapabilities: boolean;
  private readonly capabilitiesIntervalMs: number;
  private capsTimer: ReturnType<typeof setInterval> | null = null;
  private pendingMembers: Uint8Array[] = [];
  private pendingBytes = 0;
  private bundleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sendStats: BinaryRelaySendStats = {
    messagesSent: 0,
    framesSent: 0,
    bundlesSent: 0,
    bytesSent: 0,
    messagesDropped: 0,
  };

  constructor(
    config: BinaryRelayConfig,
    private readonly callbacks: BinaryRelayCallbacks,
  ) {
    this.url = config.url;
    this.logger = config.logger ?? silentLogger;
    this.retryAttempts = config.retryAttempts ?? 8;
    this.retryInitialDelayMs = config.retryInitialDelayMs ?? 250;
    this.retryMaxDelayMs = config.retryMaxDelayMs ?? 5000;
    this.bundleSends = config.bundleSends ?? true;
    this.bundleWindowMs = Math.max(0, config.bundleWindowMs ?? 1);
    this.advertiseCapabilities = config.advertiseCapabilities ?? true;
    this.capabilitiesIntervalMs = Math.max(1000, config.capabilitiesIntervalMs ?? 15_000);
  }

  /** Snapshot of the uplink counters. */
  stats(): BinaryRelaySendStats {
    return { ...this.sendStats };
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
    // Whatever the last frame queued goes out before the socket does.
    this.flushSends();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.generation += 1;
    this.stopCapabilities();
    const ws = this.ws;
    this.ws = null;
    this.signContext = null;
    this.stopCapabilities();
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

  /**
   * Send one pre-serialized, signed Buddy message. With `bundleSends` it joins
   * the pending MESSAGE_BUNDLE and leaves with it (see {@link flushSends});
   * otherwise it is one BINARY frame right now.
   */
  sendFrame(frame: Uint8Array): void {
    if (!this.isReady() || !this.ws) {
      throw new CrowdyRealtimeError('Binary relay is not connected', {
        code: 'BINARY_RELAY_UNAVAILABLE',
        retryable: true,
      });
    }
    if (frame.length === 0) return;
    this.sendStats.messagesSent += 1;

    if (!this.bundleSends) {
      this.transmit(frame, false);
      return;
    }

    // Too big to travel inside any bundle: what is pending goes first, then
    // this one alone (the server does the same with an oversize notification).
    if (frame.length > RELAY_MAX_BUNDLE_MEMBER_BYTES) {
      this.flushSends();
      this.transmit(frame, false);
      return;
    }

    const wouldBe = this.pendingBytes + BUNDLE_LENGTH_PREFIX_BYTES + frame.length;
    if (
      this.pendingMembers.length > 0 &&
      (wouldBe > RELAY_MAX_DATAGRAM_BYTES ||
        this.pendingMembers.length >= RELAY_MAX_BUNDLE_MEMBERS)
    ) {
      this.flushSends();
    }

    if (this.pendingMembers.length === 0) {
      this.pendingBytes = bundleSizeOf([]);
      this.bundleTimer = setTimeout(() => {
        this.bundleTimer = null;
        this.flushSends();
      }, this.bundleWindowMs);
    }
    this.pendingMembers.push(frame);
    this.pendingBytes += BUNDLE_LENGTH_PREFIX_BYTES + frame.length;

    // A hidden tab has no frame loop and its timers are throttled to a second
    // or more, so a heartbeat sent from one would sit in the bundle far longer
    // than the window says. Nothing else is coming: send it now.
    if (documentIsHidden()) this.flushSends();
  }

  /**
   * Put the pending bundle on the wire now instead of at the end of the
   * window. Call it at the end of a frame when that frame's sends should not
   * wait. No-op when nothing is pending.
   */
  flushSends(): void {
    if (this.bundleTimer) {
      clearTimeout(this.bundleTimer);
      this.bundleTimer = null;
    }
    const members = this.pendingMembers;
    if (members.length === 0) return;
    this.pendingMembers = [];
    this.pendingBytes = 0;

    if (!this.isReady() || !this.ws) {
      // The socket went away inside the window. These were fire-and-forget
      // datagrams; UDP would have lost them too. Count, do not throw: the
      // caller that queued them has long since returned.
      this.sendStats.messagesDropped += members.length;
      return;
    }
    this.transmit(packMessageBundle(members), members.length > 1);
  }

  private transmit(frame: Uint8Array, wrapped: boolean): void {
    if (!this.ws) return;
    this.ws.send(frame);
    this.sendStats.framesSent += 1;
    this.sendStats.bytesSent += frame.length;
    if (wrapped) this.sendStats.bundlesSent += 1;
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
    this.stopCapabilities();

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
      this.stopCapabilities();
    this.stopCapabilities();

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
    this.startCapabilities();
  }

  /**
   * Advertise this build's capabilities now and on a timer while ready. The
   * server binds them to the router serving our flow; a token refresh or a
   * relay-side Buddy migration silently resets that, and until the next
   * advertisement we are served in the older per-member form, which we parse too.
   */
  private startCapabilities(): void {
    this.stopCapabilities();
    if (!this.advertiseCapabilities) return;
    void this.sendCapabilities();
    const timer = setInterval(() => {
      void this.sendCapabilities();
    }, this.capabilitiesIntervalMs);
    // Node: never keep a process alive for this timer (tests, tools).
    (timer as unknown as { unref?: () => void }).unref?.();
    this.capsTimer = timer;
  }

  private stopCapabilities(): void {
    if (this.capsTimer) {
      clearInterval(this.capsTimer);
      this.capsTimer = null;
    }
  }

  private async sendCapabilities(): Promise<void> {
    const ctx = this.signContext;
    if (!ctx || this.appId == null || !this.isReady()) return;
    try {
      const frame = await serializeClientCapabilities(ctx, this.appId);
      if (this.signContext !== ctx) return;
      this.sendFrame(frame);
      // The bundler would hold it for the window; nothing else is due right now.
      this.flushSends();
    } catch (error) {
      this.logger.debug?.(`capabilities not sent: ${String(error)}`);
    }
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
