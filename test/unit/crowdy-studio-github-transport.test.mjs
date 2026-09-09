/**
 * The GitHub transport rides the ONE GraphQL client and session. Operation
 * names match the game API; no read or write names an owner/repo.
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
  autosave: false,
  installUrl: 'https://github.com/settings/installations/1',
};

test('every operation is a named GraphQL operation on the shared client', async () => {
  const gql = fakeGraphql({
    CrowdyStudioGitHubStatus: { crowdyStudioGitHubStatus: STATUS },
    CrowdyStudioGitHubConnectUrl: { crowdyStudioGitHubConnectUrl: { connectUrl: 'https://github.com/apps/crowdy-studio-dev/installations/new?state=x' } },
    CrowdyStudioGitHubRepos: { crowdyStudioGitHubRepos: [{ owner: 'modder', name: 'my-mod', fullName: 'modder/my-mod', private: true, defaultBranch: 'main' }] },
    CrowdyStudioGitHubBind: { crowdyStudioGitHubBind: STATUS },
    CrowdyStudioGitHubUnbind: { crowdyStudioGitHubUnbind: { ...STATUS, owner: null, repo: null, branch: null } },
    CrowdyStudioGitHubSetAutosave: { crowdyStudioGitHubSetAutosave: { ...STATUS, autosave: true } },
    CrowdyStudioGitHubTree: { crowdyStudioGitHubTree: [{ path: 'server', type: 'tree', sha: null, size: null }] },
    CrowdyStudioGitHubFile: { crowdyStudioGitHubFile: { path: 'server/src/lib.rs', content: 'fn a(){}', sha: 'abc' } },
    CrowdyStudioGitHubPutFile: { crowdyStudioGitHubPutFile: { path: 'server/src/lib.rs', content: 'fn b(){}', sha: 'def' } },
  });
  const t = new CrowdyStudioGitHubTransport(gql);
  const scope = { appId: '89', projectId: 'p1' };

  assert.equal((await t.status({ appId: '89', projectId: 'p1' })).owner, 'modder');
  assert.match((await t.connectUrl()).connectUrl, /installations\/new/);
  assert.equal((await t.repos())[0].fullName, 'modder/my-mod');
  assert.equal((await t.bind({ ...scope, owner: 'modder', repo: 'my-mod' })).branch, 'main');
  assert.equal((await t.unbind(scope)).owner, null);
  assert.equal((await t.setAutosave({ ...scope, autosave: true })).autosave, true);
  assert.equal((await t.tree(scope))[0].type, 'tree');
  assert.equal((await t.getFile({ ...scope, path: 'server/src/lib.rs' })).sha, 'abc');
  assert.equal((await t.putFile({ ...scope, path: 'server/src/lib.rs', content: 'fn b(){}', message: 'm', sha: 'abc' })).sha, 'def');

  // Reads and writes carry the project scope, never a repository name.
  for (const { doc, variables } of gql.calls) {
    if (/Tree|File\(|PutFile/.test(doc)) {
      assert.equal(variables.input.appId, '89');
      assert.equal(variables.input.projectId, 'p1');
      assert.equal('owner' in variables.input, false);
      assert.equal('repo' in variables.input, false);
    }
  }
  // Status never selects a token-shaped field.
  assert.doesNotMatch(gql.calls[0].doc, /token|secret/i);
});
