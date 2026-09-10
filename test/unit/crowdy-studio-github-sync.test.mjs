/**
 * Studio SERVER/CLIENT files map onto the bound repository's server/ and
 * client/ trees; every call carries only (appId, projectId).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_FULL_STACK_CROWDY_JSON,
  layoutFromTree,
  mergeStudioFilesFromGitHub,
  parseCrowdyJson,
  pullStudioFilesFromGitHub,
  pushStudioFilesToGitHub,
  repoPathToStudioFile,
  studioFileToRepoPath,
  studioFilesMissingOnGitHub,
} = await import('../../dist/crowdy-studio/github/sync.js');

const SCOPE = { appId: '89', projectId: '11111111-1111-4111-8111-111111111111' };

function repo(files) {
  const puts = [];
  const calls = [];
  return {
    puts,
    calls,
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
      return { path: input.path, content: f.content, sha: f.sha };
    },
    async putFile(input) {
      calls.push(['putFile', input]);
      puts.push(input);
      files[input.path] = { content: input.content, sha: `sha-${puts.length}` };
      return { path: input.path, content: input.content, sha: `sha-${puts.length}` };
    },
  };
}

test('layout: crowdy.json wins, otherwise inferred from server/ and client/ dirs', () => {
  assert.deepEqual(parseCrowdyJson('{"server":"srv","client":"cli"}'), { serverRoot: 'srv', clientRoot: 'cli' });
  assert.equal(parseCrowdyJson('nope'), null);
  assert.deepEqual(
    layoutFromTree([{ path: 'server', type: 'tree' }, { path: 'client', type: 'tree' }]),
    { serverRoot: 'server', clientRoot: 'client' },
  );
  assert.deepEqual(layoutFromTree([{ path: 'src', type: 'tree' }]), { serverRoot: '.', clientRoot: null });
});

test('path mapping both ways, skipping repo housekeeping', () => {
  const layout = { serverRoot: 'server', clientRoot: 'client' };
  assert.deepEqual(repoPathToStudioFile(layout, 'server/src/lib.rs'), { target: 'SERVER', path: 'src/lib.rs' });
  assert.deepEqual(repoPathToStudioFile(layout, 'client/Cargo.toml'), { target: 'CLIENT', path: 'Cargo.toml' });
  assert.equal(repoPathToStudioFile(layout, 'README.md'), null);
  assert.equal(repoPathToStudioFile(layout, 'crowdy.json'), null);
  assert.equal(repoPathToStudioFile(layout, 'server/target/debug/x'), null);
  assert.equal(repoPathToStudioFile(layout, '.github/workflows/ci.yml'), null);
  assert.equal(studioFileToRepoPath(layout, 'SERVER', 'src/lib.rs'), 'server/src/lib.rs');
  assert.equal(studioFileToRepoPath({ serverRoot: '.', clientRoot: null }, 'CLIENT', 'x.rs'), null);
});

test('pull reads only mapped blobs through (appId, projectId) and never names a repo', async () => {
  const gh = repo({
    'crowdy.json': { content: DEFAULT_FULL_STACK_CROWDY_JSON, sha: 'a' },
    'server/src/lib.rs': { content: 'fn s() {}', sha: 'b' },
    'client/src/lib.rs': { content: 'fn c() {}', sha: 'c' },
    'README.md': { content: '# hi', sha: 'd' },
    '.github/workflows/ci.yml': { content: 'on: push', sha: 'e' },
  });
  const { files, layout } = await pullStudioFilesFromGitHub(gh, SCOPE);
  assert.deepEqual(layout, { serverRoot: 'server', clientRoot: 'client' });
  assert.deepEqual(
    files.map((f) => `${f.target}:${f.path}`).sort(),
    ['CLIENT:src/lib.rs', 'SERVER:src/lib.rs'],
  );
  for (const [, input] of gh.calls) {
    assert.deepEqual(Object.keys(input).filter((k) => ['owner', 'repo', 'ref', 'branch'].includes(k)), []);
    assert.equal(input.appId, SCOPE.appId);
    assert.equal(input.projectId, SCOPE.projectId);
  }
  const reads = gh.calls.filter(([op]) => op === 'getFile').map(([, i]) => i.path).sort();
  assert.deepEqual(reads, ['client/src/lib.rs', 'crowdy.json', 'server/src/lib.rs']);
});

test('push writes crowdy.json once for a full-stack project, sends sha on update, skips unchanged blobs', async () => {
  const gh = repo({
    'server/src/lib.rs': { content: 'fn s() {}', sha: 'b' },
  });
  const pushed = await pushStudioFilesToGitHub(gh, SCOPE, [
    { target: 'SERVER', path: 'src/lib.rs', content: 'fn s() {}' }, // unchanged
    { target: 'CLIENT', path: 'src/lib.rs', content: 'fn c() {}' }, // new
  ]);
  assert.equal(pushed, 2); // crowdy.json + client file
  const paths = gh.puts.map((p) => p.path).sort();
  assert.deepEqual(paths, ['client/src/lib.rs', 'crowdy.json']);
  assert.equal(gh.puts.find((p) => p.path === 'client/src/lib.rs').sha, undefined);

  const again = await pushStudioFilesToGitHub(gh, SCOPE, [
    { target: 'SERVER', path: 'src/lib.rs', content: 'fn s() { changed }' },
  ]);
  assert.equal(again, 1);
  const update = gh.puts.at(-1);
  assert.equal(update.path, 'server/src/lib.rs');
  assert.equal(update.sha, 'b');
  assert.match(update.message, /studio: update SERVER src\/lib.rs/);
});

test('merge overlays changed and new files, reports no change when in sync; missing-on-GitHub is listed not deleted', () => {
  const current = [
    { target: 'SERVER', path: 'src/lib.rs', content: 'a' },
    { target: 'SERVER', path: 'src/old.rs', content: 'gone upstream' },
  ];
  const incoming = [
    { target: 'SERVER', path: 'src/lib.rs', content: 'b' },
    { target: 'CLIENT', path: 'src/lib.rs', content: 'c' },
  ];
  const merged = mergeStudioFilesFromGitHub(current, incoming);
  assert.equal(merged.changed, true);
  assert.equal(merged.files.length, 3);
  assert.equal(merged.files.find((f) => f.path === 'src/old.rs').content, 'gone upstream');
  assert.equal(mergeStudioFilesFromGitHub(merged.files, incoming).changed, false);
  const missing = studioFilesMissingOnGitHub(
    { serverRoot: 'server', clientRoot: 'client' },
    merged.files,
    [{ path: 'server/src/lib.rs', type: 'blob' }, { path: 'client/src/lib.rs', type: 'blob' }],
  );
  assert.deepEqual(missing.map((f) => f.path), ['src/old.rs']);
});
