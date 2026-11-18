/**
 * The platform calls a Studio dock makes (Game API v2.73.0), against a fake GraphQL client: a mod
 * build's Studio source, the CLIENT half starter, the Studio links, and the starter project laid
 * out from the platform's CLIENT half.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CrowdyStudioAPI, ExecAPI, createCrowdyStudioStarterProject } from '../../dist/index.js';

/** A GraphQL client that answers by operation name and records what it was asked. */
function fakeGraphql(answers) {
  const seen = [];
  return {
    seen,
    request: async (doc, vars) => {
      const name = doc.definitions.find((d) => d.kind === 'OperationDefinition').name.value;
      seen.push([name, vars]);
      const answer = answers[name];
      if (!answer) throw new Error(`unexpected ${name}`);
      return answer;
    },
  };
}

const BUILD = {
  __typename: 'ExecBuild',
  buildId: 'b7',
  status: 'queued',
  log: null,
  sdkVersion: null,
  createdAt: 't',
  startedAt: null,
  finishedAt: null,
  artifacts: [],
  studioProjectId: 'p1',
  studioRevision: '3',
};

test('modBuild and modClientBuild send the Studio source and read it back', async () => {
  const graphql = fakeGraphql({
    ExecModBuild: { execModBuild: { ...BUILD, kind: 'exec' } },
    ExecModClientBuild: { execModClientBuild: { ...BUILD, kind: 'client' } },
  });
  const exec = new ExecAPI(graphql);
  const studio = { projectId: 'p1', revision: '3' };
  const crate = { name: 'turret', files: { 'Cargo.toml': 'c', 'src/lib.rs': 'l' } };

  const server = await exec.modBuild('77', crate, studio);
  assert.equal(server.studioProjectId, 'p1');
  assert.equal(server.studioRevision, '3');
  const client = await exec.modClientBuild('77', crate, studio);
  assert.equal(client.kind, 'client');
  await exec.modBuild('77', crate);

  const files = [{ path: 'Cargo.toml', content: 'c' }, { path: 'src/lib.rs', content: 'l' }];
  assert.deepEqual(graphql.seen, [
    ['ExecModBuild', { appId: '77', crate: { name: 'turret', files }, studio }],
    ['ExecModClientBuild', { appId: '77', crate: { name: 'turret', files }, studio }],
    ['ExecModBuild', { appId: '77', crate: { name: 'turret', files } }],
  ]);
});

test('modClientStarter reads the CLIENT half starter', async () => {
  const graphql = fakeGraphql({
    ExecModClientStarter: {
      execModClientStarter: {
        __typename: 'ExecStarter',
        crate: 'client-half',
        nodeType: 'client',
        description: 'A CLIENT half',
        files: [{ __typename: 'ExecBuildFile', path: 'Cargo.toml', content: 'c' }],
      },
    },
  });
  const starter = await new ExecAPI(graphql).modClientStarter('77');
  assert.deepEqual(starter, {
    crate: 'client-half',
    nodeType: 'client',
    description: 'A CLIENT half',
    files: [{ path: 'Cargo.toml', content: 'c' }],
  });
  assert.deepEqual(graphql.seen, [['ExecModClientStarter', { appId: '77' }]]);
});

test("crowdyStudio.links() is this tier's Studio origin and wallet page", async () => {
  const graphql = fakeGraphql({
    CrowdyStudioLinks: {
      crowdyStudioLinks: {
        __typename: 'CrowdyStudioLinks',
        origin: 'https://studio.prod.crowdedkingdoms.com',
        walletUrl: 'https://studio.prod.crowdedkingdoms.com/account/wallet',
      },
    },
  });
  assert.deepEqual(await new CrowdyStudioAPI(graphql).links(), {
    origin: 'https://studio.prod.crowdedkingdoms.com',
    walletUrl: 'https://studio.prod.crowdedkingdoms.com/account/wallet',
  });
});

test("a starter project's CLIENT target is the platform's CLIENT half, its package renamed", () => {
  const input = createCrowdyStudioStarterProject({
    appId: '77',
    gridId: '5',
    name: 'Weather HUD',
    kind: 'CLIENT',
    clientStarter: {
      files: [
        { path: 'Cargo.toml', content: '[package]\nname = "client-half"\n\n[dependencies]\nname = "kept"\n' },
        { path: 'src/lib.rs', content: 'fn init() {}\n' },
      ],
    },
  });
  assert.deepEqual(input.files, [
    { target: 'CLIENT', path: 'Cargo.toml', content: '[package]\nname = "weather-hud-client"\n\n[dependencies]\nname = "kept"\n' },
    { target: 'CLIENT', path: 'src/lib.rs', content: 'fn init() {}\n' },
  ]);
  assert.throws(
    () =>
      createCrowdyStudioStarterProject({
        appId: '77',
        gridId: '5',
        name: 'Weather HUD',
        kind: 'CLIENT',
        clientStarter: { files: [{ path: 'Cargo.toml', content: '[package]\n' }] },
      }),
    /The CLIENT half starter has no Cargo.toml or src\/lib\.rs/,
  );
});
