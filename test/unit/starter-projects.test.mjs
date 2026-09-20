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
  assert.match(cargo.content, /crowdy-compute-sdk = "0\.1\.5"/u);
  assert.match(cargo.content, /serde_json = "1"/u);
  assert.match(cargo.content, /\[package\.metadata\.crowdy\]/u);
  assert.match(cargo.content, /tick_interval_ms = 1000/u);
  assert.match(cargo.content, /1000 = HUD\/text/u);
  const lib = project.files.find((file) => file.path === 'src/lib.rs');
  assert.match(lib.content, /tick_interval_ms/u);
  assert.match(lib.content, /pointer_clicks/u);
});

test('SERVER starter Cargo.toml does not declare a client tick interval', async () => {
  const { createCrowdyStudioStarterProject } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  const project = createCrowdyStudioStarterProject({
    appId: '1',
    gridId: '2',
    name: 'Demo',
    kind: 'SERVER',
  });
  const cargo = project.files.find((file) => file.path === 'Cargo.toml');
  assert.ok(cargo);
  assert.doesNotMatch(cargo.content, /tick_interval_ms/u);
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
