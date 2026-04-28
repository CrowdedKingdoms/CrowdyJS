import { CrowdyProtocolError } from './errors.js';
import type { ChunkCoordinatesInput, Scalars } from './generated/graphql.js';

export class SequenceAllocator {
  private nextValue: number;

  constructor(seed = 1) {
    this.nextValue = seed & 0xff;
  }

  next(): number {
    const value = this.nextValue;
    this.nextValue = (this.nextValue + 1) & 0xff;
    return value;
  }
}

export function generateCrowdyUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function validateCrowdyUuid(uuid: string): void {
  if (new TextEncoder().encode(uuid).length !== 32) {
    throw new CrowdyProtocolError({
      message: 'Crowdy UUID must be exactly 32 bytes when UTF-8 encoded',
    });
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

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
