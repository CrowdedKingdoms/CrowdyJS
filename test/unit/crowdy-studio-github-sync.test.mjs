/**
 * Studio SERVER/CLIENT paths map onto GitHub server/ and client/ trees.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  layoutFromRootEntries,
  mergeStudioFilesFromGitHub,
  parseCrowdyJson,
  repoPathToStudioFile,
  studioFileToRepoPath,
} = await import('../../dist/crowdy-studio/github/sync.js');

test('server/ + client/ dirs are the fullstack GitHub layout', () => {
  const layout = layoutFromRootEntries([
    { path: 'README.md', type: 'file' },
    { path: 'client', type: 'dir' },
    { path: 'server', type: 'dir' },
  ]);
  assert.deepEqual(layout, { serverRoot: 'server', clientRoot: 'client' });
  assert.deepEqual(repoPathToStudioFile(layout, 'client/src/lib.rs'), {
    target: 'CLIENT',
    path: 'src/lib.rs',
  });
  assert.deepEqual(repoPathToStudioFile(layout, 'server/src/lib.rs'), {
    target: 'SERVER',
    path: 'src/lib.rs',
  });
  assert.equal(repoPathToStudioFile(layout, 'README.md'), null);
  assert.equal(repoPathToStudioFile(layout, 'crowdy.json'), null);
  assert.equal(studioFileToRepoPath(layout, 'CLIENT', 'src/lib.rs'), 'client/src/lib.rs');
  assert.equal(studioFileToRepoPath(layout, 'SERVER', 'Cargo.toml'), 'server/Cargo.toml');
});

test('crowdy.json overrides inferred roots', () => {
  const layout = parseCrowdyJson('{"server":"backend","client":"web"}');
  assert.deepEqual(layout, { serverRoot: 'backend', clientRoot: 'web' });
});

test('GitHub pull replaces matching Studio files and keeps extras', () => {
  const { files, changed } = mergeStudioFilesFromGitHub(
    [
      { target: 'CLIENT', path: 'src/lib.rs', content: 'old client' },
      { target: 'SERVER', path: 'src/lib.rs', content: 'old server' },
      { target: 'SERVER', path: 'src/extra.rs', content: 'keep me' },
    ],
    [
      { target: 'CLIENT', path: 'src/lib.rs', content: 'new client' },
      { target: 'SERVER', path: 'src/lib.rs', content: 'old server' },
    ],
  );
  assert.equal(changed, true);
  assert.equal(
    files.find((file) => file.target === 'CLIENT' && file.path === 'src/lib.rs')
      ?.content,
    'new client',
  );
  assert.equal(
    files.find((file) => file.path === 'src/extra.rs')?.content,
    'keep me',
  );
});
