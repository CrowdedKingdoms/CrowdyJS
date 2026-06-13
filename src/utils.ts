import { CrowdyProtocolError } from './errors.js';
import type { ChunkCoordinatesInput, Scalars } from './generated/graphql.js';

/**
 * Allocates the per-client `sequenceNumber` stamped on outgoing spatial
 * messages (actor / voxel / audio / text / event sends). The `...AndWait`
 * helpers use it to correlate each send with the echo or
 * {@link GenericErrorResponse} the server fans back on the `udpNotifications`
 * subscription (matched via `sequenceNumber`).
 *
 * Values are a single **unsigned byte**: they advance monotonically and wrap
 * modulo 256 (…, 254, 255, 0, 1, …), mirroring the uint8 carried on the UDP
 * wire. This is for **correlation only** — a `sequenceNumber` is *not* an
 * idempotency key, and with just 256 distinct values you should treat an echo
 * as matched as soon as it arrives rather than keeping many sends in flight at
 * once.
 *
 * Allocate one instance per client/connection so its counter stays private to
 * that session.
 */
export class SequenceAllocator {
  private nextValue: number;

  /**
   * @param seed - The first value {@link next} will return, truncated to a
   *   byte (`seed & 0xff`). Defaults to `1`.
   */
  constructor(seed = 1) {
    this.nextValue = seed & 0xff;
  }

  /**
   * Return the current sequence value, then advance the counter by one
   * (wrapping back to `0` after `255`).
   *
   * @returns The next sequence number to stamp on a send, in the inclusive
   *   range `0`–`255`.
   */
  next(): number {
    const value = this.nextValue;
    this.nextValue = (this.nextValue + 1) & 0xff;
    return value;
  }
}

/**
 * Mint a fresh Crowdy actor id: 16 cryptographically random bytes rendered as
 * **32 lowercase-hex ASCII characters** (e.g.
 * `"0123456789abcdef0123456789abcdef"`).
 *
 * This is the UDP-wire actor id used throughout the SDK — it is **not** a
 * hyphenated RFC-4122 UUID and carries no dashes or version/variant bits. The
 * result always satisfies {@link validateCrowdyUuid} (exactly 32 ASCII bytes).
 *
 * Requires a Web Crypto `crypto.getRandomValues` global (present in browsers
 * and modern Node, or polyfilled).
 *
 * @returns A new 32-character hex actor id.
 */
export function generateCrowdyUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Assert that `uuid` is a well-formed Crowdy actor id — **exactly 32 bytes
 * when UTF-8 encoded**. Because the wire id is plain ASCII that means 32 ASCII
 * characters; any non-ASCII character encodes to multiple bytes and so fails
 * the check. Call it before sending an id you didn't obtain from
 * {@link generateCrowdyUuid} or the server.
 *
 * @param uuid - The candidate actor id.
 * @throws {CrowdyProtocolError} if the id is not exactly 32 UTF-8 bytes.
 */
export function validateCrowdyUuid(uuid: string): void {
  if (new TextEncoder().encode(uuid).length !== 32) {
    throw new CrowdyProtocolError({
      message: 'Crowdy UUID must be exactly 32 bytes when UTF-8 encoded',
    });
  }
}

/**
 * Encode raw bytes as a base64 string for the SDK's binary fields — the
 * `state`, `audioData`, `payload`, and similar blobs on spatial sends and
 * notifications all travel as base64 over the wire.
 *
 * Uses the `btoa` global; each `Uint8Array` element is treated as one byte.
 * Inverse of {@link decodeBase64}.
 *
 * @param bytes - The binary payload to encode.
 * @returns The base64-encoded representation.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string from a binary SDK/wire field (e.g. a notification's
 * `state` / `audioData` / `payload`) back into raw bytes.
 *
 * Uses the `atob` global. Inverse of {@link encodeBase64}.
 *
 * @param value - The base64 text to decode.
 * @returns The decoded bytes.
 */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Assert that a chunk address fits the wire format: each of `x`, `y`, `z` must
 * be a valid **signed 64-bit integer**
 * (−9,223,372,036,854,775,808 … 9,223,372,036,854,775,807). Chunk coordinates
 * travel as int64 decimal strings, so this guards against values that would
 * overflow the server's int64 columns before you send them.
 *
 * Each axis is parsed with `BigInt()`, so a number or a decimal string is
 * accepted; a non-integer literal is rejected by `BigInt()` itself (a native
 * `SyntaxError`) before the range check runs.
 *
 * @param chunk - The chunk coordinates to validate.
 * @throws {CrowdyProtocolError} if any axis is outside the signed int64 range.
 */
export function validateChunkCoordinates(chunk: ChunkCoordinatesInput): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    const value = BigInt(chunk[axis] as Scalars['BigInt']['input']);
    if (value < -9_223_372_036_854_775_808n || value > 9_223_372_036_854_775_807n) {
      throw new CrowdyProtocolError({
        message: `Chunk coordinate ${axis} is outside signed int64 range`,
      });
    }
  }
}
