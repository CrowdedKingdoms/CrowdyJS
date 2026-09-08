/**
 * GraphQL documents for GitHub Studio match the live /graphql-dsh operations.
 * Observed 2026-09-08: CrowdyStudioGitHubStatus with projectId returned
 * BenjaminScholtens / crowdy-mod-github-connected-project-cd40 / main.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { CrowdyStudioGitHubTransport } = await import(
  '../../dist/crowdy-studio/github/transport.js'
);

function fakeGraphql(handler) {
  const calls = [];
  return {
    calls,
    query: async (document, variables) => {
      calls.push({ document, variables });
      return handler(document, variables);
    },
  };
}

const STATUS = {
  configured: true,
  connected: true,
  accountLogin: 'BenjaminScholtens',
  repositorySelection: 'all',
  owner: 'BenjaminScholtens',
  repo: 'crowdy-mod-github-connected-project-cd40',
  branch: 'main',
  sha: null,
};

test('status posts CrowdyStudioGitHubStatus with appId and projectId', async () => {
  const graphql = fakeGraphql(() => ({ crowdyStudioGitHubStatus: STATUS }));
  const github = new CrowdyStudioGitHubTransport(graphql);
  const status = await github.status({
    appId: '84070698573312',
    projectId: 'd0bf7182-1220-4011-8012-7f77ba2c3efa',
  });
  assert.equal(status.owner, 'BenjaminScholtens');
  assert.equal(status.repo, 'crowdy-mod-github-connected-project-cd40');
  assert.match(graphql.calls[0].document, /query CrowdyStudioGitHubStatus/);
  assert.deepEqual(graphql.calls[0].variables, {
    appId: '84070698573312',
    projectId: 'd0bf7182-1220-4011-8012-7f77ba2c3efa',
  });
});

test('connectUrl / bind / createMod / tree / getFile / putFile use named operations', async () => {
  const graphql = fakeGraphql((document, variables) => {
    if (document.includes('query CrowdyStudioGitHubStatus')) {
      return { crowdyStudioGitHubStatus: STATUS };
    }
    if (document.includes('mutation CrowdyStudioGitHubConnectUrl')) {
      return { crowdyStudioGitHubConnectUrl: { connectUrl: 'https://github.com/apps/x/installations/new', state: 'st' } };
    }
    if (document.includes('mutation CrowdyStudioGitHubBind')) {
      return { crowdyStudioGitHubBind: STATUS };
    }
    if (document.includes('mutation CrowdyStudioGitHubCreateMod')) {
      return { crowdyStudioGitHubCreateMod: STATUS };
    }
    if (document.includes('query CrowdyStudioGitHubFile')) {
      return {
        crowdyStudioGitHubFile: {
          path: variables.input.path,
          content: 'fn on_init() {}\n',
          sha: 'cca2f394',
        },
      };
    }
    if (document.includes('query CrowdyStudioGitHubTree')) {
      return {
        crowdyStudioGitHubTree: [
          { path: 'README.md', type: 'file', sha: '291e4d0f' },
          { path: 'client', type: 'dir', sha: '8bcfb348' },
          { path: 'crowdy.json', type: 'file', sha: '4a08a1a5' },
          { path: 'server', type: 'dir', sha: '2d90c23e' },
        ],
      };
    }
    if (document.includes('mutation CrowdyStudioGitHubPutFile')) {
      return {
        crowdyStudioGitHubPutFile: {
          path: variables.input.path,
          content: variables.input.content,
          sha: '80306779c5d287f4c2f270eeb510d6d9b377102d',
        },
      };
    }
    throw new Error(`unexpected document ${document.slice(0, 80)}`);
  });
  const github = new CrowdyStudioGitHubTransport(graphql);

  const connect = await github.connectUrl();
  assert.equal(connect.state, 'st');
  assert.match(graphql.calls.at(-1).document, /mutation CrowdyStudioGitHubConnectUrl/);

  await github.bind({
    appId: '84070698573312',
    projectId: 'd0bf7182-1220-4011-8012-7f77ba2c3efa',
    owner: 'BenjaminScholtens',
    repo: 'crowdy-mod-github-connected-project-cd40',
    branch: 'main',
  });
  assert.match(graphql.calls.at(-1).document, /mutation CrowdyStudioGitHubBind/);

  await github.createMod({
    appId: '84070698573312',
    projectId: 'proj',
    name: 'github-connected-project',
    kind: 'FULL_STACK',
  });
  assert.match(graphql.calls.at(-1).document, /mutation CrowdyStudioGitHubCreateMod/);

  const tree = await github.tree({
    owner: 'BenjaminScholtens',
    repo: 'crowdy-mod-github-connected-project-cd40',
    path: '',
    ref: 'main',
  });
  assert.deepEqual(
    tree.map((row) => row.path),
    ['README.md', 'client', 'crowdy.json', 'server'],
  );
  assert.match(graphql.calls.at(-1).document, /query CrowdyStudioGitHubTree/);

  const file = await github.getFile({
    owner: 'BenjaminScholtens',
    repo: 'crowdy-mod-github-connected-project-cd40',
    path: 'server/src/lib.rs',
    ref: 'main',
  });
  assert.match(file.content, /fn on_init/);
  assert.match(graphql.calls.at(-1).document, /query CrowdyStudioGitHubFile/);

  const put = await github.putFile({
    owner: 'BenjaminScholtens',
    repo: 'crowdy-mod-github-connected-project-cd40',
    path: 'server/src/lib.rs',
    content: 'fn on_init() {}\n// marker\n',
    message: 'observe phase0 marker',
    branch: 'main',
    sha: 'cca2f394',
  });
  assert.equal(put.sha, '80306779c5d287f4c2f270eeb510d6d9b377102d');
  assert.match(graphql.calls.at(-1).document, /mutation CrowdyStudioGitHubPutFile/);
  assert.equal(graphql.calls.at(-1).variables.input.sha, 'cca2f394');
});
