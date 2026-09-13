/**
 * Studio SERVER/CLIENT files map onto the bound repository through the layout
 * the API resolved. The SDK never parses crowdy.json itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { studioFileToRepoPath, repoPathToStudioFile, isRustAuthoringPath, joinRepo, underRoot } = await import(
  '../../dist/crowdy-studio/github/layout.js'
);

test('project files join under the target root the API named', () => {
  const layout = { server: 'server', client: 'client' };
  assert.equal(studioFileToRepoPath(layout, 'SERVER', 'src/lib.rs'), 'server/src/lib.rs');
  assert.equal(studioFileToRepoPath(layout, 'CLIENT', 'Cargo.toml'), 'client/Cargo.toml');
  assert.equal(studioFileToRepoPath({ server: '.', client: null }, 'SERVER', 'src/lib.rs'), 'src/lib.rs');
  assert.equal(studioFileToRepoPath({ server: '.', client: null }, 'CLIENT', 'src/lib.rs'), null);
});

test('repository paths map back only when they are rust authoring paths under a root', () => {
  const layout = { server: 'server', client: 'client' };
  assert.deepEqual(repoPathToStudioFile(layout, 'client/src/lib.rs'), { target: 'CLIENT', path: 'src/lib.rs' });
  assert.deepEqual(repoPathToStudioFile(layout, 'server/Cargo.toml'), { target: 'SERVER', path: 'Cargo.toml' });
  for (const p of ['README.md', 'assets/mesh.glb', 'server/Cargo.lock', 'server/build.rs', 'crowdy.json']) {
    assert.equal(repoPathToStudioFile(layout, p), null, p);
  }
  // A client crate nested under a root server resolves to CLIENT.
  const nested = { server: '.', client: 'client' };
  assert.deepEqual(repoPathToStudioFile(nested, 'client/src/lib.rs'), { target: 'CLIENT', path: 'src/lib.rs' });
  assert.deepEqual(repoPathToStudioFile(nested, 'src/lib.rs'), { target: 'SERVER', path: 'src/lib.rs' });
});

test('path helpers refuse traversal and normalise slashes', () => {
  assert.equal(isRustAuthoringPath('src/../x.rs'), false);
  assert.equal(isRustAuthoringPath('src/a/b.rs'), true);
  assert.equal(joinRepo('/server/', '/src/lib.rs'), 'server/src/lib.rs');
  assert.equal(underRoot('server/src/lib.rs', 'server/'), 'src/lib.rs');
  assert.equal(underRoot('client/src/lib.rs', 'server'), null);
});
