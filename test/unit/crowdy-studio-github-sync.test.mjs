/**
 * Studio SERVER/CLIENT paths map onto GitHub server/ and client/ trees.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_FULL_STACK_CROWDY_JSON,
  layoutFromRootEntries,
  mergeStudioFilesFromGitHub,
  parseCrowdyJson,
  pullStudioFilesFromGitHub,
  pushStudioFilesToGitHub,
  repoPathToStudioFile,
  resolveGitHubLayout,
  studioFileToRepoPath,
} = await import('../../dist/crowdy-studio/github/sync.js');

const BIND = {
  owner: 'BenjaminScholtens',
  repo: 'crowdy-mod-github-connected-project-cd40',
  branch: 'main',
};

function githubFs(files) {
  const puts = [];
  return {
    puts,
    async getFile({ path }) {
      const file = files[path];
      if (!file) throw new Error(`missing ${path}`);
      return { path, content: file.content, sha: file.sha };
    },
    async tree({ path }) {
      const prefix = path ? `${path}/` : '';
      const seen = new Map();
      for (const repoPath of Object.keys(files)) {
        if (prefix && !repoPath.startsWith(prefix) && repoPath !== path) continue;
        const rest = prefix ? repoPath.slice(prefix.length) : repoPath;
        const [head, ...more] = rest.split('/');
        if (!head) continue;
        const child = prefix ? `${path}/${head}` : head;
        if (!seen.has(child)) {
          seen.set(child, more.length ? 'dir' : 'file');
        }
      }
      return [...seen.entries()].map(([child, type]) => ({
        path: child,
        type,
        sha: files[child]?.sha ?? 'dir',
      }));
    },
    async putFile(input) {
      puts.push(input);
      files[input.path] = { content: input.content, sha: input.sha || 'new' };
      return { path: input.path, content: input.content, sha: 'new' };
    },
  };
}

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

test('only-server / only-client / neither layouts', () => {
  assert.deepEqual(
    layoutFromRootEntries([{ path: 'server', type: 'dir' }]),
    { serverRoot: 'server', clientRoot: null },
  );
  assert.deepEqual(
    layoutFromRootEntries([{ path: 'client', type: 'dir' }]),
    { serverRoot: '.', clientRoot: 'client' },
  );
  assert.deepEqual(layoutFromRootEntries([{ path: 'README.md', type: 'file' }]), {
    serverRoot: '.',
    clientRoot: null,
  });
});

test('parseCrowdyJson rejects invalid JSON and missing keys', () => {
  assert.equal(parseCrowdyJson('not-json'), null);
  assert.equal(parseCrowdyJson('{"other":true}'), null);
});

test('resolveGitHubLayout prefers crowdy.json then infers server/+client/', async () => {
  const withJson = githubFs({
    'crowdy.json': { content: '{"server":"backend","client":"web"}', sha: 'j' },
  });
  assert.deepEqual(await resolveGitHubLayout(withJson, BIND), {
    serverRoot: 'backend',
    clientRoot: 'web',
  });

  const inferred = githubFs({
    'README.md': { content: '# mod', sha: 'r' },
    'server/src/lib.rs': { content: 'fn server() {}', sha: 's' },
    'client/src/lib.rs': { content: 'fn client() {}', sha: 'c' },
  });
  assert.deepEqual(await resolveGitHubLayout(inferred, BIND), {
    serverRoot: 'server',
    clientRoot: 'client',
  });
});

test('pullStudioFilesFromGitHub skips README and crowdy.json', async () => {
  const github = githubFs({
    'README.md': { content: '# skip', sha: 'r' },
    'crowdy.json': { content: '{"server":"server","client":"client"}', sha: 'j' },
    'server/src/lib.rs': { content: 'fn server() {}', sha: 's' },
    'client/src/lib.rs': { content: 'fn client() {}', sha: 'c' },
  });
  const files = await pullStudioFilesFromGitHub(github, BIND);
  assert.deepEqual(
    files.map((file) => `${file.target}:${file.path}`).sort(),
    ['CLIENT:src/lib.rs', 'SERVER:src/lib.rs'],
  );
});

test('pushStudioFilesToGitHub writes server/client paths', async () => {
  const github = githubFs({
    'crowdy.json': { content: DEFAULT_FULL_STACK_CROWDY_JSON, sha: 'j' },
  });
  const pushed = await pushStudioFilesToGitHub(github, BIND, [
    { target: 'SERVER', path: 'src/lib.rs', content: 'fn server() {}' },
    { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
  ]);
  assert.equal(pushed, 2);
  assert.deepEqual(
    github.puts.map((row) => row.path).sort(),
    ['client/src/lib.rs', 'server/src/lib.rs'],
  );
});

test('pushStudioFilesToGitHub writes fullstack crowdy.json when it is missing', async () => {
  const github = githubFs({
    'server/src/lib.rs': { content: 'old', sha: 's' },
    'client/src/lib.rs': { content: 'old', sha: 'c' },
  });
  await pushStudioFilesToGitHub(github, BIND, [
    { target: 'SERVER', path: 'src/lib.rs', content: 'fn server() {}' },
    { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
  ]);
  const crowdy = github.puts.find((row) => row.path === 'crowdy.json');
  assert.equal(crowdy.content, DEFAULT_FULL_STACK_CROWDY_JSON);
});

test('pushStudioFilesToGitHub is a no-op when content is unchanged', async () => {
  const github = githubFs({
    'crowdy.json': { content: DEFAULT_FULL_STACK_CROWDY_JSON, sha: 'j' },
    'server/src/lib.rs': { content: 'fn server() {}', sha: 's' },
    'client/src/lib.rs': { content: 'fn client() {}', sha: 'c' },
  });
  const pushed = await pushStudioFilesToGitHub(github, BIND, [
    { target: 'SERVER', path: 'src/lib.rs', content: 'fn server() {}' },
    { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
  ]);
  assert.equal(pushed, 0);
  assert.equal(github.puts.length, 0);
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
