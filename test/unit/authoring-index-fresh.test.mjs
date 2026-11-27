/**
 * The embedded Studio authoring index is not older than what this repository says about the
 * platform (18.41.0, OI-2026-11-26-010 item 6).
 *
 * The index is the compute toolchain's, embedded byte for byte
 * (`src/live-coding/assets/browser-authoring-index.json`; AGENTS.md, "The Studio authoring
 * index"). `check:authoring-index` in the build proves the generated TypeScript is that
 * file, and nothing proved the file was current: 18.40.0 shipped ckx-sdk 0.14.0's index
 * beside a schema and a README that describe ckx-sdk 0.15.0's `Caller::Org`. CI has no
 * checkout of the toolchain, so these compare the index with what is committed here, which
 * a release refreshes from the same Application API branch:
 *
 * 1. every Rust path the committed `schema.gql` names (`Caller::Org`, `Hub::on_world`) is a
 *    symbol of the index;
 * 2. the index's ckx-sdk is at least the newest ckx-sdk version README.md and MIGRATION.md
 *    name;
 * 3. with `CROWDY_AUTHORING_INDEX_SOURCE` naming the toolchain's
 *    `compute-toolchain/browser-authoring-index.json`, the two files are the same bytes
 *    (what `npm run authoring-index:drift -- --source <file>` checks; a release sets it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(repo, path), 'utf8');
const embeddedPath = resolve(repo, 'src/live-coding/assets/browser-authoring-index.json');
const index = JSON.parse(readFileSync(embeddedPath, 'utf8'));
const { GENERATED_BROWSER_AUTHORING_INDEX } = await import(
  '../../dist/live-coding/browser-authoring-index.generated.js'
);

/** `a.b.c` as numbers, a missing part 0. */
const parts = (version) => version.split('.').map((n) => Number(n));
function atLeast(have, want) {
  const a = parts(have);
  const b = parts(want);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** The Rust paths (`Type::member`) a text names in backticks. */
function rustPaths(text) {
  const found = new Set();
  for (const match of text.matchAll(/`([A-Z][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*)\b[^`\n]*`/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

/** The ckx-sdk versions a text names: "ckx-sdk 0.15.0", "ckx-sdk before 0.15", "ckx-sdk@0.15.0". */
function ckxVersions(text) {
  const found = new Set();
  for (const match of text.matchAll(/ckx-sdk`?(?:@| (?:before |from |v)?)(\d+\.\d+(?:\.\d+)?)/g)) {
    found.add(match[1]);
  }
  return [...found];
}

const ckx = index.crates.find((crate) => crate.name === 'ckx-sdk');

test('the embedded index is the build output, and it carries ckx-sdk', () => {
  assert.deepEqual(GENERATED_BROWSER_AUTHORING_INDEX, index, 'the generated module is the embedded file');
  assert.ok(ckx, 'the index has a ckx-sdk crate');
  assert.match(ckx.version, /^\d+\.\d+\.\d+$/);
});

test('every Rust path the schema names is a symbol of the embedded index', () => {
  const named = rustPaths(read('schema.gql'));
  // If the schema stops naming any, this gate has stopped looking: say so here.
  assert.ok(named.includes('Caller::Org'), `the schema names ckx-sdk paths (found: ${named.join(', ')})`);
  const known = new Set(
    index.symbols
      .filter((symbol) => symbol.module === 'ckx_sdk' || symbol.module.startsWith('ckx_sdk::'))
      .map((symbol) => symbol.name),
  );
  const missing = named.filter((path) => !known.has(path));
  assert.deepEqual(
    missing,
    [],
    `schema.gql names ${missing.join(', ')}, which the embedded authoring index (ckx-sdk ${ckx.version}) ` +
      'does not have: it is older than the schema. Embed the toolchain\'s index again ' +
      '(npm run authoring-index:drift -- --source <compute-toolchain/browser-authoring-index.json> --write, ' +
      'then npm run authoring-index:generate).',
  );
});

test('the embedded index is not older than the ckx-sdk the README and the migration notes name', () => {
  const named = [...ckxVersions(read('README.md')), ...ckxVersions(read('MIGRATION.md'))];
  assert.ok(named.length > 0, 'the README names a ckx-sdk version');
  const newest = named.reduce((a, b) => (atLeast(a, b) ? a : b));
  assert.ok(
    atLeast(ckx.version, newest),
    `README.md or MIGRATION.md names ckx-sdk ${newest}, and the embedded authoring index is ckx-sdk ${ckx.version}'s. ` +
      'Embed the toolchain\'s index again (npm run authoring-index:drift, then authoring-index:generate).',
  );
});

test('the checks above can tell an old index from a current one', () => {
  assert.deepEqual(rustPaths('as `Caller::Org`: the; `Hub::on_world`). `Caller::Org { player }` and `plain`'), [
    'Caller::Org',
    'Hub::on_world',
  ]);
  assert.deepEqual(ckxVersions('ckx-sdk 0.10.0 (x); ckx-sdk before 0.15, `ckx-sdk` 0.14.1 and ckx-sdk@0.15.0').sort(), [
    '0.10.0',
    '0.14.1',
    '0.15',
    '0.15.0',
  ]);
  assert.equal(atLeast('0.15.0', '0.15'), true);
  assert.equal(atLeast('0.14.0', '0.15'), false, 'the index 18.40.0 shipped would have failed');
  assert.equal(atLeast('0.15.0', '0.14.1'), true);
  assert.equal(atLeast('0.9.0', '0.10.0'), false);
});

const source = process.env.CROWDY_AUTHORING_INDEX_SOURCE;
test(
  "the embedded index is the toolchain's file, byte for byte",
  { skip: source ? false : 'set CROWDY_AUTHORING_INDEX_SOURCE to the toolchain\'s compute-toolchain/browser-authoring-index.json (a release does)' },
  () => {
    assert.ok(existsSync(source), 'CROWDY_AUTHORING_INDEX_SOURCE names a file that exists');
    assert.ok(
      readFileSync(source).equals(readFileSync(embeddedPath)),
      'the embedded authoring index is not the file CROWDY_AUTHORING_INDEX_SOURCE names: ' +
        'npm run authoring-index:drift -- --source <that file> --write, then npm run authoring-index:generate',
    );
  },
);
