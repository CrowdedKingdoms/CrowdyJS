import assert from 'node:assert/strict';
import { test } from 'node:test';

const { GitHubDraftStore, MemoryDraftOverlayStorage, DraftError, gitBlobShaOfText } = await import(
  '../../dist/crowdy-studio/draft/index.js'
);
const { CrowdyGraphQLError } = await import('../../dist/errors.js');

const APP = '89';
const PROJECT = '11111111-1111-4111-8111-111111111111';

/** A bound branch in memory: tree, batched reads, one-commit writes, refresh. */
function fakeRepo(initial) {
  const files = new Map(Object.entries(initial));
  let head = '1'.repeat(40);
  let counter = 1;
  const calls = [];
  const nextSha = () => String(++counter).padStart(40, '0');
  const transport = {
    async tree({ commitSha }) {
      calls.push(['tree', commitSha]);
      const entries = [];
      for (const [path, content] of files) {
        entries.push({ path, type: 'blob', sha: await gitBlobShaOfText(content), size: Buffer.byteLength(content) });
      }
      return { commitSha: head, entries };
    },
    async getFiles({ paths }) {
      calls.push(['getFiles', paths.length]);
      const out = [];
      const missing = [];
      for (const path of paths) {
        if (!files.has(path)) missing.push(path);
        else {
          const content = files.get(path);
          const binary = content.includes('\u0000');
          out.push({ path, sha: await gitBlobShaOfText(content), size: Buffer.byteLength(content), binary, content: binary ? null : content });
        }
      }
      return { commitSha: head, files: out, missing };
    },
    async commitFiles({ expectedCommitSha, changes, message }) {
      calls.push(['commitFiles', changes.length, message]);
      if (expectedCommitSha !== head) {
        throw new CrowdyGraphQLError([{ message: 'The project moved on since it was read.', extensions: { code: 'GITHUB_STALE_SHA' } }]);
      }
      for (const change of changes) {
        if (change.delete) files.delete(change.path);
        else files.set(change.path, change.content);
      }
      const parentSha = head;
      head = nextSha();
      return {
        commitSha: head,
        parentSha,
        written: changes.filter((c) => !c.delete).map((c) => c.path),
        deleted: changes.filter((c) => c.delete).map((c) => c.path),
      };
    },
    async refresh() {
      calls.push(['refresh']);
      return { githubSha: head };
    },
  };
  return {
    transport,
    calls,
    files,
    get head() {
      return head;
    },
    /** Someone pushed to the branch outside Studio. */
    push(path, content) {
      if (content === null) files.delete(path);
      else files.set(path, content);
      head = nextSha();
    },
  };
}

function storeFor(repo, storage = new MemoryDraftOverlayStorage()) {
  return new GitHubDraftStore({ transport: repo.transport, appId: APP, projectId: PROJECT, baseCommitSha: repo.head, storage });
}

test('versions are git blob ids', async () => {
  assert.equal(await gitBlobShaOfText('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(await gitBlobShaOfText(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});

test('the draft lists the base, reads in batches, and caches text by blob id', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n', 'model/catalog.mjs': 'export const PROGRAM_CATALOG = [];\n', '.env': 'SECRET=1', 'node_modules/x/i.js': '' });
  const store = storeFor(repo);
  const snap = await store.load();
  assert.deepEqual(snap.entries.map((e) => e.path), ['model/catalog.mjs', 'src/main.ts']);
  assert.equal(snap.entries.every((e) => !e.dirty), true);
  const first = await store.read(['src/main.ts', 'model/catalog.mjs', 'src/gone.ts', '.env']);
  assert.deepEqual(first.files.map((f) => f.path).sort(), ['model/catalog.mjs', 'src/main.ts']);
  assert.deepEqual(first.missing.sort(), ['.env', 'src/gone.ts']);
  assert.equal(repo.calls.filter((c) => c[0] === 'getFiles').length, 1);
  await store.read(['src/main.ts']);
  assert.equal(repo.calls.filter((c) => c[0] === 'getFiles').length, 1, 'cached by blob id');
});

test('writes honour createIfAbsent and ifHash, and writing the base content back is not dirty', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n' });
  const store = storeFor(repo);
  await store.load();
  const base = (await store.read(['src/main.ts'])).files[0];
  await assert.rejects(
    store.write('src/main.ts', 'x', { source: 'agent', precondition: { kind: 'createIfAbsent' } }),
    (error) => error instanceof DraftError && error.code === 'DRAFT_STALE',
  );
  await assert.rejects(
    store.write('src/main.ts', 'x', { source: 'agent', precondition: { kind: 'ifHash', hash: '0'.repeat(40) } }),
    (error) => error.code === 'DRAFT_STALE',
  );
  const events = [];
  store.subscribe((event) => events.push(event));
  const written = await store.write('src/main.ts', 'export const a = 1;\n', { source: 'agent', precondition: { kind: 'ifHash', hash: base.hash } });
  assert.equal(written.previousHash, base.hash);
  assert.equal(store.snapshot().entries.find((e) => e.path === 'src/main.ts').dirty, true);
  assert.deepEqual(events.at(-1).changes, [{ path: 'src/main.ts', hash: written.hash }]);
  assert.equal(events.at(-1).source, 'agent');
  await store.write('src/main.ts', 'export {}\n', { source: 'player' });
  assert.equal(store.snapshot().entries.find((e) => e.path === 'src/main.ts').dirty, false);
  await assert.rejects(store.write('.github/workflows/ci.yml', 'on: push', { source: 'agent' }), (error) => error.code === 'DRAFT_PATH_REFUSED');
  await assert.rejects(store.write('../x.ts', 'x', { source: 'agent' }), (error) => error.code === 'DRAFT_PATH_REFUSED');
});

test('commit publishes every change as one commit and the draft follows its own base', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n', 'src/old.ts': 'old\n' });
  const store = storeFor(repo);
  await store.load();
  await store.write('src/scenes/pool/PoolScene.ts', 'export class PoolScene {}\n', { source: 'agent', precondition: { kind: 'createIfAbsent' } });
  await store.write('src/main.ts', 'export const x = 1;\n', { source: 'agent' });
  await store.remove('src/old.ts', { source: 'agent' });
  assert.deepEqual(store.snapshot().deleted, ['src/old.ts']);
  const result = await store.commit({ message: 'Add the pool scene' });
  assert.deepEqual(result.committed.sort(), ['src/main.ts', 'src/old.ts', 'src/scenes/pool/PoolScene.ts']);
  assert.deepEqual(repo.calls.filter((c) => c[0] === 'commitFiles'), [['commitFiles', 3, 'Add the pool scene']]);
  assert.equal(result.baseCommitSha, repo.head);
  const after = store.snapshot();
  assert.equal(after.entries.some((e) => e.dirty), false);
  assert.deepEqual(after.deleted, []);
  assert.equal(repo.files.get('src/main.ts'), 'export const x = 1;\n');
  await assert.rejects(store.commit({ message: 'nothing' }), (error) => error.code === 'DRAFT_NOT_FOUND');
});

test('a moved branch rebases the edits that do not collide and retries once', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n', 'README.md': '# game\n' });
  const store = storeFor(repo);
  await store.load();
  await store.write('src/main.ts', 'export const mine = 1;\n', { source: 'agent' });
  repo.push('README.md', '# game, renamed upstream\n');
  const result = await store.commit({ message: 'mine' });
  assert.deepEqual(result.committed, ['src/main.ts']);
  assert.deepEqual(repo.calls.filter((c) => c[0] === 'refresh').length, 1);
  assert.equal(repo.files.get('README.md'), '# game, renamed upstream\n', 'the upstream change is kept');
  assert.equal(repo.files.get('src/main.ts'), 'export const mine = 1;\n');
});

test('a path both sides changed is a conflict the player settles', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n' });
  const store = storeFor(repo);
  await store.load();
  await store.write('src/main.ts', 'export const mine = 1;\n', { source: 'agent' });
  repo.push('src/main.ts', 'export const theirs = 1;\n');
  await assert.rejects(store.commit({ message: 'mine' }), (error) => {
    assert.equal(error.code, 'DRAFT_CONFLICT');
    assert.deepEqual(error.conflicts.map((c) => c.path), ['src/main.ts']);
    return true;
  });
  assert.deepEqual(store.conflicts().map((c) => c.path), ['src/main.ts']);
  await store.resolveConflict('src/main.ts', 'mine');
  const result = await store.commit({ message: 'mine, over theirs' });
  assert.deepEqual(result.committed, ['src/main.ts']);
  assert.equal(repo.files.get('src/main.ts'), 'export const mine = 1;\n');

  await store.write('src/main.ts', 'export const again = 1;\n', { source: 'agent' });
  repo.push('src/main.ts', 'export const upstream = 2;\n');
  await assert.rejects(store.commit({ message: 'again' }), (error) => error.code === 'DRAFT_CONFLICT');
  await store.resolveConflict('src/main.ts', 'theirs');
  assert.equal((await store.read(['src/main.ts'])).files[0].content, 'export const upstream = 2;\n');
  assert.equal(store.snapshot().entries.some((e) => e.dirty), false);
});

test('the draft survives a reload of the page (same storage, new store)', async () => {
  const repo = fakeRepo({ 'src/main.ts': 'export {}\n' });
  const storage = new MemoryDraftOverlayStorage();
  const first = storeFor(repo, storage);
  await first.load();
  await first.write('src/main.ts', 'export const kept = 1;\n', { source: 'player' });
  first.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = storeFor(repo, storage);
  await second.load();
  assert.equal((await second.read(['src/main.ts'])).files[0].content, 'export const kept = 1;\n');
  assert.equal(second.snapshot().entries[0].dirty, true);
});
