/**
 * Wire codecs for a fleet session (realtime servers v0.50.0): one realtime session an
 * organization's game server opens for itself, in which it carries the players who are on it.
 *
 * Pure functions with no I/O: they build and read bytes and compute HMACs with WebCrypto, so
 * they run in any JavaScript runtime. `FleetSession` (`@crowdedkingdoms/crowdyjs/fleet`) is
 * the session that sends and receives them over UDP.
 *
 * **A fleet token signs for every player its session carries. It stays on a server the
 * organization runs, beside the organization's org token, and never goes into a browser page
 * or a game client.**
 *
 * What a game server sends:
 *
 * - **For a carried player**, the message that player's own session would send, with the
 *   tail's game token id the player's and the tail's HMAC keyed with the fleet token. Build
 *   it with the serializers in binary-wire.ts and {@link carriedPlayerContext}.
 * - **Under the session's own game token id**, only `CLIENT_CAPABILITIES` (29),
 *   `FLEET_CARRY` (49), `FLEET_RELEASE` (50) and `CLIENT_ACTOR_HEARTBEAT` (26, with no actor).
 *
 * What it receives is read by {@link parseFleetDatagram}, which verifies before it returns:
 * `FLEET_CARRY_RESULT` (51), `FLEET_RELEASED` (52) and `FLEET_DELIVERY` (53) in both of their
 * forms, plain notifications, and the control frames that move or end the session.
 *
 * All numbers are little endian. Game token ids and user ids are 64-bit and are returned as
 * decimal strings, as the Application API returns them.
 */
import {
  CONTROL_NONCE_BYTES,
  createSignContext,
  HMAC_SIZE,
  parseNotification,
  serializeLongSpatial,
  SPATIAL_CONTAINS_AUTH_OFFSET,
  SPATIAL_HEADER_SIZE,
  TAIL_AUTH_BYTES,
  TAIL_NO_AUTH_BYTES,
  verifyControlHmac,
  verifyWithToken,
  WireMessageType,
  type RelaySignContext,
} from './binary-wire.js';
import type { UdpNotification } from './realtime.js';

/**
 * The largest datagram a fleet session is sent: a `FLEET_DELIVERY` with one player, alone,
 * with its own HMAC. Nothing else the realtime servers send a client is above 1,232 bytes.
 * Size receive buffers for this.
 */
export const FLEET_MAX_DATAGRAM_BYTES = 1242;
/** The most players one `FLEET_DELIVERY` lists; more are split over frames. */
export const FLEET_MAX_DELIVERY_PLAYERS = 32;
/** A token, as its 64 octets: a fleet token and a player's app token alike. */
export const FLEET_TOKEN_CHARS = 64;
/** The ASCII label a `FLEET_CARRY` proof starts with (14 bytes). */
export const FLEET_CARRY_PROOF_LABEL = 'ck-fleet-carry';
/** A `FLEET_CARRY` whose time is further than this from the server's is refused (status 3). */
export const FLEET_CARRY_CLOCK_TOLERANCE_MS = 30_000;
/** `FLEET_CARRY`'s app payload: `[8B player gameTokenId][8B epoch ms][32B proof]`. */
export const FLEET_CARRY_PAYLOAD_BYTES = 48;
/** `FLEET_CARRY_RESULT`: `[1B 51][8B player gameTokenId][8B user id][1B status]`. */
export const FLEET_CARRY_RESULT_BYTES = 18;
/** `FLEET_RELEASED`: `[1B 52][8B player gameTokenId][1B reason]`. */
export const FLEET_RELEASED_BYTES = 10;

/** `FLEET_CARRY_RESULT`'s status byte. Treat a value not listed as a refusal. */
export const FleetCarryStatus = {
  /** The session carries the player; the result names their user id. */
  CARRIED: 0,
  /** No live token by that game token id (also: a token of another app). */
  NO_LIVE_TOKEN: 1,
  /** The token is another organization's player's. */
  OTHER_ORGANIZATION: 2,
  /** The proof or its time failed (also: a carry sent again after it ended, a replay). */
  PROOF_FAILED: 3,
  /** The session carries as many players as it may (also: the server has no place for it). */
  SESSION_FULL: 4,
} as const;

/** `FLEET_RELEASED`'s reason byte. Treat a value not listed as the carry having ended. */
export const FleetReleaseReason = {
  /** Another session carries the player now: they moved to another of your servers. */
  CARRIED_ELSEWHERE: 1,
  /** The player's sign-in ended (revoked, or expired and not carried again with a live token). */
  SIGN_IN_ENDED: 2,
  /** No gameplay input from the player for the app's idle timeout. */
  IDLE: 5,
} as const;

/** `COMMAND_SESSION_RELEASED`'s reason byte. Treat a value not listed as `STALE`. */
export const SessionReleaseReason = {
  DEAUTHORIZED: 0,
  STALE: 1,
  TOKEN_EXPIRED: 2,
  OVERLOAD: 3,
  REBALANCE: 4,
  IDLE: 5,
} as const;

/** A game token id or a user id: a 64-bit number as a decimal string, a bigint or a safe integer. */
export type FleetId = string | bigint | number;

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

/** `id` as the 64-bit integer the wire carries. */
function int64(id: FleetId, what: string): bigint {
  let value: bigint;
  try {
    if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new RangeError();
    if (typeof id === 'string' && !/^-?\d+$/.test(id)) throw new RangeError();
    value = BigInt(id);
  } catch {
    throw new RangeError(`${what} must be a whole 64-bit number: ${String(id)}`);
  }
  if (value < INT64_MIN || value > INT64_MAX) {
    throw new RangeError(`${what} must be a whole 64-bit number: ${String(id)}`);
  }
  return value;
}

function tokenOctets(token: string, what: string): Uint8Array {
  if (typeof token !== 'string' || token.length !== FLEET_TOKEN_CHARS) {
    throw new RangeError(`${what} must be ${FLEET_TOKEN_CHARS} characters`);
  }
  const bytes = new Uint8Array(FLEET_TOKEN_CHARS);
  for (let i = 0; i < FLEET_TOKEN_CHARS; i += 1) {
    const code = token.charCodeAt(i);
    if (code > 0xff) throw new RangeError(`${what} must be ${FLEET_TOKEN_CHARS} single-byte characters`);
    bytes[i] = code;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * The fleet session's own signing context: its `gameTokenId` and its token (the 64 characters
 * `openFleetSession` answered) as the HMAC key. It signs the session's own messages
 * (29, 49, 50, 26), verifies everything the session is sent, and is what
 * {@link carriedPlayerContext} derives a player's context from.
 * @throws {RangeError} for a token that is not 64 characters or an id that is not a 64-bit number.
 */
export async function createFleetSignContext(
  fleetGameTokenId: FleetId,
  fleetToken: string,
): Promise<RelaySignContext> {
  tokenOctets(fleetToken, 'the fleet token');
  return createSignContext(int64(fleetGameTokenId, 'the fleet gameTokenId'), fleetToken);
}

/**
 * The signing context for a message a fleet session sends for a carried player: the tail's
 * game token id is the player's, and the HMAC is keyed with the fleet token. Pass it to any
 * serializer in binary-wire.ts (`serializeActorUpdate`, `serializeVoxelUpdate`,
 * `serializeClientEvent`, `serializeTextPacket`, `serializeAudioPacket`,
 * `serializeVideoPacket`, `serializeClientMediaSpeakers`, `serializeActorHeartbeat`, the
 * channel serializers) and the result is the message that player's own session would send,
 * signed by the fleet session.
 */
export function carriedPlayerContext(
  fleet: RelaySignContext,
  playerGameTokenId: FleetId,
): RelaySignContext {
  return {
    gameTokenId: int64(playerGameTokenId, 'the player gameTokenId'),
    tokenBytes: fleet.tokenBytes,
    key: fleet.key,
  };
}

// ---------------------------------------------------------------------------
// FLEET_CARRY (49) and FLEET_RELEASE (50)
// ---------------------------------------------------------------------------

/** What a `FLEET_CARRY` proves and names. */
export interface FleetCarryInput {
  /** The session's app. */
  appId: FleetId;
  /** The player's app token's `gameTokenId`. */
  playerGameTokenId: FleetId;
  /** The player's app token: 64 characters. It keys the proof and is not sent. */
  playerToken: string;
  /**
   * The time the proof is made for, in epoch milliseconds. The server refuses one more than
   * 30 seconds from its own, and one older than the last carry of that player it accepted
   * from this session: a carry sent again needs a new time and a new proof.
   */
  epochMillis: FleetId;
  sequenceNumber?: number | null;
}

/**
 * The proof inside a `FLEET_CARRY`: it shows the game server holds the player's token.
 *
 * ```
 * HMAC-SHA256(key = the player's 64-octet token,
 *             "ck-fleet-carry" (14 ASCII bytes) || 8B fleet gameTokenId ||
 *             8B player gameTokenId || 8B epoch ms)
 * ```
 */
export async function fleetCarryProof(input: {
  playerToken: string;
  fleetGameTokenId: FleetId;
  playerGameTokenId: FleetId;
  epochMillis: FleetId;
}): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    tokenOctets(input.playerToken, "the player's token") as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const label = FLEET_CARRY_PROOF_LABEL.length;
  const message = new Uint8Array(label + 24);
  for (let i = 0; i < label; i += 1) message[i] = FLEET_CARRY_PROOF_LABEL.charCodeAt(i);
  const view = new DataView(message.buffer);
  view.setBigInt64(label, int64(input.fleetGameTokenId, 'the fleet gameTokenId'), true);
  view.setBigInt64(label + 8, int64(input.playerGameTokenId, 'the player gameTokenId'), true);
  view.setBigInt64(label + 16, int64(input.epochMillis, 'epochMillis'), true);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message as unknown as BufferSource));
}

/**
 * Build a `FLEET_CARRY` (49): "this session carries this player". The capabilities'
 * long-spatial layout (chunk `(0,0,0)`, distance 0, no actor uuid) under the session's own
 * game token id, with the app payload `[8B player gameTokenId][8B epoch ms][32B proof]`
 * ({@link fleetCarryProof}). 157 bytes. The server answers `FLEET_CARRY_RESULT` (51), or
 * nothing: send it again, with a new time and proof, until it does.
 */
export async function serializeFleetCarry(
  fleet: RelaySignContext,
  input: FleetCarryInput,
): Promise<Uint8Array> {
  const player = int64(input.playerGameTokenId, 'the player gameTokenId');
  const epoch = int64(input.epochMillis, 'epochMillis');
  const proof = await fleetCarryProof({
    playerToken: input.playerToken,
    fleetGameTokenId: fleet.gameTokenId,
    playerGameTokenId: player,
    epochMillis: epoch,
  });
  const payload = new Uint8Array(FLEET_CARRY_PAYLOAD_BYTES);
  const view = new DataView(payload.buffer);
  view.setBigInt64(0, player, true);
  view.setBigInt64(8, epoch, true);
  payload.set(proof, 16);
  return serializeLongSpatial(
    fleet,
    WireMessageType.FLEET_CARRY,
    int64(input.appId, 'appId'),
    { x: 0, y: 0, z: 0 },
    0,
    0,
    '',
    payload,
    input.sequenceNumber ?? 0,
  );
}

/**
 * Build a `FLEET_RELEASE` (50): "this player left the game". `FLEET_CARRY`'s layout with the
 * app payload `[8B player gameTokenId]`. 117 bytes. The server sends no answer, and sending
 * it again changes nothing. The player's actors leave as when a player's own session ends.
 */
export async function serializeFleetRelease(
  fleet: RelaySignContext,
  input: { appId: FleetId; playerGameTokenId: FleetId; sequenceNumber?: number | null },
): Promise<Uint8Array> {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setBigInt64(0, int64(input.playerGameTokenId, 'the player gameTokenId'), true);
  return serializeLongSpatial(
    fleet,
    WireMessageType.FLEET_RELEASE,
    int64(input.appId, 'appId'),
    { x: 0, y: 0, z: 0 },
    0,
    0,
    '',
    payload,
    input.sequenceNumber ?? 0,
  );
}

// ---------------------------------------------------------------------------
// FLEET_CARRY_RESULT (51), FLEET_RELEASED (52), FLEET_DELIVERY (53)
// ---------------------------------------------------------------------------

/** A `FLEET_CARRY_RESULT` (51): the answer to a `FLEET_CARRY`. */
export interface FleetCarryResultFrame {
  playerGameTokenId: string;
  /** The player's user id when `status` is 0; `'0'` otherwise. */
  userId: string;
  /** {@link FleetCarryStatus}. */
  status: number;
}

/** A `FLEET_RELEASED` (52): the server ended a carry. */
export interface FleetReleasedFrame {
  playerGameTokenId: string;
  /** {@link FleetReleaseReason}. */
  reason: number;
}

/** A `FLEET_DELIVERY` (53): one notification, and the carried players it is for. */
export interface FleetDeliveryFrame {
  /** The carried players who may receive the notification, by game token id: 1 to 32. */
  players: string[];
  /** The notification, as the SDK's parsers produce it for a player's own session. */
  notification: UdpNotification;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Read a `FLEET_CARRY_RESULT` (51) frame, `[1B 51][8B player gameTokenId][8B user id]
 * [1B status]`, without its HMAC. `null` for a frame that is not one. This does not verify:
 * {@link parseFleetDatagram} does.
 */
export function parseFleetCarryResult(frame: Uint8Array): FleetCarryResultFrame | null {
  if (frame.length < FLEET_CARRY_RESULT_BYTES || frame[0] !== WireMessageType.FLEET_CARRY_RESULT) {
    return null;
  }
  const v = view(frame);
  return {
    playerGameTokenId: v.getBigInt64(1, true).toString(),
    userId: v.getBigInt64(9, true).toString(),
    status: frame[17],
  };
}

/**
 * Read a `FLEET_RELEASED` (52) frame, `[1B 52][8B player gameTokenId][1B reason]`, without
 * its HMAC. `null` for a frame that is not one. This does not verify.
 */
export function parseFleetReleased(frame: Uint8Array): FleetReleasedFrame | null {
  if (frame.length < FLEET_RELEASED_BYTES || frame[0] !== WireMessageType.FLEET_RELEASED) {
    return null;
  }
  return { playerGameTokenId: view(frame).getBigInt64(1, true).toString(), reason: frame[9] };
}

/**
 * Read a `FLEET_DELIVERY` (53) frame, `[1B 53][1B count][count x 8B player gameTokenId]
 * [notification]`, without its HMAC, and unwrap the notification inside into the object the
 * SDK's parsers produce. The notification is what a player's own session would have been
 * sent, unsigned: a long-spatial one with its 9-byte tail and `containsAuth` 0, or a channel
 * one (18 or 36). `null` for a count of 0 or above 32, a frame shorter than its count says,
 * and a frame whose contents are not a notification that can be read. This does not verify.
 */
export function parseFleetDelivery(frame: Uint8Array): FleetDeliveryFrame | null {
  if (frame.length < 2 || frame[0] !== WireMessageType.FLEET_DELIVERY) return null;
  const count = frame[1];
  if (count === 0 || count > FLEET_MAX_DELIVERY_PLAYERS) return null;
  const listEnd = 2 + count * 8;
  if (frame.length <= listEnd) return null;
  const inner = frame.subarray(listEnd);
  const type = inner[0];
  const channel =
    type === WireMessageType.CHANNEL_MESSAGE_NOTIFICATION ||
    type === WireMessageType.CHANNEL_AUDIO_NOTIFICATION;
  // A notification only: never an error frame, a control frame or another delivery.
  if (!channel && (type & 0x80) === 0) return null;
  if (!channel && inner.length < SPATIAL_HEADER_SIZE + TAIL_NO_AUTH_BYTES) return null;
  const notification = parseNotification(inner);
  if (!notification) return null;
  const v = view(frame);
  const players: string[] = [];
  for (let i = 0; i < count; i += 1) players.push(v.getBigInt64(2 + i * 8, true).toString());
  return { players, notification };
}

// ---------------------------------------------------------------------------
// A whole datagram
// ---------------------------------------------------------------------------

/** One verified message out of a datagram a fleet session was sent. */
export type FleetInbound =
  | ({ kind: 'carryResult' } & FleetCarryResultFrame)
  | ({ kind: 'released' } & FleetReleasedFrame)
  | ({ kind: 'delivery' } & FleetDeliveryFrame)
  /**
   * A plain notification: state, sent once for the session when at least one carried player
   * may receive it, or a `GenericErrorResponse`. State is returned only verified. `verified`
   * is false for one thing alone: an error frame (`[3][seq][code]`) that came outside a signed
   * bundle. It has no room for an HMAC, so nothing shows the realtime server sent it.
   */
  | { kind: 'notification'; notification: UdpNotification; verified: boolean }
  /** `COMMAND_RECONNECT` (22) or its bound form (44): connect to another realtime server. */
  | { kind: 'reconnect'; bound: boolean }
  /** `COMMAND_SESSION_RELEASED` (28) or its bound form (45), with {@link SessionReleaseReason}. */
  | { kind: 'sessionReleased'; reason: number; bound: boolean }
  /** `CONTROL_BOUND_ACK` (46): the server accepted the capabilities that carried this nonce. */
  | { kind: 'controlBoundAck' };

/** What {@link parseFleetDatagram} read, and what it dropped. */
export interface FleetDatagram {
  /** The messages that verified, in the datagram's order. */
  messages: FleetInbound[];
  /** Frames dropped because their HMAC did not verify (a signed bundle counts once). */
  hmacFailures: number;
  /** Frames dropped because they could not be read. */
  malformed: number;
  /**
   * Notifications dropped because they carried no HMAC and were not inside a signed bundle
   * or a `FLEET_DELIVERY`. The realtime servers sign every notification they send a session,
   * so one without a signature did not come from them. No option takes them.
   */
  unsigned: number;
  /** Bound control frames dropped because their nonce is not this connection's. */
  staleControl: number;
}

export interface FleetParseOptions {
  /**
   * The 8 bytes this connection sent with `BOUND_CONTROL` in its capabilities. A bound control
   * frame (44, 45, 46) verifies only with this nonce; without one every bound frame is stale.
   */
  controlNonce?: Uint8Array | null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Read one datagram a fleet session was sent, verifying everything in it with the fleet
 * token before returning it. A frame that fails is dropped and counted, never returned.
 *
 * - **`MESSAGE_BUNDLE_SIGNED` (30)**, sent to a session that advertised `BUNDLE_SIGNED`: one
 *   HMAC over the datagram, checked once. Its members, 51 to 53 among them, carry none.
 * - **51, 52 and 53 anywhere else** (alone in the datagram, or a member of a
 *   `MESSAGE_BUNDLE`, 2): each is followed by its own HMAC, its last 32 bytes:
 *   `HMAC-SHA256(key = the fleet token, message = every byte before the HMAC || the fleet
 *   token)`. A session that advertised `BUNDLE_SIGNED` is still sent a `FLEET_DELIVERY` above
 *   1,197 bytes this way, alone, so every session reads both forms.
 * - **A plain long-spatial notification** outside a signed bundle carries its own HMAC
 *   (`containsAuth` 1) and is checked with it. One with no signature is dropped and counted
 *   (`unsigned`).
 * - **An error frame** (`[3][seq][code]`) has no room for an HMAC. It is returned either way,
 *   marked `verified` only when it was a member of a signed bundle.
 * - **Control frames** (22, 28, 44, 45, 46) are always their own datagram, signed over their
 *   leading bytes.
 *
 * `fleet` is the session's own context ({@link createFleetSignContext}). A datagram above
 * {@link FLEET_MAX_DATAGRAM_BYTES} is malformed.
 */
export async function parseFleetDatagram(
  fleet: RelaySignContext,
  datagram: Uint8Array,
  options: FleetParseOptions = {},
): Promise<FleetDatagram> {
  const out: FleetDatagram = { messages: [], hmacFailures: 0, malformed: 0, unsigned: 0, staleControl: 0 };
  if (datagram.length === 0 || datagram.length > FLEET_MAX_DATAGRAM_BYTES) {
    out.malformed += 1;
    return out;
  }
  const type = datagram[0];

  if (
    type === WireMessageType.COMMAND_RECONNECT ||
    type === WireMessageType.COMMAND_SESSION_RELEASED ||
    type === WireMessageType.COMMAND_RECONNECT_BOUND ||
    type === WireMessageType.COMMAND_SESSION_RELEASED_BOUND ||
    type === WireMessageType.CONTROL_BOUND_ACK
  ) {
    await readControl(fleet, datagram, options, out);
    return out;
  }

  if (type === WireMessageType.MESSAGE_BUNDLE_SIGNED) {
    if (datagram.length <= 1 + HMAC_SIZE) {
      out.malformed += 1;
      return out;
    }
    const end = datagram.length - HMAC_SIZE;
    if (!(await verifyWithToken(fleet, datagram.subarray(0, end), datagram.subarray(end)))) {
      out.hmacFailures += 1;
      return out;
    }
    for (const member of bundleMembers(datagram, end, out)) {
      await readMember(fleet, member, true, out);
    }
    return out;
  }

  if (type === WireMessageType.MESSAGE_BUNDLE) {
    for (const member of bundleMembers(datagram, datagram.length, out)) {
      await readMember(fleet, member, false, out);
    }
    return out;
  }

  await readMember(fleet, datagram, false, out);
  return out;
}

/** The members of `[1B type]{[2B u16 length][member]}…` up to `end`. A truncated one ends the walk. */
function bundleMembers(bytes: Uint8Array, end: number, out: FleetDatagram): Uint8Array[] {
  const v = view(bytes);
  const members: Uint8Array[] = [];
  let off = 1;
  while (off < end) {
    if (off + 2 > end) {
      out.malformed += 1;
      break;
    }
    const len = v.getUint16(off, true);
    off += 2;
    if (len === 0 || off + len > end) {
      out.malformed += 1;
      break;
    }
    members.push(bytes.subarray(off, off + len));
    off += len;
  }
  return members;
}

async function readControl(
  fleet: RelaySignContext,
  datagram: Uint8Array,
  options: FleetParseOptions,
  out: FleetDatagram,
): Promise<void> {
  const type = datagram[0];
  const bound = type !== WireMessageType.COMMAND_RECONNECT && type !== WireMessageType.COMMAND_SESSION_RELEASED;
  const released =
    type === WireMessageType.COMMAND_SESSION_RELEASED ||
    type === WireMessageType.COMMAND_SESSION_RELEASED_BOUND;
  // [type][reason, for a release][nonce, for a bound form] then the HMAC over those bytes.
  const signedLen = 1 + (released ? 1 : 0) + (bound ? CONTROL_NONCE_BYTES : 0);
  if (datagram.length !== signedLen + HMAC_SIZE) {
    out.malformed += 1;
    return;
  }
  if (!(await verifyControlHmac(fleet, datagram.subarray(0, signedLen), datagram.subarray(signedLen)))) {
    out.hmacFailures += 1;
    return;
  }
  if (bound) {
    const nonce = datagram.subarray(signedLen - CONTROL_NONCE_BYTES, signedLen);
    if (!options.controlNonce || !sameBytes(nonce, options.controlNonce)) {
      out.staleControl += 1;
      return;
    }
  }
  if (type === WireMessageType.CONTROL_BOUND_ACK) out.messages.push({ kind: 'controlBoundAck' });
  else if (released) out.messages.push({ kind: 'sessionReleased', reason: datagram[1], bound });
  else out.messages.push({ kind: 'reconnect', bound });
}

/**
 * One complete message: a member of a bundle, or a datagram that is not a bundle.
 * `inSignedBundle` says the bundle's own HMAC already vouched for it.
 */
async function readMember(
  fleet: RelaySignContext,
  message: Uint8Array,
  inSignedBundle: boolean,
  out: FleetDatagram,
): Promise<void> {
  const type = message[0];

  if (
    type === WireMessageType.FLEET_CARRY_RESULT ||
    type === WireMessageType.FLEET_RELEASED ||
    type === WireMessageType.FLEET_DELIVERY
  ) {
    let frame = message;
    if (!inSignedBundle) {
      // Its own HMAC: the last 32 bytes, over every byte before them and then the token. A
      // frame too short to hold one came without it.
      if (message.length <= HMAC_SIZE) {
        out.hmacFailures += 1;
        return;
      }
      const end = message.length - HMAC_SIZE;
      frame = message.subarray(0, end);
      if (!(await verifyWithToken(fleet, frame, message.subarray(end)))) {
        out.hmacFailures += 1;
        return;
      }
    }
    if (type === WireMessageType.FLEET_CARRY_RESULT) {
      const result = parseFleetCarryResult(frame);
      if (result) out.messages.push({ kind: 'carryResult', ...result });
      else out.malformed += 1;
    } else if (type === WireMessageType.FLEET_RELEASED) {
      const released = parseFleetReleased(frame);
      if (released) out.messages.push({ kind: 'released', ...released });
      else out.malformed += 1;
    } else {
      const delivery = parseFleetDelivery(frame);
      if (delivery) out.messages.push({ kind: 'delivery', ...delivery });
      else out.malformed += 1;
    }
    return;
  }

  if (type === WireMessageType.GENERIC_ERROR_MESSAGE) {
    // [3][seq][code] has no room for an HMAC: it is as good as the bundle it came in, and a
    // caller is told which (`verified`).
    const error = parseNotification(message);
    if (error) out.messages.push({ kind: 'notification', notification: error, verified: inSignedBundle });
    else out.malformed += 1;
    return;
  }

  const channel =
    type === WireMessageType.CHANNEL_MESSAGE_NOTIFICATION ||
    type === WireMessageType.CHANNEL_AUDIO_NOTIFICATION;
  if (!channel && (type & 0x80) === 0) return; // not a notification: nothing a session reads

  let verified = inSignedBundle;
  if (!channel) {
    if (message.length < SPATIAL_HEADER_SIZE + TAIL_NO_AUTH_BYTES) {
      out.malformed += 1;
      return;
    }
    if (message[SPATIAL_CONTAINS_AUTH_OFFSET] !== 0) {
      // Its own HMAC sits before the 9-byte tail, over the header and the payload.
      if (message.length < SPATIAL_HEADER_SIZE + TAIL_AUTH_BYTES) {
        out.malformed += 1;
        return;
      }
      const prefix = message.length - TAIL_AUTH_BYTES;
      const tag = message.subarray(prefix, prefix + HMAC_SIZE);
      if (!(await verifyWithToken(fleet, message.subarray(0, prefix), tag))) {
        out.hmacFailures += 1;
        return;
      }
      verified = true;
    }
  }
  if (!verified) {
    out.unsigned += 1;
    return;
  }
  const notification = parseNotification(message);
  if (notification) out.messages.push({ kind: 'notification', notification, verified });
  else if (channel) out.malformed += 1;
  // An unknown spatial type is skipped: the protocol grows by adding types.
}
