/**
 * Webcam video fragments: the SDK-side half of `CLIENT_VIDEO_PACKET_2` (143).
 *
 * A Buddy datagram carries at most 1232 bytes, and a long-spatial payload at most
 * ~1123 of them (1117 once the HMAC tail is counted). Even a 64×64 JPEG is 2–6 KB,
 * so a frame crosses as several packets. The server never looks inside a video
 * payload; THIS is the contract both SDKs implement, byte for byte
 * (published under "Wire formats" on docs.crowdedkingdoms.com):
 *
 * ```
 * offset  size  field       meaning
 * 0       1     version     0x01. Anything else: drop the fragment.
 * 1       1     codec       0 = JPEG, 1 = WebP. Others reserved; drop.
 * 2       2     frameId     uint16 big-endian, per sender, +1 per frame, wraps.
 * 4       1     fragIndex   0-based index of this fragment within the frame.
 * 5       1     fragCount   total fragments in the frame, 1..16.
 * 6       ...   body        this fragment's slice of the encoded frame.
 * ```
 *
 * Reassembly is per `(sender uuid, frameId)`: a frame is delivered once when every
 * index has arrived; an incomplete frame is dropped when a NEWER frameId from the
 * same sender arrives, or after {@link VIDEO_FRAME_TIMEOUT_MS} without progress. No
 * retransmit, no NACK — the next frame is the recovery. Pure functions and a small
 * class with no DOM dependency, so the same fixtures run here and in CrowdyCPP.
 */

/** Bytes of fragment header in front of every body slice. */
export const VIDEO_FRAGMENT_HEADER_BYTES = 6;
/** Largest body a fragment may carry with the HMAC tail present (1123 − 6). */
export const MAX_VIDEO_FRAGMENT_BODY_BYTES = 1117;
/** A frame is refused above this many fragments (~17.8 KB). */
export const MAX_VIDEO_FRAGMENTS = 16;
/** An incomplete frame is abandoned after this long without a new fragment. */
export const VIDEO_FRAME_TIMEOUT_MS = 500;
/** The one header version this SDK writes and accepts. */
export const VIDEO_FRAGMENT_VERSION = 1;

/** Frame codecs the header can name. */
export const VideoCodec = {
  JPEG: 0,
  WEBP: 1,
} as const;
export type VideoCodec = (typeof VideoCodec)[keyof typeof VideoCodec];

/** One fragment's parsed header. */
export interface VideoFragmentHeader {
  version: number;
  codec: number;
  frameId: number;
  fragIndex: number;
  fragCount: number;
}

/** A frame the assembler completed. */
export interface AssembledVideoFrame {
  uuid: string;
  frameId: number;
  codec: VideoCodec;
  bytes: Uint8Array;
  /** When the LAST fragment arrived (the caller's clock). */
  completedAt: number;
}

/**
 * Split one encoded frame into fragments, each `header || slice`.
 *
 * @param frame - the encoded frame bytes (a JPEG or WebP file as `Uint8Array`).
 * @param frameId - per-sender counter, `0..65535`; wraps by the caller.
 * @param codec - {@link VideoCodec}.
 * @param maxBody - bytes per fragment body; defaults to the wire maximum.
 * @throws {RangeError} when the frame would need more than {@link MAX_VIDEO_FRAGMENTS}
 *   fragments (send a smaller frame; a partial frame is never sent), when `frameId`
 *   is out of range, or when `frame` is empty.
 */
export function fragmentFrame(
  frame: Uint8Array,
  frameId: number,
  codec: VideoCodec = VideoCodec.JPEG,
  maxBody: number = MAX_VIDEO_FRAGMENT_BODY_BYTES,
): Uint8Array[] {
  if (frame.length === 0) throw new RangeError('video frame is empty');
  if (!Number.isInteger(frameId) || frameId < 0 || frameId > 0xffff) {
    throw new RangeError(`frameId must be 0..65535, got ${frameId}`);
  }
  if (!Number.isInteger(maxBody) || maxBody < 1 || maxBody > MAX_VIDEO_FRAGMENT_BODY_BYTES) {
    throw new RangeError(`maxBody must be 1..${MAX_VIDEO_FRAGMENT_BODY_BYTES}, got ${maxBody}`);
  }
  const fragCount = Math.ceil(frame.length / maxBody);
  if (fragCount > MAX_VIDEO_FRAGMENTS) {
    throw new RangeError(
      `video frame of ${frame.length} bytes needs ${fragCount} fragments; the ceiling is ${MAX_VIDEO_FRAGMENTS} (${MAX_VIDEO_FRAGMENTS * maxBody} bytes)`,
    );
  }
  const out: Uint8Array[] = [];
  for (let i = 0; i < fragCount; i += 1) {
    const slice = frame.subarray(i * maxBody, Math.min(frame.length, (i + 1) * maxBody));
    const packet = new Uint8Array(VIDEO_FRAGMENT_HEADER_BYTES + slice.length);
    packet[0] = VIDEO_FRAGMENT_VERSION;
    packet[1] = codec;
    packet[2] = (frameId >> 8) & 0xff;
    packet[3] = frameId & 0xff;
    packet[4] = i;
    packet[5] = fragCount;
    packet.set(slice, VIDEO_FRAGMENT_HEADER_BYTES);
    out.push(packet);
  }
  return out;
}

/**
 * Parse a fragment header. Returns `null` for anything this SDK must drop: too
 * short, wrong version, reserved codec, `fragCount` outside `1..16`, or an index at
 * or past the count.
 */
export function parseVideoFragmentHeader(packet: Uint8Array): VideoFragmentHeader | null {
  if (packet.length < VIDEO_FRAGMENT_HEADER_BYTES) return null;
  const version = packet[0];
  const codec = packet[1];
  const frameId = (packet[2] << 8) | packet[3];
  const fragIndex = packet[4];
  const fragCount = packet[5];
  if (version !== VIDEO_FRAGMENT_VERSION) return null;
  if (codec !== VideoCodec.JPEG && codec !== VideoCodec.WEBP) return null;
  if (fragCount < 1 || fragCount > MAX_VIDEO_FRAGMENTS) return null;
  if (fragIndex >= fragCount) return null;
  return { version, codec, frameId, fragIndex, fragCount };
}

/** True when `a` is newer than `b` on the wrapping uint16 frameId counter. */
export function isNewerFrameId(a: number, b: number): boolean {
  return ((a - b) & 0xffff) !== 0 && ((a - b) & 0xffff) < 0x8000;
}

interface PendingFrame {
  frameId: number;
  codec: VideoCodec;
  fragCount: number;
  parts: Array<Uint8Array | undefined>;
  received: number;
  lastAt: number;
}

/**
 * Reassembles fragments per sender. Feed every `ClientVideoNotification`'s
 * decoded `videoData` to {@link ingest}; call {@link prune} on a timer (or rely on
 * the newer-frame rule alone) and {@link forget} when a sender leaves.
 */
export class VideoFrameAssembler {
  private readonly pending = new Map<string, PendingFrame>();
  /** The newest frameId per sender that was completed or abandoned; older ones are stragglers. */
  private readonly lastDone = new Map<string, number>();
  /** Fragments dropped for a malformed header or a stale frameId. */
  dropped = 0;
  /** Frames abandoned incomplete (newer frame arrived, timeout, or forget). */
  abandoned = 0;

  constructor(private readonly timeoutMs: number = VIDEO_FRAME_TIMEOUT_MS) {}

  /**
   * Add one fragment. Returns the completed frame when this fragment finished it,
   * otherwise `null`.
   */
  ingest(uuid: string, packet: Uint8Array, nowMs: number = Date.now()): AssembledVideoFrame | null {
    const header = parseVideoFragmentHeader(packet);
    if (!header) {
      this.dropped += 1;
      return null;
    }
    let frame = this.pending.get(uuid);
    if (!frame) {
      const done = this.lastDone.get(uuid);
      if (done !== undefined && !isNewerFrameId(header.frameId, done)) {
        // A straggler from a frame already completed or abandoned.
        this.dropped += 1;
        return null;
      }
    }
    if (frame && frame.frameId !== header.frameId) {
      if (isNewerFrameId(header.frameId, frame.frameId)) {
        // The sender has moved on; whatever we had of the old frame will never complete.
        this.abandoned += 1;
        this.lastDone.set(uuid, frame.frameId);
        this.pending.delete(uuid);
        frame = undefined;
      } else {
        // A straggler from a frame we already completed or abandoned.
        this.dropped += 1;
        return null;
      }
    }
    if (frame && (frame.fragCount !== header.fragCount || frame.codec !== header.codec)) {
      // Same frameId, different shape: corrupt or a very fast wrap. Start over.
      this.abandoned += 1;
      frame = undefined;
    }
    if (!frame) {
      frame = {
        frameId: header.frameId,
        codec: header.codec as VideoCodec,
        fragCount: header.fragCount,
        parts: new Array<Uint8Array | undefined>(header.fragCount),
        received: 0,
        lastAt: nowMs,
      };
      this.pending.set(uuid, frame);
    }
    if (frame.parts[header.fragIndex] === undefined) {
      frame.parts[header.fragIndex] = packet.subarray(VIDEO_FRAGMENT_HEADER_BYTES);
      frame.received += 1;
    }
    frame.lastAt = nowMs;
    if (frame.received < frame.fragCount) return null;

    this.pending.delete(uuid);
    this.lastDone.set(uuid, frame.frameId);
    let total = 0;
    for (const part of frame.parts) total += part!.length;
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const part of frame.parts) {
      bytes.set(part!, off);
      off += part!.length;
    }
    return { uuid, frameId: frame.frameId, codec: frame.codec, bytes, completedAt: nowMs };
  }

  /** Abandon frames that have not progressed within the timeout. Returns how many. */
  prune(nowMs: number = Date.now()): number {
    let n = 0;
    for (const [uuid, frame] of this.pending) {
      if (nowMs - frame.lastAt > this.timeoutMs) {
        this.pending.delete(uuid);
        this.lastDone.set(uuid, frame.frameId);
        this.abandoned += 1;
        n += 1;
      }
    }
    return n;
  }

  /** Drop any partial frame for a sender that left. */
  forget(uuid: string): void {
    if (this.pending.delete(uuid)) this.abandoned += 1;
    this.lastDone.delete(uuid);
  }

  /** Senders with a frame in progress. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
