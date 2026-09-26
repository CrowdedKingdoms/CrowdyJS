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
      pairingPreference: kind === 'FULL_STACK' ? 'REQUIRED' : 'NONE',
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

function playerCompute(overrides = {}) {
  return {
    async deploy(input) {
      return {
        versionId: input.target === 'CLIENT' ? 'client-v1' : 'server-v1',
      };
    },
    async versions({ name }) {
      return [{
        versionId: name.includes('client') ? 'client-v1' : 'server-v1',
        compileStatus: 'succeeded',
        compileLog: null,
      }];
    },
    async setEnabled() {
      return {};
    },
    async setRequires() {
      return true;
    },
    async artifactBytes({ versionId }) {
      return {
        bytes: new Uint8Array([0, 97, 115, 109]).buffer,
        artifactHash: 'a'.repeat(64),
        fuelPerDispatch: 1000n,
        versionId,
      };
    },
    async usage() {
      return {
        hourUnitsUsed: '5',
        dayUnitsUsed: '9',
        unitsPerHour: '1000',
        unitsPerDay: '5000',
        compilesThisHour: 1,
        maxCompilesPerHour: 20,
        gateStatus: 'active',
        gateReason: null,
      };
    },
    async runs() {
      return [];
    },
    async logs() {
      return [];
    },
    async invoke() {
      return { resultJson: '{"ok":true}', fuelUsed: '4', durationUs: 2 };
    },
    ...overrides,
  };
}

function options(provider, compute, extra = {}) {
  return {
    projectProvider: provider,
    playerCompute: compute,
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

test('project file CRUD is target-scoped and debounced into one atomic save', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const controller = new CrowdyStudioController(
    options(provider, playerCompute()),
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
    options(provider, playerCompute(), { autosaveMs: 10_000 }),
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
    options(provider, playerCompute(), { autosaveMs: 10_000 }),
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
    options(provider, playerCompute(), {
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

test('full-stack deploy saves once and orders client, server, pairing, enable, run', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const calls = [];
  const compute = playerCompute({
    async deploy(input) {
      calls.push(`deploy:${input.target}:${input.draft}`);
      // The server resolves the source from the project; no bodies travel.
      assert.equal(input.projectId, 'project-1');
      assert.equal('sourceFilesJson' in input, false);
      assert.equal('commitSha' in input, false, 'a STUDIO project pins no commit');
      return {
        versionId: input.target === 'CLIENT' ? 'client-v1' : 'server-v1',
      };
    },
    async versions({ name }) {
      calls.push(`poll:${name}`);
      return [{
        versionId: name.includes('client') ? 'client-v1' : 'server-v1',
        compileStatus: 'succeeded',
        compileLog: null,
      }];
    },
    async setRequires(input) {
      calls.push(`requires:${input.serverName}:${input.requiredClientName}`);
      return true;
    },
    async setEnabled(input) {
      calls.push(`enabled:${input.name}:${input.enabled}`);
      return {};
    },
    async artifactBytes(input) {
      calls.push(`artifact:${input.name}:${input.versionId}`);
      return {
        bytes: new Uint8Array([1]).buffer,
        artifactHash: 'b'.repeat(64),
        fuelPerDispatch: 500n,
        versionId: input.versionId,
      };
    },
  });
  const brokerFactory = () => ({
    async start() {
      calls.push('broker:start');
    },
    stop() {
      calls.push('broker:stop');
    },
  });
  const controller = new CrowdyStudioController(
    options(provider, compute, { brokerFactory, autosaveMs: 10_000 }),
  );
  await controller.initialize();
  controller.updateFile('CLIENT', 'src/lib.rs', 'fn edited() {}');
  await controller.deployLive();

  assert.equal(provider.saves.length, 1);
  assert.deepEqual(calls, [
    'deploy:CLIENT:false',
    'poll:weather-client',
    'deploy:SERVER:false',
    'poll:weather-server',
    'requires:weather-server:weather-client',
    'enabled:weather-server:true',
    'artifact:weather-client:client-v1',
    'broker:start',
  ]);
  assert.equal(controller.getState().runtime.phase, 'RUNNING');
  controller.destroy();
});

test('with mods, the SERVER target builds the crate, deploys it as the grid\u2019s mod, enables and stops it', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  const calls = [];
  const compute = playerCompute({
    async deploy() {
      throw new Error('legacy player compute is not used with mods');
    },
    async setEnabled() {
      throw new Error('legacy player compute is not used with mods');
    },
  });
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
  const controller = new CrowdyStudioController(options(provider, compute, { mods }));
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
  const refused = new CrowdyStudioController(options(providerFor(bad), compute, { mods }));
  await refused.initialize();
  calls.length = 0;
  const r = await refused.deployLive();
  assert.equal(r.status, 'FAILED');
  assert.match(r.message, /lowercase/);
  assert.deepEqual(calls, []);
  controller.destroy();
  refused.destroy();
});

const MOD_STARTER_CARGO =
  '[package]\nname = "grid-mod"\nversion = "0.1.0"\nedition = "2024"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nckx-sdk = { path = "../../crates/ckx-sdk" }\n';

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
    ...overrides,
  };
}

/** Player compute whose every call fails: the ck-exec paths must not reach it. */
function legacyForbidden(except = {}) {
  const refuse = (what) => async () => {
    throw new Error(`legacy player compute ${what} is not used with mods`);
  };
  return playerCompute({
    deploy: refuse('deploy'),
    versions: refuse('versions'),
    setEnabled: refuse('setEnabled'),
    setRequires: refuse('setRequires'),
    invoke: refuse('invoke'),
    runs: refuse('runs'),
    logs: refuse('logs'),
    usage: refuse('usage'),
    ...except,
  });
}

test('on ck-exec a new SERVER target starts from the mod starter, named for the project', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const provider = providerFor();
  const controller = new CrowdyStudioController(
    options(provider, legacyForbidden(), { mods: execMods(calls) }),
  );
  assert.equal(controller.getState().serverEngine, 'ck-exec');
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

  // Full stack: the mod starter for SERVER, the legacy client crate for CLIENT, no pairing.
  calls.length = 0;
  const full = await controller.createProject({ name: 'Weather Tools', kind: 'FULL_STACK' });
  assert.deepEqual(calls, [['starter', '42']]);
  assert.equal(full.metadata.pairingPreference, 'NONE');
  const cargoOf = (target) =>
    full.files.find((file) => file.target === target && file.path === 'Cargo.toml').content;
  assert.match(cargoOf('SERVER'), /ckx-sdk/);
  assert.match(cargoOf('CLIENT'), /crowdy-compute-sdk = "0\.1\.8"/);

  // A CLIENT project has no SERVER target, so no starter is asked for.
  calls.length = 0;
  await controller.createProject({ name: 'Hud', kind: 'CLIENT' });
  assert.deepEqual(calls, []);

  // Names fit a mod (48 characters) and a build's crate names (a leading letter).
  const long = await controller.createProject({ name: 'x'.repeat(60), kind: 'SERVER' });
  assert.equal(long.metadata.serverModuleName, `${'x'.repeat(41)}-server`);
  const digits = await controller.createProject({ name: '3D Tools', kind: 'SERVER' });
  assert.equal(digits.metadata.serverModuleName, 'mod-3d-tools-server');
  controller.destroy();
});

test("serverEngine 'player-compute' stays selectable with mods; 'ck-exec' without mods is refused", async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const deploys = [];
  const provider = providerFor(project('SERVER'));
  const controller = new CrowdyStudioController(
    options(
      provider,
      playerCompute({
        async deploy(input) {
          deploys.push(input.target);
          return { versionId: 'server-v1' };
        },
      }),
      { mods: execMods(calls), serverEngine: 'player-compute' },
    ),
  );
  assert.equal(controller.getState().serverEngine, 'player-compute');
  await controller.initialize();
  const created = await controller.createProject({ name: 'Legacy', kind: 'SERVER' });
  assert.match(
    created.files.find((file) => file.path === 'Cargo.toml').content,
    /crowdy-compute-sdk = "0\.1\.8"/,
  );
  await controller.deployLive();
  assert.deepEqual(deploys, ['SERVER']);
  assert.deepEqual(calls, [], 'no mod call on the legacy engine');
  controller.destroy();

  assert.throws(
    () => new CrowdyStudioController(options(providerFor(), playerCompute(), { serverEngine: 'ck-exec' })),
    /needs the mods option/,
  );
  const plain = new CrowdyStudioController(options(providerFor(), playerCompute()));
  assert.equal(plain.getState().serverEngine, 'player-compute');
  plain.destroy();
});

test('on ck-exec Invoke calls the mod over one exec connection, and Logs, Runs and usage leave player compute alone', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const calls = [];
  const wallet = [];
  const controller = new CrowdyStudioController(
    options(providerFor(project('SERVER')), legacyForbidden(), {
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
  const [error, info] = controller.getState().logs;
  assert.deepEqual(
    [error.level, error.success, error.errorMessage, error.startedAt, error.runId],
    ['error', false, 'boom', '2026-09-26T00:00:02Z', 'l2'],
  );
  assert.deepEqual([info.level, info.success, info.errorMessage], ['info', true, 'visited']);

  await controller.refreshSurface('runs');
  assert.deepEqual(controller.getState().runs, []);
  await controller.refreshSurface('usage');
  assert.equal(controller.getState().usage, null, 'a SERVER-only mod spends no player compute');
  assert.equal(controller.getState().wallet.balanceCents, '250');

  controller.destroy();
  await sleep(0);
  assert.deepEqual(calls.at(-1), ['close']);
});

test('on ck-exec a full-stack project still reads player compute usage for its CLIENT compiles', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const controller = new CrowdyStudioController(
    options(providerFor(project('FULL_STACK')), legacyForbidden({ usage: playerCompute().usage }), {
      mods: execMods([]),
    }),
  );
  await controller.initialize();
  await controller.refreshSurface('usage');
  assert.equal(controller.getState().usage.gateStatus, 'active');
  controller.destroy();
});

test('on ck-exec the mod build sends only crate files, under a crate name a build accepts', async () => {
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
    options(providerFor(withAssets), legacyForbidden(), { mods: execMods(calls) }),
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

test('full-stack partial compile never mutates pairing or enables either target', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const calls = [];
  const compute = playerCompute({
    async deploy(input) {
      calls.push(`deploy:${input.target}`);
      return {
        versionId: input.target === 'CLIENT' ? 'client-v1' : 'server-v1',
      };
    },
    async versions({ name }) {
      calls.push(`poll:${name}`);
      return [{
        versionId: name.includes('client') ? 'client-v1' : 'server-v1',
        compileStatus: name.includes('server') ? 'failed' : 'succeeded',
        compileLog: name.includes('server')
          ? 'error[E0425]: missing\n --> src/lib.rs:3:7'
          : null,
      }];
    },
    async setRequires() {
      calls.push('requires');
    },
    async setEnabled() {
      calls.push('enabled');
    },
    async artifactBytes() {
      calls.push('artifact');
    },
  });
  const controller = new CrowdyStudioController(options(provider, compute));
  await controller.initialize();
  await controller.deployLive();

  assert.deepEqual(calls, [
    'deploy:CLIENT',
    'poll:weather-client',
    'deploy:SERVER',
    'poll:weather-server',
  ]);
  assert.equal(controller.getState().runtime.phase, 'COMPILE_FAILED');
  assert.equal(controller.getState().authoritativeDiagnostics[0].path, 'src/lib.rs');
  controller.destroy();
});

test('target permissions prevent unavailable authoring before deploy', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  let deploys = 0;
  const controller = new CrowdyStudioController(
    options(
      provider,
      playerCompute({
        async deploy() {
          deploys++;
          return { versionId: 'unexpected' };
        },
      }),
      {
        targetPermissions: {
          SERVER: { canWrite: false, canRun: false },
        },
      },
    ),
  );
  await controller.initialize();
  await controller.testDraft();
  assert.equal(deploys, 0);
  assert.equal(controller.getState().runtime.phase, 'ERROR');
  assert.match(
    controller.getState().runtime.message,
    /SERVER authoring is unavailable/u,
  );
  controller.destroy();
});

test('client deploy hot-swaps the exact version and stop reports partial failures', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const events = [];
  let deployNo = 0;
  const compute = playerCompute({
    async deploy(input) {
      deployNo++;
      return {
        versionId: `${input.target.toLowerCase()}-v${deployNo}`,
      };
    },
    async versions({ name }) {
      return [{
        versionId: name.includes('client')
          ? `client-v${deployNo}`
          : `server-v${deployNo}`,
        compileStatus: 'succeeded',
        compileLog: null,
      }];
    },
    async artifactBytes(input) {
      events.push(`artifact:${input.versionId}`);
      return {
        bytes: new Uint8Array([deployNo]).buffer,
        artifactHash: 'c'.repeat(64),
        fuelPerDispatch: 10n,
        versionId: input.versionId,
      };
    },
    async setEnabled(input) {
      if (!input.enabled) throw new Error('disable unavailable');
      return {};
    },
  });
  let brokerNo = 0;
  const brokerFactory = () => {
    const id = ++brokerNo;
    return {
      async start() {
        events.push(`start:${id}`);
      },
      stop() {
        events.push(`stop:${id}`);
      },
    };
  };
  const controller = new CrowdyStudioController(
    options(provider, compute, { brokerFactory }),
  );
  await controller.initialize();
  await controller.deployLive();
  await controller.deployLive();
  assert.ok(
    events.indexOf('start:2') < events.indexOf('stop:1'),
    'new broker starts before the old broker stops',
  );

  const stopped = await controller.stopProject();
  assert.equal(stopped.serverStopped, false);
  assert.equal(stopped.clientStopped, true);
  assert.match(stopped.failures[0], /disable unavailable/u);
  assert.equal(controller.getState().runtime.phase, 'PARTIAL_FAILURE');
  controller.destroy();
});

test('runs/logs/usage polling occurs only while visible and cleans up', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  let runReads = 0;
  const compute = playerCompute({
    async runs() {
      runReads++;
      return [];
    },
  });
  const controller = new CrowdyStudioController(
    options(provider, compute, { monitorPollMs: 5 }),
  );
  await controller.initialize();
  controller.setSurfaceVisible('runs', true);
  await sleep(18);
  assert.ok(runReads >= 2);
  controller.setPageVisible(false);
  const hiddenReads = runReads;
  await sleep(18);
  assert.equal(runReads, hiddenReads);
  controller.setPageVisible(true);
  await sleep(8);
  assert.ok(runReads > hiddenReads);
  controller.destroy();
  const destroyedReads = runReads;
  await sleep(12);
  assert.equal(runReads, destroyedReads);
});

test('usage, wallet, logs, runs, and invoke feed the monitoring surfaces', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor(project('SERVER'));
  const calls = [];
  const row = {
    runId: 'run-1',
    moduleName: 'weather-server',
    triggerSource: 'invoke',
    startedAt: '2026-07-23T00:00:00Z',
    durationUs: 12,
    fuelUsed: '30',
    success: true,
    errorMessage: null,
  };
  const compute = playerCompute({
    async runs(input) {
      calls.push(['runs', input]);
      return [row];
    },
    async logs(input) {
      calls.push(['logs', input]);
      return [{ ...row, success: false, errorMessage: 'trap' }];
    },
    async invoke(input) {
      calls.push(['invoke', input]);
      return { resultJson: '{"ok":true}', fuelUsed: '4', durationUs: 2 };
    },
  });
  const controller = new CrowdyStudioController(
    options(provider, compute, {
      playerWallet: {
        async balance() {
          calls.push(['wallet']);
          return { balanceCents: '250', currency: 'USD' };
        },
      },
    }),
  );
  await controller.initialize();
  await controller.refreshSurface('runs');
  await controller.refreshSurface('logs');
  await controller.refreshSurface('usage');
  const invoked = await controller.invoke('inspect', '{"x":1}');

  assert.equal(controller.getState().runs[0].runId, 'run-1');
  assert.equal(controller.getState().logs[0].errorMessage, 'trap');
  assert.equal(controller.getState().usage.gateStatus, 'active');
  assert.equal(controller.getState().wallet.balanceCents, '250');
  assert.equal(invoked.resultJson, '{"ok":true}');
  assert.deepEqual(calls.at(-1), [
    'invoke',
    {
      appId: '42',
      gridId: '500',
      moduleName: 'weather-server',
      exportName: 'inspect',
      paramsJson: '{"x":1}',
    },
  ]);
  controller.destroy();
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
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github }));
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
  const c2 = new CrowdyStudioController(options(provider, playerCompute(), { github: github2 }));
  await c2.initialize();
  await sleep(5);
  assert.throws(() => c2.createGitHubRepository(), /Connect GitHub first/);
});

test('GitHub: status is fetched on open, nothing else happens until asked', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport(CONNECTED_UNBOUND);
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github }));
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
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github, autosaveMs: 10_000 }));
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
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github, autosaveMs: 10_000 }));
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

test('GitHub: a bound project deploys the commit the mirror is at, and its files reach the provider as a normal save', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const bound = { ...project(), source: 'GITHUB', github: { owner: 'modder', repo: 'my-mod', branch: 'main', sha: SHA_A } };
  const provider = providerFor(bound);
  const deploys = [];
  const compute = playerCompute({
    async deploy(input) {
      deploys.push(input);
      return { versionId: `${input.target}-v1` };
    },
  });
  const github = githubTransport({ ...CONNECTED_UNBOUND, owner: 'modder', repo: 'my-mod', branch: 'main', githubSha: SHA_A });
  const controller = new CrowdyStudioController(options(provider, compute, { github }));
  await controller.initialize();
  await sleep(5);
  controller.updateFile('SERVER', 'src/lib.rs', 'fn committed() {}');
  await controller.saveNow();
  // The controller does not know how a bound project persists: it hands the
  // snapshot to the provider, which commits it. No putFile through the card.
  assert.equal(provider.saves.length, 1);
  assert.equal(github.calls.some(([op]) => op === 'putFile'), false);
  await controller.deployLive();
  assert.ok(deploys.length >= 1);
  for (const d of deploys) {
    assert.equal(d.projectId, 'project-1');
    assert.equal(d.commitSha, SHA_A);
    assert.equal('sourceFilesJson' in d, false);
  }
});
