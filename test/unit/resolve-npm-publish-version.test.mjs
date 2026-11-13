import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDistTags,
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

test('a dev publish of an older version than @dev serves is refused', () => {
  // A run of dev/v18.28.0 left queued for days would otherwise publish 18.28.0-dev.2
  // and point @dev back at it, replacing 18.31.1-dev.1 for every consumer of the tag.
  assert.throws(
    () =>
      resolvePublishVersion({
        tier: 'dev',
        version: 'v18.28.0',
        registryVersions: '["18.28.0-dev.1","18.31.1-dev.1"]',
        distTags: '{"latest":"18.31.1","dev":"18.31.1-dev.1","test":"18.31.1-test.1"}',
      }),
    /@dev serves 18\.31\.1-dev\.1, which is newer than 18\.28\.0/,
  );
});

test('a re-run of the version @dev serves mints its next ordinal', () => {
  assert.deepEqual(
    resolvePublishVersion({
      tier: 'dev',
      version: 'v18.31.1',
      registryVersions: '["18.31.1-dev.1"]',
      distTags: '{"dev":"18.31.1-dev.1"}',
    }),
    { publishVersion: '18.31.1-dev.2', distTag: 'dev' },
  );
});

test('a newer version moves its dist-tag forward', () => {
  assert.equal(
    resolvePublishVersion({
      tier: 'test',
      version: 'v18.32.0',
      registryVersions: '["18.31.1-test.1"]',
      distTags: '{"test":"18.31.1-test.1"}',
    }).publishVersion,
    '18.32.0-test.1',
  );
});

test('each tier is judged by its own dist-tag', () => {
  // @dev being ahead says nothing about @test, which this publish moves.
  assert.equal(
    resolvePublishVersion({
      tier: 'test',
      version: 'v18.31.1',
      registryVersions: '["18.32.0-dev.1"]',
      distTags: '{"dev":"18.32.0-dev.1","test":"18.30.0-test.1"}',
    }).publishVersion,
    '18.31.1-test.1',
  );
});

test('a dist-tag that does not exist yet does not block the first publish to it', () => {
  assert.equal(
    resolvePublishVersion({
      tier: 'test',
      version: 'v18.32.0',
      registryVersions: '[]',
      distTags: '{"latest":"18.31.1"}',
    }).publishVersion,
    '18.32.0-test.1',
  );
});

test('a prod re-run of a version already on the registry stays a no-op', () => {
  // The workflow skips the upload for a version npm already has, so nothing moves.
  assert.deepEqual(
    resolvePublishVersion({
      tier: 'prod',
      version: 'v18.28.0',
      registryVersions: '["18.28.0","18.31.1"]',
      distTags: '{"latest":"18.31.1"}',
    }),
    { publishVersion: '18.28.0', distTag: 'latest' },
  );
});

test('a prod publish of an unpublished version older than @latest is refused', () => {
  assert.throws(
    () =>
      resolvePublishVersion({
        tier: 'prod',
        version: 'v18.30.5',
        registryVersions: '["18.31.1"]',
        distTags: '{"latest":"18.31.1"}',
      }),
    /would move @latest back/,
  );
});

test('without a dist-tag answer the guard does not run', () => {
  assert.equal(
    resolvePublishVersion({ tier: 'dev', version: 'v18.28.0', registryVersions: '[]' }).publishVersion,
    '18.28.0-dev.1',
  );
});

test('dist-tags normalise from npm output shapes', () => {
  for (const empty of ['', '{}', null, undefined]) {
    assert.deepEqual(normalizeDistTags(empty), {});
  }
  assert.deepEqual(normalizeDistTags('{"dev":"1.0.0-dev.1"}'), { dev: '1.0.0-dev.1' });
  assert.throws(() => normalizeDistTags('["1.0.0"]'), /unexpected registry dist-tags/);
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
