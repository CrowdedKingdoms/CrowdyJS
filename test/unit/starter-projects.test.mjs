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
  const lib = project.files.find((file) => file.path === 'src/lib.rs');
  assert.match(lib.content, /tickIntervalMs is set/u);
});
