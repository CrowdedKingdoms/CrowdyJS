/**
 * A fleet session's wire formats written out with `node:crypto`, independently of the SDK:
 * the fixed inputs of the golden vectors and builders for what a game server sends and is
 * sent. fleet-wire.test.mjs pins the vectors made from them; fleet-session.test.mjs plays a
 * realtime server with them. Not a test file itself.
 *
 *   fleet token    "fleet-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"  (64 octets)
 *   fleet id       9001   (the fleet session's gameTokenId)
 *   player token   "player-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO"  (64 octets)
 *   player id      4242   (the player's gameTokenId); a second player, 4243
 *   user id        77
 *   app id         7
 *   carry time     1795000000000  (epoch milliseconds)
 *   actor uuid     "0123456789abcdef0123456789abcdef"
 *   chunk          (1, -2, 3)
 *
 *   HMAC of a signed message = HMAC-SHA256(key = token, message = bytes before the HMAC || token)
 *   carry proof              = HMAC-SHA256(key = player token, "ck-fleet-carry" || fleet id ||
 *                              player id || carry time), each number 8 bytes little endian
 */
import { createHmac } from 'node:crypto';

export const FLEET_TOKEN = 'fleet-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';
export const PLAYER_TOKEN = 'player-token-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO';
export const FLEET_ID = 9001n;
export const PLAYER_ID = 4242n;
export const OTHER_PLAYER_ID = 4243n;
export const USER_ID = 77n;
export const APP_ID = 7n;
export const CARRY_MS = 1795000000000n;
export const UUID = '0123456789abcdef0123456789abcdef';
export const CHUNK = { x: '1', y: '-2', z: '3' };

// ---- the formats, written out independently of the SDK ----

export const hex = (bytes) => Buffer.from(bytes).toString('hex');
export const fromHex = (h) => new Uint8Array(Buffer.from(h, 'hex'));
export const latin1 = (s) => Buffer.from(s, 'latin1');
export const i64 = (v) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
};
export const u16 = (v) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
};
/** HMAC-SHA256(key = token, message = data): the control frames' scheme and the proof's. */
export const rawHmac = (token, data) => createHmac('sha256', latin1(token)).update(data).digest();
/** HMAC-SHA256(key = token, message = data || token): every signed message's scheme. */
export const tokenHmac = (token, data) => rawHmac(token, Buffer.concat([data, latin1(token)]));

/** [type][appId][chunk x, y, z][distance][decay][containsAuth][32B uuid][payload] */
export function spatialHead({ type, chunk = [0, 0, 0], distance = 0, decay = 0, auth, uuid = '', payload = Buffer.alloc(0) }) {
  const id = Buffer.alloc(32);
  id.write(uuid, 'latin1');
  return Buffer.concat([
    Buffer.from([type]),
    i64(APP_ID),
    i64(chunk[0]),
    i64(chunk[1]),
    i64(chunk[2]),
    Buffer.from([distance, decay, auth]),
    id,
    Buffer.from(payload),
  ]);
}
/** A client message: the head, the HMAC keyed with `signToken`, the tail's id, the sequence. */
export function clientMessage(fields, { signToken, tailId, seq }) {
  const head = spatialHead({ ...fields, auth: 1 });
  return Buffer.concat([head, tokenHmac(signToken, head), i64(tailId), Buffer.from([seq])]);
}
/** A server notification with no HMAC of its own: the head, epoch ms, the sequence. */
export function plainNotification(fields, { epochMs, seq }) {
  return Buffer.concat([spatialHead({ ...fields, auth: 0 }), i64(epochMs), Buffer.from([seq])]);
}
/** The same notification signed for one session: the HMAC sits before the 9-byte tail. */
export function signedNotification(fields, { epochMs, seq, token = FLEET_TOKEN }) {
  const head = spatialHead({ ...fields, auth: 1 });
  return Buffer.concat([head, tokenHmac(token, head), i64(epochMs), Buffer.from([seq])]);
}
/** [18 | 36][8B channelId][32B sender uuid][2B length][payload][8B epoch ms][1B seq] */
export function channelNotification({ type = 18, channelId, uuid, payload, epochMs, seq }) {
  return Buffer.concat([
    Buffer.from([type]),
    i64(channelId),
    latin1(uuid),
    u16(payload.length),
    Buffer.from(payload),
    i64(epochMs),
    Buffer.from([seq]),
  ]);
}
export const carryResult = (player, user, status) =>
  Buffer.concat([Buffer.from([51]), i64(player), i64(user), Buffer.from([status])]);
export const released = (player, reason) => Buffer.concat([Buffer.from([52]), i64(player), Buffer.from([reason])]);
export const delivery = (players, notification) =>
  Buffer.concat([Buffer.from([53, players.length]), ...players.map(i64), notification]);
/** A frame followed by its own HMAC: the form sent to a session without BUNDLE_SIGNED. */
export const withOwnHmac = (frame, token = FLEET_TOKEN) => Buffer.concat([frame, tokenHmac(token, frame)]);
/** [type]{[2B length][member]}… */
export const bundle = (type, members) =>
  Buffer.concat([Buffer.from([type]), ...members.flatMap((m) => [u16(m.length), m])]);
/** MESSAGE_BUNDLE_SIGNED (30): the bundle, then one HMAC over all of it. */
export function signedBundle(members, token = FLEET_TOKEN) {
  const body = bundle(30, members);
  return Buffer.concat([body, tokenHmac(token, body)]);
}
