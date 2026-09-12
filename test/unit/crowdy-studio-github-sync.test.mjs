/**
 * Studio SERVER/CLIENT files map onto the bound repository using
 * `crowdyStudioGitHubLayout`. Persist is putFile (blob sha + expectedCommitSha).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_FULL_STACK_CROWDY_JSON,
  layoutFromApi,
  loadStudioFilesFromGitHub,
  persistStudioFilesToGitHub,
  repoPathToStudioFile,
  studioFileToRepoPath,
  trimSlash,
} = await import('../../dist/crowdy-studio/github/sync.js');

const SCOPE = { appId: '89', projectId: '11111111-1111-4111-8111-111111111111' };

function repo(files, layout = {
  commitSha: 'headsha',
  server: 'server',
  client: 'client',
  assets: 'assets',
  crowdyJson: DEFAULT_FULL_STACK_CROWDY_JSON,
}) {
  const puts = [];
  const calls = [];
  let commit = layout.commitSha;
  return {
    puts,
    calls,
    async layout(input) {
      calls.push(['layout', input]);
      return { ...layout, commitSha: commit };
    },
    async tree(input) {
      calls.push(['tree', input]);
      const dirs = new Set();
      const out = [];
      for (const path of Object.keys(files)) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
        out.push({ path, type: 'blob', sha: files[path].sha, size: files[path].content.length });
      }
      for (const d of dirs) out.push({ path: d, type: 'tree', sha: null, size: null });
      return out;
    },
    async getFile(input) {
      calls.push(['getFile', input]);
      const f = files[input.path];
      if (!f) throw new Error(`missing ${input.path}`);
      return { path: input.path, content: f.content, sha: f.sha, commitSha: null };
    },
    async putFile(input) {
      calls.push(['putFile', input]);
      puts.push(input);
      commit = `commit-${puts.length}`;
      files[input.path] = { content: input.content, sha: `sha-${puts.length}` };
      return {
        path: input.path,
        content: input.content,
        sha: `sha-${puts.length}`,
        commitSha: commit,
      };
    },
  };
}

test('trimSlash strips only leading and trailing slashes', () => {
  assert.equal(trimSlash('///server/src///'), 'server/src');
  assert.equal(trimSlash('client'), 'client');
  assert.equal(trimSlash('///'), '');
});

test('layout comes from the API layout query, not a local crowdy.json grammar', () => {
  assert.deepEqual(
    layoutFromApi({
      commitSha: 'abc',
      server: 'srv',
      client: 'cli',
      assets: 'assets',
      crowdyJson: '{"server":"srv"}',
    }),
    { serverRoot: 'srv', clientRoot: 'cli', assets: 'assets' },
  );
  assert.deepEqual(
    layoutFromApi({
      commitSha: 'abc',
      server: 'src',
      client: null,
      assets: 'assets',
      crowdyJson: null,
    }),
    { serverRoot: 'src', clientRoot: null, assets: 'assets' },
  );
});

test('path mapping both ways, skipping repo housekeeping', () => {
  const layout = { serverRoot: 'server', clientRoot: 'client', assets: 'assets' };
  assert.deepEqual(repoPathToStudioFile(layout, 'server/src/lib.rs'), { target: 'SERVER', path: 'src/lib.rs' });
  assert.deepEqual(repoPathToStudioFile(layout, 'client/Cargo.toml'), { target: 'CLIENT', path: 'Cargo.toml' });
  assert.equal(repoPathToStudioFile(layout, 'README.md'), null);
  assert.equal(repoPathToStudioFile(layout, 'crowdy.json'), null);
  assert.equal(repoPathToStudioFile(layout, 'server/target/debug/x'), null);
  assert.equal(repoPathToStudioFile(layout, '.github/workflows/ci.yml'), null);
  assert.equal(studioFileToRepoPath(layout, 'SERVER', 'src/lib.rs'), 'server/src/lib.rs');
  assert.equal(studioFileToRepoPath({ serverRoot: '.', clientRoot: null, assets: 'assets' }, 'CLIENT', 'x.rs'), null);
});

test('load uses layout then tree/file and never names a repo', async () => {
  const gh = repo({
    'crowdy.json': { content: DEFAULT_FULL_STACK_CROWDY_JSON, sha: 'a' },
    'server/src/lib.rs': { content: 'fn s() {}', sha: 'b' },
    'client/src/lib.rs': { content: 'fn c() {}', sha: 'c' },
    'README.md': { content: '# hi', sha: 'd' },
    '.github/workflows/ci.yml': { content: 'on: push', sha: 'e' },
  });
  const { files, layout, commitSha } = await loadStudioFilesFromGitHub(gh, SCOPE);
  assert.equal(commitSha, 'headsha');
  assert.deepEqual(layout, { serverRoot: 'server', clientRoot: 'client', assets: 'assets' });
  assert.deepEqual(
    files.map((f) => `${f.target}:${f.path}`).sort(),
    ['CLIENT:src/lib.rs', 'SERVER:src/lib.rs'],
  );
  assert.equal(gh.calls[0][0], 'layout');
  for (const [, input] of gh.calls) {
    assert.deepEqual(Object.keys(input).filter((k) => ['owner', 'repo', 'ref', 'branch'].includes(k)), []);
    assert.equal(input.appId, SCOPE.appId);
    assert.equal(input.projectId, SCOPE.projectId);
  }
  const reads = gh.calls.filter(([op]) => op === 'getFile').map(([, i]) => i.path).sort();
  assert.deepEqual(reads, ['client/src/lib.rs', 'server/src/lib.rs']);
});

test('persist puts with blob sha and expectedCommitSha; skips unchanged blobs', async () => {
  const gh = repo({
    'server/src/lib.rs': { content: 'fn s() {}', sha: 'b' },
  });
  const previous = [{ target: 'SERVER', path: 'src/lib.rs', content: 'fn s() {}' }];
  const first = await persistStudioFilesToGitHub(
    gh,
    SCOPE,
    [
      { target: 'SERVER', path: 'src/lib.rs', content: 'fn s() {}' },
      { target: 'CLIENT', path: 'src/lib.rs', content: 'fn c() {}' },
    ],
    {
      expectedCommitSha: 'headsha',
      blobShaByPath: new Map([['server/src/lib.rs', 'b']]),
      previous,
    },
  );
  assert.equal(first.written, 1);
  assert.equal(first.commitSha, 'commit-1');
  assert.deepEqual(gh.puts.map((p) => p.path), ['client/src/lib.rs']);
  assert.equal(gh.puts[0].sha, undefined);
  assert.equal(gh.puts[0].expectedCommitSha, 'headsha');

  const update = await persistStudioFilesToGitHub(
    gh,
    SCOPE,
    [{ target: 'SERVER', path: 'src/lib.rs', content: 'fn s() { changed }' }],
    {
      expectedCommitSha: first.commitSha,
      blobShaByPath: new Map([['server/src/lib.rs', 'b']]),
      previous,
    },
  );
  assert.equal(update.written, 1);
  const last = gh.puts.at(-1);
  assert.equal(last.path, 'server/src/lib.rs');
  assert.equal(last.sha, 'b');
  assert.equal(last.expectedCommitSha, 'commit-1');
  assert.match(last.message, /studio: update SERVER src\/lib.rs/);
});
