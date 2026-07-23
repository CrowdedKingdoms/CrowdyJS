import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { RustAnalysis } from '../../dist/live-coding/rust-analysis.js';
import {
  EMBEDDED_PLATFORM_INDEX,
  MAX_PLATFORM_CRATES,
  MAX_PLATFORM_CRATE_FIELD_LENGTH,
  MAX_PLATFORM_INDEX_BYTES,
  computePlatformIndexContentHash,
  loadPlatformIndex,
} from '../../dist/live-coding/platform-index.js';
import { VirtualFileSystem } from '../../dist/live-coding/vfs.js';

let analysis;
before(async () => {
  const assets = new URL('../../dist/live-coding/assets/', import.meta.url);
  analysis = await RustAnalysis.create({
    parserWasmUrl: new URL('web-tree-sitter.wasm', assets).pathname,
    grammarWasmUrl: new URL('tree-sitter-rust.wasm', assets).pathname,
    platformIndex: EMBEDDED_PLATFORM_INDEX,
  });
});
after(() => analysis?.dispose());

function open(vfs, path, text) {
  return vfs.open({
    uri: `file:///player-mod/${path}`,
    languageId: 'rust',
    version: 1,
    text,
  });
}

test('WASM analysis provides diagnostics, symbols, and workspace definitions', () => {
  const vfs = new VirtualFileSystem();
  const declarations = open(
    vfs,
    'src/helpers.rs',
    'pub struct Player;\npub fn helper(value: u32) -> u32 { value + 1 }\n',
  );
  const caller = open(
    vfs,
    'src/lib.rs',
    'fn run() { let value = helper(1); }\n',
  );
  assert.deepEqual(
    analysis.documentSymbols(declarations).map((symbol) => symbol.name),
    ['Player', 'helper'],
  );
  const definition = analysis.definition(
    caller,
    { line: 0, character: 25 },
    vfs.documents(),
  );
  assert.equal(definition.uri, declarations.uri);
  assert.deepEqual(definition.range.start, { line: 1, character: 7 });

  const broken = open(vfs, 'src/broken.rs', 'fn broken( {\n');
  assert.ok(analysis.diagnostics(broken).length > 0);
  assert.equal(analysis.diagnostics(caller).length, 0);
});

test('completion and hover merge workspace and generated platform symbols', () => {
  const vfs = new VirtualFileSystem();
  open(vfs, 'src/helpers.rs', 'pub fn helper() {}\n');
  const document = open(
    vfs,
    'src/lib.rs',
    'fn run() { hel }\ncrowdy_compute_sdk::register_module!();\n',
  );
  const completions = analysis.completions(
    document,
    { line: 0, character: 14 },
    vfs.documents(),
  );
  assert.ok(completions.some((item) => item.label === 'helper'));
  const platformCompletions = analysis.completions(
    document,
    { line: 1, character: 28 },
    vfs.documents(),
  );
  assert.ok(
    platformCompletions.some((item) => item.label === 'register_module!'),
  );
  const hover = analysis.hover(
    document,
    { line: 1, character: 28 },
    vfs.documents(),
  );
  assert.match(hover.contents.value, /Wires user functions to the ABI exports/u);
  assert.match(hover.contents.value, /Crate crowdy-compute-sdk 0\.1\.5/u);
  assert.match(hover.contents.value, /source a43147b89a4e/u);
  assert.match(hover.contents.value, /SDK 0\.1\.5/u);

  const fieldDocument = open(
    vfs,
    'src/field.rs',
    'fn run() { message }\n',
  );
  const fieldCompletion = analysis
    .completions(
      fieldDocument,
      { line: 0, character: 14 },
      vfs.documents(),
    )
    .find((item) => item.label === 'message');
  assert.equal(fieldCompletion?.kind, 5);
  assert.match(fieldCompletion?.detail ?? '', /crowdy-compute-sdk@0\.1\.5/u);
  const fieldHover = analysis.hover(
    fieldDocument,
    { line: 0, character: 12 },
    vfs.documents(),
  );
  assert.match(fieldHover?.contents.value ?? '', /pub message: Option<String>/u);
});

test('target-prefixed workspaces expose cross-file symbols and lifecycle guidance', () => {
  const vfs = new VirtualFileSystem();
  open(vfs, 'server/src/helpers.rs', 'pub fn server_helper() {}\n');
  const server = open(
    vfs,
    'server/src/lib.rs',
    'fn on_tick(_dt: u32) { server_helper(); }\n',
  );
  open(vfs, 'client/src/helpers.rs', 'pub fn client_helper() {}\n');
  const client = open(vfs, 'client/src/lib.rs', 'fn client_main() {}\n');

  const serverItems = analysis.completions(
    server,
    { line: 0, character: 0 },
    vfs.documents(),
  );
  assert.ok(serverItems.some((item) => item.label === 'server lifecycle'));
  assert.ok(serverItems.some((item) => item.label === 'client_helper'));
  const clientItems = analysis.completions(
    client,
    { line: 0, character: 0 },
    vfs.documents(),
  );
  assert.ok(clientItems.some((item) => item.label === 'client lifecycle'));
  assert.ok(clientItems.some((item) => item.label === 'server_helper'));

  const hover = analysis.hover(
    server,
    { line: 0, character: 5 },
    vfs.documents(),
  );
  assert.match(hover?.contents.value ?? '', /SERVER lifecycle/u);
  const definition = analysis.definition(
    server,
    { line: 0, character: 31 },
    vfs.documents(),
  );
  assert.match(definition?.uri ?? '', /server\/src\/helpers\.rs$/u);
});

test('platform index loader is strict and bounded', () => {
  assert.equal(loadPlatformIndex(EMBEDDED_PLATFORM_INDEX).symbols.length, 725);
  assert.equal(EMBEDDED_PLATFORM_INDEX.schemaVersion, 2);
  assert.equal(EMBEDDED_PLATFORM_INDEX.crates.length, 8);
  assert.deepEqual(
    EMBEDDED_PLATFORM_INDEX.crates.map((crate) => crate.name),
    [
      'alloc',
      'core',
      'crowdy-compute-sdk',
      'crowdy-game-kit-ai',
      'crowdy-game-kit-core',
      'crowdy-game-kit-econ',
      'crowdy-game-kit-play',
      'crowdy-game-kit-sim',
    ],
  );
  assert.ok(
    EMBEDDED_PLATFORM_INDEX.crates.every((crate) =>
      /^[a-f0-9]{64}$/u.test(crate.sourceHash),
    ),
  );
  assert.equal(
    EMBEDDED_PLATFORM_INDEX.contentHash,
    '3f5f39d46f732a346033aaf2435528a183e2ab0d0e3691f29c3fa3ecada18ffb',
  );
  assert.throws(
    () => loadPlatformIndex({ ...EMBEDDED_PLATFORM_INDEX, token: 'secret' }),
    /unexpected field token/u,
  );
  assert.throws(
    () => loadPlatformIndex({ ...EMBEDDED_PLATFORM_INDEX, contentHash: 'nope' }),
    /SHA-256/u,
  );
  const tampered = structuredClone(EMBEDDED_PLATFORM_INDEX);
  tampered.symbols[0].docs += ' tampered';
  assert.throws(() => loadPlatformIndex(tampered), /contentHash mismatch/u);
  const staleCrate = structuredClone(EMBEDDED_PLATFORM_INDEX);
  staleCrate.crates[0].version = 'stale';
  assert.throws(() => loadPlatformIndex(staleCrate), /contentHash mismatch/u);
  assert.throws(
    () =>
      loadPlatformIndex({
        ...EMBEDDED_PLATFORM_INDEX,
        symbols: [
          ...EMBEDDED_PLATFORM_INDEX.symbols,
          EMBEDDED_PLATFORM_INDEX.symbols[0],
        ],
      }),
    /Duplicate platform symbol/u,
  );

  const oversized = {
    schemaVersion: 2,
    rustVersion: '1.97.1',
    sdkVersion: '0.1.5',
    abiVersion: 0,
    contentHash: '0'.repeat(64),
    crates: EMBEDDED_PLATFORM_INDEX.crates,
    symbols: Array.from({ length: 200 }, (_, index) => ({
      module: 'oversized',
      name: `VALUE_${index}`,
      kind: 'static',
      signature: `pub static VALUE_${index}: &str`,
      docs: 'x'.repeat(12_000),
    })),
  };
  assert.ok(
    new TextEncoder().encode(JSON.stringify(oversized)).byteLength >
      MAX_PLATFORM_INDEX_BYTES,
  );
  assert.throws(() => loadPlatformIndex(oversized), /limit is 2097152/u);

  assert.throws(
    () =>
      loadPlatformIndex({
        ...EMBEDDED_PLATFORM_INDEX,
        crates: Array.from({ length: MAX_PLATFORM_CRATES + 1 }, (_, index) => ({
          name: `crate-${index}`,
          version: '1.0.0',
          sourceHash: '0'.repeat(64),
        })),
      }),
    /256 crate limit/u,
  );
  assert.throws(
    () =>
      loadPlatformIndex({
        ...EMBEDDED_PLATFORM_INDEX,
        crates: [
          {
            name: 'x'.repeat(MAX_PLATFORM_CRATE_FIELD_LENGTH + 1),
            version: '1.0.0',
            sourceHash: '0'.repeat(64),
          },
        ],
      }),
    /at most 256 characters/u,
  );
});

test('producer static symbols are accepted and mapped as variables', async () => {
  const staticIndex = {
    schemaVersion: 2,
    rustVersion: '1.97.1',
    sdkVersion: '0.1.5',
    abiVersion: 0,
    contentHash: '',
    crates: [
      {
        name: 'example',
        version: '1.0.0',
        sourceHash: '0'.repeat(64),
      },
    ],
    symbols: [
      {
        module: 'example',
        name: 'MAX_PLAYERS',
        kind: 'static',
        signature: 'pub static MAX_PLAYERS: usize',
        docs: 'Maximum player count.',
      },
    ],
  };
  staticIndex.contentHash = computePlatformIndexContentHash(staticIndex);
  const loaded = loadPlatformIndex(staticIndex);
  assert.equal(loaded.symbols[0].kind, 'static');

  const local = await RustAnalysis.create({
    parserWasmUrl: new URL('web-tree-sitter.wasm', new URL('../../dist/live-coding/assets/', import.meta.url)).pathname,
    grammarWasmUrl: new URL('tree-sitter-rust.wasm', new URL('../../dist/live-coding/assets/', import.meta.url)).pathname,
    platformIndex: loaded,
  });
  try {
    const vfs = new VirtualFileSystem();
    const document = open(vfs, 'src/lib.rs', 'fn run() { MAX }\n');
    const completion = local
      .completions(document, { line: 0, character: 14 }, vfs.documents())
      .find((item) => item.label === 'MAX_PLAYERS');
    assert.equal(completion?.kind, 6);
  } finally {
    local.dispose();
  }
});
