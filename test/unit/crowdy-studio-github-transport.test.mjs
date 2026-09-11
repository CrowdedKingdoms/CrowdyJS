/**
 * The GitHub transport rides the ONE GraphQL client and session. Operation
 * names match the game API; no read or write names an owner/repo. Studio
 * GitHub ops require an identity session — play app-tokens receive SCOPE_MISSING.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { CrowdyStudioGitHubTransport } = await import('../../dist/crowdy-studio/github/transport.js');

function fakeGraphql(responses) {
  const calls = [];
  return {
    calls,
    async query(doc, variables) {
      calls.push({ doc, variables });
      const name = /(?:query|mutation)\s+(\w+)/.exec(doc)[1];
      const body = responses[name];
      if (!body) throw new Error(`no response for ${name}`);
      return body;
    },
  };
}

const STATUS = {
  configured: true,
  connected: true,
  accountLogin: 'modder',
  accountType: 'User',
  owner: 'modder',
  repo: 'my-mod',
  branch: 'main',
  githubSha: 'abc1234',
  projectId: 'p1',
  autosave: false,
  installUrl: 'https://github.com/settings/installations/1',
};

test('every operation is a named GraphQL operation on the shared client', async () => {
  const gql = fakeGraphql({
    CrowdyStudioGitHubStatus: { crowdyStudioGitHubStatus: STATUS },
    CrowdyStudioGitHubConnectUrl: { crowdyStudioGitHubConnectUrl: { connectUrl: 'https://github.com/apps/crowdy-studio-dev/installations/new?state=x' } },
    CrowdyStudioGitHubRepos: { crowdyStudioGitHubRepos: [{ owner: 'modder', name: 'my-mod', fullName: 'modder/my-mod', private: true, defaultBranch: 'main' }] },
    CrowdyStudioGitHubBind: { crowdyStudioGitHubBind: STATUS },
    CrowdyStudioGitHubCreateMod: { crowdyStudioGitHubCreateMod: { ...STATUS, projectId: 'p-new', githubSha: 'seed' } },
    CrowdyStudioGitHubUnbind: { crowdyStudioGitHubUnbind: { ...STATUS, owner: null, repo: null, branch: null, githubSha: null } },
    CrowdyStudioGitHubSetAutosave: { crowdyStudioGitHubSetAutosave: { ...STATUS, autosave: true } },
    CrowdyStudioGitHubTree: { crowdyStudioGitHubTree: [{ path: 'server', type: 'tree', sha: null, size: null }] },
    CrowdyStudioGitHubFile: { crowdyStudioGitHubFile: { path: 'server/src/lib.rs', content: 'fn a(){}', sha: 'abc', commitSha: null } },
    CrowdyStudioGitHubPutFile: { crowdyStudioGitHubPutFile: { path: 'server/src/lib.rs', content: 'fn b(){}', sha: 'def', commitSha: 'c2' } },
    CrowdyStudioGitHubLayout: {
      crowdyStudioGitHubLayout: {
        commitSha: 'abc1234',
        server: 'server',
        client: 'client',
        assets: 'assets',
        crowdyJson: '{"server":"server","client":"client"}',
      },
    },
  });
  const t = new CrowdyStudioGitHubTransport(gql);
  const scope = { appId: '89', projectId: 'p1' };

  const status = await t.status({ appId: '89', projectId: 'p1' });
  assert.equal(status.owner, 'modder');
  assert.equal(status.githubSha, 'abc1234');
  assert.equal(status.projectId, 'p1');
  assert.match((await t.connectUrl()).connectUrl, /installations\/new/);
  assert.equal((await t.repos())[0].fullName, 'modder/my-mod');
  assert.equal((await t.bind({ ...scope, owner: 'modder', repo: 'my-mod' })).branch, 'main');
  assert.equal((await t.createMod({ appId: '89', name: 'My mod', owner: 'modder', repo: 'my-mod' })).projectId, 'p-new');
  assert.equal((await t.unbind(scope)).owner, null);
  assert.equal((await t.setAutosave({ ...scope, autosave: true })).autosave, true);
  assert.equal((await t.tree(scope))[0].type, 'tree');
  assert.equal((await t.getFile({ ...scope, path: 'server/src/lib.rs' })).sha, 'abc');
  const put = await t.putFile({
    ...scope,
    path: 'server/src/lib.rs',
    content: 'fn b(){}',
    message: 'm',
    sha: 'abc',
    expectedCommitSha: 'abc1234',
  });
  assert.equal(put.sha, 'def');
  assert.equal(put.commitSha, 'c2');
  const layout = await t.layout(scope);
  assert.equal(layout.server, 'server');
  assert.equal(layout.commitSha, 'abc1234');

  for (const { doc, variables } of gql.calls) {
    if (/Tree|File\(|PutFile|Layout|CreateMod/.test(doc)) {
      assert.equal(variables.input.appId, '89');
      if (/CreateMod/.test(doc) === false) {
        if (variables.input.projectId) assert.equal(variables.input.projectId, 'p1');
      }
      if (!/Bind|CreateMod/.test(doc)) {
        assert.equal('owner' in variables.input, false);
        assert.equal('repo' in variables.input, false);
      }
    }
  }
  const putCall = gql.calls.find(({ doc }) => /PutFile/.test(doc));
  assert.equal(putCall.variables.input.sha, 'abc');
  assert.equal(putCall.variables.input.expectedCommitSha, 'abc1234');
  assert.doesNotMatch(gql.calls[0].doc, /token|secret/i);
  assert.match(gql.calls.find(({ doc }) => /CreateMod/.test(doc)).doc, /crowdyStudioGitHubCreateMod/);
  assert.match(gql.calls.find(({ doc }) => /Layout/.test(doc)).doc, /crowdyStudioGitHubLayout/);
});
