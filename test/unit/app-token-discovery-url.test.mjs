import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Every token-issuing mutation must SELECT `discoveryUrl`.
 *
 * WHY A TEST FOR ONE WORD IN A STRING. The three documents share one
 * `APP_TOKEN_FIELDS` constant, so the field is easy to add and just as easy to drop
 * while editing an unrelated one — and nothing else would notice. The type would still
 * declare `discoveryUrl`, the code reading it would still compile, and the value would
 * simply be `undefined` at runtime. A client would then construct itself with no
 * discovery origin and behave perfectly until the moment its endpoint stopped
 * answering, which is the one moment discovery exists for.
 *
 * `refreshAppToken` matters as much as the other two: it is what a long-lived client
 * calls, so it is the path by which a session that started before a datacenter move
 * learns where to go.
 */

const source = readFileSync(
  new URL('../../src/domains/portal.ts', import.meta.url),
  'utf8',
);

test('all three token mutations select discoveryUrl', () => {
  for (const mutation of [
    'MintAppToken',
    'ExchangePortalCode',
    'RefreshAppToken',
  ]) {
    const line = source
      .split('\n')
      .find((l) => l.includes(`mutation ${mutation}`));
    assert.ok(line, `no document found for ${mutation}`);
    // Selected via the shared constant rather than spelled out, which is the point:
    // asserting on the interpolation is what makes one edit cover all three.
    assert.match(
      line,
      /\$\{APP_TOKEN_FIELDS\}/,
      `${mutation} does not use APP_TOKEN_FIELDS, so it can drift from the others`,
    );
  }
  const fields = source.match(/const APP_TOKEN_FIELDS\s*=\s*\n?\s*'([^']+)'/);
  assert.ok(fields, 'APP_TOKEN_FIELDS not found');
  assert.ok(
    fields[1].split(/\s+/).includes('discoveryUrl'),
    'APP_TOKEN_FIELDS must select discoveryUrl: a token-holding client cannot re-mint, ' +
      'so this is its only way back when its endpoint stops answering',
  );
});

test('AppTokenResponse declares discoveryUrl as nullable', () => {
  // Nullable because a Game API older than the datacenter rebuild does not return it.
  // A non-null type here would be a lie that only shows up against an older server.
  assert.match(
    source,
    /discoveryUrl:\s*string\s*\|\s*null/,
    'AppTokenResponse.discoveryUrl must be `string | null`',
  );
});

test('no dead per-environment origin is used as an example anywhere', () => {
  // `ck.pgc.prod…` was the old per-environment origin; that environment is shelved and
  // the name resolves to nothing. An example hostname gets copied, so a dead one in the
  // SDK becomes a dead one in somebody's client.
  const files = [
    '../../src/binary-relay.ts',
    '../../src/rediscover.ts',
    '../../src/crowdy-client.ts',
    '../../src/domains/portal.ts',
  ];
  for (const rel of files) {
    const text = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(
      !text.includes('ck.pgc.prod'),
      `${rel} still references the shelved pgc-prod origin`,
    );
    // The dotted per-datacenter form cannot be covered by the one-label wildcard the
    // shared name requires, so it is never a valid endpoint. Matched on the TIER label
    // rather than on a domain suffix: the previous pattern ended in `.cp`, and the
    // brand-root migration would have made it unmatchable — a negative assertion that
    // passes because its subject cannot occur is not a check.
    assert.ok(
      !/ck\.(or|va)\.(dev|test|prod)\./.test(text),
      `${rel} uses the dotted per-datacenter form; it is ck-<dc>.<tier>… with a dash`,
    );
  }
});
