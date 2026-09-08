/**
 * Play GraphQL stays on /graphql. Studio GitHub/DSH use dshGraphqlEndpoint
 * (/graphql-dsh → local :4000). Observed 2026-09-08: play token on /graphql-dsh
 * was UNAUTHENTICATED; DSH session on /graphql-dsh returned GitHub status.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

function memStore(initial = null) {
  let token = initial;
  return {
    get: () => token,
    set: (value) => {
      token = value;
    },
    clear: () => {
      token = null;
    },
  };
}

test('loginStudioLocal is a no-op when gameplay and Studio share one GraphQL origin', async () => {
  const { createCrowdyClient } = await loadSdk();
  const fetches = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetches.push(String(url));
    return { ok: true, json: async () => ({ data: {} }) };
  };
  try {
    const client = createCrowdyClient({
      httpUrl: 'https://play.invalid/graphql',
      tokenStore: memStore(),
    });
    assert.equal(client.dshSession, client.session);
    await client.loginStudioLocal({ email: 'dev@local', password: 'x' });
    assert.equal(fetches.length, 0);
    client.close();
  } finally {
    globalThis.fetch = previous;
  }
});

test('GitHub and DSH domains use dshGraphqlEndpoint, not the play origin', async () => {
  const { createCrowdyClient } = await loadSdk();
  const fetches = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init.body));
    fetches.push({
      url: String(url),
      authorization: init.headers?.authorization ?? init.headers?.Authorization,
      query: body.query,
    });
    const headers = { get: () => null };
    if (String(body.query).includes('CrowdyStudioGitHubStatus')) {
      return {
        ok: true,
        headers,
        json: async () => ({
          data: {
            crowdyStudioGitHubStatus: {
              configured: true,
              connected: true,
              owner: 'BenjaminScholtens',
              repo: 'crowdy-mod-github-connected-project-cd40',
              branch: 'main',
            },
          },
        }),
      };
    }
    return { ok: true, headers, json: async () => ({ data: { __typename: 'Query' } }) };
  };
  try {
    const client = createCrowdyClient({
      httpUrl: 'https://play.invalid/graphql',
      dshGraphqlEndpoint: 'http://127.0.0.1:4000/graphql',
      tokenStore: memStore('play-token'),
      dshTokenStore: memStore('dsh-token'),
    });
    client.setToken('play-token');
    client.dshSession.setToken('dsh-token');
    const status = await client.crowdyStudioGitHub.status({
      appId: '84070698573312',
      projectId: 'd0bf7182-1220-4011-8012-7f77ba2c3efa',
    });
    assert.equal(status.repo, 'crowdy-mod-github-connected-project-cd40');
    assert.equal(fetches[0].url, 'http://127.0.0.1:4000/graphql');
    assert.equal(fetches[0].authorization, 'Bearer dsh-token');
    assert.match(fetches[0].query, /CrowdyStudioGitHubStatus/);
    assert.notEqual(client.dshSession, client.session);
    client.close();
  } finally {
    globalThis.fetch = previous;
  }
});
