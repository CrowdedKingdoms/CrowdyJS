import { isRecord } from './lsp-protocol.js';
import { GENERATED_BROWSER_AUTHORING_INDEX } from './browser-authoring-index.generated.js';

export type PlatformSymbolKind =
  | 'const'
  | 'enum'
  | 'field'
  | 'function'
  | 'macro'
  | 'method'
  | 'module'
  | 'reexport'
  | 'static'
  | 'struct'
  | 'trait'
  | 'type'
  | 'variant';

export interface PlatformSymbol {
  module: string;
  name: string;
  kind: PlatformSymbolKind;
  signature: string;
  docs: string;
}

export interface PlatformCrate {
  name: string;
  version: string;
  sourceHash: string;
}

export interface PlatformIndex {
  schemaVersion: 2;
  rustVersion: string;
  sdkVersion: string;
  abiVersion: number;
  contentHash: string;
  crates: PlatformCrate[];
  symbols: PlatformSymbol[];
}

const SYMBOL_KINDS = new Set<PlatformSymbolKind>([
  'const',
  'enum',
  'field',
  'function',
  'macro',
  'method',
  'module',
  'reexport',
  'static',
  'struct',
  'trait',
  'type',
  'variant',
]);
export const MAX_PLATFORM_INDEX_BYTES = 2 * 1024 * 1024;
export const MAX_PLATFORM_CRATES = 256;
export const MAX_PLATFORM_CRATE_FIELD_LENGTH = 256;
const INDEX_KEYS = new Set([
  'schemaVersion',
  'rustVersion',
  'sdkVersion',
  'abiVersion',
  'contentHash',
  'crates',
  'symbols',
]);
const CRATE_KEYS = new Set(['name', 'version', 'sourceHash']);
const SYMBOL_KEYS = new Set([
  'module',
  'name',
  'kind',
  'signature',
  'docs',
]);

export function loadPlatformIndex(input: unknown): PlatformIndex {
  assertSerializedSize(input);
  if (!isRecord(input)) throw new Error('Platform index must be an object');
  assertExactKeys(input, INDEX_KEYS, 'platform index');
  if (input.schemaVersion !== 2) {
    throw new Error(`Unsupported platform index schemaVersion: ${String(input.schemaVersion)}`);
  }
  const rustVersion = requiredString(input.rustVersion, 'rustVersion');
  const sdkVersion = requiredString(input.sdkVersion, 'sdkVersion');
  if (!Number.isSafeInteger(input.abiVersion) || (input.abiVersion as number) < 0) {
    throw new Error('abiVersion must be a non-negative safe integer');
  }
  const abiVersion = input.abiVersion as number;
  const contentHash = requiredString(input.contentHash, 'contentHash');
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
    throw new Error('contentHash must be a lowercase SHA-256 hex digest');
  }
  if (!Array.isArray(input.crates) || input.crates.length === 0) {
    throw new Error('crates must be a non-empty array');
  }
  if (input.crates.length > MAX_PLATFORM_CRATES) {
    throw new Error(
      `Platform index exceeds the ${MAX_PLATFORM_CRATES} crate limit`,
    );
  }
  const crates = input.crates.map((entry, index) => loadCrate(entry, index));
  const crateNames = new Set<string>();
  for (const crate of crates) {
    if (crateNames.has(crate.name)) {
      throw new Error(`Duplicate platform crate: ${crate.name}`);
    }
    crateNames.add(crate.name);
  }
  if (!Array.isArray(input.symbols)) {
    throw new Error('symbols must be an array');
  }
  if (input.symbols.length > 20_000) {
    throw new Error('Platform index exceeds the 20,000 symbol limit');
  }
  const symbols = input.symbols.map((entry, index) =>
    loadSymbol(entry, index),
  );
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const path = `${symbol.module}::${symbol.name}`;
    const key = `${path}\0${symbol.kind}\0${symbol.signature}`;
    if (seen.has(key)) throw new Error(`Duplicate platform symbol: ${path}`);
    seen.add(key);
  }
  const loaded: PlatformIndex = {
    schemaVersion: 2,
    rustVersion,
    sdkVersion,
    abiVersion,
    contentHash,
    crates: Object.freeze(crates) as unknown as PlatformCrate[],
    symbols: Object.freeze(symbols) as unknown as PlatformSymbol[],
  };
  const computedHash = computePlatformIndexContentHash(loaded);
  if (computedHash !== contentHash) {
    throw new Error(
      `Platform index contentHash mismatch: expected ${contentHash}, computed ${computedHash}`,
    );
  }
  assertSerializedSize(loaded);
  return Object.freeze(loaded);
}

export function computePlatformIndexContentHash(
  index: Pick<
    PlatformIndex,
    | 'schemaVersion'
    | 'rustVersion'
    | 'sdkVersion'
    | 'abiVersion'
    | 'crates'
    | 'symbols'
  >,
): string {
  const payload = {
    schemaVersion: index.schemaVersion,
    rustVersion: index.rustVersion,
    sdkVersion: index.sdkVersion,
    abiVersion: index.abiVersion,
    crates: index.crates.map((crate) => ({
      name: crate.name,
      version: crate.version,
      sourceHash: crate.sourceHash,
    })),
    symbols: index.symbols.map((symbol) => ({
      module: symbol.module,
      name: symbol.name,
      kind: symbol.kind,
      signature: symbol.signature,
      docs: symbol.docs,
    })),
  };
  return sha256Hex(JSON.stringify(payload));
}

function loadCrate(input: unknown, index: number): PlatformCrate {
  if (!isRecord(input)) throw new Error(`crates[${index}] must be an object`);
  assertExactKeys(input, CRATE_KEYS, `crates[${index}]`);
  const sourceHash = requiredString(
    input.sourceHash,
    `crates[${index}].sourceHash`,
  );
  if (!/^[a-f0-9]{64}$/u.test(sourceHash)) {
    throw new Error(
      `crates[${index}].sourceHash must be a lowercase SHA-256 hex digest`,
    );
  }
  return Object.freeze({
    name: requiredCrateString(input.name, `crates[${index}].name`),
    version: requiredCrateString(
      input.version,
      `crates[${index}].version`,
    ),
    sourceHash,
  });
}

function loadSymbol(input: unknown, index: number): PlatformSymbol {
  if (!isRecord(input)) throw new Error(`symbols[${index}] must be an object`);
  assertExactKeys(input, SYMBOL_KEYS, `symbols[${index}]`);
  const kind = requiredString(input.kind, `symbols[${index}].kind`);
  if (!SYMBOL_KINDS.has(kind as PlatformSymbolKind)) {
    throw new Error(`symbols[${index}].kind is unsupported`);
  }
  const symbol: PlatformSymbol = {
    module: requiredString(input.module, `symbols[${index}].module`),
    name: requiredString(input.name, `symbols[${index}].name`),
    kind: kind as PlatformSymbolKind,
    signature: requiredString(input.signature, `symbols[${index}].signature`),
    docs: boundedString(input.docs, `symbols[${index}].docs`),
  };
  return Object.freeze(symbol);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384) {
    throw new Error(`${field} must be a non-empty bounded string`);
  }
  return value;
}

function requiredCrateString(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PLATFORM_CRATE_FIELD_LENGTH
  ) {
    throw new Error(
      `${field} must be a non-empty string of at most ${MAX_PLATFORM_CRATE_FIELD_LENGTH} characters`,
    );
  }
  return value;
}

function boundedString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 16_384) {
    throw new Error(`${field} must be a bounded string`);
  }
  return value;
}

function assertExactKeys(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
): void {
  const unexpected = Object.keys(input).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`${field} has unexpected field ${unexpected}`);
  const missing = [...allowed].find((key) => !(key in input));
  if (missing) throw new Error(`${field} is missing ${missing}`);
}

function assertSerializedSize(input: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new Error('Platform index must be JSON-serializable');
  }
  if (serialized === undefined) return;
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_PLATFORM_INDEX_BYTES) {
    throw new Error(
      `Platform index is ${bytes} bytes; limit is ${MAX_PLATFORM_INDEX_BYTES}`,
    );
  }
}

function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index++) {
      const left = words[index - 15]!;
      const right = words[index - 2]!;
      const sigma0 =
        rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 =
        rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] =
        (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }
  return [...state]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

const SHA256_CONSTANTS = new Uint32Array([
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

export const EMBEDDED_PLATFORM_INDEX: PlatformIndex = loadPlatformIndex(
  GENERATED_BROWSER_AUTHORING_INDEX,
);
