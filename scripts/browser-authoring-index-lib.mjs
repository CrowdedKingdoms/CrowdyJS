import { createHash } from 'node:crypto';

export const MAX_INDEX_BYTES = 2 * 1024 * 1024;
export const MAX_CRATES = 256;
export const MAX_CRATE_FIELD_LENGTH = 256;
export const MAX_SYMBOLS = 20_000;
export const MAX_SYMBOL_FIELD_LENGTH = 16_384;

const SYMBOL_KINDS = new Set([
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

export function validateIndexBytes(sourceBytes, label = 'Browser authoring index') {
  if (!Buffer.isBuffer(sourceBytes) && !(sourceBytes instanceof Uint8Array)) {
    throw new Error(`${label} must be supplied as bytes`);
  }
  let index;
  try {
    index = JSON.parse(Buffer.from(sourceBytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  validateIndex(index, sourceBytes.byteLength, label);
  return index;
}

export function validateIndex(index, bytes, label = 'Browser authoring index') {
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error(`${label} must be an object`);
  }
  const keys = Object.keys(index).sort();
  const expected = [
    'abiVersion',
    'contentHash',
    'crates',
    'rustVersion',
    'schemaVersion',
    'sdkVersion',
    'symbols',
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields are incompatible: ${keys.join(',')}`);
  }
  if (index.schemaVersion !== 2) {
    throw new Error(`Unsupported browser authoring schema ${index.schemaVersion}`);
  }
  if (
    !boundedString(index.rustVersion, MAX_SYMBOL_FIELD_LENGTH, false) ||
    !boundedString(index.sdkVersion, MAX_SYMBOL_FIELD_LENGTH, false) ||
    !Number.isSafeInteger(index.abiVersion) ||
    index.abiVersion < 0 ||
    !/^[a-f0-9]{64}$/u.test(index.contentHash) ||
    !Array.isArray(index.crates) ||
    !Array.isArray(index.symbols)
  ) {
    throw new Error(`${label} metadata is incompatible`);
  }
  if (
    index.crates.length === 0 ||
    index.crates.length > MAX_CRATES ||
    index.symbols.length > MAX_SYMBOLS ||
    bytes > MAX_INDEX_BYTES
  ) {
    throw new Error(`${label} exceeds CrowdyJS limits`);
  }
  const crateNames = new Set();
  for (const [position, crate] of index.crates.entries()) {
    validateExactObject(
      crate,
      ['name', 'sourceHash', 'version'],
      `${label} crates[${position}]`,
    );
    if (
      !boundedString(crate.name, MAX_CRATE_FIELD_LENGTH, false) ||
      !boundedString(crate.version, MAX_CRATE_FIELD_LENGTH, false) ||
      !/^[a-f0-9]{64}$/u.test(crate.sourceHash)
    ) {
      throw new Error(`${label} crates[${position}] is incompatible`);
    }
    if (crateNames.has(crate.name)) {
      throw new Error(`${label} has duplicate crate ${crate.name}`);
    }
    crateNames.add(crate.name);
  }
  const symbolIdentities = new Set();
  for (const [position, symbol] of index.symbols.entries()) {
    validateExactObject(
      symbol,
      ['docs', 'kind', 'module', 'name', 'signature'],
      `${label} symbols[${position}]`,
    );
    if (
      !boundedString(symbol.module, MAX_SYMBOL_FIELD_LENGTH, false) ||
      !boundedString(symbol.name, MAX_SYMBOL_FIELD_LENGTH, false) ||
      !boundedString(symbol.signature, MAX_SYMBOL_FIELD_LENGTH, false) ||
      !boundedString(symbol.docs, MAX_SYMBOL_FIELD_LENGTH, true) ||
      !SYMBOL_KINDS.has(symbol.kind)
    ) {
      throw new Error(`${label} symbols[${position}] is incompatible`);
    }
    const identity = `${symbol.module}\0${symbol.name}\0${symbol.kind}\0${symbol.signature}`;
    if (symbolIdentities.has(identity)) {
      throw new Error(`${label} has duplicate symbol ${symbol.module}::${symbol.name}`);
    }
    symbolIdentities.add(identity);
  }
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: index.schemaVersion,
        rustVersion: index.rustVersion,
        sdkVersion: index.sdkVersion,
        abiVersion: index.abiVersion,
        crates: index.crates,
        symbols: index.symbols,
      }),
    )
    .digest('hex');
  if (contentHash !== index.contentHash) {
    throw new Error(
      `${label} contentHash mismatch: expected ${index.contentHash}, computed ${contentHash}`,
    );
  }
}

function validateExactObject(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(keys)) {
    throw new Error(`${field} fields are incompatible`);
  }
}

function boundedString(value, maxLength, allowEmpty) {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.length > 0) &&
    value.length <= maxLength
  );
}
