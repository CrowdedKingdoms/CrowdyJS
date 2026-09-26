import assert from 'node:assert/strict';
import test from 'node:test';

test('starter Cargo.toml pins crowdy-compute-sdk and serde_json', async () => {
  const { createCrowdyStudioStarterProject } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const project = createCrowdyStudioStarterProject({
    appId: '1',
    gridId: '2',
    name: 'Demo',
    kind: 'CLIENT',
  });
  const cargo = project.files.find((file) => file.path === 'Cargo.toml');
  assert.ok(cargo, 'starter includes Cargo.toml');
  assert.match(cargo.content, /crowdy-compute-sdk = "0\.1\.8"/u);
  assert.match(cargo.content, /serde_json = "1"/u);
  assert.match(cargo.content, /\[package\.metadata\.crowdy\]/u);
  assert.match(cargo.content, /tick_interval_ms = 1000/u);
  assert.match(cargo.content, /1000 = HUD\/text/u);
  const lib = project.files.find((file) => file.path === 'src/lib.rs');
  assert.match(lib.content, /tick_interval_ms/u);
  assert.match(lib.content, /pointer_clicks/u);
});

const MOD_STARTER = {
  files: [
    {
      path: 'Cargo.toml',
      content:
        '[package]\nname = "grid-mod"\nedition = "2024"\n\n[lib]\nname = "grid_mod"\ncrate-type = ["cdylib"]\n',
    },
    { path: 'src/lib.rs', content: 'use ckx_sdk::prelude::*;\n' },
  ],
};

test('the SERVER target is the mod starter crate, and the CLIENT target keeps its crate', async () => {
  const { createCrowdyStudioStarterProject } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const clientOnly = createCrowdyStudioStarterProject({
    appId: '1',
    gridId: '2',
    name: 'Demo',
    kind: 'CLIENT',
  });
  const project = createCrowdyStudioStarterProject({
    appId: '1',
    gridId: '2',
    name: 'Demo',
    kind: 'FULL_STACK',
    modStarter: MOD_STARTER,
  });
  assert.equal(project.metadata.pairingPreference, 'NONE');
  const server = project.files.filter((file) => file.target === 'SERVER');
  assert.deepEqual(server.map((file) => file.path), ['Cargo.toml', 'src/lib.rs']);
  // Only [package] name changes; [lib] name is the crate's own business.
  assert.equal(
    server[0].content,
    '[package]\nname = "demo-server"\nedition = "2024"\n\n[lib]\nname = "grid_mod"\ncrate-type = ["cdylib"]\n',
  );
  assert.doesNotMatch(server[0].content, /tick_interval_ms/u);
  assert.deepEqual(
    project.files.filter((file) => file.target === 'CLIENT'),
    clientOnly.files,
  );

  assert.throws(
    () =>
      createCrowdyStudioStarterProject({ appId: '1', gridId: '2', name: 'Demo', kind: 'SERVER' }),
    /starts from the mod starter/,
  );
  assert.throws(
    () =>
      createCrowdyStudioStarterProject({
        appId: '1',
        gridId: '2',
        name: 'Demo',
        kind: 'SERVER',
        modStarter: { files: [{ path: 'src/lib.rs', content: '' }] },
      }),
    /no Cargo\.toml or src\/lib\.rs/,
  );
});

test('parseClientTickIntervalMs reads, clamps, and defaults', async () => {
  const { parseClientTickIntervalMs } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  assert.equal(parseClientTickIntervalMs(undefined), 1000);
  assert.equal(
    parseClientTickIntervalMs('[package.metadata.crowdy]\ntick_interval_ms = 50\n'),
    50,
  );
  assert.equal(
    parseClientTickIntervalMs('tick_interval_ms = 8\n'),
    16,
  );
  assert.equal(
    parseClientTickIntervalMs('tick_interval_ms = 5000\n'),
    1000,
  );
  assert.equal(
    parseClientTickIntervalMs('# tick_interval_ms = 16\n'),
    1000,
  );
});
