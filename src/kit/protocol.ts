/**
 * The game kit protocol: what kit hubs (ck-exec's starter packs, built on `ckx_sdk::kit`)
 * send the kit's clients, read without I/O.
 *
 * A kit hub's topics carry **kit messages**: MessagePack maps with the hub's data and four
 * reserved fields beside it: `v` (the protocol version, {@link KIT_PROTOCOL}), `epoch` (the
 * publishing instance's epoch, which changes whenever it is placed again: a move, a restart or
 * a crash), `seq` (one more than the topic's last message) and `kind`:
 *
 * - `snapshot`: the topic's whole public state; it replaces what the client holds.
 * - `delta`: one change to a collection (`id`, then `type_name` and `props`, or `removed`),
 *   applied in `seq` order. A gap in `seq`, or another `epoch`, means a resync.
 * - `changed`: something private changed for the players in `who` (`what` names it); they read
 *   it back with a call the hub answers for its caller alone. Topics have no access control,
 *   so kit hubs never publish anything private.
 * - `event`: something that happened, with nothing to keep.
 *
 * Every kit hub answers `snapshot { topic }` with a `snapshot` message whose `seq` is the
 * topic's last. A call that changes something may carry an `action_id`; the hub answers a call
 * sent again with the first answer. A refusal's message is `kit:<code>: <text>`.
 */

import { CrowdyExecError } from '../domains/exec.js';

/** The protocol version kit messages carry in `v`. */
export const KIT_PROTOCOL = 1;
/** The method every kit hub answers with a topic's snapshot. */
export const KIT_SNAPSHOT_METHOD = 'snapshot';
/** The longest `action_id` a hub takes, in bytes. */
export const KIT_ACTION_ID_MAX = 64;

export type KitMessageKind = 'snapshot' | 'delta' | 'changed' | 'event';

/** The reserved fields of a kit message. */
export interface KitHeader {
  v: number;
  epoch: number;
  seq: number;
  kind: KitMessageKind;
}

/** The body of a `changed` message. */
export interface KitChanged {
  /** The players who should read again (player ids). */
  who: number[];
  /** What changed for them, as the hub's endpoints name it. */
  what: string;
}

/** One member of a collection, as a `delta` or a collection snapshot carries it. */
export interface KitContainer {
  id: number;
  type_name: string;
  /** Its public properties, all of them: a delta replaces what the client held. */
  props: Record<string, unknown>;
}

/** A collection delta's body. */
export interface KitDelta {
  id: number;
  type_name?: string;
  props?: Record<string, unknown>;
  removed?: boolean;
}

const KINDS: ReadonlySet<string> = new Set(['snapshot', 'delta', 'changed', 'event']);
const RESERVED = ['v', 'epoch', 'seq', 'kind'] as const;

/** Whether `value` is a kit message: a map with the four reserved fields. */
export function isKitMessage(value: unknown): value is KitHeader & Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.v === 'number' &&
    typeof v.epoch === 'number' &&
    typeof v.seq === 'number' &&
    typeof v.kind === 'string' &&
    KINDS.has(v.kind)
  );
}

/**
 * A kit message split into its header and its body (every other field), or null when
 * `value` is not one.
 */
export function splitKitMessage<T = Record<string, unknown>>(
  value: unknown,
): { header: KitHeader; body: T } | null {
  if (!isKitMessage(value)) return null;
  const body: Record<string, unknown> = { ...value };
  for (const k of RESERVED) delete body[k];
  return {
    header: { v: value.v, epoch: value.epoch, seq: value.seq, kind: value.kind },
    body: body as T,
  };
}

// ---- refusals ----

const CODED = /^kit:([a-z0-9_]{1,64}): ([\s\S]*)$/;

/** The code and text of a kit refusal's message, or null for any other message. */
export function parseKitRefusal(message: string): { code: string; text: string } | null {
  const m = CODED.exec(message);
  return m ? { code: m[1]!, text: m[2]! } : null;
}

/** The refusal codes kit hubs share; a hub may add its own (lowercase, digits, `_`). */
export const KIT_CODES = {
  BAD_REQUEST: 'bad_request',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  CONFLICT: 'conflict',
  FULL: 'full',
  LIMIT: 'limit',
  COOLDOWN: 'cooldown',
  NOT_YOUR_TURN: 'not_your_turn',
  NOT_MEMBER: 'not_member',
  STARTED: 'started',
  FINISHED: 'finished',
  NOT_READY: 'not_ready',
  RESERVED: 'reserved',
  EMPTY: 'empty',
  OUT_OF_REACH: 'out_of_reach',
  EXPIRED: 'expired',
  INSUFFICIENT: 'insufficient',
  ALREADY_DONE: 'already_done',
  /** A hub the call needed did not answer: the kit sends it again with its action id. */
  UNAVAILABLE: 'unavailable',
} as const;

/**
 * A kit hub refused the call (`AppError` with a `kit:<code>:` message): `code` is what to
 * branch on, `text` what to show. It is a {@link CrowdyExecError} with status `AppError`, so
 * code that handles exec errors handles it.
 */
export class KitError extends CrowdyExecError {
  readonly code: string;
  readonly text: string;

  constructor(code: string, text: string, cause?: unknown) {
    super('AppError', `kit:${code}: ${text}`, cause);
    this.name = 'KitError';
    this.code = code;
    this.text = text;
  }

  /** `error` as a {@link KitError} when it is a coded refusal; otherwise `error` itself. */
  static from(error: unknown): unknown {
    if (error instanceof KitError) return error;
    if (error instanceof CrowdyExecError && error.status === 'AppError') {
      // A CrowdyExecError's message leads with its status.
      const prefix = `${error.status}: `;
      const raw = error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
      const coded = parseKitRefusal(raw);
      if (coded) return new KitError(coded.code, coded.text, error);
    }
    return error;
  }
}

/** The refusal code of `error`, when it is a kit refusal. */
export function kitErrorCode(error: unknown): string | null {
  const e = KitError.from(error);
  return e instanceof KitError ? e.code : null;
}

// ---- action ids ----

/** A fresh `action_id`: unique per attempt, the same for every resend of that attempt. */
export function newActionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * `args` with `action_id` beside them: a plain object gains the field, `undefined` or `null`
 * becomes `{ action_id }`. Anything else (an array, a number) cannot carry one and is
 * returned as it is.
 */
export function withActionId(args: unknown, actionId: string): unknown {
  if (args === undefined || args === null) return { action_id: actionId };
  if (typeof args === 'object' && !Array.isArray(args) && !(args instanceof Uint8Array)) {
    return { ...(args as Record<string, unknown>), action_id: actionId };
  }
  return args;
}

// ---- shard keys ----

/**
 * The centre chunk of the shard holding chunk `(x, z)`: shards are `size` by `size` chunks,
 * keyed by their centre. The same function as `ckx_sdk::kit::shard`, so a client finds the
 * hub for where it stands without asking. `x` and `z` are chunk coordinates (integers).
 */
export function shardCentre(x: number, z: number, size: number): [number, number] {
  const s = Math.max(1, Math.trunc(size));
  const half = Math.floor(s / 2);
  return [Math.floor(Math.trunc(x) / s) * s + half, Math.floor(Math.trunc(z) / s) * s + half];
}

/** The key of the shard holding chunk `(x, z)`: `"<x>,<z>"` of its centre. */
export function shardKey(x: number, z: number, size: number): string {
  const [cx, cz] = shardCentre(x, z, size);
  return `${cx},${cz}`;
}

/** The centre chunk a shard key names, or null when it is not `"<x>,<z>"`. */
export function parseShardKey(key: string): [number, number] | null {
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(key);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The keys of the shards within `radius` shards of the one holding `(x, z)`, its own first. */
export function shardKeysAround(x: number, z: number, size: number, radius: number): string[] {
  const s = Math.max(1, Math.trunc(size));
  const [cx, cz] = shardCentre(x, z, s);
  const keys = [`${cx},${cz}`];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx !== 0 || dz !== 0) keys.push(`${cx + dx * s},${cz + dz * s}`);
    }
  }
  return keys;
}
