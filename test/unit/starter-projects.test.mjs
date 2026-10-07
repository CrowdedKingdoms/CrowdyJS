import assert from 'node:assert/strict';
import test from 'node:test';

test('a CLIENT starter pins crowdy-client-sdk and serde_json', async () => {
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
  assert.match(cargo.content, /crowdy-client-sdk = "0\.1\.0"/u);
  assert.doesNotMatch(cargo.content, /crowdy-compute-sdk/u);
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

test('the SERVER target is the mod starter crate, and the CLIENT target is a CLIENT project\u2019s crate', async () => {
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

/**
 * The game API's rules for a CLIENT half's Cargo.toml (`execModClientBuild`): only [package],
 * [lib] as a cdylib, [dependencies] on crowdy-client-sdk, serde and serde_json, and
 * [package.metadata.crowdy] with tick_interval_ms; one key = value per line.
 */
function clientManifestProblems(manifest) {
  const problems = [];
  const sections = new Set(['package', 'lib', 'dependencies', 'package.metadata.crowdy']);
  const packageKeys = new Set(['name', 'version', 'edition', 'description', 'publish', 'license', 'authors', 'rust-version']);
  const deps = new Set(['crowdy-client-sdk', 'serde', 'serde_json']);
  let section = '';
  let cdylib = false;
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1].trim();
      if (!sections.has(section)) problems.push(`section [${section}]`);
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) {
      problems.push(`line ${line}`);
      continue;
    }
    const [, key, value] = kv;
    if (section === 'package' && !packageKeys.has(key)) problems.push(`[package] ${key}`);
    if (section === 'lib') {
      if (!['name', 'crate-type'].includes(key)) problems.push(`[lib] ${key}`);
      if (key === 'crate-type') cdylib = /^\[\s*"cdylib"\s*(,\s*"rlib"\s*)?\]$/.test(value);
    }
    if (section === 'package.metadata.crowdy' && (key !== 'tick_interval_ms' || !/^\d{1,6}$/.test(value))) {
      problems.push(`[package.metadata.crowdy] ${key}`);
    }
    if (section === 'dependencies' && !deps.has(key)) problems.push(`dependency ${key}`);
  }
  if (!cdylib) problems.push('no cdylib');
  return problems;
}

test("a CLIENT target starts from a crowdy-client-sdk crate the game API's builder accepts", async () => {
  const { createCrowdyStudioStarterProject, parseClientTickIntervalMs } = await import(
    '../../dist/crowdy-studio/index.js'
  );
  for (const kind of ['CLIENT', 'FULL_STACK']) {
    const project = createCrowdyStudioStarterProject({
      appId: '1',
      gridId: '2',
      name: 'Weather HUD',
      kind,
      modStarter: {
        files: [
          { path: 'Cargo.toml', content: '[package]\nname = "grid-mod"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nckx-sdk = "0.7.0"\n' },
          { path: 'src/lib.rs', content: 'use ckx_sdk::prelude::*;\n' },
        ],
      },
    });
    const client = (path) => project.files.find((file) => file.target === 'CLIENT' && file.path === path).content;
    assert.deepEqual(clientManifestProblems(client('Cargo.toml')), [], kind);
    assert.match(client('Cargo.toml'), /^name = "weather-hud-client"$/m);
    assert.match(client('Cargo.toml'), /^crowdy-client-sdk = "0\.1\.0"$/m);
    assert.equal(parseClientTickIntervalMs(client('Cargo.toml')), 1000);
    assert.match(client('src/lib.rs'), /^use crowdy_client_sdk as crowdy;$/m);
    assert.match(client('src/lib.rs'), /crowdy::register_module!\(init: init, tick: tick, invoke: invoke, event: event\);/);
    assert.doesNotMatch(client('src/lib.rs'), /crowdy_compute_sdk|container_|model_invoke/);
    assert.equal(project.metadata.clientModuleName, 'weather-hud-client');
    assert.equal(project.metadata.pairingPreference, 'NONE');
  }
  // The rules refuse the legacy compute SDK, which no starter names any more.
  assert.deepEqual(
    clientManifestProblems('[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\ncrowdy-compute-sdk = "0.1.8"\n'),
    ['dependency crowdy-compute-sdk'],
  );
});
