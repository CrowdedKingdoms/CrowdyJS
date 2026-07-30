/**
 * Buddy client wire-format codec for the binary realtime relay
 * (`crowdy-relay-v1`).
 *
 * Mirrors the game-api's `UdpMessageParserService` byte-for-byte: uplink
 * serializers build the complete client→Buddy datagram (spatial header +
 * payload + HMAC + gameTokenId + sequence) and downlink parsing produces the
 * same `__typename`-tagged notification objects the GraphQL
 * `udpNotifications` subscription delivers, so handler code is transport
 * agnostic.
 *
 * The per-message HMAC key is the 64-octet game token string itself — the
 * same bearer token the SDK already holds — computed with WebCrypto
 * (HMAC-SHA256). Buddy verifies it server-side; the relay does not.
 */

import { decodeBase64, encodeBase64 } from './utils.js';
import type { UdpNotification } from './realtime.js';

export const RELAY_MAX_DATAGRAM_BYTES = 1232;

/** Wire opcodes (mirror of game-api / Buddy `UdpMessageType`). */
export const WireMessageType = {
  MESSAGE_BUNDLE: 2,
  GENERIC_ERROR_MESSAGE: 3,
  CHANNEL_MESSAGE_REQUEST: 17,
  CHANNEL_MESSAGE_NOTIFICATION: 18,
  ACTOR_UPDATE_REQUEST_2: 128,
  ACTOR_UPDATE_RESPONSE_2: 129,
  ACTOR_UPDATE_NOTIFICATION_2: 130,
  VOXEL_UPDATE_REQUEST_2: 131,
  VOXEL_UPDATE_RESPONSE_2: 132,
  VOXEL_UPDATE_NOTIFICATION_2: 133,
  CLIENT_AUDIO_PACKET_2: 134,
  CLIENT_AUDIO_NOTIFICATION_2: 135,
  CLIENT_TEXT_PACKET_2: 136,
  CLIENT_TEXT_NOTIFICATION_2: 137,
  CLIENT_EVENT_NOTIFICATION_2: 138,
  SERVER_EVENT_NOTIFICATION_2: 139,
  SINGLE_ACTOR_MESSAGE: 142,
} as const;

const SPATIAL_HEADER_SIZE = 68;
const UUID_SIZE = 32;
const HMAC_SIZE = 32;
/** Client→server tail with auth: hmac(32) + gameTokenId(8) + seq(1). */
const TAIL_AUTH_BYTES = 41;
/** Server→client tail: epochMillis(8) + seq(1). */
const TAIL_NO_AUTH_BYTES = 9;

/**
 * Wire error byte → GraphQL `UdpErrorCode` enum name (mirror of the game-api
 * `ErrorType` numeric enum, which GraphQL serializes by name).
 */
const UDP_ERROR_NAMES: Record<number, string> = {
  0: 'NO_ERROR',
  1: 'UNKNOWN_ERROR',
  2: 'EMAIL_NOT_FOUND',
  3: 'BAD_PASSWORD',
  4: 'EMAIL_ALREADY_EXISTS',
  5: 'INVALID_TOKEN',
  6: 'APP_NOT_FOUND',
  7: 'UNAUTHORIZED',
  8: 'APP_NOT_LOADED',
  9: 'EMAIL_TOO_SHORT',
  10: 'EMAIL_TOO_LONG',
  11: 'PASSWORD_TOO_SHORT',
  12: 'PASSWORD_TOO_LONG',
  13: 'GAME_TOKEN_WRONG_SIZE',
  14: 'NAME_TOO_LONG',
  15: 'INVALID_REQUEST',
  16: 'EMAIL_INVALID',
  17: 'INVALID_TOKEN_LENGTH',
  18: 'INVALID_APP_ID',
  19: 'CHUNK_NOT_FOUND',
  20: 'USER_NOT_AUTHENTICATED',
  21: 'INVALID_STATE_DATA',
  22: 'USER_NOT_APP_ADMIN',
  23: 'GRID_OUTSIDE_ASSIGNMENT',
  24: 'NO_MATCHING_GRID_ASSIGNMENT',
  25: 'INVALID_GRID_COORDINATES',
  26: 'GRID_ALREADY_EXISTS',
  27: 'GRID_OVERLAPS_EXISTING',
  28: 'GAMERTAG_ALREADY_EXISTS',
  29: 'GRID_NOT_FOUND',
  30: 'CANNOT_DELETE_DEFAULT_WORLD_GRID',
  31: 'GRID_HAS_NESTED_CHILDREN',
  32: 'TOKEN_EXPIRED',
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function latin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Per-session signing context: the game token id (from the relay `ready`
 * frame) plus the token bytes and imported WebCrypto HMAC key.
 */
export interface RelaySignContext {
  gameTokenId: bigint;
  tokenBytes: Uint8Array;
  key: CryptoKey;
}

/** Import the game token as an HMAC-SHA256 WebCrypto key (once per session). */
export async function createSignContext(
  gameTokenId: bigint,
  gameTokenString: string,
): Promise<RelaySignContext> {
  const tokenBytes = latin1Bytes(gameTokenString);
  const key = await crypto.subtle.importKey(
    'raw',
    tokenBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return { gameTokenId, tokenBytes, key };
}

/**
 * Spatial-message HMAC: key = token bytes; signed data =
 * `dataBeforeHmac || tokenBytes` (mirror of `computeSpatialHmac`).
 */
async function signWithToken(
  ctx: RelaySignContext,
  dataBeforeHmac: Uint8Array,
): Promise<Uint8Array> {
  const signed = new Uint8Array(dataBeforeHmac.length + ctx.tokenBytes.length);
  signed.set(dataBeforeHmac, 0);
  signed.set(ctx.tokenBytes, dataBeforeHmac.length);
  const mac = await crypto.subtle.sign(
    'HMAC',
    ctx.key,
    signed as unknown as BufferSource,
  );
  return new Uint8Array(mac);
}

interface ChunkInput {
  x: string | number | bigint;
  y: string | number | bigint;
  z: string | number | bigint;
}

function clampDistance(distance: number): number {
  return Math.max(0, Math.min(8, distance));
}

/**
 * Build a complete client→Buddy spatial datagram:
 * `header(68) + payload + hmac(32) + gameTokenId(8) + seq(1)` with
 * `containsAuth = 1` (mirror of `serializeSpatialMessage`).
 */
async function serializeSpatial(
  ctx: RelaySignContext,
  messageType: number,
  appId: string | number | bigint,
  chunk: ChunkInput,
  distance: number,
  decayRate: number,
  uuid: string,
  payload: Uint8Array,
  sequenceNumber: number,
): Promise<Uint8Array> {
  const dataLen = SPATIAL_HEADER_SIZE + payload.length;
  const data = new Uint8Array(dataLen);
  const view = new DataView(data.buffer);
  let off = 0;

  view.setUint8(off, messageType);
  off += 1;
  view.setBigInt64(off, BigInt(appId), true);
  off += 8;
  view.setBigInt64(off, BigInt(chunk.x), true);
  off += 8;
  view.setBigInt64(off, BigInt(chunk.y), true);
  off += 8;
  view.setBigInt64(off, BigInt(chunk.z), true);
  off += 8;
  view.setUint8(off, clampDistance(distance));
  off += 1;
  view.setUint8(off, decayRate & 0xff);
  off += 1;
  view.setUint8(off, 1); // containsAuth
  off += 1;

  const uuidBytes = textEncoder.encode(uuid);
  if (uuidBytes.length > UUID_SIZE) {
    throw new Error(`UUID too long: ${uuidBytes.length} > ${UUID_SIZE}`);
  }
  data.set(uuidBytes, off);
  off += UUID_SIZE;

  data.set(payload, off);

  const hmac = await signWithToken(ctx, data);

  const total = dataLen + TAIL_AUTH_BYTES;
  if (total > RELAY_MAX_DATAGRAM_BYTES) {
    throw new Error(
      `Datagram exceeds maximum size: ${total} > ${RELAY_MAX_DATAGRAM_BYTES}`,
    );
  }
  const out = new Uint8Array(total);
  out.set(data, 0);
  out.set(hmac, dataLen);
  const tailView = new DataView(out.buffer);
  tailView.setBigInt64(dataLen + HMAC_SIZE, ctx.gameTokenId, true);
  tailView.setUint8(dataLen + HMAC_SIZE + 8, sequenceNumber & 0xff);
  return out;
}

// ---------------------------------------------------------------------------
// Uplink serializers (one per send* input shape)
// ---------------------------------------------------------------------------

export interface SpatialSendBase {
  appId: string;
  chunk: { x: string; y: string; z: string };
  uuid: string;
  distance?: number | null;
  decayRate?: number | null;
  sequenceNumber?: number | null;
}

export function serializeActorUpdate(
  ctx: RelaySignContext,
  input: SpatialSendBase & { state: string },
): Promise<Uint8Array> {
  return serializeSpatial(
    ctx,
    WireMessageType.ACTOR_UPDATE_REQUEST_2,
    input.appId,
    input.chunk,
    input.distance ?? 8,
    input.decayRate ?? 1,
    input.uuid,
    decodeBase64(input.state ?? ''),
    input.sequenceNumber ?? 0,
  );
}

export function serializeVoxelUpdate(
  ctx: RelaySignContext,
  input: SpatialSendBase & {
    voxel: { x: number; y: number; z: number };
    voxelType: number;
    voxelState: string;
  },
): Promise<Uint8Array> {
  const voxelState = decodeBase64(input.voxelState ?? '');
  const payload = new Uint8Array(10 + voxelState.length);
  const view = new DataView(payload.buffer);
  view.setInt16(0, input.voxel.x, true);
  view.setInt16(2, input.voxel.y, true);
  view.setInt16(4, input.voxel.z, true);
  view.setInt16(6, input.voxelType, true);
  view.setUint16(8, voxelState.length, true);
  payload.set(voxelState, 10);
  return serializeSpatial(
    ctx,
    WireMessageType.VOXEL_UPDATE_REQUEST_2,
    input.appId,
    input.chunk,
    input.distance ?? 8,
    input.decayRate ?? 0,
    input.uuid,
    payload,
    input.sequenceNumber ?? 0,
  );
}

export function serializeAudioPacket(
  ctx: RelaySignContext,
  input: SpatialSendBase & { audioData: string },
): Promise<Uint8Array> {
  return serializeSpatial(
    ctx,
    WireMessageType.CLIENT_AUDIO_PACKET_2,
    input.appId,
    input.chunk,
    input.distance ?? 1,
    input.decayRate ?? 0,
    input.uuid,
    decodeBase64(input.audioData ?? ''),
    input.sequenceNumber ?? 0,
  );
}

export function serializeTextPacket(
  ctx: RelaySignContext,
  input: SpatialSendBase & { text: string },
): Promise<Uint8Array> {
  return serializeSpatial(
    ctx,
    WireMessageType.CLIENT_TEXT_PACKET_2,
    input.appId,
    input.chunk,
    input.distance ?? 8,
    input.decayRate ?? 0,
    input.uuid,
    textEncoder.encode(input.text ?? ''),
    input.sequenceNumber ?? 0,
  );
}

export function serializeClientEvent(
  ctx: RelaySignContext,
  input: SpatialSendBase & { eventType: number; state: string },
): Promise<Uint8Array> {
  const state = decodeBase64(input.state ?? '');
  const payload = new Uint8Array(2 + state.length);
  new DataView(payload.buffer).setUint16(0, input.eventType, true);
  payload.set(state, 2);
  return serializeSpatial(
    ctx,
    WireMessageType.CLIENT_EVENT_NOTIFICATION_2,
    input.appId,
    input.chunk,
    input.distance ?? 8,
    input.decayRate ?? 0,
    input.uuid,
    payload,
    input.sequenceNumber ?? 0,
  );
}

export function serializeSingleActorMessage(
  ctx: RelaySignContext,
  input: {
    appId: string;
    chunk: { x: string; y: string; z: string };
    targetUuid: string;
    payload?: string | null;
    sequenceNumber?: number | null;
  },
): Promise<Uint8Array> {
  return serializeSpatial(
    ctx,
    WireMessageType.SINGLE_ACTOR_MESSAGE,
    input.appId,
    input.chunk,
    0,
    0,
    input.targetUuid,
    input.payload ? decodeBase64(input.payload) : new Uint8Array(0),
    input.sequenceNumber ?? 0,
  );
}

/**
 * CHANNEL_MESSAGE_REQUEST:
 * `[1B type=17][8B channelId][32B uuid][2B payloadLen][payload][1B containsAuth]
 *  [32B HMAC][8B gameTokenId][1B seq]` — HMAC over everything before it.
 */
export async function serializeChannelMessage(
  ctx: RelaySignContext,
  input: {
    channelId: string;
    uuid: string;
    payload?: string | null;
    sequenceNumber?: number | null;
  },
): Promise<Uint8Array> {
  const payload = input.payload ? decodeBase64(input.payload) : new Uint8Array(0);
  if (payload.length > 1024) {
    throw new Error(`Channel payload exceeds 1024 bytes: ${payload.length}`);
  }
  const uuidBytes = textEncoder.encode(input.uuid);
  if (uuidBytes.length !== UUID_SIZE) {
    throw new Error(
      `Invalid uuid length: must be exactly ${UUID_SIZE} bytes when UTF-8 encoded. Received ${uuidBytes.length} bytes.`,
    );
  }

  const prefixLen = 1 + 8 + UUID_SIZE + 2 + payload.length + 1;
  const prefix = new Uint8Array(prefixLen);
  const view = new DataView(prefix.buffer);
  let off = 0;
  view.setUint8(off, WireMessageType.CHANNEL_MESSAGE_REQUEST);
  off += 1;
  view.setBigUint64(off, BigInt(input.channelId), true);
  off += 8;
  prefix.set(uuidBytes, off);
  off += UUID_SIZE;
  view.setUint16(off, payload.length, true);
  off += 2;
  prefix.set(payload, off);
  off += payload.length;
  view.setUint8(off, 1); // containsAuth

  const hmac = await signWithToken(ctx, prefix);

  const out = new Uint8Array(prefixLen + HMAC_SIZE + 8 + 1);
  out.set(prefix, 0);
  out.set(hmac, prefixLen);
  const tail = new DataView(out.buffer);
  tail.setBigUint64(prefixLen + HMAC_SIZE, ctx.gameTokenId, true);
  tail.setUint8(prefixLen + HMAC_SIZE + 8, (input.sequenceNumber ?? 0) & 0xff);
  return out;
}

// ---------------------------------------------------------------------------
// Downlink parsing (relay frame → UdpNotification objects)
// ---------------------------------------------------------------------------

interface SpatialParts {
  appId: string;
  chunkX: string;
  chunkY: string;
  chunkZ: string;
  distance: number;
  decayRate: number;
  uuid: string;
  payload: Uint8Array;
  sequenceNumber: number;
  epochMillis: string;
}

function stripNulls(value: string): string {
  return value.replace(/\0/g, '');
}

function parseSpatialParts(bytes: Uint8Array, view: DataView): SpatialParts {
  if (bytes.length < SPATIAL_HEADER_SIZE) {
    throw new Error(
      `Spatial message too short for header: ${bytes.length} < ${SPATIAL_HEADER_SIZE}`,
    );
  }
  let off = 1;
  const appId = view.getBigInt64(off, true);
  off += 8;
  const chunkX = view.getBigInt64(off, true);
  off += 8;
  const chunkY = view.getBigInt64(off, true);
  off += 8;
  const chunkZ = view.getBigInt64(off, true);
  off += 8;
  const distance = view.getUint8(off);
  off += 1;
  const decayRate = view.getUint8(off);
  off += 1;
  const containsAuth = view.getUint8(off) !== 0;
  off += 1;
  const uuid = stripNulls(
    textDecoder.decode(bytes.subarray(off, off + UUID_SIZE)),
  );
  off += UUID_SIZE;

  const tailBytes = containsAuth ? TAIL_AUTH_BYTES : TAIL_NO_AUTH_BYTES;
  let payload: Uint8Array;
  let sequenceNumber = 0;
  let epochMillis = 0n;
  if (bytes.length >= SPATIAL_HEADER_SIZE + tailBytes) {
    const payloadEnd = bytes.length - tailBytes;
    payload = bytes.subarray(off, payloadEnd);
    let tOff = payloadEnd;
    if (containsAuth) tOff += HMAC_SIZE;
    epochMillis = view.getBigInt64(tOff, true);
    sequenceNumber = view.getUint8(tOff + 8);
  } else {
    payload = bytes.subarray(off);
  }

  return {
    appId: appId.toString(),
    chunkX: chunkX.toString(),
    chunkY: chunkY.toString(),
    chunkZ: chunkZ.toString(),
    distance,
    decayRate,
    uuid,
    payload,
    sequenceNumber,
    epochMillis: epochMillis.toString(),
  };
}

function spatialCommon(p: SpatialParts) {
  return {
    appId: p.appId,
    chunkX: p.chunkX,
    chunkY: p.chunkY,
    chunkZ: p.chunkZ,
    distance: p.distance,
    decayRate: p.decayRate,
    uuid: p.uuid,
    sequenceNumber: p.sequenceNumber,
    epochMillis: p.epochMillis,
  };
}

function parseOne(bytes: Uint8Array): UdpNotification | null {
  if (bytes.length < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messageType = bytes[0];

  if (messageType === WireMessageType.GENERIC_ERROR_MESSAGE) {
    if (bytes.length < 3) return null;
    return {
      __typename: 'GenericErrorResponse',
      sequenceNumber: view.getUint8(1),
      errorCode: (UDP_ERROR_NAMES[view.getUint8(2)] ??
        'UNKNOWN_ERROR') as never,
    } as UdpNotification;
  }

  if (messageType === WireMessageType.CHANNEL_MESSAGE_NOTIFICATION) {
    // [1B type][8B channelId][32B senderUuid][2B payloadLen][payload][8B epochMillis][1B seq]
    if (bytes.length < 1 + 8 + UUID_SIZE + 2) return null;
    let off = 1;
    const channelId = view.getBigUint64(off, true);
    off += 8;
    const uuid = stripNulls(
      textDecoder.decode(bytes.subarray(off, off + UUID_SIZE)),
    );
    off += UUID_SIZE;
    const payloadLen = view.getUint16(off, true);
    off += 2;
    if (bytes.length < off + payloadLen + 8 + 1) return null;
    const payload = bytes.subarray(off, off + payloadLen);
    off += payloadLen;
    const epochMillis = view.getBigUint64(off, true);
    off += 8;
    const sequenceNumber = view.getUint8(off);
    return {
      __typename: 'ChannelMessageNotification',
      channelId: channelId.toString(),
      uuid,
      payload: encodeBase64(payload),
      sequenceNumber,
      epochMillis: epochMillis.toString(),
    } as UdpNotification;
  }

  if ((messageType & 0x80) === 0) {
    return null; // control opcodes (COMMAND_RECONNECT etc.) never reach the client
  }

  const p = parseSpatialParts(bytes, view);
  switch (messageType) {
    case WireMessageType.ACTOR_UPDATE_RESPONSE_2:
      return {
        __typename: 'ActorUpdateResponse',
        ...spatialCommon(p),
      } as UdpNotification;
    case WireMessageType.ACTOR_UPDATE_NOTIFICATION_2:
      return {
        __typename: 'ActorUpdateNotification',
        ...spatialCommon(p),
        state: encodeBase64(p.payload),
      } as UdpNotification;
    case WireMessageType.VOXEL_UPDATE_RESPONSE_2:
      return {
        __typename: 'VoxelUpdateResponse',
        ...spatialCommon(p),
      } as UdpNotification;
    case WireMessageType.VOXEL_UPDATE_NOTIFICATION_2: {
      if (p.payload.length < 10) return null;
      const pv = new DataView(
        p.payload.buffer,
        p.payload.byteOffset,
        p.payload.byteLength,
      );
      const stateLength = pv.getUint16(8, true);
      return {
        __typename: 'VoxelUpdateNotification',
        ...spatialCommon(p),
        voxelX: pv.getInt16(0, true),
        voxelY: pv.getInt16(2, true),
        voxelZ: pv.getInt16(4, true),
        voxelType: pv.getInt16(6, true),
        voxelState: encodeBase64(p.payload.subarray(10, 10 + stateLength)),
      } as UdpNotification;
    }
    case WireMessageType.CLIENT_AUDIO_NOTIFICATION_2:
      return {
        __typename: 'ClientAudioNotification',
        ...spatialCommon(p),
        audioData: encodeBase64(p.payload),
      } as UdpNotification;
    case WireMessageType.CLIENT_TEXT_NOTIFICATION_2:
      return {
        __typename: 'ClientTextNotification',
        ...spatialCommon(p),
        text: stripNulls(textDecoder.decode(p.payload)),
      } as UdpNotification;
    case WireMessageType.CLIENT_EVENT_NOTIFICATION_2:
    case WireMessageType.SERVER_EVENT_NOTIFICATION_2: {
      if (p.payload.length < 2) return null;
      const pv = new DataView(
        p.payload.buffer,
        p.payload.byteOffset,
        p.payload.byteLength,
      );
      return {
        __typename:
          messageType === WireMessageType.CLIENT_EVENT_NOTIFICATION_2
            ? 'ClientEventNotification'
            : 'ServerEventNotification',
        ...spatialCommon(p),
        eventType: pv.getUint16(0, true),
        state: encodeBase64(p.payload.subarray(2)),
      } as UdpNotification;
    }
    case WireMessageType.SINGLE_ACTOR_MESSAGE: {
      const { distance: _d, decayRate: _r, ...rest } = spatialCommon(p);
      return {
        __typename: 'SingleActorMessageNotification',
        ...rest,
        payload: encodeBase64(p.payload),
      } as UdpNotification;
    }
    default:
      return null;
  }
}

/**
 * Parse one relay BINARY frame (one Buddy datagram, possibly a
 * MESSAGE_BUNDLE) into notification objects. Unparseable inner messages are
 * skipped, mirroring the server-side bundle behavior.
 */
export function parseRelayFrame(bytes: Uint8Array): UdpNotification[] {
  if (bytes.length < 1) return [];

  if (bytes[0] === WireMessageType.MESSAGE_BUNDLE) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out: UdpNotification[] = [];
    let off = 1;
    while (off + 2 <= bytes.length) {
      const len = view.getUint16(off, true);
      off += 2;
      if (off + len > bytes.length) break;
      try {
        const parsed = parseOne(bytes.subarray(off, off + len));
        if (parsed) out.push(parsed);
      } catch {
        // skip unparseable bundle member
      }
      off += len;
    }
    return out;
  }

  try {
    const parsed = parseOne(bytes);
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}
