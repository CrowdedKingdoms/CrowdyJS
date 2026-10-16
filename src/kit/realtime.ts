/**
 * What kit hubs show players near them through the realtime tier (UDP), decoded for World
 * Stores: server-driven actors (mobs, NPCs, pets, a ball) and server events.
 *
 * A server-driven actor's state is {@link KitActorState} as MessagePack (`ckx_sdk::kit::wire`
 * `ActorState`). A server event is an `eventType` from the registry in `wire.ts` with a JSON
 * body; `ServerEventNotification.state` is that body, base64.
 */

import { decode, encode } from '@msgpack/msgpack';

import { jsonCodec, type StateCodec } from '../stores/codec.js';
import { decodeBase64, encodeBase64 } from '../utils.js';
import {
  EVENT_ABILITY,
  EVENT_CONTACT_DAMAGE,
  EVENT_CONTROL_POINT,
  EVENT_EMOTE,
  EVENT_ENCOUNTER,
  EVENT_MOVEMENT_VIOLATION,
  EVENT_POSSESSION,
  EVENT_PROPOSAL,
  EVENT_RACE_TIMING,
  EVENT_SCORE,
  EVENT_TURN,
  EVENT_WEATHER,
  EVENT_ZONE_CHANGE,
} from './wire.js';

/** A server-driven actor as a kit hub shows it. */
export interface KitActorState {
  /** What it is: `mob`, `npc`, `pet`, `ball`, `ghost`, or a game's own word. */
  kind: string;
  /** Its id within the hub that shows it. */
  id: number;
  /** Where it is, in chunks. */
  x: number;
  y: number;
  z: number;
  hp: number | null;
  max_hp?: number;
  mode?: string;
  /** The player it belongs to (a pet, a summon). */
  owner?: number;
  yaw?: number;
  name?: string;
}

/** Whether a decoded value is a kit actor's state. */
export function isKitActorState(value: unknown): value is KitActorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === 'string' && typeof v.id === 'number' && typeof v.x === 'number' && typeof v.z === 'number';
}

/** A kit actor's state from its MessagePack bytes, or null when they are not one. */
export function decodeKitActorState(bytes: Uint8Array): KitActorState | null {
  try {
    const v = decode(bytes) as Record<string, unknown>;
    if (!isKitActorState(v)) return null;
    return { ...v, y: typeof v.y === 'number' ? v.y : 0, hp: typeof v.hp === 'number' ? v.hp : null } as KitActorState;
  } catch {
    return null;
  }
}

/**
 * A {@link StateCodec} for the actors kit hubs show, for `createWorldSession`'s `actors`
 * config. A state that is not a kit actor's decodes to null (a player's, say).
 */
export const kitActorCodec: StateCodec<KitActorState | null> = {
  encode: (state) => encodeBase64(state ? encode(state) : new Uint8Array()),
  decode: (data) => (data ? decodeKitActorState(decodeBase64(data)) : null),
};

/** A player's actor in a world with kit hubs, with the game's own state. */
export interface KitPlayerActor<P> {
  kind: 'player';
  player: P;
}

/** A remote actor in a world with kit hubs: a player's, or a server-driven one. */
export type KitWorldActor<P> = KitPlayerActor<P> | KitActorState;

/** Whether a remote actor is a player's (rather than one a hub shows). */
export function isKitPlayerActor<P>(actor: KitWorldActor<P>): actor is KitPlayerActor<P> {
  return actor.kind === 'player' && 'player' in actor;
}

/**
 * One codec for a world where players and kit hubs both show actors: a kit actor's state
 * decodes as itself, anything else through `playerCodec` as `{ kind: 'player', player }`.
 * A game's own player state must not be a MessagePack map with `kind`, `id`, `x` and `z`.
 */
export function withKitActors<P>(playerCodec: StateCodec<P>): StateCodec<KitWorldActor<P>> {
  return {
    encode: (actor) => (isKitPlayerActor(actor) ? playerCodec.encode(actor.player) : kitActorCodec.encode(actor)),
    decode: (data) => {
      const kit = data ? decodeKitActorState(decodeBase64(data)) : null;
      return kit ?? { kind: 'player', player: playerCodec.decode(data) };
    },
  };
}

/**
 * Lane predicates for `createWorldSession`'s `actors.lanes` with {@link withKitActors}:
 * `players`, `mobs`, `npcs`, `pets`, and `others` for any other kind a hub shows.
 */
export function kitActorLanes<P>(): Record<'players' | 'mobs' | 'npcs' | 'pets' | 'others', (a: KitWorldActor<P>) => boolean> {
  const known = new Set(['player', 'mob', 'npc', 'pet']);
  return {
    players: (a) => a.kind === 'player',
    mobs: (a) => a.kind === 'mob',
    npcs: (a) => a.kind === 'npc',
    pets: (a) => a.kind === 'pet',
    others: (a) => !known.has(a.kind),
  };
}

/** The event types of the kit's registry, each with the JSON codec its body takes. */
export const KIT_EVENT_TYPES: readonly number[] = [
  EVENT_CONTACT_DAMAGE,
  EVENT_WEATHER,
  EVENT_TURN,
  EVENT_SCORE,
  EVENT_PROPOSAL,
  EVENT_ABILITY,
  EVENT_MOVEMENT_VIOLATION,
  EVENT_CONTROL_POINT,
  EVENT_RACE_TIMING,
  EVENT_ZONE_CHANGE,
  EVENT_ENCOUNTER,
  EVENT_POSSESSION,
  EVENT_EMOTE,
];

/** Codecs for World Stores' `EventRouter`, one per kit event type: the bodies are JSON. */
export function kitEventCodecs(): Map<number, StateCodec<Record<string, unknown>>> {
  const codec = jsonCodec<Record<string, unknown>>();
  return new Map(KIT_EVENT_TYPES.map((t) => [t, codec]));
}

/**
 * A server event a kit hub sent, from its notification (`eventType` and the base64 `state`),
 * or null when the body is not JSON.
 */
export function parseKitServerEvent(notification: {
  eventType: number;
  state: string;
}): { eventType: number; body: Record<string, unknown> } | null {
  try {
    const text = new TextDecoder().decode(decodeBase64(notification.state));
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return { eventType: notification.eventType, body: body as Record<string, unknown> };
  } catch {
    return null;
  }
}
