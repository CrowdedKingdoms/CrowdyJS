/**
 * Realtime traffic metrics — SDK-owned counters for every spatial message the
 * client sends (the `client.udp.send*` mutations, including the ones issued
 * internally by the World Stores layers) and every notification delivered on
 * the shared `udpNotifications` subscription.
 *
 * Exposed as `client.metrics`; call {@link RealtimeMetrics.snapshot} from a
 * HUD/diagnostics loop. Byte counts measure the app-defined **payload** field
 * of each message (`state` / `audioData` / `text` / `payload` / `voxelState`),
 * not wire framing or GraphQL envelope overhead.
 */

/** Counter pair tracked per direction and per message kind. */
export interface RealtimeMetricsCounters {
  /** Number of messages. */
  messages: number;
  /** Total payload bytes (see module docs for what "payload" means). */
  bytes: number;
}

/** Per-kind counters for one message kind (e.g. `actorUpdate`, `audio`). */
export interface RealtimeMetricsKind {
  sent: RealtimeMetricsCounters;
  received: RealtimeMetricsCounters;
}

/** The result of {@link RealtimeMetrics.snapshot}. */
export interface RealtimeMetricsSnapshot {
  /** Cumulative counters since construction or the last {@link RealtimeMetrics.reset}. */
  totals: {
    sent: number;
    received: number;
    bytesSent: number;
    bytesReceived: number;
  };
  /**
   * Cumulative counters broken down by message kind. Sent kinds use the send
   * method's message name (`actorUpdate`, `voxelUpdate`, `audio`, `text`,
   * `clientEvent`, `singleActorMessage`, `channelMessage`); received kinds use
   * the notification handler names (`actorUpdate`, `voxelUpdate`, `audio`,
   * `text`, `clientEvent`, `serverEvent`, `singleActorMessage`,
   * `channelMessage`, `genericError`, `connectionEvent`, ...).
   */
  perKind: Record<string, RealtimeMetricsKind>;
  /** Rates averaged over the sliding window (~10 s). */
  rates: {
    sentPerSecond: number;
    receivedPerSecond: number;
    bytesSentPerSecond: number;
    bytesReceivedPerSecond: number;
  };
  /** Epoch milliseconds when tracking began (construction or last reset). */
  startedAt: number;
}

const WINDOW_SECONDS = 10;

interface RateBucket {
  second: number;
  sent: number;
  received: number;
  bytesSent: number;
  bytesReceived: number;
}

/**
 * Counter store behind `client.metrics`. All methods are cheap (plain counter
 * increments and a fixed ring of per-second rate buckets), so recording on
 * every message adds no meaningful overhead to the send/receive hot paths.
 */
export class RealtimeMetrics {
  private readonly buckets: RateBucket[];
  private readonly perKind = new Map<string, RealtimeMetricsKind>();
  private totalSent = 0;
  private totalReceived = 0;
  private totalBytesSent = 0;
  private totalBytesReceived = 0;
  private startedAtMs: number;

  /** @param now - Clock override for tests. Defaults to `Date.now`. */
  constructor(private readonly now: () => number = Date.now) {
    this.buckets = Array.from({ length: WINDOW_SECONDS }, () => ({
      second: -1,
      sent: 0,
      received: 0,
      bytesSent: 0,
      bytesReceived: 0,
    }));
    this.startedAtMs = this.now();
  }

  /** Record one outbound message. Called by the SDK's `udp.send*` methods. */
  recordSent(kind: string, payloadBytes: number): void {
    this.totalSent += 1;
    this.totalBytesSent += payloadBytes;
    const entry = this.kindEntry(kind);
    entry.sent.messages += 1;
    entry.sent.bytes += payloadBytes;
    const bucket = this.bucket();
    bucket.sent += 1;
    bucket.bytesSent += payloadBytes;
  }

  /** Record one delivered notification. Called by the realtime dispatch. */
  recordReceived(kind: string, payloadBytes: number): void {
    this.totalReceived += 1;
    this.totalBytesReceived += payloadBytes;
    const entry = this.kindEntry(kind);
    entry.received.messages += 1;
    entry.received.bytes += payloadBytes;
    const bucket = this.bucket();
    bucket.received += 1;
    bucket.bytesReceived += payloadBytes;
  }

  /**
   * A point-in-time copy of all counters plus rates averaged over the sliding
   * window. Safe to call every frame; allocation is proportional to the number
   * of distinct message kinds.
   */
  snapshot(): RealtimeMetricsSnapshot {
    const nowMs = this.now();
    const currentSecond = Math.floor(nowMs / 1000);
    let sent = 0;
    let received = 0;
    let bytesSent = 0;
    let bytesReceived = 0;
    for (const bucket of this.buckets) {
      if (bucket.second < 0 || currentSecond - bucket.second >= WINDOW_SECONDS) continue;
      sent += bucket.sent;
      received += bucket.received;
      bytesSent += bucket.bytesSent;
      bytesReceived += bucket.bytesReceived;
    }
    // Average over the tracked lifetime when younger than the full window so
    // early rates aren't diluted by empty seconds that never happened.
    const elapsedSeconds = Math.max(1, Math.min(WINDOW_SECONDS, (nowMs - this.startedAtMs) / 1000));
    const perKind: Record<string, RealtimeMetricsKind> = {};
    for (const [kind, entry] of this.perKind) {
      perKind[kind] = {
        sent: { ...entry.sent },
        received: { ...entry.received },
      };
    }
    return {
      totals: {
        sent: this.totalSent,
        received: this.totalReceived,
        bytesSent: this.totalBytesSent,
        bytesReceived: this.totalBytesReceived,
      },
      perKind,
      rates: {
        sentPerSecond: sent / elapsedSeconds,
        receivedPerSecond: received / elapsedSeconds,
        bytesSentPerSecond: bytesSent / elapsedSeconds,
        bytesReceivedPerSecond: bytesReceived / elapsedSeconds,
      },
      startedAt: this.startedAtMs,
    };
  }

  /** Zero every counter and restart the rate window. */
  reset(): void {
    this.totalSent = 0;
    this.totalReceived = 0;
    this.totalBytesSent = 0;
    this.totalBytesReceived = 0;
    this.perKind.clear();
    for (const bucket of this.buckets) {
      bucket.second = -1;
      bucket.sent = 0;
      bucket.received = 0;
      bucket.bytesSent = 0;
      bucket.bytesReceived = 0;
    }
    this.startedAtMs = this.now();
  }

  private kindEntry(kind: string): RealtimeMetricsKind {
    let entry = this.perKind.get(kind);
    if (!entry) {
      entry = {
        sent: { messages: 0, bytes: 0 },
        received: { messages: 0, bytes: 0 },
      };
      this.perKind.set(kind, entry);
    }
    return entry;
  }

  private bucket(): RateBucket {
    const second = Math.floor(this.now() / 1000);
    const bucket = this.buckets[second % WINDOW_SECONDS]!;
    if (bucket.second !== second) {
      bucket.second = second;
      bucket.sent = 0;
      bucket.received = 0;
      bucket.bytesSent = 0;
      bucket.bytesReceived = 0;
    }
    return bucket;
  }
}

/**
 * The size of a message's app-defined payload field: the first of `state`,
 * `audioData`, `text`, `payload`, or `voxelState` present as a string. Base64
 * and ASCII payloads measure 1 byte per character; multi-byte UTF-8 text is
 * approximated by its UTF-16 length.
 */
export function payloadBytesOf(record: Record<string, unknown>): number {
  for (const key of ['state', 'audioData', 'text', 'payload', 'voxelState']) {
    const value = record[key];
    if (typeof value === 'string') return value.length;
  }
  return 0;
}
