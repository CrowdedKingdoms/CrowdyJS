import { CrowdyAgentError } from './errors.js';

export type JsonPrimitive = string | number | boolean | null;

interface JsonSchemaBase {
  readonly description?: string;
  readonly enum?: readonly JsonPrimitive[];
  readonly const?: JsonPrimitive;
}

export interface JsonSchemaString extends JsonSchemaBase {
  readonly type: 'string';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: 'uuid' | 'date-time';
}

export interface JsonSchemaNumber extends JsonSchemaBase {
  readonly type: 'number' | 'integer';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface JsonSchemaBoolean extends JsonSchemaBase {
  readonly type: 'boolean';
}

export interface JsonSchemaNull extends JsonSchemaBase {
  readonly type: 'null';
}

export interface JsonSchemaArray extends JsonSchemaBase {
  readonly type: 'array';
  readonly minItems?: number;
  readonly maxItems: number;
  readonly uniqueItems?: boolean;
  readonly items: JsonSchema;
}

export interface JsonSchemaObject extends JsonSchemaBase {
  readonly type: 'object';
  readonly additionalProperties: false;
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly minProperties?: number;
  readonly maxProperties?: number;
}

export interface JsonSchemaUnion {
  readonly oneOf: readonly JsonSchema[];
  readonly description?: string;
}

export type JsonSchema =
  | JsonSchemaString
  | JsonSchemaNumber
  | JsonSchemaBoolean
  | JsonSchemaNull
  | JsonSchemaArray
  | JsonSchemaObject
  | JsonSchemaUnion;

export interface JsonSchemaValidationOptions {
  /** Stable code distinguishes provider arguments from executor results. */
  direction?: 'INPUT' | 'OUTPUT' | 'SCHEMA';
  maxDepth?: number;
  maxNodes?: number;
  maxBytes?: number;
}

const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_NODES = 4_096;
const DEFAULT_MAX_BYTES = 1_048_576;
const DECIMAL_PATTERN = /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

/**
 * Fields the model must never supply. They are injected from authenticated
 * session, dispatch, approval, and lease context.
 */
export const FORBIDDEN_AGENT_AUTHORITY_FIELDS = Object.freeze([
  'userId',
  'ownerUserId',
  'appId',
  'projectId',
  'gridId',
  'sessionId',
  'runId',
  'toolCallId',
  'clientEpoch',
  'leaseId',
  'lease',
  'approval',
  'approvalGrant',
  'argumentHash',
  'descriptorDigest',
  'idempotencyKey',
  'deadline',
  'token',
  'authorization',
  'headers',
  'endpoint',
  'url',
  'permissions',
  'authority',
] as const);

const FORBIDDEN_NORMALIZED = new Set(
  FORBIDDEN_AGENT_AUTHORITY_FIELDS.map(normalizeField),
);

/** Validate a schema itself before it enters an immutable registry. */
export function assertBoundedJsonSchema(
  schema: JsonSchemaObject,
  options: { rejectAuthorityFields?: boolean } = {},
): void {
  const seen = new Set<JsonSchema>();
  inspectSchema(schema, '$', 0, seen, options.rejectAuthorityFields ?? true);
}

/** Strictly validate JSON data and reject unknown fields or unbounded values. */
export function validateJsonSchemaValue(
  schema: JsonSchema,
  value: unknown,
  options: JsonSchemaValidationOptions = {},
): void {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let bytes: number;
  try {
    bytes = encodedJsonBytes(value);
  } catch (error) {
    throw validationError(
      options.direction,
      '$',
      error instanceof Error ? error.message : 'value is not bounded JSON',
    );
  }
  if (bytes > maxBytes) {
    throw validationError(
      options.direction,
      '$',
      `encoded value is ${bytes} bytes; maximum is ${maxBytes}`,
    );
  }
  const state = {
    nodes: 0,
    maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    direction: options.direction,
    ancestors: new Set<object>(),
  };
  validateNode(schema, value, '$', 0, state);
}

/** RFC-8785-compatible canonical JSON for the JSON subset used by contracts. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

/** Synchronous browser-safe SHA-256 used for descriptor and content digests. */
export function sha256Digest(value: string | Uint8Array): `sha256:${string}` {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = sha256(bytes);
  return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function digestCanonicalJson(value: unknown): `sha256:${string}` {
  return sha256Digest(canonicalJson(value));
}

/** Recursively freeze a JSON-like contract object. */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function isDecimalString(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

function inspectSchema(
  schema: JsonSchema,
  path: string,
  depth: number,
  seen: Set<JsonSchema>,
  rejectAuthorityFields: boolean,
): void {
  if (depth > DEFAULT_MAX_DEPTH) schemaFailure(path, 'schema is too deeply nested');
  if (seen.has(schema)) schemaFailure(path, 'recursive schemas are forbidden');
  seen.add(schema);
  if ('oneOf' in schema) {
    if (schema.oneOf.length < 2 || schema.oneOf.length > 16) {
      schemaFailure(path, 'oneOf must contain 2 to 16 bounded alternatives');
    }
    schema.oneOf.forEach((entry, index) =>
      inspectSchema(entry, `${path}.oneOf[${index}]`, depth + 1, seen, rejectAuthorityFields),
    );
    seen.delete(schema);
    return;
  }
  if (schema.enum) {
    if (schema.enum.length === 0 || schema.enum.length > 128) {
      schemaFailure(path, 'enum must contain 1 to 128 values');
    }
    if (new Set(schema.enum.map((entry) => canonicalJson(entry))).size !== schema.enum.length) {
      schemaFailure(path, 'enum values must be unique');
    }
  }
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) {
      schemaFailure(path, 'every object must set additionalProperties:false');
    }
    const keys = Object.keys(schema.properties);
    const maxProperties = schema.maxProperties ?? keys.length;
    if (keys.length > 128 || maxProperties > keys.length || maxProperties < 0) {
      schemaFailure(path, 'object property bounds are invalid');
    }
    if (new Set(schema.required).size !== schema.required.length) {
      schemaFailure(path, 'required fields must be unique');
    }
    for (const required of schema.required) {
      if (!(required in schema.properties)) {
        schemaFailure(path, `required field ${required} has no schema`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (rejectAuthorityFields && FORBIDDEN_NORMALIZED.has(normalizeField(key))) {
        schemaFailure(`${path}.properties.${key}`, 'caller authority fields are forbidden');
      }
      inspectSchema(
        child,
        `${path}.properties.${key}`,
        depth + 1,
        seen,
        rejectAuthorityFields,
      );
    }
  } else if (schema.type === 'array') {
    if (
      !Number.isSafeInteger(schema.maxItems) ||
      schema.maxItems < 0 ||
      schema.maxItems > 10_000 ||
      (schema.minItems !== undefined &&
        (!Number.isSafeInteger(schema.minItems) ||
          schema.minItems < 0 ||
          schema.minItems > schema.maxItems))
    ) {
      schemaFailure(path, 'array item bounds are required and invalid');
    }
    inspectSchema(schema.items, `${path}.items`, depth + 1, seen, rejectAuthorityFields);
  } else if (schema.type === 'string') {
    if (
      schema.maxLength === undefined ||
      !Number.isSafeInteger(schema.maxLength) ||
      schema.maxLength < 0 ||
      schema.maxLength > DEFAULT_MAX_BYTES ||
      (schema.minLength !== undefined &&
        (!Number.isSafeInteger(schema.minLength) ||
          schema.minLength < 0 ||
          schema.minLength > schema.maxLength))
    ) {
      schemaFailure(path, 'every string must have valid min/max length bounds');
    }
    if (schema.pattern !== undefined) {
      try {
        void new RegExp(schema.pattern, 'u');
      } catch {
        schemaFailure(path, 'string pattern is invalid');
      }
    }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (
      schema.minimum === undefined ||
      schema.maximum === undefined ||
      !Number.isFinite(schema.minimum) ||
      !Number.isFinite(schema.maximum) ||
      schema.minimum > schema.maximum
    ) {
      schemaFailure(path, 'every number must have finite minimum and maximum');
    }
  }
  seen.delete(schema);
}

interface ValidationState {
  nodes: number;
  maxNodes: number;
  maxDepth: number;
  direction?: 'INPUT' | 'OUTPUT' | 'SCHEMA';
  ancestors: Set<object>;
}

function validateNode(
  schema: JsonSchema,
  value: unknown,
  path: string,
  depth: number,
  state: ValidationState,
): void {
  state.nodes++;
  if (state.nodes > state.maxNodes) {
    throw validationError(state.direction, path, 'value has too many nodes');
  }
  if (depth > state.maxDepth) {
    throw validationError(state.direction, path, 'value is too deeply nested');
  }
  if ('oneOf' in schema) {
    let matches = 0;
    for (const alternative of schema.oneOf) {
      try {
        const branchState: ValidationState = {
          ...state,
          ancestors: new Set(state.ancestors),
        };
        validateNode(alternative, value, path, depth, branchState);
        matches++;
      } catch (error) {
        if (!(error instanceof CrowdyAgentError)) throw error;
      }
    }
    if (matches !== 1) {
      throw validationError(state.direction, path, `must match exactly one schema (matched ${matches})`);
    }
    return;
  }
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    throw validationError(state.direction, path, `must equal ${String(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    throw validationError(state.direction, path, 'contains an unknown enum value');
  }
  if (schema.type === 'null') {
    if (value !== null) throw validationError(state.direction, path, 'must be null');
    return;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw validationError(state.direction, path, 'must be a boolean');
    }
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      throw validationError(state.direction, path, 'must be a string');
    }
    if (
      (schema.minLength !== undefined && value.length < schema.minLength) ||
      (schema.maxLength !== undefined && value.length > schema.maxLength)
    ) {
      throw validationError(
        state.direction,
        path,
        `string length must be ${schema.minLength ?? 0}..${schema.maxLength ?? 'bounded'}`,
      );
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      throw validationError(state.direction, path, 'does not match the required pattern');
    }
    if (schema.format === 'uuid' && !UUID_PATTERN.test(value)) {
      throw validationError(state.direction, path, 'must be a UUID');
    }
    if (
      schema.format === 'date-time' &&
      (!DATE_TIME_PATTERN.test(value) || !Number.isFinite(Date.parse(value)))
    ) {
      throw validationError(state.direction, path, 'must be a UTC date-time');
    }
    return;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.type === 'integer' && !Number.isSafeInteger(value))
    ) {
      throw validationError(state.direction, path, `must be a finite ${schema.type}`);
    }
    if (
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum)
    ) {
      throw validationError(
        state.direction,
        path,
        `must be within ${schema.minimum}..${schema.maximum}`,
      );
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      throw validationError(state.direction, path, 'must be an array');
    }
    if (
      (schema.minItems !== undefined && value.length < schema.minItems) ||
      value.length > schema.maxItems
    ) {
      throw validationError(
        state.direction,
        path,
        `array length must be ${schema.minItems ?? 0}..${schema.maxItems}`,
      );
    }
    if (schema.uniqueItems) {
      const values = value.map((entry) => canonicalJson(entry));
      if (new Set(values).size !== values.length) {
        throw validationError(state.direction, path, 'array items must be unique');
      }
    }
    enterContainer(value, path, state);
    try {
      value.forEach((entry, index) =>
        validateNode(schema.items, entry, `${path}[${index}]`, depth + 1, state),
      );
    } finally {
      state.ancestors.delete(value);
    }
    return;
  }
  if (!isPlainRecord(value)) {
    throw validationError(state.direction, path, 'must be a plain object');
  }
  if (schema.type !== 'object') {
    throw validationError(state.direction, path, 'schema type mismatch');
  }
  const keys = Object.keys(value);
  const allowed = new Set(Object.keys(schema.properties));
  const unknown = keys.find((key) => !allowed.has(key));
  if (unknown) {
    throw validationError(state.direction, `${path}.${unknown}`, 'unknown fields are forbidden');
  }
  if (
    (schema.minProperties !== undefined && keys.length < schema.minProperties) ||
    keys.length > (schema.maxProperties ?? allowed.size)
  ) {
    throw validationError(state.direction, path, 'object property count is out of bounds');
  }
  for (const key of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw validationError(state.direction, `${path}.${key}`, 'required field is missing');
    }
  }
  enterContainer(value, path, state);
  try {
    for (const key of keys) {
      validateNode(schema.properties[key], value[key], `${path}.${key}`, depth + 1, state);
    }
  } finally {
    state.ancestors.delete(value);
  }
}

function enterContainer(value: object, path: string, state: ValidationState): void {
  if (state.ancestors.has(value)) {
    throw validationError(state.direction, path, 'cyclic values are forbidden');
  }
  state.ancestors.add(value);
}

function validationError(
  direction: JsonSchemaValidationOptions['direction'],
  field: string,
  message: string,
): CrowdyAgentError {
  const code =
    direction === 'OUTPUT'
      ? 'AGENT_TOOL_OUTPUT_INVALID'
      : direction === 'SCHEMA'
        ? 'AGENT_TOOL_DESCRIPTOR_INVALID'
        : 'AGENT_TOOL_INPUT_INVALID';
  return new CrowdyAgentError(code, `${field}: ${message}`, { field });
}

function schemaFailure(path: string, message: string): never {
  throw validationError('SCHEMA', path, message);
}

function encodedJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(canonicalJson(value)).byteLength;
  } catch (error) {
    if (error instanceof CrowdyAgentError) throw error;
    throw new CrowdyAgentError('AGENT_TOOL_INPUT_INVALID', 'Value is not bounded JSON', {
      cause: error,
    });
  }
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CrowdyAgentError('AGENT_TOOL_INPUT_INVALID', 'Non-finite numbers are forbidden');
    }
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new CrowdyAgentError(
      'AGENT_TOOL_INPUT_INVALID',
      `Non-JSON value of type ${typeof value} is forbidden`,
    );
  }
  if (ancestors.has(value)) {
    throw new CrowdyAgentError('AGENT_TOOL_INPUT_INVALID', 'Cyclic JSON is forbidden');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, ancestors)).join(',')}]`;
    }
    if (!isPlainRecord(value)) {
      throw new CrowdyAgentError('AGENT_TOOL_INPUT_INVALID', 'Only plain JSON objects are allowed');
    }
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`,
      );
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeField(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '').toLowerCase();
}

function sha256(input: Uint8Array): Uint8Array {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high);
  view.setUint32(paddedLength - 4, low);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((word, index) => outputView.setUint32(index * 4, word));
  return output;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
