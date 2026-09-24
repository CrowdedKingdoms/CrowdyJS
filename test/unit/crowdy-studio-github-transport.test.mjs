/**
 * The GitHub transport rides the ONE GraphQL client and session. Operation
 * names match the game API; no read or write names an owner/repo; every
 * bound write carries expectedCommitSha.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { CrowdyStudioGitHubTransport } = await import('../../dist/crowdy-studio/github/transport.js');

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

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
  githubSha: SHA_A,
  installUrl: 'https://github.com/settings/installations/1',
};

test('every operation is a named GraphQL operation on the shared client', async () => {
  const gql = fakeGraphql({
    CrowdyStudioGitHubStatus: { crowdyStudioGitHubStatus: STATUS },
    CrowdyStudioGitHubConnectUrl: { crowdyStudioGitHubConnectUrl: { connectUrl: 'https://github.com/apps/crowdy-studio-dev/installations/new?state=x' } },
    CrowdyStudioGitHubRepos: { crowdyStudioGitHubRepos: [{ owner: 'modder', name: 'my-mod', fullName: 'modder/my-mod', private: true, defaultBranch: 'main' }] },
    CrowdyStudioGitHubBind: { crowdyStudioGitHubBind: STATUS },
    CrowdyStudioGitHubUnbind: { crowdyStudioGitHubUnbind: { ...STATUS, owner: null, repo: null, branch: null, githubSha: null } },
    CrowdyStudioGitHubRefresh: { crowdyStudioGitHubRefresh: { ...STATUS, githubSha: SHA_B } },
    CrowdyStudioGitHubLayout: { crowdyStudioGitHubLayout: { commitSha: SHA_A, server: 'server', client: 'client', assets: 'assets', fromFile: true } },
    CrowdyStudioGitHubTree: { crowdyStudioGitHubTree: { commitSha: SHA_A, entries: [{ path: 'server', type: 'tree', sha: null, size: null }] } },
    CrowdyStudioGitHubFile: { crowdyStudioGitHubFile: { path: 'server/src/lib.rs', content: 'fn a(){}', sha: 'abc', commitSha: SHA_A } },
    CrowdyStudioGitHubPutFile: { crowdyStudioGitHubPutFile: { path: 'server/src/lib.rs', content: 'fn b(){}', sha: 'def', commitSha: SHA_B } },
    CrowdyStudioGitHubDeleteFile: { crowdyStudioGitHubDeleteFile: { ...STATUS, githubSha: SHA_B } },
  });
  const t = new CrowdyStudioGitHubTransport(gql);
  const scope = { appId: '89', projectId: 'p1' };

  assert.equal((await t.status({ appId: '89', projectId: 'p1' })).githubSha, SHA_A);
  assert.match((await t.connectUrl()).connectUrl, /installations\/new/);
  assert.equal((await t.repos())[0].fullName, 'modder/my-mod');
  assert.equal((await t.bind({ ...scope, owner: 'modder', repo: 'my-mod', initial: 'PUSH_PROJECT' })).branch, 'main');
  assert.equal((await t.unbind(scope)).owner, null);
  assert.equal((await t.refresh(scope)).githubSha, SHA_B);
  assert.equal((await t.layout({ ...scope, commitSha: SHA_A })).server, 'server');
  assert.equal((await t.tree(scope)).entries[0].type, 'tree');
  assert.equal((await t.getFile({ ...scope, path: 'server/src/lib.rs' })).commitSha, SHA_A);
  assert.equal(
    (await t.putFile({ ...scope, path: 'server/src/lib.rs', content: 'fn b(){}', message: 'm', expectedCommitSha: SHA_A })).commitSha,
    SHA_B,
  );
  assert.equal((await t.deleteFile({ ...scope, path: 'server/src/old.rs', message: 'rm', expectedCommitSha: SHA_B })).githubSha, SHA_B);

  // Reads and writes carry the project scope, never a repository name.
  for (const { doc, variables } of gql.calls) {
    if (/Layout|Tree|File\(|PutFile|DeleteFile|Refresh/.test(doc)) {
      assert.equal(variables.input.appId, '89');
      assert.equal(variables.input.projectId, 'p1');
      assert.equal('owner' in variables.input, false);
      assert.equal('repo' in variables.input, false);
    }
    if (/PutFile|DeleteFile/.test(doc)) {
      assert.match(variables.input.expectedCommitSha, /^[a-f0-9]{40}$/);
    }
  }
  // Bind says which side is the truth; status never selects a token-shaped field.
  const bind = gql.calls.find((c) => /GitHubBind/.test(c.doc));
  assert.equal(bind.variables.input.initial, 'PUSH_PROJECT');
  assert.doesNotMatch(gql.calls[0].doc, /token|secret|autosave/i);
  // The removed surface stays removed.
  assert.equal(typeof t.setAutosave, 'undefined');
});
