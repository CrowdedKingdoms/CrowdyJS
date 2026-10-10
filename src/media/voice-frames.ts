/**
 * Voice payloads: an optional convention for what an app carries inside an audio payload
 * (`CLIENT_AUDIO_PACKET_2` 134, delivered as `CLIENT_AUDIO_NOTIFICATION_2` 135).
 *
 * The server never looks inside an audio payload, and an app with a format of its own keeps it.
 * This is a shared one, implemented byte for byte by both SDKs (CrowdyCPP's
 * `crowdy/media/voice_frames.hpp`; both replay `test/unit/fixtures/voice-frames.json`): a 10-byte
 * header in front of each codec frame, integers little-endian.
 *
 * ```
 * offset  size  field      meaning
 * 0       1     version    1. A reader refuses any other version.
 * 1       1     codec      0 = unspecified / raw, 1 = Opus 48 kHz mono, 2 = G.711 µ-law 8 kHz.
 * 2       2     seq        uint16, +1 per packet sent, wraps.
 * 4       4     timestamp  uint32 in codec samples (48 kHz for Opus, 8 kHz for µ-law;
 *                          milliseconds for codec 0 and any codec not listed), wraps.
 * 8       1     frameMs    the frame's duration in milliseconds.
 * 9       1     flags      bit 0: the first packet after silence (a talk spurt starts);
 *                          bit 1: the last packet before silence. Other bits are reserved.
 * 10      ...   frame      one codec frame.
 * ```
 *
 * A reader refuses a packet shorter than 10 bytes or of another version: {@link decodeVoicePacket}
 * returns `null`, and nothing here throws on a packet from the network. {@link VoicePacketizer}
 * numbers one sender's frames and sets the talk-spurt flags; {@link VoiceJitterBuffer} puts each
 * sender's packets back in order, plays them out after a fixed delay and reports the frames that
 * never came as gaps.
 *
 * **Opus.** No codec ships with this SDK. A browser encodes and decodes Opus with WebCodecs: an
 * `AudioEncoder` configured `{ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate:
 * 24000, opus: { frameDuration: 20000 } }` emits one `EncodedAudioChunk` per 20 ms (copy it out
 * with `copyTo` and packetize the bytes), and an `AudioDecoder` configured `{ codec: 'opus',
 * sampleRate: 48000, numberOfChannels: 1 }` decodes each frame the jitter buffer plays (`new
 * EncodedAudioChunk({ type: 'key', timestamp, data })`). Check `typeof AudioEncoder !==
 * 'undefined'` and `AudioEncoder.isConfigSupported(config)` first, and fall back to G.711 µ-law
 * (codec 2) where either is missing. WebCodecs conceals no loss: on a gap, repeat the last
 * decoded frame more quietly, or play silence. Where a voice sits in the world (panning,
 * distance attenuation) is the game's to decide.
 */

/** Bytes of voice header in front of every codec frame. */
export const VOICE_HEADER_BYTES = 10;
/** The one header version this SDK writes and accepts. */
export const VOICE_HEADER_VERSION = 1;
/** Largest codec frame one audio payload carries with the HMAC tail present (1123 − 10). */
export const MAX_VOICE_FRAME_BYTES = 1113;
/** Default {@link VoiceJitterBufferOptions.targetDelayMs}. */
export const VOICE_TARGET_DELAY_MS = 60;
/** Default {@link VoiceJitterBufferOptions.maxFrames}. */
export const VOICE_JITTER_MAX_FRAMES = 64;
/** Default {@link VoiceJitterBufferOptions.resetAfterMs}. */
export const VOICE_RESET_AFTER_MS = 200;

/** Codecs the header names. Any other value is carried through as it is. */
export const VoiceCodec = {
  /** Unspecified, or raw samples in a format the app defines. The timestamp counts milliseconds. */
  RAW: 0,
  /** Opus, 48 kHz, one channel. */
  OPUS: 1,
  /** G.711 µ-law, 8 kHz, one byte per sample. */
  MULAW: 2,
} as const;
export type VoiceCodec = (typeof VoiceCodec)[keyof typeof VoiceCodec];

/** Header flag bits. */
export const VoiceFlag = {
  /** The first packet after silence: a talk spurt starts. */
  SPURT_START: 1,
  /** The last packet before silence. */
  SPURT_END: 2,
} as const;

/** A parsed or to-be-written voice header. */
export interface VoiceHeader {
  version: number;
  codec: number;
  seq: number;
  timestamp: number;
  frameMs: number;
  flags: number;
}

/** A parsed voice packet: its header and the codec frame after it. */
export interface VoicePacket {
  header: VoiceHeader;
  /** A view into the packet, not a copy. */
  frame: Uint8Array;
}

/** The sample clock a codec's timestamps count: 48000 (Opus), 8000 (µ-law), else 1000. */
export function voiceClockRate(codec: number): number {
  if (codec === VoiceCodec.OPUS) return 48000;
  if (codec === VoiceCodec.MULAW) return 8000;
  return 1000;
}

/** How far the timestamp moves for one frame of `frameMs` milliseconds. */
export function voiceSamplesPerFrame(codec: number, frameMs: number): number {
  return (voiceClockRate(codec) / 1000) * frameMs;
}

/**
 * The distance from seq `b` to seq `a` on the wrapping uint16 counter, from −32768 to 32767:
 * positive when `a` is newer.
 */
export function voiceSeqDiff(a: number, b: number): number {
  const d = (a - b) & 0xffff;
  return d >= 0x8000 ? d - 0x10000 : d;
}

/**
 * Write a voice header (always version 1).
 *
 * @throws {RangeError} when a field is outside its width: codec, frameMs and flags 0-255, seq
 *   0-65535, timestamp 0-4294967295.
 */
export function encodeVoiceHeader(header: Omit<VoiceHeader, 'version'>): Uint8Array {
  checkField('codec', header.codec, 0xff);
  checkField('seq', header.seq, 0xffff);
  checkField('timestamp', header.timestamp, 0xffffffff);
  checkField('frameMs', header.frameMs, 0xff);
  checkField('flags', header.flags, 0xff);
  const out = new Uint8Array(VOICE_HEADER_BYTES);
  const view = new DataView(out.buffer);
  out[0] = VOICE_HEADER_VERSION;
  out[1] = header.codec;
  view.setUint16(2, header.seq, true);
  view.setUint32(4, header.timestamp, true);
  out[8] = header.frameMs;
  out[9] = header.flags;
  return out;
}

/**
 * `header || frame`, ready for `udp.sendAudioPacket` (base64 it as `audioData`).
 *
 * @throws {RangeError} as {@link encodeVoiceHeader}, and when the frame is longer than
 *   {@link MAX_VOICE_FRAME_BYTES}.
 */
export function encodeVoicePacket(
  header: Omit<VoiceHeader, 'version'>,
  frame: Uint8Array,
): Uint8Array {
  if (frame.length > MAX_VOICE_FRAME_BYTES) {
    throw new RangeError(
      `voice frame of ${frame.length} bytes exceeds ${MAX_VOICE_FRAME_BYTES} bytes`,
    );
  }
  const packet = new Uint8Array(VOICE_HEADER_BYTES + frame.length);
  packet.set(encodeVoiceHeader(header), 0);
  packet.set(frame, VOICE_HEADER_BYTES);
  return packet;
}

/**
 * Parse a voice packet. Returns `null` for a packet shorter than {@link VOICE_HEADER_BYTES} or of
 * a version other than {@link VOICE_HEADER_VERSION}. Codecs and flag bits this SDK does not know
 * are returned as they are.
 */
export function decodeVoicePacket(packet: Uint8Array): VoicePacket | null {
  if (packet.length < VOICE_HEADER_BYTES) return null;
  if (packet[0] !== VOICE_HEADER_VERSION) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  return {
    header: {
      version: packet[0],
      codec: packet[1],
      seq: view.getUint16(2, true),
      timestamp: view.getUint32(4, true),
      frameMs: packet[8],
      flags: packet[9],
    },
    frame: packet.subarray(VOICE_HEADER_BYTES),
  };
}

/** Options for {@link VoicePacketizer}. */
export interface VoicePacketizerOptions {
  /** {@link VoiceCodec}, or an app's own value (0-255). */
  codec: number;
  /** The duration of every frame, 1-255 ms. */
  frameMs: number;
  /** The first packet's seq. Defaults to 0. */
  seq?: number;
  /** The first packet's timestamp. Defaults to 0. */
  timestamp?: number;
}

/**
 * Numbers one sender's frames: each packet gets the next seq (uint16, wraps) and a timestamp one
 * frame later than the last (uint32, wraps). The first packet, and the first after a `last` one
 * or a {@link skip}, carries {@link VoiceFlag.SPURT_START}. Keep one packetizer for as long as the
 * sender speaks with the same codec and frame duration, muted stretches included: a fresh one
 * starts its seq over, and a receiver that still holds the old stream drops packets that look old
 * to it until the seq catches up or the stream is reset.
 */
export class VoicePacketizer {
  readonly codec: number;
  readonly frameMs: number;
  private seqValue: number;
  private timestampValue: number;
  private spurtStart = true;

  /** @throws {RangeError} for a codec outside 0-255, a frameMs outside 1-255, or a bad seq or timestamp. */
  constructor(options: VoicePacketizerOptions) {
    checkField('codec', options.codec, 0xff);
    checkField('frameMs', options.frameMs, 0xff);
    if (options.frameMs < 1) throw new RangeError('frameMs must be 1-255, got 0');
    checkField('seq', options.seq ?? 0, 0xffff);
    checkField('timestamp', options.timestamp ?? 0, 0xffffffff);
    this.codec = options.codec;
    this.frameMs = options.frameMs;
    this.seqValue = options.seq ?? 0;
    this.timestampValue = options.timestamp ?? 0;
  }

  /** The seq the next packet will carry. */
  get nextSeq(): number {
    return this.seqValue;
  }

  /** The timestamp the next packet will carry. */
  get nextTimestamp(): number {
    return this.timestampValue;
  }

  /**
   * The next packet: the header, then `frame`.
   *
   * @param options - `last`: this is the last packet before silence ({@link VoiceFlag.SPURT_END});
   *   the next one starts a talk spurt.
   * @throws {RangeError} when the frame is longer than {@link MAX_VOICE_FRAME_BYTES}; nothing is
   *   numbered.
   */
  packetize(frame: Uint8Array, options: { last?: boolean } = {}): Uint8Array {
    const last = options.last === true;
    const packet = encodeVoicePacket(
      {
        codec: this.codec,
        seq: this.seqValue,
        timestamp: this.timestampValue,
        frameMs: this.frameMs,
        flags: (this.spurtStart ? VoiceFlag.SPURT_START : 0) | (last ? VoiceFlag.SPURT_END : 0),
      },
      frame,
    );
    this.seqValue = (this.seqValue + 1) & 0xffff;
    this.advance(1);
    this.spurtStart = last;
    return packet;
  }

  /**
   * Silence: move the timestamp past `frames` frames that are not sent (the seq does not move),
   * and start a talk spurt with the next packet. `skip(0)` only does the latter.
   *
   * @throws {RangeError} unless `frames` is a non-negative integer.
   */
  skip(frames = 1): void {
    if (!Number.isInteger(frames) || frames < 0) {
      throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
    }
    this.advance(frames % 0x100000000);
    this.spurtStart = true;
  }

  private advance(frames: number): void {
    const step = voiceSamplesPerFrame(this.codec, this.frameMs);
    this.timestampValue = (this.timestampValue + ((frames * step) % 0x100000000)) % 0x100000000;
  }
}

/** Options for {@link VoiceJitterBuffer}. */
export interface VoiceJitterBufferOptions {
  /** How long after the first packet of a talk spurt arrives it plays. Defaults to 60 ms. */
  targetDelayMs?: number;
  /**
   * The window of seqs one sender may have buffered, from the next one to play; a packet this far
   * ahead of it or farther starts the stream over. Defaults to 64 (1.28 s of 20 ms frames).
   */
  maxFrames?: number;
  /**
   * A sender with no packet accepted for this long is silent: its stream stops reporting gaps,
   * and the next packet starts it over. Must exceed `targetDelayMs`. Defaults to 200 ms.
   */
  resetAfterMs?: number;
}

/** What {@link VoiceJitterBuffer.push} did with a packet. */
export type VoicePushResult = 'buffered' | 'late' | 'duplicate' | 'malformed';

/** One played slot: a frame, or a gap where one never came. */
export interface VoicePlayout {
  /** The sender's key, as pushed. */
  key: string;
  seq: number;
  /** The frame's timestamp; for a gap, the one its frame would have had. */
  timestamp: number;
  codec: number;
  frameMs: number;
  /** The frame's flags; 0 for a gap. */
  flags: number;
  /** True when the frame is missing: conceal `frameMs` of audio (or play silence). */
  gap: boolean;
  /** The codec frame, or `null` for a gap. */
  frame: Uint8Array | null;
}

interface VoiceStream {
  codec: number;
  frameMs: number;
  nextSeq: number;
  /** When `nextSeq` plays. */
  nextAtMs: number;
  /** The timestamp `nextSeq` is expected to carry. */
  nextTimestamp: number;
  /** A slot has been played (or reported as a gap) in this spurt. */
  started: boolean;
  highestSeq: number;
  /** The seq of the accepted last-before-silence packet. */
  endSeq: number | null;
  /** `endSeq` has played: the spurt is over. */
  ended: boolean;
  lastArrivalMs: number;
  frames: Map<number, VoicePacket>;
}

/**
 * Puts each sender's voice packets back in order and plays them out after a fixed delay. Feed
 * every audio notification's decoded `audioData` to {@link push} with the sender's key (its actor
 * uuid), call {@link pull} (or {@link poll}) at least once a frame, and {@link forget} a sender
 * that left. Pass both the same clock (`performance.now()` in a browser; `Date.now()` when
 * omitted). Pure and clock-injected, so both SDKs replay the same fixtures.
 *
 * - A sender's stream starts with the first packet it accepts, which plays `targetDelayMs` after
 *   it arrived; each later seq plays `frameMs` after the one before it.
 * - {@link pull} returns the slots that are due, in seq order: the frame, or a gap (`frame:
 *   null`) when it is missing. After the last packet before silence ({@link VoiceFlag.SPURT_END})
 *   the stream reports nothing more. It reports slots only until `resetAfterMs` after the last
 *   packet it accepted, and is then reset.
 * - A packet is late, and dropped, when its slot has passed or has been played. One older than the
 *   first slot of a spurt that has not started playing is fitted in front of it while its slot is
 *   still ahead.
 * - The stream starts over, dropping what it holds, on a packet that starts a talk spurt and is
 *   newer than every packet it accepted; on a packet newer than the spurt's last packet before
 *   silence; on a change of codec or frame duration; on a packet `maxFrames` or more seqs ahead of
 *   the next one to play; and on any packet after `resetAfterMs` without one accepted. A sender
 *   that restarts its seq lower is dropped as late until then.
 * - A sender holds at most `maxFrames` frames.
 *
 * The frame duration is fixed within a talk spurt, and so is the delay once the spurt starts: a
 * sender whose clock runs fast fills the window, one that runs slow underruns, and both recover at
 * the next spurt.
 */
export class VoiceJitterBuffer {
  /** Packets dropped because their slot had passed. */
  late = 0;
  /** Packets dropped because their seq was already buffered. */
  duplicates = 0;
  /** Packets refused as not voice v1 (or with a frame duration of 0). */
  malformed = 0;
  /** Buffered frames thrown away unplayed (a stream started over, went silent, or was forgotten). */
  discarded = 0;
  /** Slots reported as gaps. */
  gaps = 0;

  private readonly targetDelayMs: number;
  private readonly maxFrames: number;
  private readonly resetAfterMs: number;
  private readonly streams = new Map<string, VoiceStream>();

  /**
   * @throws {RangeError} for a negative `targetDelayMs`, a `maxFrames` outside 1-4096, or a
   *   `resetAfterMs` not above `targetDelayMs`.
   */
  constructor(options: VoiceJitterBufferOptions = {}) {
    this.targetDelayMs = options.targetDelayMs ?? VOICE_TARGET_DELAY_MS;
    this.maxFrames = options.maxFrames ?? VOICE_JITTER_MAX_FRAMES;
    this.resetAfterMs = options.resetAfterMs ?? VOICE_RESET_AFTER_MS;
    if (!Number.isInteger(this.targetDelayMs) || this.targetDelayMs < 0) {
      throw new RangeError(`targetDelayMs must be a non-negative integer, got ${this.targetDelayMs}`);
    }
    if (!Number.isInteger(this.maxFrames) || this.maxFrames < 1 || this.maxFrames > 4096) {
      throw new RangeError(`maxFrames must be 1-4096, got ${this.maxFrames}`);
    }
    if (!Number.isInteger(this.resetAfterMs) || this.resetAfterMs <= this.targetDelayMs) {
      throw new RangeError(
        `resetAfterMs must be an integer above targetDelayMs (${this.targetDelayMs}), got ${this.resetAfterMs}`,
      );
    }
  }

  /** Add one packet from the sender `key`. Never throws on the packet's contents. */
  push(key: string, packet: Uint8Array, nowMs: number = Date.now()): VoicePushResult {
    const parsed = decodeVoicePacket(packet);
    if (!parsed || parsed.header.frameMs === 0) {
      this.malformed += 1;
      return 'malformed';
    }
    const { header } = parsed;
    const held: VoicePacket = { header, frame: parsed.frame.slice() };
    let stream = this.streams.get(key);
    if (stream && this.startsOver(stream, header, nowMs)) {
      this.discarded += stream.frames.size;
      stream = undefined;
    }
    if (!stream) {
      this.streams.set(key, {
        codec: header.codec,
        frameMs: header.frameMs,
        nextSeq: header.seq,
        nextAtMs: nowMs + this.targetDelayMs,
        nextTimestamp: header.timestamp,
        started: false,
        highestSeq: header.seq,
        endSeq: (header.flags & VoiceFlag.SPURT_END) !== 0 ? header.seq : null,
        ended: false,
        lastArrivalMs: nowMs,
        frames: new Map([[header.seq, held]]),
      });
      return 'buffered';
    }
    const ahead = voiceSeqDiff(header.seq, stream.nextSeq);
    const slotAtMs = stream.nextAtMs + ahead * stream.frameMs;
    const behind =
      ahead < 0 &&
      (stream.started || voiceSeqDiff(stream.highestSeq, header.seq) >= this.maxFrames);
    if (behind || slotAtMs < nowMs) {
      this.late += 1;
      return 'late';
    }
    if (stream.frames.has(header.seq)) {
      this.duplicates += 1;
      return 'duplicate';
    }
    if (ahead < 0) {
      stream.nextSeq = header.seq;
      stream.nextAtMs = slotAtMs;
      stream.nextTimestamp = header.timestamp;
    }
    stream.frames.set(header.seq, held);
    stream.lastArrivalMs = nowMs;
    if (voiceSeqDiff(header.seq, stream.highestSeq) > 0) stream.highestSeq = header.seq;
    if ((header.flags & VoiceFlag.SPURT_END) !== 0 && stream.endSeq === null) {
      stream.endSeq = header.seq;
    }
    return 'buffered';
  }

  /** The sender's slots due by `nowMs`, in seq order. */
  pull(key: string, nowMs: number = Date.now()): VoicePlayout[] {
    const stream = this.streams.get(key);
    if (!stream) return [];
    const out: VoicePlayout[] = [];
    const silentAtMs = stream.lastArrivalMs + this.resetAfterMs;
    while (!stream.ended && stream.nextAtMs <= nowMs && stream.nextAtMs < silentAtMs) {
      const seq = stream.nextSeq;
      const held = stream.frames.get(seq);
      if (held) {
        stream.frames.delete(seq);
        out.push({
          key,
          seq,
          timestamp: held.header.timestamp,
          codec: held.header.codec,
          frameMs: held.header.frameMs,
          flags: held.header.flags,
          gap: false,
          frame: held.frame,
        });
        stream.nextTimestamp = held.header.timestamp;
      } else {
        this.gaps += 1;
        out.push({
          key,
          seq,
          timestamp: stream.nextTimestamp,
          codec: stream.codec,
          frameMs: stream.frameMs,
          flags: 0,
          gap: true,
          frame: null,
        });
      }
      stream.started = true;
      if (stream.endSeq === seq) stream.ended = true;
      stream.nextSeq = (seq + 1) & 0xffff;
      stream.nextAtMs += stream.frameMs;
      stream.nextTimestamp =
        (stream.nextTimestamp + voiceSamplesPerFrame(stream.codec, stream.frameMs)) % 0x100000000;
    }
    if (nowMs >= silentAtMs) {
      this.discarded += stream.frames.size;
      this.streams.delete(key);
    }
    return out;
  }

  /** Every sender's due slots ({@link pull} for each); senders in no particular order. */
  poll(nowMs: number = Date.now()): VoicePlayout[] {
    const out: VoicePlayout[] = [];
    for (const key of [...this.streams.keys()]) out.push(...this.pull(key, nowMs));
    return out;
  }

  /** Drop a sender's stream (it left). */
  forget(key: string): void {
    const stream = this.streams.get(key);
    if (!stream) return;
    this.discarded += stream.frames.size;
    this.streams.delete(key);
  }

  /** Senders with a stream. */
  get senderCount(): number {
    return this.streams.size;
  }

  /** Frames the sender has buffered. */
  bufferedCount(key: string): number {
    return this.streams.get(key)?.frames.size ?? 0;
  }

  private startsOver(stream: VoiceStream, header: VoiceHeader, nowMs: number): boolean {
    if (nowMs - stream.lastArrivalMs >= this.resetAfterMs) return true;
    if (header.codec !== stream.codec || header.frameMs !== stream.frameMs) return true;
    if (
      (header.flags & VoiceFlag.SPURT_START) !== 0 &&
      voiceSeqDiff(header.seq, stream.highestSeq) > 0
    ) {
      return true;
    }
    if (stream.endSeq !== null && voiceSeqDiff(header.seq, stream.endSeq) > 0) return true;
    return voiceSeqDiff(header.seq, stream.nextSeq) >= this.maxFrames;
  }
}

function checkField(name: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be an integer 0-${max}, got ${value}`);
  }
}
