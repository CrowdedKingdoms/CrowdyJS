/**
 * A GITHUB project's files are the server's mirror of the repository. The
 * provider persists them as commits (one PutFile / DeleteFile per changed
 * file, each carrying the commit the previous one produced) and metadata as
 * a plain project save with no file bodies. A stale commit surfaces as the
 * same revision conflict the editor already recovers from.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

function projectDto(overrides = {}) {
  return {
    projectId: '11111111-1111-4111-8111-111111111111',
    appId: '1',
    ownerUserId: '7',
    gridId: '2',
    name: 'Tools',
    description: null,
    serverModuleName: 'tools-server',
    clientModuleName: 'tools-client',
    pairingPreference: 'PAIRED',
    sdkVersion: '0.1.5',
    abiVersion: 0,
    revision: '1',
    archived: false,
    archivedAt: null,
    fileCount: 2,
    totalBytes: '28',
    source: 'GITHUB',
    githubOwner: 'modder',
    githubRepo: 'my-mod',
    githubBranch: 'main',
    githubSha: SHA_A,
    createdAt: '2026-07-23T00:00:00Z',
    updatedAt: '2026-07-23T00:00:00Z',
    files: [
      file('SERVER', 'src/lib.rs', 'fn server() {}'),
      file('CLIENT', 'src/lib.rs', 'fn client() {}'),
    ],
    ...overrides,
  };
}

function file(target, path, content) {
  return {
    target,
    path,
    content,
    revision: '1',
    provenance: 'AUTHORED',
    provenanceLibraryFileId: null,
    provenanceLibraryRevision: null,
    provenanceCommonVersionId: null,
    createdAt: '2026-07-23T00:00:00Z',
    updatedAt: '2026-07-23T00:00:00Z',
  };
}

function opName(doc) {
  if (typeof doc === 'string') return /(?:query|mutation)\s+(\w+)/.exec(doc)[1];
  return doc.definitions.find((d) => d.kind === 'OperationDefinition')?.name?.value;
}

async function harness(behaviour = {}) {
  const { createCrowdyClient, CrowdyGraphQLError, CrowdyStudioRevisionConflictError } = await loadSdk();
  const client = createCrowdyClient({ httpUrl: 'https://game.invalid' });
  const calls = [];
  let remote = projectDto();
  let sha = SHA_A;
  const nextSha = () => {
    sha = sha === SHA_A ? SHA_B : SHA_C;
    return sha;
  };
  const answer = async (doc, variables) => {
    const name = opName(doc);
    calls.push({ name, variables });
    switch (name) {
      case 'CrowdyStudioProject':
        return { crowdyStudioProject: { ...remote, githubSha: sha } };
      case 'CrowdyStudioProjectSave':
        remote = { ...remote, name: variables.input.name, revision: String(Number(remote.revision) + 1) };
        return { crowdyStudioProjectSave: { ...remote, githubSha: sha } };
      case 'CrowdyStudioGitHubLayout':
        return {
          crowdyStudioGitHubLayout: { commitSha: variables.input.commitSha, server: 'server', client: 'client', assets: 'assets', fromFile: true },
        };
      case 'CrowdyStudioGitHubPutFile': {
        if (behaviour.staleOnPut && variables.input.path === behaviour.staleOnPut) {
          throw new CrowdyGraphQLError([{ message: 'The project moved on since it was read.', extensions: { code: 'GITHUB_STALE_SHA' } }]);
        }
        assert.equal(variables.input.expectedCommitSha, sha, `put of ${variables.input.path} carries the current commit`);
        const commit = nextSha();
        return { crowdyStudioGitHubPutFile: { path: variables.input.path, content: variables.input.content, sha: 'blob', commitSha: commit } };
      }
      case 'CrowdyStudioGitHubDeleteFile': {
        assert.equal(variables.input.expectedCommitSha, sha);
        const commit = nextSha();
        return { crowdyStudioGitHubDeleteFile: { configured: true, connected: true, owner: 'modder', repo: 'my-mod', branch: 'main', githubSha: commit } };
      }
      default:
        throw new Error(`unexpected ${name}`);
    }
  };
  client.graphql.request = answer;
  client.graphql.query = answer;
  return { client, calls, CrowdyStudioRevisionConflictError, currentSha: () => sha };
}

test('a bound project save commits each changed file in turn, deletes through DeleteFile, and never sends file bodies to the project save', async () => {
  const { client, calls, currentSha } = await harness();
  const scope = { appId: '1', gridId: '2', projectId: '11111111-1111-4111-8111-111111111111' };
  const project = await client.crowdyStudio.getProject(scope);
  assert.equal(project.source, 'GITHUB');
  assert.equal(project.github.sha, SHA_A);

  const saved = await client.crowdyStudio.saveProject({
    ...scope,
    expectedRevisionId: project.revision.id,
    metadata: { ...project.metadata, name: 'Tools renamed' },
    files: [
      { target: 'SERVER', path: 'src/lib.rs', content: 'fn server_v2() {}' },
      { target: 'SERVER', path: 'src/extra.rs', content: 'fn extra() {}' },
      // CLIENT src/lib.rs deleted
    ],
  });
  const names = calls.map((c) => c.name);
  assert.deepEqual(names, [
    'CrowdyStudioProject',
    'CrowdyStudioProjectSave',
    'CrowdyStudioGitHubLayout',
    'CrowdyStudioGitHubPutFile',
    'CrowdyStudioGitHubPutFile',
    'CrowdyStudioGitHubDeleteFile',
    'CrowdyStudioProject',
  ]);
  const metadataSave = calls[1].variables.input;
  assert.equal(metadataSave.name, 'Tools renamed');
  assert.deepEqual(metadataSave.upserts, []);
  assert.deepEqual(metadataSave.deletes, []);
  const puts = calls.filter((c) => c.name === 'CrowdyStudioGitHubPutFile').map((c) => c.variables.input);
  assert.deepEqual(puts.map((p) => p.path).sort(), ['server/src/extra.rs', 'server/src/lib.rs']);
  assert.deepEqual(puts.map((p) => p.expectedCommitSha), [SHA_A, SHA_B], 'each put carries the commit the previous one produced');
  for (const p of puts) {
    assert.equal(p.appId, '1');
    assert.equal(p.projectId, scope.projectId);
    assert.equal('sha' in p, false, 'the server resolves the blob sha from expectedCommitSha');
  }
  const del = calls.find((c) => c.name === 'CrowdyStudioGitHubDeleteFile').variables.input;
  assert.equal(del.path, 'client/src/lib.rs');
  assert.equal(del.expectedCommitSha, SHA_C);
  assert.equal(saved.github.sha, currentSha());
});

test('a save with no changes on a bound project touches nothing but the re-read', async () => {
  const { client, calls } = await harness();
  const scope = { appId: '1', gridId: '2', projectId: '11111111-1111-4111-8111-111111111111' };
  const project = await client.crowdyStudio.getProject(scope);
  await client.crowdyStudio.saveProject({
    ...scope,
    expectedRevisionId: project.revision.id,
    metadata: project.metadata,
    files: project.files,
  });
  assert.deepEqual(calls.map((c) => c.name), ['CrowdyStudioProject', 'CrowdyStudioProject']);
});

test('GITHUB_STALE_SHA from a put becomes the revision conflict the editor recovers from, carrying the remote project', async () => {
  const { client, CrowdyStudioRevisionConflictError } = await harness({ staleOnPut: 'server/src/lib.rs' });
  const scope = { appId: '1', gridId: '2', projectId: '11111111-1111-4111-8111-111111111111' };
  const project = await client.crowdyStudio.getProject(scope);
  await assert.rejects(
    () =>
      client.crowdyStudio.saveProject({
        ...scope,
        expectedRevisionId: project.revision.id,
        metadata: project.metadata,
        files: [
          { target: 'SERVER', path: 'src/lib.rs', content: 'fn stale() {}' },
          { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
        ],
      }),
    (error) => {
      assert.ok(error instanceof CrowdyStudioRevisionConflictError);
      assert.equal(error.remoteProject?.source, 'GITHUB');
      return true;
    },
  );
});
