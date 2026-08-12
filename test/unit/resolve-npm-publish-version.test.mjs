import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRegistryVersions,
  resolvePublishVersion,
} from '../../scripts/ci/resolve-npm-publish-version.mjs';

/**
 * The tier -> npm version mapping, tested where it is cheap to test.
 *
 * WHY THIS IS A UNIT TEST AND NOT A COMMENT IN THE WORKFLOW. The publish workflow
 * gets exactly one chance per version: npm accepts a version string once and
 * refuses it forever after, so an off-by-one in the ordinal is not a retryable
 * mistake, it burns the number. Every case below was cheap to write and none of
 * them can be observed from CI without publishing something.
 *
 * The cases that matter most are the ones where the registry answer is not the
 * shape you assumed: `npm view <pkg> versions --json` prints a bare JSON STRING
 * rather than an array when the package has exactly one version, and prints
 * nothing useful at all when the package has never been published.
 */

test('prod publishes the bare version under @latest', () => {
  assert.deepEqual(
    resolvePublishVersion({ tier: 'prod', version: 'v14.2.0', registryVersions: '["14.1.0"]' }),
    { publishVersion: '14.2.0', distTag: 'latest' },
  );
});

test('prod ignores any prerelease ordinals already cut for the same version', () => {
  assert.deepEqual(
    resolvePublishVersion({
      tier: 'prod',
      version: 'v14.2.0',
      registryVersions: '["14.2.0-dev.1","14.2.0-dev.2","14.2.0-test.1"]',
    }),
    { publishVersion: '14.2.0', distTag: 'latest' },
  );
});

test('the first dev build of a version is ordinal 1, not 0', () => {
  assert.deepEqual(
    resolvePublishVersion({ tier: 'dev', version: 'v14.2.0', registryVersions: '["14.1.0"]' }),
    { publishVersion: '14.2.0-dev.1', distTag: 'dev' },
  );
});

test('the next dev build takes the highest existing ordinal plus one', () => {
  assert.deepEqual(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.2.0-dev.1","14.2.0-dev.2","14.2.0-dev.3"]',
    }),
    { publishVersion: '14.2.0-dev.4', distTag: 'dev' },
  );
});

test('ordinals are compared numerically, so 10 beats 9', () => {
  // A lexicographic max would answer `-dev.10`, which npm has already taken.
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.2.0-dev.9","14.2.0-dev.10"]',
    }).publishVersion,
    '14.2.0-dev.11',
  );
});

test('a gap in the ordinals does not reuse the gap', () => {
  // Reusing 2 would be refused by npm if it was ever published and unpublished,
  // and is confusing either way: ordinals are a sequence, not a free list.
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.2.0-dev.1","14.2.0-dev.3"]',
    }).publishVersion,
    '14.2.0-dev.4',
  );
});

test('dev and test ordinals are counted separately', () => {
  const registryVersions = '["14.2.0-dev.1","14.2.0-dev.2","14.2.0-test.1"]';
  assert.equal(
    resolvePublishVersion({ tier: 'test', version: 'v14.2.0', registryVersions }).publishVersion,
    '14.2.0-test.2',
  );
  assert.equal(
    resolvePublishVersion({ tier: 'test', version: 'v14.2.0', registryVersions }).distTag,
    'test',
  );
});

test('ordinals are counted per base version, not across the package', () => {
  // 14.1.0 having reached -dev.7 says nothing about 14.2.0.
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.1.0-dev.7","14.1.0"]',
    }).publishVersion,
    '14.2.0-dev.1',
  );
});

test('a version that merely starts with the base is not a match', () => {
  // `.` is a regex wildcard: 14.2.0 must not match 1442x0, and 14.2.01 is a
  // different version entirely.
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.2.01-dev.5","1442x0-dev.9"]',
    }).publishVersion,
    '14.2.0-dev.1',
  );
});

test('a suffix that is not a plain ordinal is ignored', () => {
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '["14.2.0-dev.1.2","14.2.0-dev.beta","14.2.0-devx.9"]',
    }).publishVersion,
    '14.2.0-dev.1',
  );
});

test('the version may be given with or without the leading v', () => {
  assert.equal(
    resolvePublishVersion({ tier: 'dev', version: '14.2.0', registryVersions: '[]' }).publishVersion,
    '14.2.0-dev.1',
  );
});

test('a package with exactly one published version answers a bare string', () => {
  // This is npm's real output shape and it would throw on `.length` or silently
  // iterate characters if it were assumed to be an array.
  assert.deepEqual(normalizeRegistryVersions('"14.2.0-dev.1"'), ['14.2.0-dev.1']);
  assert.equal(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v14.2.0',
      registryVersions: '"14.2.0-dev.1"',
    }).publishVersion,
    '14.2.0-dev.2',
  );
});

test('an unpublished package resolves to the first ordinal rather than throwing', () => {
  for (const empty of ['', '[]', null, undefined]) {
    assert.deepEqual(normalizeRegistryVersions(empty), []);
  }
  assert.equal(
    resolvePublishVersion({ tier: 'dev', version: 'v14.2.0', registryVersions: '' }).publishVersion,
    '14.2.0-dev.1',
  );
});

test('an unknown tier is refused', () => {
  assert.throws(
    () => resolvePublishVersion({ tier: 'staging', version: 'v14.2.0', registryVersions: '[]' }),
    /not one of dev, test, prod/,
  );
});

test('a version that is not bare MAJOR.MINOR.PATCH is refused', () => {
  // The prefix convention exists so the tier never lands in the version's
  // prerelease field; accepting one here would put it back.
  for (const version of ['v14.2', 'v14.2.0-rc.1', 'v14.2.0+build', 'fourteen']) {
    assert.throws(
      () => resolvePublishVersion({ tier: 'prod', version, registryVersions: '[]' }),
      /not a bare MAJOR\.MINOR\.PATCH/,
      `expected '${version}' to be refused`,
    );
  }
});
