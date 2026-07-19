/**
 * Engine wire registry — the client mirror of the server's
 * `crowdy-game-kit-core::wire` (the single source of truth for the actor
 * pose layout and flag-bit registry used by compute-module game engines).
 * Parity with the Rust crate is checked by the kit unit suite: any change
 * here must land in kit-core first.
 *
 * 48-byte little-endian pose: pos f32 x3 (0..11), yaw/pitch f32 (12..19),
 * velocity f32 x3 (20..31), flags u8 (32), held u8 (33), 34-35 reserved,
 * updated_at f64 ms (36..43), 44-47 reserved. Payloads may append opaque
 * UTF-8 suffix bytes (engines put the entity's container id there).
 */

import { decodeBase64, encodeBase64 } from '../utils.js';
import type { StateCodec } from '../stores/codec.js';

export const POSE_BYTES = 48;

/** Flag-bit registry. Bits 0-3 are platform-reserved; games may use 4-7. */
export const FLAG_GROUNDED = 0b0001;
export const FLAG_MOB = 0b0010;
export const FLAG_NPC = 0b0100;
export const FLAG_RESERVED3 = 0b1000;

/** The decoded engine pose (plus the payload suffix, when present). */
export interface EnginePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  velX: number;
  velY: number;
  velZ: number;
  flags: number;
  held: number;
  updatedAtMs: number;
  /** UTF-8 payload suffix after the 48-byte pose (container id), if any. */
  suffix: string | null;
}

/** Encode a pose (suffix appended when set). */
export function encodeEnginePose(pose: Partial<EnginePose>): Uint8Array {
  const suffix = pose.suffix != null ? new TextEncoder().encode(pose.suffix) : null;
  const bytes = new Uint8Array(POSE_BYTES + (suffix?.length ?? 0));
  const view = new DataView(bytes.buffer);
  view.setFloat32(0, pose.x ?? 0, true);
  view.setFloat32(4, pose.y ?? 0, true);
  view.setFloat32(8, pose.z ?? 0, true);
  view.setFloat32(12, pose.yaw ?? 0, true);
  view.setFloat32(16, pose.pitch ?? 0, true);
  view.setFloat32(20, pose.velX ?? 0, true);
  view.setFloat32(24, pose.velY ?? 0, true);
  view.setFloat32(28, pose.velZ ?? 0, true);
  view.setUint8(32, pose.flags ?? 0);
  view.setUint8(33, pose.held ?? 0);
  view.setFloat64(36, pose.updatedAtMs ?? 0, true);
  if (suffix) bytes.set(suffix, POSE_BYTES);
  return bytes;
}

/**
 * Decode the leading 48 bytes (tolerates longer payloads — the suffix is
 * extracted). Returns null for short or non-finite payloads.
 */
export function decodeEnginePose(bytes: Uint8Array): EnginePose | null {
  if (bytes.length < POSE_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pose: EnginePose = {
    x: view.getFloat32(0, true),
    y: view.getFloat32(4, true),
    z: view.getFloat32(8, true),
    yaw: view.getFloat32(12, true),
    pitch: view.getFloat32(16, true),
    velX: view.getFloat32(20, true),
    velY: view.getFloat32(24, true),
    velZ: view.getFloat32(28, true),
    flags: view.getUint8(32),
    held: view.getUint8(33),
    updatedAtMs: view.getFloat64(36, true),
    suffix: poseSuffix(bytes),
  };
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z)) {
    return null;
  }
  return pose;
}

/** The UTF-8 suffix after the pose (engine container ids), if any. */
export function poseSuffix(bytes: Uint8Array): string | null {
  if (bytes.length <= POSE_BYTES) return null;
  const text = new TextDecoder().decode(bytes.subarray(POSE_BYTES)).trim();
  return text.length > 0 ? text : null;
}

/**
 * A {@link StateCodec} for engine poses over the base64 wire form — plug it
 * into `attachRemoteActors` / `createWorldSession` actor config. Undecodable
 * payloads yield a zeroed pose with `flags: 0` (they land in the players
 * lane predicate's care, same as unknown custom states).
 */
export const enginePoseCodec: StateCodec<EnginePose> = {
  encode: (pose) => encodeBase64(encodeEnginePose(pose)),
  decode: (data) =>
    decodeEnginePose(decodeBase64(data)) ?? {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      flags: 0,
      held: 0,
      updatedAtMs: 0,
      suffix: null,
    },
};

/**
 * Ready-made lane predicates for `createWorldSession` when the world runs
 * compute-module engines: `players` (no engine flag), `mobs` (FLAG_MOB) and
 * `npcs` (FLAG_NPC) — what Blocks with Friends hand-wired in its Phase 9
 * adoption. Spread extra lanes on top as needed.
 */
export function engineLanes(): Record<string, (state: EnginePose) => boolean> {
  return {
    mobs: (state) => (state.flags & FLAG_MOB) !== 0,
    npcs: (state) => (state.flags & FLAG_NPC) !== 0,
    players: (state) => (state.flags & (FLAG_MOB | FLAG_NPC)) === 0,
  };
}

// ---------------------------------------------------------------------------
// Server-event payloads ([u16 LE event type][state bytes], state = JSON)
// ---------------------------------------------------------------------------

/** Contact damage decided by a mob/combat engine (kit-play referee). */
export const EVENT_CONTACT_DAMAGE = 77;
/** Weather/season transition from a world engine (kit-sim weather). */
export const EVENT_WEATHER = 90;
/** Turn changed (kit-play turns; match engines). */
export const EVENT_TURN = 91;
/** Score / match summary (kit-play score). */
export const EVENT_SCORE = 92;
/** Match proposal (matchmaking → matches handoff). */
export const EVENT_PROPOSAL = 93;
/** Ability cast/impact (kit-play abilities). */
export const EVENT_ABILITY = 94;
/** Movement-envelope violation (movement-warden, observe/flag). */
export const EVENT_MOVEMENT_VIOLATION = 95;
/** Control-point state change (territory). */
export const EVENT_CONTROL_POINT = 96;
/** Race timing: checkpoint/lap/finish (kit-play timing). */
export const EVENT_RACE_TIMING = 97;
/** Zone change: shrinking circles, event areas (kit-sim zones). */
export const EVENT_ZONE_CHANGE = 98;

/** Split an engine server-event payload into its type + JSON body. */
export function parseEngineEvent(
  bytes: Uint8Array,
): { eventType: number; body: Record<string, unknown> } | null {
  if (bytes.length < 2) return null;
  const eventType = bytes[0] | (bytes[1] << 8);
  let body: Record<string, unknown> = {};
  if (bytes.length > 2) {
    try {
      body = JSON.parse(new TextDecoder().decode(bytes.subarray(2))) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return { eventType, body };
}

/** A parsed type-77 contact-damage event. */
export interface ContactDamageEvent {
  targetUuid: string;
  damage: number;
  mobId: string;
  mobName: string;
}

/** Parse a contact-damage event; null when the payload is another type. */
export function parseContactDamage(bytes: Uint8Array): ContactDamageEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_CONTACT_DAMAGE) return null;
  return {
    targetUuid: String(parsed.body.targetUuid ?? ''),
    damage: Number(parsed.body.damage ?? 0),
    mobId: String(parsed.body.mobId ?? ''),
    mobName: String(parsed.body.mobName ?? ''),
  };
}

/** A parsed type-90 weather transition event. */
export interface WeatherEvent {
  weather: string;
  sinceMs: number;
  untilMs: number;
  /** Extra fields engines add (dayPhase, isNight, remainingMs, ...). */
  body: Record<string, unknown>;
}

/** Parse a weather event; null when the payload is another type. */
export function parseWeatherEvent(bytes: Uint8Array): WeatherEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_WEATHER) return null;
  return {
    weather: String(parsed.body.weather ?? ''),
    sinceMs: Number(parsed.body.sinceMs ?? 0),
    untilMs: Number(parsed.body.untilMs ?? 0),
    body: parsed.body,
  };
}

/** A parsed type-91 turn-changed event (match engines). */
export interface TurnEvent {
  actorId: string;
  round: number;
  turnInRound: number;
  body: Record<string, unknown>;
}

/** Parse a turn event; null when the payload is another type. */
export function parseTurnEvent(bytes: Uint8Array): TurnEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_TURN) return null;
  return {
    actorId: String(parsed.body.actorId ?? ''),
    round: Number(parsed.body.round ?? 0),
    turnInRound: Number(parsed.body.turnInRound ?? 0),
    body: parsed.body,
  };
}

/** A parsed type-92 score/summary event (match engines). */
export interface ScoreEvent {
  /** Per-actor standings when present. */
  standings: Array<{ actorId: string; score: number; rank: number }>;
  winnerId: string | null;
  body: Record<string, unknown>;
}

/** Parse a score event; null when the payload is another type. */
export function parseScoreEvent(bytes: Uint8Array): ScoreEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_SCORE) return null;
  const standings = Array.isArray(parsed.body.standings)
    ? (parsed.body.standings as Array<Record<string, unknown>>).map((s) => ({
        actorId: String(s.actorId ?? ''),
        score: Number(s.score ?? 0),
        rank: Number(s.rank ?? 0),
      }))
    : [];
  return {
    standings,
    winnerId: parsed.body.winnerId != null ? String(parsed.body.winnerId) : null,
    body: parsed.body,
  };
}

/** A parsed type-93 match-proposal event (matchmaking handoff). */
export interface ProposalEvent {
  proposalId: string;
  mode: string;
  players: string[];
  body: Record<string, unknown>;
}

/** Parse a proposal event; null when the payload is another type. */
export function parseProposalEvent(bytes: Uint8Array): ProposalEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_PROPOSAL) return null;
  return {
    proposalId: String(parsed.body.proposalId ?? ''),
    mode: String(parsed.body.mode ?? ''),
    players: Array.isArray(parsed.body.players)
      ? (parsed.body.players as unknown[]).map(String)
      : [],
    body: parsed.body,
  };
}

/** A parsed type-94 ability cast/impact event. */
export interface AbilityEvent {
  /** `'cast'` or `'impact'`. */
  kind: string;
  abilityId: string;
  casterId: string;
  victimId: string | null;
  damage: number;
  body: Record<string, unknown>;
}

/** Parse an ability event; null when the payload is another type. */
export function parseAbilityEvent(bytes: Uint8Array): AbilityEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_ABILITY) return null;
  return {
    kind: String(parsed.body.kind ?? ''),
    abilityId: String(parsed.body.abilityId ?? ''),
    casterId: String(parsed.body.casterId ?? ''),
    victimId: parsed.body.victimId != null ? String(parsed.body.victimId) : null,
    damage: Number(parsed.body.damage ?? 0),
    body: parsed.body,
  };
}

/** A parsed type-95 movement-violation event (observe/flag posture). */
export interface MovementViolationEvent {
  /** `'speed'`, `'teleport'`, or `'bounds'`. */
  kind: string;
  userId: string;
  detail: string;
  body: Record<string, unknown>;
}

/** Parse a movement-violation event; null when the payload is another type. */
export function parseMovementViolation(bytes: Uint8Array): MovementViolationEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_MOVEMENT_VIOLATION) return null;
  return {
    kind: String(parsed.body.kind ?? ''),
    userId: String(parsed.body.userId ?? ''),
    detail: String(parsed.body.detail ?? ''),
    body: parsed.body,
  };
}

/** A parsed type-96 control-point state event (territory flips). */
export interface ControlPointEvent {
  pointId: string;
  owner: string;
  previousOwner: string;
  body: Record<string, unknown>;
}

/** Parse a control-point event; null when the payload is another type. */
export function parseControlPointEvent(bytes: Uint8Array): ControlPointEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_CONTROL_POINT) return null;
  return {
    pointId: String(parsed.body.pointId ?? ''),
    owner: String(parsed.body.owner ?? ''),
    previousOwner: String(parsed.body.previousOwner ?? ''),
    body: parsed.body,
  };
}

/** A parsed type-97 race-timing event (checkpoint/lap/finish). */
export interface RaceTimingEvent {
  /** `'started'`, `'checkpoint'`, `'lap'`, or `'finished'`. */
  kind: string;
  courseId: string;
  userId: string;
  body: Record<string, unknown>;
}

/** Parse a race-timing event; null when the payload is another type. */
export function parseRaceTimingEvent(bytes: Uint8Array): RaceTimingEvent | null {
  const parsed = parseEngineEvent(bytes);
  if (!parsed || parsed.eventType !== EVENT_RACE_TIMING) return null;
  return {
    kind: String(parsed.body.kind ?? ''),
    courseId: String(parsed.body.courseId ?? ''),
    userId: String(parsed.body.userId ?? ''),
    body: parsed.body,
  };
}
