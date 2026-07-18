/**
 * Typed state codecs — the foundation of the World Stores layer.
 *
 * Every opaque base64 blob on the platform (actor replication `state`, voxel
 * `voxelState`, chunk `chunkState`, client event `state`, channel/actor
 * message `payload`, `UserAppState.state`, avatar public/private/app state)
 * is app-defined. A {@link StateCodec} names that definition ONCE: the dev
 * registers their custom type + encoder/decoder with a store, and the store
 * speaks typed values everywhere else.
 */

import { decodeBase64, encodeBase64 } from '../utils.js';

/**
 * A two-way codec between a typed value and the platform's base64 wire form.
 * Implement your own, or build one with {@link jsonCodec} (compact JSON),
 * {@link rawCodec} (pass-through base64), or {@link structCodec} (fixed-layout
 * binary — the right choice for high-rate replication state).
 */
export interface StateCodec<T> {
  /** Encode a typed value into the base64 wire form. */
  encode(value: T): string;
  /** Decode the base64 wire form back into the typed value. */
  decode(data: string): T;
}

/**
 * JSON codec: `JSON.stringify` → UTF-8 → base64. Convenient for low-rate,
 * structured state (save blobs, avatar profiles, channel payloads). Do NOT
 * use it for per-tick actor replication — spatial packets have a ~1.1 KB
 * budget and JSON wastes most of it; use {@link structCodec} there.
 */
export function jsonCodec<T>(): StateCodec<T> {
  return {
    encode: (value) => encodeBase64(new TextEncoder().encode(JSON.stringify(value))),
    decode: (data) => JSON.parse(new TextDecoder().decode(decodeBase64(data))) as T,
  };
}

/**
 * Identity codec: the typed value IS the base64 string. Use it when the app
 * already has its own encoding pipeline and just wants the stores' lifecycle
 * management.
 */
export const rawCodec: StateCodec<string> = {
  encode: (value) => value,
  decode: (data) => data,
};

/**
 * UTF-8 text codec: plain strings ↔ base64 (chat payloads, simple messages).
 */
export const textCodec: StateCodec<string> = {
  encode: (value) => encodeBase64(new TextEncoder().encode(value)),
  decode: (data) => new TextDecoder().decode(decodeBase64(data)),
};

// ---------------------------------------------------------------------------
// structCodec — a declarative fixed-layout binary DSL
// ---------------------------------------------------------------------------

/**
 * One field of a {@link structCodec} layout. Build fields with the factory
 * helpers ({@link f32}, {@link u8}, …) rather than by hand.
 */
export interface StructField<V> {
  /** Bytes this field occupies. */
  size: number;
  read(view: DataView, offset: number, littleEndian: boolean): V;
  write(view: DataView, offset: number, value: V, littleEndian: boolean): void;
  /** True for {@link reserved} padding — excluded from the value type. */
  skip?: boolean;
}

/** A struct layout: ordered named fields (insertion order = byte order). */
export type StructSpec = Record<string, StructField<unknown>>;

/** The typed value a {@link StructSpec} encodes (reserved fields omitted). */
export type StructValue<S extends StructSpec> = {
  [K in keyof S as S[K]['skip'] extends true ? never : K]: S[K] extends StructField<infer V>
    ? V
    : never;
};

/** 32-bit float field. */
export function f32(): StructField<number> {
  return {
    size: 4,
    read: (v, o, le) => v.getFloat32(o, le),
    write: (v, o, value, le) => v.setFloat32(o, value, le),
  };
}

/** 64-bit float field (e.g. epoch-milliseconds timestamps). */
export function f64(): StructField<number> {
  return {
    size: 8,
    read: (v, o, le) => v.getFloat64(o, le),
    write: (v, o, value, le) => v.setFloat64(o, value, le),
  };
}

/** Unsigned 8-bit int field (flags, small ids). */
export function u8(): StructField<number> {
  return {
    size: 1,
    read: (v, o) => v.getUint8(o),
    write: (v, o, value) => v.setUint8(o, value),
  };
}

/** Unsigned 16-bit int field. */
export function u16(): StructField<number> {
  return {
    size: 2,
    read: (v, o, le) => v.getUint16(o, le),
    write: (v, o, value, le) => v.setUint16(o, value, le),
  };
}

/** Unsigned 32-bit int field. */
export function u32(): StructField<number> {
  return {
    size: 4,
    read: (v, o, le) => v.getUint32(o, le),
    write: (v, o, value, le) => v.setUint32(o, value, le),
  };
}

/** Signed 8-bit int field. */
export function i8(): StructField<number> {
  return {
    size: 1,
    read: (v, o) => v.getInt8(o),
    write: (v, o, value) => v.setInt8(o, value),
  };
}

/** Signed 16-bit int field. */
export function i16(): StructField<number> {
  return {
    size: 2,
    read: (v, o, le) => v.getInt16(o, le),
    write: (v, o, value, le) => v.setInt16(o, value, le),
  };
}

/** Signed 32-bit int field. */
export function i32(): StructField<number> {
  return {
    size: 4,
    read: (v, o, le) => v.getInt32(o, le),
    write: (v, o, value, le) => v.setInt32(o, value, le),
  };
}

/** Boolean stored as one byte (0/1). */
export function bool8(): StructField<boolean> {
  return {
    size: 1,
    read: (v, o) => v.getUint8(o) !== 0,
    write: (v, o, value) => v.setUint8(o, value ? 1 : 0),
  };
}

/** Fixed-length raw bytes field. */
export function bytes(length: number): StructField<Uint8Array> {
  return {
    size: length,
    read: (v, o) => new Uint8Array(v.buffer, v.byteOffset + o, length).slice(),
    write: (v, o, value) => {
      const target = new Uint8Array(v.buffer, v.byteOffset + o, length);
      target.set(value.subarray(0, length));
    },
  };
}

/** Reserved padding bytes — occupies layout space, absent from the value type. */
export function reserved(length: number): StructField<undefined> & { skip: true } {
  return {
    size: length,
    skip: true,
    read: () => undefined,
    write: () => {},
  };
}

/** A {@link StateCodec} produced by {@link structCodec}, exposing its byte size. */
export interface StructCodec<T> extends StateCodec<T> {
  /** The fixed encoded size in bytes (before base64). */
  readonly byteLength: number;
}

/**
 * Build a fixed-layout binary codec from a declarative field spec — the
 * replication-state workhorse. Fields are laid out in declaration order,
 * little-endian by default (matching the platform's wire conventions).
 *
 * The Blocks-with-Friends 48-byte pose, declaratively:
 *
 * ```ts
 * const poseCodec = structCodec({
 *   x: f32(), y: f32(), z: f32(),
 *   yaw: f32(), pitch: f32(),
 *   vx: f32(), vy: f32(), vz: f32(),
 *   flags: u8(), heldBlockId: u8(), _r0: reserved(2),
 *   updatedAt: f64(), _r1: reserved(4),
 * }); // poseCodec.byteLength === 48
 * ```
 *
 * @throws {Error} at decode time when the payload is shorter than the layout.
 */
export function structCodec<S extends StructSpec>(
  spec: S,
  options: { littleEndian?: boolean } = {},
): StructCodec<StructValue<S>> {
  const littleEndian = options.littleEndian ?? true;
  const fields = Object.entries(spec) as Array<[string, StructField<unknown>]>;
  const byteLength = fields.reduce((sum, [, f]) => sum + f.size, 0);

  return {
    byteLength,
    encode(value) {
      const buffer = new Uint8Array(byteLength);
      const view = new DataView(buffer.buffer);
      let offset = 0;
      for (const [name, field] of fields) {
        if (!field.skip) {
          field.write(view, offset, (value as Record<string, unknown>)[name], littleEndian);
        }
        offset += field.size;
      }
      return encodeBase64(buffer);
    },
    decode(data) {
      const buffer = decodeBase64(data);
      if (buffer.byteLength < byteLength) {
        throw new Error(
          `structCodec: payload is ${buffer.byteLength} bytes, layout needs ${byteLength}`,
        );
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const out: Record<string, unknown> = {};
      let offset = 0;
      for (const [name, field] of fields) {
        if (!field.skip) {
          out[name] = field.read(view, offset, littleEndian);
        }
        offset += field.size;
      }
      return out as StructValue<S>;
    },
  };
}
