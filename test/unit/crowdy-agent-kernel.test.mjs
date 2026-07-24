import test from 'node:test';
import assert from 'node:assert/strict';

function project(revision = '1', content = 'pub fn original() {}') {
  return {
    projectId: 'project-1',
    appId: 'app-1',
    gridId: 'grid-1',
    kind: 'SERVER',
    metadata: {
      name: 'Agent project',
      serverModuleName: 'agent-project',
      pairingPreference: 'NONE',
    },
    files: [
      { target: 'SERVER', path: 'Cargo.toml', content: '[package]\nname="agent"' },
      { target: 'SERVER', path: 'src/lib.rs', content },
    ],
    sdkVersion: '0.1.5',
    abiVersion: 0,
    revision: {
      id: revision,
      savedAt: '2026-07-23T20:00:00Z',
    },
    createdAt: '2026-07-23T20:00:00Z',
    updatedAt: '2026-07-23T20:00:00Z',
  };
}

function provider() {
  let current = project();
  let revision = 1;
  const saves = [];
  const atomicWrites = [];
  const checkpoints = [];
  const snapshots = new Map();
  const checkpoint = (snapshot, reason, id) => ({
    checkpointId: id,
    projectRevisionId: snapshot.revision.id,
    contentHash: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    reason,
    files: snapshot.files.map((file, index) => ({
      target: file.target,
      path: file.path,
      contentHash: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
      byteLength: Buffer.byteLength(file.content),
    })),
    createdAt: '2026-07-23T20:00:00Z',
  });
  const synchronizationProvider = {
    async applyAtomicPatch(input) {
      atomicWrites.push(structuredClone(input));
      const before = structuredClone(current);
      const metadata = checkpoint(
        before,
        'AGENT_WRITE',
        `checkpoint-${atomicWrites.length}`,
      );
      snapshots.set(metadata.checkpointId, before);
      checkpoints.push(metadata);
      const files = structuredClone(current.files);
      for (const change of input.changes) {
        const index = files.findIndex(
          (file) => file.target === change.target && file.path === change.path,
        );
        if (index >= 0) files[index].content = change.content;
        else files.push({
          target: change.target,
          path: change.path,
          content: change.content,
        });
      }
      revision += 1;
      current = {
        ...current,
        files,
        revision: {
          id: String(revision),
          savedAt: `2026-07-23T20:00:0${revision}Z`,
        },
        updatedAt: `2026-07-23T20:00:0${revision}Z`,
      };
      return {
        project: structuredClone(current),
        checkpoint: structuredClone(metadata),
        changedFiles: metadata.files,
      };
    },
    async listCheckpoints() {
      return structuredClone(checkpoints);
    },
    async restoreCheckpoint(input) {
      const snapshot = snapshots.get(input.checkpointId);
      if (!snapshot) throw new Error('checkpoint not found');
      const preimage = checkpoint(
        structuredClone(current),
        'RESTORE_PREIMAGE',
        `pre-restore-${checkpoints.length + 1}`,
      );
      checkpoints.push(preimage);
      revision += 1;
      current = {
        ...structuredClone(snapshot),
        revision: {
          id: String(revision),
          savedAt: `2026-07-23T20:00:0${revision}Z`,
        },
        updatedAt: `2026-07-23T20:00:0${revision}Z`,
      };
      return {
        project: structuredClone(current),
        preRestoreCheckpoint: structuredClone(preimage),
      };
    },
  };
  return {
    saves,
    atomicWrites,
    synchronizationProvider,
    async listProjects() {
      return [{
        projectId: current.projectId,
        name: current.metadata.name,
        kind: current.kind,
        revisionId: current.revision.id,
        serverModuleName: current.metadata.serverModuleName,
        updatedAt: current.updatedAt,
      }];
    },
    async getProject() {
      return structuredClone(current);
    },
    async createProject() {
      return structuredClone(current);
    },
    async saveProject(input) {
      saves.push(structuredClone(input));
      revision += 1;
      current = {
        ...current,
        metadata: structuredClone(input.metadata),
        files: structuredClone(input.files),
        revision: {
          id: String(revision),
          savedAt: `2026-07-23T20:00:0${revision}Z`,
        },
        updatedAt: `2026-07-23T20:00:0${revision}Z`,
      };
      return structuredClone(current);
    },
    async listPersonalLibraryFiles() {
      return [];
    },
    async listCommonFiles() {
      return [];
    },
    async importReferenceFile() {
      return structuredClone(current);
    },
    async savePersonalLibraryFile() {
      throw new Error('not used');
    },
  };
}

function compute() {
  return {
    async deploy() {
      return { versionId: 'version-1' };
    },
    async versions() {
      return [{
        versionId: 'version-1',
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
    async artifactBytes() {
      throw new Error('not used');
    },
    async usage() {
      return {
        hourUnitsUsed: '1',
        dayUnitsUsed: '1',
        unitsPerHour: '100',
        unitsPerDay: '1000',
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
      return { resultJson: '{}' };
    },
  };
}

function options(projectProvider) {
  return {
    projectProvider,
    synchronizationProvider: projectProvider.synchronizationProvider,
    playerCompute: compute(),
    appId: 'app-1',
    gridId: 'grid-1',
    autosaveMs: 10_000,
    sleep: async () => {},
  };
}

test('kernel applies multi-file patches atomically and restores checkpoint pre-images', async () => {
  const { CrowdyStudioController, sha256Digest } = await import(
    '../../dist/index.js'
  );
  const store = provider();
  const controller = new CrowdyStudioController(options(store));
  await controller.initialize();
  const before = controller.fileContent({
    source: 'PROJECT',
    target: 'SERVER',
    path: 'src/lib.rs',
  });

  await assert.rejects(
    controller.applyAtomicPatch({
      expectedRevisionId: '1',
      changes: [
        {
          target: 'SERVER',
          path: 'src/lib.rs',
          operation: 'REPLACE',
          content: 'pub fn changed() {}',
          expectedContentHash: sha256Digest(before),
        },
        {
          target: 'SERVER',
          path: 'src/new.rs',
          operation: 'REPLACE',
          content: 'pub fn new() {}',
          expectedContentHash: `sha256:${'0'.repeat(64)}`,
        },
      ],
    }),
    /no longer exists/,
  );
  assert.equal(store.atomicWrites.length, 0, 'validation failure writes no files');
  assert.equal(
    controller.fileContent({
      source: 'PROJECT',
      target: 'SERVER',
      path: 'src/lib.rs',
    }),
    before,
  );

  const result = await controller.applyAtomicPatch({
    expectedRevisionId: '1',
    changes: [
      {
        target: 'SERVER',
        path: 'src/lib.rs',
        operation: 'REPLACE',
        content: 'pub fn changed() {}',
        expectedContentHash: sha256Digest(before),
      },
      {
        target: 'SERVER',
        path: 'src/new.rs',
        operation: 'CREATE',
        content: 'pub fn new() {}',
        expectedContentHash: 'ABSENT',
      },
    ],
  });
  assert.equal(store.atomicWrites.length, 1);
  assert.equal(result.project.revision.id, '2');
  assert.equal(controller.getState().checkpoints.length, 1);
  assert.equal(controller.getState().saveState, 'SAVED');

  await controller.restoreCheckpoint(
    result.checkpoint.checkpointId,
    'opaque-approval-grant',
    '2',
  );
  assert.equal(store.atomicWrites.length, 1);
  assert.equal(
    controller.fileContent({
      source: 'PROJECT',
      target: 'SERVER',
      path: 'src/lib.rs',
    }),
    before,
  );
  assert.equal(
    controller.getState().project.files.some((file) => file.path === 'src/new.rs'),
    false,
  );
  controller.destroy();
});

test('agent preparation flushes autosave and human edits preempt synchronously', async () => {
  const { CrowdyStudioController } = await import('../../dist/index.js');
  const store = provider();
  const controller = new CrowdyStudioController(options(store));
  await controller.initialize();
  const signals = [];
  controller.onHumanEdit(() => signals.push('preempt'));

  controller.updateFile('SERVER', 'src/lib.rs', 'pub fn human() {}');
  assert.deepEqual(signals, ['preempt']);
  const context = await controller.prepareForAgentWork();
  assert.equal(store.saves.length, 1);
  assert.equal(context.projectRevisionId, '2');
  assert.equal(controller.getState().agentActivity, 'WORKING');

  controller.updateSettings({ description: 'human edit during agent work' });
  assert.equal(controller.getState().agentActivity, 'PAUSED');
  assert.deepEqual(signals, ['preempt', 'preempt']);
  controller.destroy();
});

test('saved-versus-running state becomes stale and dirty human state blocks agent sync', async () => {
  const {
    CrowdyStudioController,
    CrowdyStudioRevisionConflictError,
  } = await import('../../dist/index.js');
  const store = provider();
  const controller = new CrowdyStudioController(options(store));
  await controller.initialize();
  const deployed = await controller.testDraft();
  assert.equal(deployed.status, 'RUNNING');
  assert.equal(controller.getState().runtimeSync.state, 'RUNNING_SAVED');

  controller.updateFile('SERVER', 'src/lib.rs', 'pub fn newer() {}');
  assert.equal(controller.getState().runtimeSync.state, 'RUNNING_STALE');
  assert.throws(
    () =>
      controller.synchronizeProject(project('9', 'pub fn remote() {}'), {
        source: 'AGENT',
        expectedPreviousRevisionId: '1',
      }),
    CrowdyStudioRevisionConflictError,
  );
  assert.equal(controller.getState().saveState, 'CONFLICT');
  controller.destroy();
});
