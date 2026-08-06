// v14 removed the second GraphQL endpoint. TypeScript stops a TS caller from passing
// the old options, but a JavaScript caller would sail through and have its identity
// calls quietly sent to httpUrl -- or nowhere, if managementUrl was the only URL it
// set. These assert the removal is loud, and that client.management is really gone
// rather than merely undocumented.
import test from 'node:test';
import assert from 'node:assert/strict';

const loadSdk = () => import('../../dist/index.js');

for (const removed of ['managementUrl', 'managementGraphqlEndpoint']) {
  test(`createCrowdyClient refuses the removed \`${removed}\` option`, async () => {
    const { createCrowdyClient } = await loadSdk();
    assert.throws(
      () =>
        createCrowdyClient({
          httpUrl: 'https://api.invalid/graphql',
          [removed]: 'https://management.invalid',
        }),
      (err) => {
        assert.match(err.message, new RegExp(removed));
        assert.match(err.message, /v14/);
        assert.match(err.message, /httpUrl/);
        return true;
      },
    );
  });
}

test('client.management is gone and client.graphql serves every surface', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({ httpUrl: 'https://api.invalid/graphql' });

  assert.equal(client.management, undefined);
  assert.ok(client.graphql, 'client.graphql is the one transport');

  // Every sub-client that used to hold the management transport must now issue
  // through client.graphql. Stubbing the one client has to capture all of them;
  // a sub-client left on a second transport would simply not appear.
  const seen = [];
  client.graphql.request = async () => {
    seen.push(true);
    return {};
  };

  await client.users.me().catch(() => {});
  await client.platform.config().catch(() => {});
  await client.apps.codeAdmissionMode('1').catch(() => {});
  await client.quotas.effectiveQuota?.('1').catch(() => {});

  assert.ok(
    seen.length >= 3,
    `expected the identity surfaces to issue through client.graphql, saw ${seen.length}`,
  );
  client.close();
});
