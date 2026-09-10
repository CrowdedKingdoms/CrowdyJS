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
  return {
    saves,
    imports,
    librarySaves,
    async listProjects() {
      return [{
        projectId: current.projectId,
        name: current.metadata.name,
        kind: current.kind,
        revisionId: current.revision.id,
        serverModuleName: current.metadata.serverModuleName,
        clientModuleName: current.metadata.clientModuleName,
        updatedAt: current.updatedAt,
      }];
    },
    async getProject() {
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
      const files = JSON.parse(input.sourceFilesJson);
      assert.deepEqual(Object.keys(files).sort(), ['Cargo.toml', 'src/lib.rs']);
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

// ----- GitHub repository loop -------------------------------------------------

function githubTransport(initialStatus) {
  let status = { ...initialStatus };
  const calls = [];
  let files = {
    'server/src/lib.rs': { content: 'fn server() {}', sha: 's1' },
    'client/src/lib.rs': { content: 'fn client() {}', sha: 'c1' },
    'crowdy.json': { content: '{"server":"server","client":"client"}', sha: 'j1' },
  };
  return {
    calls,
    get files() {
      return files;
    },
    setRemote(next) {
      files = next;
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
      status = { ...status, owner: input.owner, repo: input.repo, branch: input.branch ?? 'main', autosave: false };
      return { ...status };
    },
    async unbind(input) {
      calls.push(['unbind', input]);
      status = { ...status, owner: null, repo: null, branch: null, autosave: false };
      return { ...status };
    },
    async setAutosave(input) {
      calls.push(['setAutosave', input]);
      status = { ...status, autosave: input.autosave };
      return { ...status };
    },
    async tree(input) {
      calls.push(['tree', input]);
      const dirs = new Set();
      const out = [];
      for (const path of Object.keys(files)) {
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
        out.push({ path, type: 'blob', sha: files[path].sha, size: 1 });
      }
      for (const d of dirs) out.push({ path: d, type: 'tree', sha: null, size: null });
      return out;
    },
    async getFile(input) {
      calls.push(['getFile', input]);
      const f = files[input.path];
      if (!f) throw new Error('missing');
      return { path: input.path, content: f.content, sha: f.sha };
    },
    async putFile(input) {
      calls.push(['putFile', input]);
      files[input.path] = { content: input.content, sha: `${input.path}-v2` };
      return { path: input.path, content: input.content, sha: `${input.path}-v2` };
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
  autosave: false,
  installUrl: 'https://github.com/settings/installations/1',
};

test('GitHub: status is fetched on open, nothing is pulled or pushed until asked', async () => {
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

test('GitHub: bind is owner/repo@branch scoped to the project; autosave stays off; saves do not push', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport(CONNECTED_UNBOUND);
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github }));
  await controller.initialize();
  await sleep(5);

  await assert.rejects(() => controller.bindGitHubRepo('nonsense'), /owner\/repo/);
  await controller.bindGitHubRepo('modder/my-mod@trunk');
  const bind = github.calls.find(([op]) => op === 'bind')[1];
  assert.deepEqual(bind, { appId: '42', projectId: 'project-1', owner: 'modder', repo: 'my-mod', branch: 'trunk' });
  assert.equal(controller.getState().github.autosave, false);

  controller.updateFile('SERVER', 'src/lib.rs', 'fn edited() {}');
  await controller.saveNow();
  assert.equal(provider.saves.length, 1);
  assert.equal(github.calls.some(([op]) => op === 'putFile'), false, 'no push without opt-in');
});

test('GitHub: once opted in, a save pushes the changed files through the project scope', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport({ ...CONNECTED_UNBOUND, owner: 'modder', repo: 'my-mod', branch: 'main' });
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github }));
  await controller.initialize();
  await sleep(5);

  await controller.setGitHubAutosave(true);
  assert.equal(controller.getState().github.autosave, true);
  controller.updateFile('SERVER', 'src/lib.rs', 'fn pushed() {}');
  await controller.saveNow();
  await sleep(20);
  const puts = github.calls.filter(([op]) => op === 'putFile').map(([, i]) => i);
  assert.ok(puts.some((p) => p.path === 'server/src/lib.rs' && p.content === 'fn pushed() {}'));
  for (const p of puts) {
    assert.equal(p.appId, '42');
    assert.equal(p.projectId, 'project-1');
    assert.equal('owner' in p, false);
  }
});

test('GitHub: pull overlays the repo, saves once, and refuses over unsaved edits', async () => {
  const { CrowdyStudioController } = await loadSdk();
  const provider = providerFor();
  const github = githubTransport({ ...CONNECTED_UNBOUND, owner: 'modder', repo: 'my-mod', branch: 'main' });
  const controller = new CrowdyStudioController(options(provider, playerCompute(), { github, autosaveMs: 10_000 }));
  await controller.initialize();
  await sleep(5);

  controller.updateFile('SERVER', 'src/lib.rs', 'fn dirty() {}');
  assert.equal(await controller.pullFromGitHub(), false);
  assert.match(controller.getState().githubMessage, /Save Studio edits/);
  await controller.saveNow();

  github.setRemote({
    'crowdy.json': { content: '{"server":"server","client":"client"}', sha: 'j1' },
    'server/src/lib.rs': { content: 'fn from_github() {}', sha: 's9' },
  });
  const before = provider.saves.length;
  assert.equal(await controller.pullFromGitHub(), true);
  const state = controller.getState();
  assert.equal(state.project.files.find((f) => f.target === 'SERVER' && f.path === 'src/lib.rs').content, 'fn from_github() {}');
  assert.equal(provider.saves.length, before + 1, 'pull persists exactly one save');
  assert.equal(github.calls.filter(([op]) => op === 'putFile').length, 0, 'a pull never pushes back');
});
