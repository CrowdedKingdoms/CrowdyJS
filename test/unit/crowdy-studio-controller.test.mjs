import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, sleep } from '../helpers.mjs';

const GRID = {
  low: { x: 0n, y: 0n, z: 0n },
  high: { x: 2n, y: 2n, z: 2n },
};

function project(kind = 'FULL_STACK', revision = 'r1') {
  const targets =
    kind === 'FULL_STACK' ? ['SERVER', 'CLIENT'] : [kind];
  return {
    projectId: 'project-1',
    appId: '42',
    gridId: '500',
    kind,
    metadata: {
      name: 'Weather tools',
      ...(targets.includes('SERVER')
        ? { serverModuleName: 'weather-server' }
        : {}),
      ...(targets.includes('CLIENT')
        ? { clientModuleName: 'weather-client' }
        : {}),
      pairingPreference: 'NONE',
    },
    files: targets.flatMap((target) => [
      { target, path: 'Cargo.toml', content: `[package]\nname="${target.toLowerCase()}"` },
      { target, path: 'src/lib.rs', content: `fn ${target.toLowerCase()}() {}` },
    ]),
    sdkVersion: '0.1.5',
    abiVersion: 0,
    revision: { id: revision, savedAt: '2026-07-23T00:00:00Z' },
    source: 'STUDIO',
    github: null,
    createdAt: '2026-07-23T00:00:00Z',
    updatedAt: '2026-07-23T00:00:00Z',
  };
}

function providerFor(initial = project()) {
  let current = structuredClone(initial);
  let revision = 1;
  const saves = [];
  const imports = [];
  const librarySaves = [];
  const reads = [];
  return {
    saves,
    imports,
    librarySaves,
    reads,
    async listProjects() {
      return [{
        projectId: current.projectId,
        name: current.metadata.name,
        kind: current.kind,
        revisionId: current.revision.id,
        serverModuleName: current.metadata.serverModuleName,
        clientModuleName: current.metadata.clientModuleName,
        source: current.source ?? 'STUDIO',
        githubSha: current.github?.sha ?? null,
        updatedAt: current.updatedAt,
      }];
    },
    async getProject() {
      reads.push(current.projectId);
      return structuredClone(current);
    },
    async createProject(input) {
      current = {
        ...project(input.kind),
        metadata: structuredClone(input.metadata),
        files: structuredClone(input.files),
      };
      return structuredClone(current);
    },
    async saveProject(input) {
      saves.push(structuredClone(input));
      revision++;
      current = {
        ...current,
        metadata: structuredClone(input.metadata),
        files: structuredClone(input.files),
        revision: {
          id: `r${revision}`,
          savedAt: `2026-07-23T00:00:0${revision}Z`,
        },
        updatedAt: `2026-07-23T00:00:0${revision}Z`,
      };
      return structuredClone(current);
    },
    async listPersonalLibraryFiles() {
      return [{
        id: 'personal-1',
        source: 'PERSONAL_LIBRARY',
        title: 'Math',
        target: 'SERVER',
        path: 'src/math.rs',
        content: 'pub fn add() {}',
      }];
    },
    async listCommonFiles() {
      return [{
        id: 'common-1',
        source: 'COMMON',
        title: 'Types',
        target: 'SERVER',
        path: 'src/types.rs',
        content: 'pub struct Vec3;',
      }];
    },
    async importReferenceFile(input) {
      imports.push(structuredClone(input));
      revision++;
      current.files.push({
        target: 'SERVER',
        path: input.destinationPath ?? 'src/types.rs',
        content: 'pub struct Vec3;',
      });
      current.revision = {
        id: `r${revision}`,
        savedAt: `2026-07-23T00:00:0${revision}Z`,
      };
      current.updatedAt = current.revision.savedAt;
      return structuredClone(current);
    },
    async savePersonalLibraryFile(input) {
      librarySaves.push(structuredClone(input));
      return {
        id: `personal-${librarySaves.length + 1}`,
        source: 'PERSONAL_LIBRARY',
        title: input.title,
        target: input.target,
        path: input.path,
        content: input.content,
      };
    },
  };
}

function options(provider, extra = {}) {
  return {
    projectProvider: provider,
    mods: execMods([]),
    appId: '42',
    gridId: '500',
    grid: GRID,
    workerUrl: 'glue.js',
    onHostCall: async () => ({ ok: true }),
    sleep: async () => {},
    autosaveMs: 10,
    retryMs: 10,
    ...extra,
  };
}

const MOD_STARTER_CARGO =
  '[package]\nname = "grid-mod"\nversion = "0.1.0"\nedition = "2024"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nckx-sdk = { path = "../../crates/ckx-sdk" }\n';

const CLIENT_DIGEST = 'd'.repeat(64);
const CLIENT_HASH = 'e'.repeat(64);

/** A `client.exec` stand-in: every mod call is recorded in `calls`. */
function execMods(calls, overrides = {}) {
  return {
    async modStarter(appId) {
      calls.push(['starter', appId]);
      return {
        crate: 'grid-mod',
        nodeType: 'mod:grid-mod',
        description: 'Starter mod',
        files: [
          { path: 'Cargo.toml', content: MOD_STARTER_CARGO },
          { path: 'src/lib.rs', content: 'use ckx_sdk::prelude::*;\n' },
        ],
      };
    },
    async modBuild(appId, crate) {
      calls.push(['build', appId, crate]);
      return { buildId: 'b1', status: 'queued', log: null, artifacts: [] };
    },
    async modBuildStatus(appId, buildId) {
      calls.push(['status', appId, buildId]);
      return { buildId, status: 'succeeded', log: 'Finished release', artifacts: [] };
    },
    async modDeploy(appId, gridId, name, buildId) {
      calls.push(['deploy', appId, gridId, name, buildId]);
      return { version: 1, name };
    },
    async modSetEnabled(appId, gridId, name, enabled) {
      calls.push(['enabled', appId, gridId, name, enabled]);
      return { enabled };
    },
    async modLogs(appId, gridId, name, logOptions) {
      calls.push(['logs', appId, gridId, name, logOptions]);
      return [
        { id: 'l2', nodeType: `mod:${name}`, key: gridId, level: 0, host: 'h1', at: '2026-09-26T00:00:02Z', text: 'boom' },
        { id: 'l1', nodeType: `mod:${name}`, key: gridId, level: 2, host: 'h1', at: '2026-09-26T00:00:01Z', text: 'visited' },
      ];
    },
    async connect(appId, connectOptions) {
      calls.push(['connect', appId, connectOptions]);
      return {
        async call(nodeType, key, method, args) {
          calls.push(['call', nodeType, key, method, args]);
          return { visits: 2n, last: 'visitor' };
        },
        close() {
          calls.push(['close']);
        },
      };
    },
    async myMods(appId) {
      calls.push(['myMods', appId]);
      return [];
    },
    async modClientBuild(appId, crate) {
      calls.push(['clientBuild', appId, crate]);
      return { buildId: 'cb1', status: 'queued', kind: 'client', log: null, artifacts: [] };
    },
    async modClientDeploy(appId, gridId, name, buildId) {
      calls.push(['attach', appId, gridId, name, buildId]);
      return {
        modId: '900', gridId, name, ownerId: '42', clientVersion: 4, digest: CLIENT_DIGEST, sizeBytes: 4,
        capabilitySummaryJson: '{}', capabilitySummary: {}, capabilityHash: CLIENT_HASH, tickIntervalMs: 250, updatedAt: 't',
      };
    },
    async consentClientMod(appId, modId, hash) {
      calls.push(['consent', appId, modId, hash]);
      return true;
    },
    async modClientArtifactBytes(appId, modId) {
      calls.push(['artifact', appId, modId]);
      return {
        modId, name: 'weather-server', gridId: '500', clientVersion: 4, bytes: new Uint8Array([0, 97, 115, 109]).buffer,
        digest: CLIENT_DIGEST, sizeBytes: 4, fuelPerDispatch: 7_000n, tickIntervalMs: 250,
        capabilitySummaryJson: '{"hostFunctions":["hud_set"]}', capabilitySummary: { hostFunctions: ['hud_set'] },
        capabilityHash: CLIENT_HASH, abiVersion: 0,
      };
    },
    ...overrides,
  };
}

const CLIENT_HALF_CARGO =
  '[package]\nname = "weather-client"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n' +
  '[package.metadata.crowdy]\ntick_interval_ms = 250\n\n[dependencies]\ncrowdy-client-sdk = "0.1.0"\nserde_json = "1"\n';

/** A project whose CLIENT crate is a crowdy-client-sdk CLIENT half beside the SERVER mod crate. */
function execProject(kind) {
  const p = project(kind);
  p.files = p.files.map((file) =>
    file.target === 'CLIENT' && file.path === 'Cargo.toml' ? { ...file, content: CLIENT_HALF_CARGO } : file,
  );
  return p;
}

/** Records every broker Studio makes. */
function recordingBrokers(calls) {
  const made = [];
  return {
    made,
    brokerFactory: (brokerOptions) => {
      made.push(brokerOptions);
      return {
        async start(bytes) {
          calls.push(['broker:start', bytes.byteLength]);
        },
        stop() {
          calls.push(['broker:stop']);
        },
      };
    },
  };
}

test('project file CRUD is target-scoped and debounced into one atomic save', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const controller = new CrowdyStudioController(
    options(provider),
  );
  await controller.initialize();

  controller.updateFile('SERVER', 'src/lib.rs', 'fn one() {}');
  controller.updateFile('SERVER', 'src/lib.rs', 'fn two() {}');
  controller.addFile('CLIENT', 'src/hud.rs', 'pub fn draw() {}');
  controller.renameFile('CLIENT', 'src/hud.rs', 'src/overlay.rs');
  controller.deleteFile('CLIENT', 'src/overlay.rs');
  assert.equal(controller.getState().saveState, 'SAVING');

  await sleep(30);
  assert.equal(provider.saves.length, 1, 'rapid edits collapse into one save');
  assert.equal(provider.saves[0].expectedRevisionId, 'r1');
  assert.equal(
    provider.saves[0].files.find(
      (file) => file.target === 'SERVER' && file.path === 'src/lib.rs',
    ).content,
    'fn two() {}',
  );
  assert.equal(controller.getState().saveState, 'SAVED');
  controller.destroy();
});

test('common files import by value and project files save into My Library', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const controller = new CrowdyStudioController(
    options(provider, { autosaveMs: 10_000 }),
  );
  await controller.initialize();

  const common = controller.getState().commonFiles[0];
  controller.updateFile('SERVER', 'src/lib.rs', 'fn dirty_before_import() {}');
  await controller.importReferenceFile(common, 'src/common.rs');
  assert.deepEqual(provider.imports[0], {
    appId: '42',
    gridId: '500',
    projectId: 'project-1',
    expectedRevisionId: 'r2',
    source: 'COMMON',
    referenceId: 'common-1',
    destinationPath: 'src/common.rs',
  });
  assert.equal(
    controller.fileContent({
      source: 'PROJECT',
      target: 'SERVER',
      path: 'src/common.rs',
    }),
    'pub struct Vec3;',
  );

  await controller.saveProjectFileToLibrary(
    'SERVER',
    'src/common.rs',
    'Shared types',
  );
  assert.equal(provider.librarySaves[0].title, 'Shared types');
  assert.equal(
    controller.getState().personalLibraryFiles[0].title,
    'Shared types',
  );
  controller.destroy();
});

test('revision conflicts preserve local files and support explicit overwrite', async () => {
  const {
    CrowdyStudioController,
    CrowdyStudioRevisionConflictError,
  } = await loadSdk();
  const provider = providerFor();
  const normalSave = provider.saveProject.bind(provider);
  const remote = project('FULL_STACK', 'remote-r2');
  let conflict = true;
  provider.saveProject = async (input) => {
    if (conflict) {
      conflict = false;
      throw new CrowdyStudioRevisionConflictError('revision changed', remote);
    }
    return normalSave(input);
  };
  const controller = new CrowdyStudioController(
    options(provider, { autosaveMs: 10_000 }),
  );
  await controller.initialize();
  controller.updateFile('SERVER', 'src/lib.rs', 'fn local_edit() {}');

  assert.equal(await controller.saveNow(), false);
  assert.equal(controller.getState().saveState, 'CONFLICT');
  assert.equal(
    controller.fileContent({
      source: 'PROJECT',
      target: 'SERVER',
      path: 'src/lib.rs',
    }),
    'fn local_edit() {}',
  );
  assert.equal(await controller.overwriteConflict(), true);
  assert.equal(provider.saves.at(-1).expectedRevisionId, 'remote-r2');
  assert.equal(controller.getState().saveState, 'SAVED');
  controller.destroy();
});

test('offline saves retain edits and retry against the same revision', async () => {
  const { CrowdyStudioController, CrowdyStudioOfflineError } = await loadSdk();
  const provider = providerFor();
  const normalSave = provider.saveProject.bind(provider);
  let offline = true;
  provider.saveProject = async (input) => {
    if (offline) throw new CrowdyStudioOfflineError('network unavailable');
    return normalSave(input);
  };
  const controller = new CrowdyStudioController(
    options(provider, {
      autosaveMs: 10_000,
      retryMs: 10_000,
    }),
  );
  await controller.initialize();
  controller.updateFile('CLIENT', 'src/lib.rs', 'fn kept_offline() {}');

  assert.equal(await controller.saveNow(), false);
  assert.equal(controller.getState().saveState, 'OFFLINE');
  offline = false;
  assert.equal(await controller.retrySave(), true);
  assert.equal(provider.saves[0].expectedRevisionId, 'r1');
  assert.equal(controller.getState().saveState, 'SAVED');
  controller.destroy();
});

test('the SERVER target builds the crate, deploys it as the grid\u2019s mod, enables and stops it', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  const calls = [];
  const statuses = ['building', 'succeeded'];
  const mods = {
    async modBuild(appId, crate) {
      calls.push(['build', appId, crate]);
      return { buildId: 'b1', status: 'queued', log: null, artifacts: [] };
    },
    async modBuildStatus(appId, buildId) {
      calls.push(['status', appId, buildId]);
      return { buildId, status: statuses.shift(), log: 'Finished release', artifacts: [] };
    },
    async modDeploy(appId, gridId, name, buildId) {
      calls.push(['deploy', appId, gridId, name, buildId]);
      return { version: 3, name };
    },
    async modSetEnabled(appId, gridId, name, enabled) {
      calls.push(['enabled', appId, gridId, name, enabled]);
      return { enabled };
    },
  };
  const controller = new CrowdyStudioController(options(provider, { mods }));
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'RUNNING', result.message);
  const stopped = await controller.stopProject();
  assert.equal(stopped.serverStopped, true);
  assert.deepEqual(calls, [
    ['build', '42', {
      name: 'weather-server',
      files: [
        { path: 'Cargo.toml', content: '[package]\nname="server"' },
        { path: 'src/lib.rs', content: 'fn server() {}' },
      ],
    }],
    ['status', '42', 'b1'],
    ['status', '42', 'b1'],
    ['deploy', '42', '500', 'weather-server', 'b1'],
    ['enabled', '42', '500', 'weather-server', true],
    ['enabled', '42', '500', 'weather-server', false],
  ]);
  assert.match(controller.getState().buildOutput, /Finished release/);

  // A name that cannot be a mod's is refused before anything is built.
  const bad = project('SERVER');
  bad.metadata.serverModuleName = 'Weather Server';
  const refused = new CrowdyStudioController(options(providerFor(bad), { mods }));
  await refused.initialize();
  calls.length = 0;
  const r = await refused.deployLive();
  assert.equal(r.status, 'FAILED');
  assert.match(r.message, /lowercase/);
  assert.deepEqual(calls, []);
  controller.destroy();
  refused.destroy();
});

test('a new SERVER target starts from the mod starter, named for the project', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const provider = providerFor();
  const controller = new CrowdyStudioController(
    options(provider, { mods: execMods(calls) }),
  );
  await controller.initialize();

  const server = await controller.createProject({ name: 'Weather Tools', kind: 'SERVER' });
  assert.deepEqual(calls, [['starter', '42']]);
  assert.equal(server.metadata.serverModuleName, 'weather-tools-server');
  assert.equal(server.metadata.pairingPreference, 'NONE');
  const cargo = server.files.find((file) => file.path === 'Cargo.toml').content;
  assert.match(cargo, /^name = "weather-tools-server"$/m);
  assert.doesNotMatch(cargo, /grid-mod|crowdy-compute-sdk/);
  assert.equal(
    cargo.replace('name = "weather-tools-server"', 'name = "grid-mod"'),
    MOD_STARTER_CARGO,
    'only the package name changes',
  );
  assert.deepEqual(
    server.files.map((file) => [file.target, file.path]),
    [['SERVER', 'Cargo.toml'], ['SERVER', 'src/lib.rs']],
  );

  // Full stack: the mod starter for SERVER, a crowdy-client-sdk CLIENT half, no pairing.
  calls.length = 0;
  const full = await controller.createProject({ name: 'Weather Tools', kind: 'FULL_STACK' });
  assert.deepEqual(calls, [['starter', '42']]);
  assert.equal(full.metadata.pairingPreference, 'NONE');
  assert.equal(full.metadata.clientModuleName, 'weather-tools-client');
  const cargoOf = (target) =>
    full.files.find((file) => file.target === target && file.path === 'Cargo.toml').content;
  assert.match(cargoOf('SERVER'), /ckx-sdk/);
  assert.match(cargoOf('CLIENT'), /^crowdy-client-sdk = "0\.1\.0"$/m);
  assert.doesNotMatch(cargoOf('CLIENT'), /crowdy-compute-sdk/);

  // A CLIENT project has no SERVER target, so no starter is asked for; its module name is the
  // mod its CLIENT half rides, so it fits a mod's.
  calls.length = 0;
  const hud = await controller.createProject({ name: 'H'.repeat(60), kind: 'CLIENT' });
  assert.deepEqual(calls, []);
  assert.equal(hud.metadata.clientModuleName, `${'h'.repeat(41)}-client`);
  assert.match(hud.files.find((file) => file.path === 'Cargo.toml').content, /crowdy-client-sdk/);

  // Names fit a mod (48 characters) and a build's crate names (a leading letter).
  const long = await controller.createProject({ name: 'x'.repeat(60), kind: 'SERVER' });
  assert.equal(long.metadata.serverModuleName, `${'x'.repeat(41)}-server`);
  const digits = await controller.createProject({ name: '3D Tools', kind: 'SERVER' });
  assert.equal(digits.metadata.serverModuleName, 'mod-3d-tools-server');
  controller.destroy();
});

test('the controller refuses to start without mods', async () => {
  const { CrowdyStudioController } = await loadSdk();
  assert.throws(
    () => new CrowdyStudioController(options(providerFor(), { mods: undefined })),
    /needs mods \(client\.exec\)/,
  );
});

test('Invoke calls the mod over one exec connection, Logs are its log lines, and the usage surface reads the wallet', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const wallet = [];
  const controller = new CrowdyStudioController(
    options(providerFor(project('SERVER')), {
      mods: execMods(calls),
      playerWallet: {
        async balance() {
          wallet.push('balance');
          return { balanceCents: '250', currency: 'USD' };
        },
      },
    }),
  );
  await controller.initialize();

  const visited = await controller.invoke('visit', '{"hello":1}');
  assert.equal(visited.resultJson, '{"visits":"2","last":"visitor"}');
  await controller.invoke('', '');
  assert.deepEqual(calls, [
    ['connect', '42', { nodeType: 'mod:weather-server', key: '500' }],
    ['call', 'mod:weather-server', '500', 'visit', { hello: 1 }],
    ['call', 'mod:weather-server', '500', 'state', null],
  ]);
  assert.equal(controller.getState().invokeResult.resultJson, '{"visits":"2","last":"visitor"}');
  await assert.rejects(() => controller.invoke('visit', '{nope'), /must be JSON/);

  calls.length = 0;
  await controller.refreshSurface('logs');
  assert.deepEqual(calls, [['logs', '42', '500', 'weather-server', { limit: 50 }]]);
  assert.deepEqual(controller.getState().logs, [
    { id: 'l2', source: 'mod', moduleName: 'weather-server', level: 'error', at: '2026-09-26T00:00:02Z', text: 'boom' },
    { id: 'l1', source: 'mod', moduleName: 'weather-server', level: 'info', at: '2026-09-26T00:00:01Z', text: 'visited' },
  ]);

  calls.length = 0;
  await controller.refreshSurface('usage');
  assert.deepEqual(wallet, ['balance']);
  assert.deepEqual(calls, [], 'nothing but the wallet');
  assert.equal(controller.getState().wallet.balanceCents, '250');
  assert.equal('usage' in controller.getState(), false);

  controller.destroy();
  await sleep(0);
  assert.deepEqual(calls.at(-1), ['close']);
});

test('the mod build sends only crate files, under a crate name a build accepts', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const withAssets = project('SERVER');
  withAssets.metadata.serverModuleName = '3d-server';
  withAssets.files.push(
    { target: 'SERVER', path: 'README.md', content: '# 3d' },
    { target: 'SERVER', path: 'programs/sky.js', content: 'export default {}' },
    { target: 'SERVER', path: 'src/sky.rs', content: 'pub fn sky() {}' },
  );
  const controller = new CrowdyStudioController(
    options(providerFor(withAssets), { mods: execMods(calls) }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'RUNNING', result.message);
  const build = calls.find(([op]) => op === 'build');
  assert.equal(build[2].name, 'mod-3d-server');
  assert.deepEqual(
    build[2].files.map((file) => file.path).sort(),
    ['Cargo.toml', 'README.md', 'src/lib.rs', 'src/sky.rs'],
  );
  assert.deepEqual(calls.find(([op]) => op === 'deploy'), ['deploy', '42', '500', '3d-server', 'b1']);
  controller.destroy();
});

test('full-stack partial compile never enables either target', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const mods = execMods(calls, {
    async modBuildStatus(_appId, buildId) {
      calls.push(['status', buildId]);
      return buildId === 'cb1'
        ? { buildId, status: 'succeeded', kind: 'client', log: null, artifacts: [] }
        : { buildId, status: 'failed', log: 'error[E0425]: missing\n --> src/lib.rs:3:7', artifacts: [] };
    },
  });
  const controller = new CrowdyStudioController(options(providerFor(execProject('FULL_STACK')), { mods }));
  await controller.initialize();
  await controller.deployLive();

  assert.deepEqual(calls.map(([op]) => op), ['clientBuild', 'status', 'build', 'status']);
  assert.equal(controller.getState().runtime.phase, 'COMPILE_FAILED');
  assert.equal(controller.getState().authoritativeDiagnostics[0].path, 'src/lib.rs');
  assert.equal(controller.getState().authoritativeDiagnostics[0].target, 'SERVER');
  controller.destroy();
});

test('target permissions prevent unavailable authoring before deploy', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  const calls = [];
  const controller = new CrowdyStudioController(
    options(provider, {
      mods: execMods(calls),
      targetPermissions: {
        SERVER: { canWrite: false, canRun: false },
      },
    }),
  );
  await controller.initialize();
  await controller.testDraft();
  assert.deepEqual(calls, []);
  assert.equal(controller.getState().runtime.phase, 'ERROR');
  assert.match(
    controller.getState().runtime.message,
    /SERVER authoring is unavailable/u,
  );
  controller.destroy();
});

test('client deploy hot-swaps the attached CLIENT version and stop reports partial failures', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const events = [];
  let deployNo = 0;
  const mods = execMods([], {
    async modClientBuild() {
      deployNo++;
      return { buildId: `cb${deployNo}`, status: 'queued', kind: 'client', log: null, artifacts: [] };
    },
    async modClientDeploy(_appId, gridId, name, buildId) {
      events.push(`attach:${buildId}`);
      return {
        modId: '900', gridId, name, ownerId: '42', clientVersion: deployNo, digest: CLIENT_DIGEST, sizeBytes: 1,
        capabilitySummaryJson: '{}', capabilitySummary: {}, capabilityHash: CLIENT_HASH, tickIntervalMs: 250, updatedAt: 't',
      };
    },
    async modClientArtifactBytes(_appId, modId) {
      return {
        modId, name: 'weather-server', gridId: '500', clientVersion: deployNo, bytes: new Uint8Array([deployNo]).buffer,
        digest: CLIENT_DIGEST, sizeBytes: 1, fuelPerDispatch: 10n, tickIntervalMs: 250,
        capabilitySummaryJson: '{"hostFunctions":[]}', capabilitySummary: { hostFunctions: [] },
        capabilityHash: CLIENT_HASH, abiVersion: 0,
      };
    },
    async modSetEnabled(_appId, _gridId, _name, enabled) {
      if (!enabled) throw new Error('disable unavailable');
      return { enabled };
    },
  });
  let brokerNo = 0;
  const brokerFactory = () => {
    const id = ++brokerNo;
    return {
      async start(bytes) {
        events.push(`start:${id}:v${new Uint8Array(bytes)[0]}`);
      },
      stop() {
        events.push(`stop:${id}`);
      },
    };
  };
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('FULL_STACK')), { mods, brokerFactory }),
  );
  await controller.initialize();
  await controller.deployLive();
  await controller.deployLive();
  assert.deepEqual(events.filter((e) => e.startsWith('attach:')), ['attach:cb1', 'attach:cb2']);
  assert.ok(events.includes('start:2:v2'), 'the second broker runs the second attached version');
  assert.ok(
    events.indexOf('start:2:v2') < events.indexOf('stop:1'),
    'new broker starts before the old broker stops',
  );

  const stopped = await controller.stopProject();
  assert.equal(stopped.serverStopped, false);
  assert.equal(stopped.clientStopped, true);
  assert.match(stopped.failures[0], /disable unavailable/u);
  assert.equal(controller.getState().runtime.phase, 'PARTIAL_FAILURE');
  controller.destroy();
});

test('logs polling occurs only while visible and cleans up', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  let logReads = 0;
  const mods = execMods([], {
    async modLogs() {
      logReads++;
      return [];
    },
  });
  const controller = new CrowdyStudioController(
    options(provider, { mods, monitorPollMs: 5 }),
  );
  await controller.initialize();
  controller.setSurfaceVisible('logs', true);
  await sleep(18);
  assert.ok(logReads >= 2);
  controller.setPageVisible(false);
  const hiddenReads = logReads;
  await sleep(18);
  assert.equal(logReads, hiddenReads);
  controller.setPageVisible(true);
  await sleep(8);
  assert.ok(logReads > hiddenReads);
  controller.destroy();
  const destroyedReads = logReads;
  await sleep(12);
  assert.equal(logReads, destroyedReads);
});

// ----- GitHub repository card -------------------------------------------------

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function githubTransport(initialStatus) {
  let status = { ...initialStatus };
  const calls = [];
  return {
    calls,
    setStatus(next) {
      status = { ...status, ...next };
    },
    async status(input) {
      calls.push(['status', input]);
      return { ...status };
    },
    async connectUrl() {
      calls.push(['connectUrl']);
      return { connectUrl: 'https://github.com/apps/x/installations/new?state=s' };
    },
    async repos() {
      return [];
    },
    async bind(input) {
      calls.push(['bind', input]);
      status = { ...status, owner: input.owner, repo: input.repo, branch: input.branch ?? 'main', githubSha: SHA_A };
      return { ...status };
    },
    async unbind(input) {
      calls.push(['unbind', input]);
      status = { ...status, owner: null, repo: null, branch: null, githubSha: null };
      return { ...status };
    },
    async refresh(input) {
      calls.push(['refresh', input]);
      status = { ...status, githubSha: SHA_B };
      return { ...status };
    },
    async layout(input) {
      calls.push(['layout', input]);
      return { commitSha: input.commitSha ?? SHA_A, server: 'server', client: 'client', assets: 'assets', fromFile: true };
    },
    async tree() {
      throw new Error('the card never lists the tree');
    },
    async getFile() {
      throw new Error('the card never reads files');
    },
    async putFile(input) {
      calls.push(['putFile', input]);
      throw new Error('the card never writes files; the provider does');
    },
    async deleteFile(input) {
      calls.push(['deleteFile', input]);
      throw new Error('the card never writes files; the provider does');
    },
  };
}

const CONNECTED_UNBOUND = {
  configured: true,
  connected: true,
  accountLogin: 'modder',
  accountType: 'User',
  owner: null,
  repo: null,
  branch: null,
  githubSha: null,
  repositorySelection: 'selected',
  installUrl: 'https://github.com/settings/installations/1',
};

test('GitHub: "create repository" opens GitHub prefilled under the connected login and leaves owner/name for the bind', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport(CONNECTED_UNBOUND);
  const controller = new CrowdyStudioController(options(provider, { github }));
  await controller.initialize();
  await sleep(5);
  const opened = [];
  globalThis.window = { open: (url, target, features) => opened.push({ url, target, features }) };
  try {
    const url = new URL(controller.createGitHubRepository());
    assert.equal(url.origin + url.pathname, 'https://github.com/new');
    assert.equal(url.searchParams.get('owner'), 'modder');
    assert.equal(url.searchParams.get('name'), 'weather-tools');
    assert.equal(url.searchParams.get('visibility'), 'private');
    assert.equal(opened.length, 1);
    assert.equal(opened[0].features, 'noopener,noreferrer');
    const state = controller.getState();
    assert.equal(state.githubPendingRepo, 'modder/weather-tools');
    // A 'selected' installation is told to add the repository before binding.
    assert.match(state.githubMessage, /add it to your Crowdy Studio installation/);
    // Nothing was written anywhere.
    assert.deepEqual(github.calls.map(([op]) => op), ['status']);
  } finally {
    delete globalThis.window;
  }

  // Not connected: refused before opening anything.
  const github2 = githubTransport({ ...CONNECTED_UNBOUND, connected: false, accountLogin: null });
  const c2 = new CrowdyStudioController(options(provider, { github: github2 }));
  await c2.initialize();
  await sleep(5);
  assert.throws(() => c2.createGitHubRepository(), /Connect GitHub first/);
});

test('GitHub: status is fetched on open, nothing else happens until asked', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport(CONNECTED_UNBOUND);
  const controller = new CrowdyStudioController(options(provider, { github }));
  await controller.initialize();
  await sleep(5);
  assert.equal(controller.getState().github?.connected, true);
  assert.deepEqual(github.calls.map(([op]) => op), ['status']);
  assert.deepEqual(github.calls[0][1], { appId: '42', projectId: 'project-1' });
});

test('GitHub: bind names which side is the truth, is scoped to the project, refuses over unsaved edits, and re-reads the project', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport(CONNECTED_UNBOUND);
  const controller = new CrowdyStudioController(options(provider, { github, autosaveMs: 10_000 }));
  await controller.initialize();
  await sleep(5);

  await assert.rejects(() => controller.bindGitHubRepo('nonsense'), /owner\/repo/);
  controller.updateFile('SERVER', 'src/lib.rs', 'fn dirty() {}');
  await assert.rejects(() => controller.bindGitHubRepo('modder/my-mod'), /Save Studio edits/);
  await controller.saveNow();

  const reads = provider.reads.length;
  await controller.bindGitHubRepo('modder/my-mod@trunk', 'TAKE_REPOSITORY');
  const bind = github.calls.find(([op]) => op === 'bind')[1];
  assert.deepEqual(bind, { appId: '42', projectId: 'project-1', owner: 'modder', repo: 'my-mod', branch: 'trunk', initial: 'TAKE_REPOSITORY' });
  assert.equal(controller.getState().github.githubSha, SHA_A);
  assert.ok(provider.reads.length > reads, 'the project is re-read after a bind (TAKE_REPOSITORY replaced its files)');
  assert.match(controller.getState().githubMessage, /Took modder\/my-mod@trunk/);
  // Files are never written through the card.
  assert.equal(github.calls.some(([op]) => op === 'putFile'), false);
});

test('GitHub: refresh brings the project to the branch head and refuses over unsaved edits', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const bound = { ...project(), source: 'GITHUB', github: { owner: 'modder', repo: 'my-mod', branch: 'main', sha: SHA_A } };
  const provider = providerFor(bound);
  const github = githubTransport({ ...CONNECTED_UNBOUND, owner: 'modder', repo: 'my-mod', branch: 'main', githubSha: SHA_A });
  const controller = new CrowdyStudioController(options(provider, { github, autosaveMs: 10_000 }));
  await controller.initialize();
  await sleep(5);

  controller.updateFile('SERVER', 'src/lib.rs', 'fn dirty() {}');
  assert.equal(await controller.refreshFromGitHub(), false);
  assert.match(controller.getState().githubMessage, /Save Studio edits/);
  await controller.saveNow();

  assert.equal(await controller.refreshFromGitHub(), true);
  assert.equal(github.calls.filter(([op]) => op === 'refresh').length, 1);
  assert.equal(controller.getState().github.githubSha, SHA_B);
  assert.match(controller.getState().githubMessage, /Refreshed to bbbbbbb/);
});

test('GitHub: a bound project builds the files the mirror holds, and its files reach the provider as a normal save', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const bound = { ...execProject('FULL_STACK'), source: 'GITHUB', github: { owner: 'modder', repo: 'my-mod', branch: 'main', sha: SHA_A } };
  const provider = providerFor(bound);
  const calls = [];
  const github = githubTransport({ ...CONNECTED_UNBOUND, owner: 'modder', repo: 'my-mod', branch: 'main', githubSha: SHA_A });
  const controller = new CrowdyStudioController(
    options(provider, {
      github,
      mods: execMods(calls),
      brokerFactory: () => ({ async start() {}, stop() {} }),
    }),
  );
  await controller.initialize();
  await sleep(5);
  controller.updateFile('SERVER', 'src/lib.rs', 'fn committed() {}');
  await controller.saveNow();
  // The controller does not know how a bound project persists: it hands the
  // snapshot to the provider, which commits it. No putFile through the card.
  assert.equal(provider.saves.length, 1);
  assert.equal(github.calls.some(([op]) => op === 'putFile'), false);
  const result = await controller.deployLive();
  assert.equal(result.status, 'RUNNING', result.message);
  // Both builds take the files the mirror holds at its commit, the saved edit included.
  const build = calls.find(([op]) => op === 'build');
  assert.equal(
    build[2].files.find((file) => file.path === 'src/lib.rs').content,
    'fn committed() {}',
  );
  const clientBuild = calls.find(([op]) => op === 'clientBuild');
  assert.equal(
    clientBuild[2].files.find((file) => file.path === 'Cargo.toml').content,
    CLIENT_HALF_CARGO,
  );
  controller.destroy();
});

// ---- the CLIENT target: a mod's CLIENT half ----

test('a full-stack deploy saves once, builds the CLIENT half first, then the mod, attaches, consents and previews the served module', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const { made, brokerFactory } = recordingBrokers(calls);
  const provider = providerFor(execProject('FULL_STACK'));
  const controller = new CrowdyStudioController(
    options(provider, {
      autosaveMs: 10_000,
      mods: execMods(calls, {
        async modBuildStatus(appId, buildId) {
          calls.push(['status', appId, buildId]);
          return {
            buildId,
            status: 'succeeded',
            kind: buildId === 'cb1' ? 'client' : 'exec',
            log: buildId === 'cb1' ? 'weather-client: capabilities eee; host calls: hud_set; ticks every 250 ms' : 'Finished release',
            artifacts: [],
          };
        },
      }),
      brokerFactory,
    }),
  );
  await controller.initialize();
  controller.updateFile('CLIENT', 'src/lib.rs', 'fn edited() {}');
  const result = await controller.deployLive();
  assert.equal(result.status, 'RUNNING', result.message);
  assert.equal(provider.saves.length, 1);
  assert.deepEqual(calls.map(([op, ...rest]) => [op, ...rest.filter((v) => typeof v !== 'object')]), [
    ['clientBuild', '42'],
    ['status', '42', 'cb1'],
    ['build', '42'],
    ['status', '42', 'b1'],
    ['deploy', '42', '500', 'weather-server', 'b1'],
    ['enabled', '42', '500', 'weather-server', true],
    ['attach', '42', '500', 'weather-server', 'cb1'],
    ['consent', '42', '900', CLIENT_HASH],
    ['artifact', '42', '900'],
    ['broker:start', 4],
  ]);
  const clientBuild = calls.find(([op]) => op === 'clientBuild')[2];
  assert.equal(clientBuild.name, 'weather-client');
  assert.deepEqual(clientBuild.files.map((f) => f.path), ['Cargo.toml', 'src/lib.rs']);
  assert.equal(made.length, 1);
  assert.equal(made[0].engine, 'ck-exec');
  assert.equal(made[0].artifactHash, CLIENT_DIGEST);
  assert.equal(made[0].fuelPerDispatch, 7_000n);
  assert.equal(made[0].tickIntervalMs, 250, 'the served CLIENT half\u2019s tick interval');
  assert.equal(made[0].moduleName, 'weather-server', 'its name on the grid event bus is its mod\u2019s');
  assert.deepEqual(made[0].consentedHostCalls, ['hud_set'], 'bounded to the summary the author consented to');
  const log = controller.getState().buildOutput;
  assert.match(log, /## CLIENT\nweather-client: capabilities/);
  assert.match(log, /Attached to mod 'weather-server' as CLIENT version 4/);
  assert.match(log, /you consented to it as its author/);
  controller.destroy();
});

test('a preview stopped while its broker starts is stopped, not left running', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  let release;
  const started = new Promise((resolve) => (release = resolve));
  let starting;
  const reachedStart = new Promise((resolve) => (starting = resolve));
  const brokers = [];
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('CLIENT')), {
      mods: execMods(calls, {
        async myMods() {
          return [{ gridId: '500', name: 'weather-client', enabled: true }];
        },
      }),
      brokerFactory: () => {
        const broker = {
          stopped: false,
          async start() {
            starting();
            await started;
          },
          stop() {
            broker.stopped = true;
          },
        };
        brokers.push(broker);
        return broker;
      },
    }),
  );
  await controller.initialize();
  const deploy = controller.testDraft();
  await reachedStart;
  await controller.stopProject();
  release();
  const result = await deploy;
  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /cancelled/);
  assert.equal(brokers.length, 1);
  assert.equal(brokers[0].stopped, true, 'the broker that finished starting after Stop was stopped');
  controller.destroy();
});

test('a CLIENT-only project with no mod deploys the mod starter first and says so', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const { made, brokerFactory } = recordingBrokers(calls);
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('CLIENT')), {
      mods: execMods(calls),
      brokerFactory,
    }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'RUNNING', result.message);
  assert.deepEqual(calls.map(([op]) => op), [
    'clientBuild', 'status',
    'myMods',
    'starter', 'build', 'status', 'deploy', 'enabled',
    'attach', 'consent', 'artifact', 'broker:start',
  ]);
  const starterBuild = calls.find(([op]) => op === 'build');
  assert.equal(starterBuild[2].name, 'weather-client');
  assert.deepEqual(starterBuild[2].files.map((f) => f.path), ['Cargo.toml', 'src/lib.rs']);
  assert.deepEqual(calls.find(([op]) => op === 'deploy'), ['deploy', '42', '500', 'weather-client', 'b1']);
  assert.deepEqual(calls.find(([op]) => op === 'enabled'), ['enabled', '42', '500', 'weather-client', true]);
  assert.deepEqual(calls.find(([op]) => op === 'attach'), ['attach', '42', '500', 'weather-client', 'cb1']);
  assert.equal(made[0].engine, 'ck-exec');
  assert.match(
    controller.getState().buildOutput,
    /## SERVER\nGrid 500 had no mod 'weather-client' of yours, and a CLIENT half rides a mod: deployed the ck-exec mod starter \(grid-mod\) as 'weather-client', its server half\./,
  );

  // Stop switches that mod off, so its CLIENT half is no longer served.
  calls.length = 0;
  const stopped = await controller.stopProject();
  assert.deepEqual([stopped.clientStopped, stopped.serverStopped, stopped.failures], [true, true, []]);
  assert.deepEqual(calls, [['broker:stop'], ['enabled', '42', '500', 'weather-client', false]]);
  controller.destroy();
});

test('a CLIENT-only project rides the mod of that name the player already has', async () => {
  const { CrowdyStudioController } = await loadSdk();
  for (const enabled of [false, true]) {
    const calls = [];
    const { brokerFactory } = recordingBrokers(calls);
    const controller = new CrowdyStudioController(
      options(providerFor(execProject('CLIENT')), {
        mods: execMods(calls, {
          async myMods(appId) {
            calls.push(['myMods', appId]);
            return [
              { modId: '1', gridId: '501', name: 'weather-client', ownerId: '42', enabled: true },
              { modId: '900', gridId: '500', name: 'weather-client', ownerId: '42', enabled },
            ];
          },
        }),
        brokerFactory,
      }),
    );
    await controller.initialize();
    const result = await controller.deployLive();
    assert.equal(result.status, 'RUNNING', result.message);
    assert.deepEqual(
      calls.map(([op]) => op),
      ['clientBuild', 'status', 'myMods', ...(enabled ? [] : ['enabled']), 'attach', 'consent', 'artifact', 'broker:start'],
    );
    assert.equal(/deployed the ck-exec mod starter/.test(controller.getState().buildOutput), false);
    assert.equal(
      /Switched mod 'weather-client' on/.test(controller.getState().buildOutput),
      !enabled,
    );
    controller.destroy();
  }
});

test('a legacy compute-SDK CLIENT crate is refused before any build, with what to change', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const legacyCrate = project('CLIENT');
  legacyCrate.files[0].content =
    '[package]\nname = "weather-client"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\ncrowdy-compute-sdk = "0.1.8"\n';
  const controller = new CrowdyStudioController(
    options(providerFor(legacyCrate), { mods: execMods(calls) }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'COMPILE_FAILED');
  assert.deepEqual(calls, []);
  assert.match(controller.getState().buildOutput, /crowdy-client-sdk = "0\.1\.0"/);
  // What the crate loses: the Game Model, sessions and grid state are not CLIENT host calls.
  assert.match(controller.getState().buildOutput, /less the Game Model, sessions and grid state \(grid_state_get \/ grid_state_set\)/);
  assert.match(controller.getState().runtime.message, /legacy player compute crate/);
  controller.destroy();
});

test('the preview\u2019s CLIENT half log lines show in Logs beside the mod\u2019s, newest first', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const { made, brokerFactory } = recordingBrokers(calls);
  const provider = providerFor(execProject('FULL_STACK'));
  const controller = new CrowdyStudioController(
    options(provider, { mods: execMods(calls), brokerFactory }),
  );
  await controller.initialize();
  assert.equal((await controller.deployLive()).status, 'RUNNING');
  assert.equal(typeof made[0].onLog, 'function', 'the preview broker has a log sink');

  await controller.refreshSurface('logs');
  made[0].onLog({ level: 'warn', message: '<b>low fuel</b>', moduleName: 'weather-server' });
  const [first, ...rest] = controller.getState().logs;
  assert.deepEqual(
    { source: first.source, moduleName: first.moduleName, level: first.level, text: first.text },
    { source: 'preview', moduleName: 'weather-client', level: 'warn', text: '<b>low fuel</b>' },
  );
  assert.ok(!Number.isNaN(Date.parse(first.at)));
  assert.deepEqual(rest.map((line) => [line.source, line.id]), [['mod', 'l2'], ['mod', 'l1']]);

  // A poll keeps the preview's lines; opening another project clears both.
  await controller.refreshSurface('logs');
  assert.equal(controller.getState().logs.filter((line) => line.source === 'preview').length, 1);
  await controller.createProject({ name: 'Other', kind: 'SERVER' });
  assert.deepEqual(controller.getState().logs, []);

  controller.destroy();
  made[0].onLog({ level: 'info', message: 'late', moduleName: 'weather-server' });
  assert.deepEqual(controller.getState().logs, []);
});

test('a CLIENT build that fails attaches nothing', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('CLIENT')), {
      mods: execMods(calls, {
        async modBuildStatus(appId, buildId) {
          calls.push(['status', appId, buildId]);
          return { buildId, status: 'failed', kind: 'client', log: 'error[E0425]: cannot find value\n --> src/lib.rs:3:7', artifacts: [] };
        },
      }),
    }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'COMPILE_FAILED');
  assert.deepEqual(calls.map(([op]) => op), ['clientBuild', 'status']);
  assert.equal(controller.getState().authoritativeDiagnostics[0].target, 'CLIENT');
  controller.destroy();
});

test('a preview the API will not serve says the CLIENT half is attached and why', async () => {
  const { CrowdyStudioController, CrowdyGraphQLError } = await loadSdk();
  const calls = [];
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('FULL_STACK')), {
      mods: execMods(calls, {
        async modClientArtifactBytes() {
          throw new CrowdyGraphQLError([{ message: 'no CLIENT half of that mod is served to you', extensions: { code: 'NOT_FOUND' } }]);
        },
      }),
      brokerFactory: () => {
        throw new Error('no broker without a module');
      },
    }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /attached to mod 'weather-server'/);
  assert.match(result.message, /run_client_code who stands in grid 500/);
  assert.ok(calls.some(([op]) => op === 'attach'));
  controller.destroy();
});

test('a CLIENT-only project whose module name cannot be a mod\u2019s is refused before anything is built', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const bad = execProject('CLIENT');
  bad.metadata.clientModuleName = 'Weather HUD';
  const controller = new CrowdyStudioController(
    options(providerFor(bad), { mods: execMods(calls) }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /names the mod its CLIENT half rides/);
  assert.deepEqual(calls, []);
  controller.destroy();
});

test('a CLIENT-only project without SERVER permissions cannot get a mod to ride', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('CLIENT')), {
      mods: execMods(calls),
      targetPermissions: { SERVER: { canWrite: false, canRun: false }, CLIENT: { canWrite: true, canRun: true } },
    }),
  );
  await controller.initialize();
  const result = await controller.deployLive();
  assert.equal(result.status, 'FAILED');
  assert.match(result.message, /needs SERVER write and run permissions/);
  assert.deepEqual(calls.map(([op]) => op), ['clientBuild', 'status', 'myMods']);
  controller.destroy();
});

test('a CLIENT-only project\u2019s Logs read the mod its CLIENT half rides', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const controller = new CrowdyStudioController(
    options(providerFor(execProject('CLIENT')), { mods: execMods(calls) }),
  );
  await controller.initialize();
  await controller.refreshSurface('logs');
  assert.deepEqual(calls, [['logs', '42', '500', 'weather-client', { limit: 50 }]]);
  assert.equal(controller.getState().logs[0].moduleName, 'weather-client');
  controller.destroy();
});
