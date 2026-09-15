/**
 * The App cannot create a repository; GitHub's own form can arrive prefilled.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { githubNewRepositoryUrl, githubRepositorySlug } = await import('../../dist/crowdy-studio/github/new-repo.js');

test('repository slugs follow GitHub grammar and never come back empty', () => {
  assert.equal(githubRepositorySlug('Sky Castle!'), 'sky-castle');
  assert.equal(githubRepositorySlug('  ..Weather tools v2  '), 'weather-tools-v2');
  assert.equal(githubRepositorySlug('mod_one.two'), 'mod_one.two');
  assert.equal(githubRepositorySlug('日本語'), 'crowdy-mod');
  assert.equal(githubRepositorySlug('x'.repeat(200)).length, 100);
});

test('the new-repository URL carries owner, slugged name, description and private visibility', () => {
  const url = new URL(
    githubNewRepositoryUrl({ owner: 'modder', name: 'Sky Castle', description: 'A tower you can climb.' }),
  );
  assert.equal(url.origin + url.pathname, 'https://github.com/new');
  assert.equal(url.searchParams.get('owner'), 'modder');
  assert.equal(url.searchParams.get('name'), 'sky-castle');
  assert.equal(url.searchParams.get('description'), 'A tower you can climb.');
  assert.equal(url.searchParams.get('visibility'), 'private');
  const bare = new URL(githubNewRepositoryUrl({ name: 'x' }));
  assert.equal(bare.searchParams.has('owner'), false);
  assert.equal(bare.searchParams.has('description'), false);
});
