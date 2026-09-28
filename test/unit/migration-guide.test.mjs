/**
 * What MIGRATION.md must tell someone moving a CLIENT project to ck-exec, checked because both
 * facts were once missing: a CLIENT half's host calls lost grid state as well as the Game Model
 * and sessions, and Crowdy Studio's CLIENT projects need ck-api v2.25.1 (#425) to save at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guide = readFileSync(new URL('../../MIGRATION.md', import.meta.url), 'utf8');

/** The text under a top-level heading, up to the next one. */
function section(heading) {
  const start = guide.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0 || guide.startsWith(`${heading}\n`), `MIGRATION.md has "${heading}"`);
  const from = start >= 0 ? start + 1 : 0;
  const next = guide.indexOf('\n# ', from + heading.length);
  return guide.slice(from, next < 0 ? undefined : next);
}

const v18 = section('# CrowdyJS v18 — the legacy engines are gone');
const v1714 = section('# 17.14.0 ck-exec CLIENT halves');

test('the guide says a CLIENT half has no grid state, not only no Game Model and sessions', () => {
  for (const [name, text] of [['18.0', v18], ['17.14.0', v1714]]) {
    assert.match(text, /grid_state_get` \/\s+`?grid_state_set/, `${name} names the grid state calls`);
  }
  assert.doesNotMatch(guide, /less the Game Model and sessions\)/, 'the old, shorter list is gone');
});

test('the guide says Crowdy Studio\u2019s CLIENT projects need ck-api v2.25.1', () => {
  for (const [name, text] of [['18.0', v18], ['17.14.0', v1714]]) {
    assert.match(text, /need(?:s)? ck-api `v2\.25\.1` or later/, name);
    assert.match(text, /CROWDY_STUDIO_MANIFEST_INVALID/, `${name} names what an older API answers`);
  }
});
