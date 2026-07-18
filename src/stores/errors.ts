/**
 * Error attribution — the bookkeeping games skip and then regret.
 *
 * The server reports UDP-side failures asynchronously as
 * `GenericErrorResponse { sequenceNumber, errorCode }`. Without a record of
 * what each sequence number was, apps can only log them. The session tracks
 * every outbound send made through the stores (kind, actor uuid, detail) in
 * a 256-slot table (sequence numbers are uint8), so each error is
 * **attributed** to the send that caused it and kept in a queryable ring
 * buffer.
 */

import type { SentPacketRecord, WorldSessionContext } from './session.js';

/** A server-reported send error, attributed to the send that caused it. */
export interface AttributedError {
  /** The server's `UdpErrorCode` (e.g. `'UNAUTHORIZED'`). */
  errorCode: string;
  sequenceNumber: number;
  receivedAt: number;
  /**
   * The tracked outbound send with this sequence number, when the session
   * saw one (undefined for sends made outside the stores).
   */
  send?: SentPacketRecord;
}

/** Options for {@link attachErrorStore}. */
export interface ErrorStoreConfig {
  /** Errors kept in the ring buffer. Defaults to 50. */
  capacity?: number;
  /** Clock override for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The SDK-managed **send-error log**: every `GenericErrorResponse` is
 * attributed to the tracked send with the same sequence number and recorded
 * (newest first). Query {@link recent}, subscribe with {@link onError}, or
 * look up the latest error for one actor with {@link lastFor}.
 *
 * Sequence numbers are uint8 correlation ids that wrap at 256, so
 * attribution is best-effort by design: a very old error after 256 newer
 * sends would attribute to the newer send with the reused number.
 */
export class ErrorStore {
  private readonly ring: AttributedError[] = [];
  private readonly sends = new Map<number, SentPacketRecord>(); // seq → last send
  private readonly byActor = new Map<string, AttributedError>();
  private readonly listeners = new Set<(error: AttributedError) => void>();
  private readonly capacity: number;
  private readonly now: () => number;
  private totalCount = 0;

  constructor(ctx: WorldSessionContext, config: ErrorStoreConfig = {}) {
    this.capacity = Math.max(1, config.capacity ?? 50);
    this.now = config.now ?? Date.now;

    // Become the session's send-tracking sink: stores that send call
    // ctx.trackSend(...) and we remember the last send per sequence number.
    ctx.setSendTracker((record) => {
      this.sends.set(record.sequenceNumber, record);
    });

    ctx.onDispose(
      ctx.on('genericError', (notification) => {
        const send = this.sends.get(notification.sequenceNumber);
        const error: AttributedError = {
          errorCode: String(notification.errorCode),
          sequenceNumber: notification.sequenceNumber,
          receivedAt: this.now(),
          ...(send ? { send } : {}),
        };
        this.ring.unshift(error);
        if (this.ring.length > this.capacity) this.ring.length = this.capacity;
        this.totalCount += 1;
        if (send?.uuid) this.byActor.set(send.uuid, error);
        for (const listener of [...this.listeners]) listener(error);
      }),
    );
  }

  /** The most recent errors, newest first (up to `n`, default all kept). */
  recent(n?: number): AttributedError[] {
    return n === undefined ? [...this.ring] : this.ring.slice(0, n);
  }

  /** The single most recent error, if any. */
  get last(): AttributedError | undefined {
    return this.ring[0];
  }

  /** Total errors seen (including ones evicted from the ring). */
  get total(): number {
    return this.totalCount;
  }

  /** The latest error attributed to sends by one actor uuid. */
  lastFor(uuid: string): AttributedError | undefined {
    return this.byActor.get(uuid);
  }

  /** Subscribe to every attributed error. @returns off. */
  onError(listener: (error: AttributedError) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drop the recorded errors (send tracking continues). */
  clear(): void {
    this.ring.length = 0;
    this.byActor.clear();
  }
}

/**
 * Attach an {@link ErrorStore} to a world session context. Prefer the
 * `errors` key of `createWorldSession`'s config.
 */
export function attachErrorStore(
  ctx: WorldSessionContext,
  config: ErrorStoreConfig = {},
): ErrorStore {
  return new ErrorStore(ctx, config);
}
