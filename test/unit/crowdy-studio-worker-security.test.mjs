import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCurrentDiagnosticVersion } from '../../dist/crowdy-studio/monaco-editor.js';
import { mountCrowdyStudio } from '../../dist/crowdy-studio/mount.js';
import {
  WorkerLanguageClient,
  WorkerMessageReader,
} from '../../dist/live-coding/worker-transport.js';

class FakeWorker {
  listeners = new Map();
  sent = [];
  terminated = 0;
  respond = true;

  addEventListener(type, listener) {
    let listeners = this.listeners.get(type);
    if (!listeners) this.listeners.set(type, (listeners = new Set()));
    listeners.add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(message) {
    this.sent.push(message);
    if (this.respond && 'id' in message) {
      queueMicrotask(() => this.emit('message', {
        data: {
          jsonrpc: '2.0',
          id: message.id,
          result: message.method === 'initialize' ? { capabilities: {} } : null,
        },
      }));
    }
  }
  terminate() {
    this.terminated++;
  }
  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

/**
 * Poll until a condition holds, or fail loudly at the deadline.
 *
 * The alternative used here before was a fixed `setTimeout(0)`, which asserts a
 * particular number of event-loop hops rather than the thing actually wanted. A
 * deadline that fails is honest about being a timing assumption; a fixed tick
 * that passes today is a flake waiting for an unrelated change.
 */
async function until(condition, { timeoutMs = 2000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test('worker transport requests, timeout cancellation, and teardown are bounded', async () => {
  const worker = new FakeWorker();
  const client = new WorkerLanguageClient(worker, { requestTimeoutMs: 30 });
  await client.initialize({ rootUri: 'file:///player-mod' });
  assert.deepEqual(
    worker.sent.slice(0, 2).map((message) => message.method),
    ['initialize', 'initialized'],
  );
  const failures = [];
  const failureSubscription = client.onError((error) =>
    failures.push(error.message),
  );
  worker.emit('error', { message: 'worker crashed' });
  assert.deepEqual(failures, ['worker crashed']);
  failureSubscription.dispose();
  client.shutdown();
  // Waited FOR rather than waited OUT. `shutdown()` sends `shutdown`, and only
  // once that request settles does its `finally` send `exit` -- two promise
  // chains deep, through vscode-jsonrpc. A single `setTimeout(0)` drains the
  // microtasks pending at that instant and nothing more, so whether `exit` had
  // been written depended on how many hops the runtime happened to need. It
  // passed reliably until an unrelated module joined the import graph and
  // shifted the timing, which is the way these fail: on somebody else's change.
  await until(() => worker.sent.some((message) => message.method === 'exit'));
  assert.ok(worker.sent.some((message) => message.method === 'shutdown'));
  assert.equal(worker.terminated, 1);

  const timeoutWorker = new FakeWorker();
  timeoutWorker.respond = false;
  const timeoutClient = new WorkerLanguageClient(timeoutWorker, {
    requestTimeoutMs: 10,
  });
  await assert.rejects(
    timeoutClient.request('textDocument/hover', {}),
    /timed out/u,
  );
  assert.ok(
    timeoutWorker.sent.some((message) => message.method === '$/cancelRequest'),
  );
  timeoutClient.dispose();
});

test('reader rejects malformed worker messages without dispatch', () => {
  const worker = new FakeWorker();
  const reader = new WorkerMessageReader(worker);
  const errors = [];
  reader.onError((error) => errors.push(error.message));
  const subscription = reader.listen(() => assert.fail('must not dispatch'));
  worker.emit('message', { data: { jsonrpc: '1.0', method: 'bad' } });
  assert.deepEqual(errors, ['Invalid Request']);
  subscription.dispose();
});

test('Crowdy Studio language path is local-only and old exports stay removed', async () => {
  const [editorSource, workerSource, transportSource, packageJson, rootSource] =
    await Promise.all([
      readFile(new URL('../../src/crowdy-studio/monaco-editor.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/live-coding/rust-lsp.worker.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../src/live-coding/worker-transport.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../../src/index.ts', import.meta.url), 'utf8'),
    ]);
  for (const source of [editorSource, workerSource]) {
    assert.doesNotMatch(
      source,
      /appToken|languageServiceUrl|authenticatedSocket|\bWebSocket\b|wss:|fetch\(/u,
    );
  }
  assert.match(transportSource, /createProtocolConnection/u);
  assert.match(workerSource, /server\.observeIncoming\(event\.data\)/u);
  assert.doesNotMatch(packageJson, /vscode-ws-jsonrpc|monaco-languageclient/u);
  const metadata = JSON.parse(packageJson);
  assert.equal(metadata.exports['./live-coding'], undefined);
  assert.ok(metadata.exports['./crowdy-studio']);
  assert.equal(metadata.exports[`./${['mod', 'studio'].join('-')}`], undefined);
  for (const removed of [
    'mountLiveCodingIDE',
    'mountLiveCoding',
    'LiveCodingController',
    'MountLiveCodingOptions',
    'draftByDefault',
    'PLAYER_CODE_TEMPLATES',
    ['mount', 'Mod', 'Studio'].join(''),
    ['Mod', 'Studio', 'Controller'].join(''),
    ['Mount', 'Mod', 'Studio', 'Options'].join(''),
  ]) {
    assert.doesNotMatch(rootSource, new RegExp(removed, 'u'));
  }
  const sdk = await import('../../dist/index.js');
  assert.equal(sdk.mountLiveCodingIDE, undefined);
  assert.equal(sdk.mountLiveCoding, undefined);
  assert.equal(sdk.LiveCodingController, undefined);
  assert.equal(sdk[['mount', 'Mod', 'Studio'].join('')], undefined);
  assert.equal(sdk[['Mod', 'Studio', 'Controller'].join('')], undefined);
  assert.equal(typeof sdk.mountCrowdyStudio, 'function');
  assert.equal(typeof sdk.CrowdyStudioController, 'function');
});

test('diagnostic versions must match the current Monaco model', () => {
  assert.equal(isCurrentDiagnosticVersion(7, 7), true);
  assert.equal(isCurrentDiagnosticVersion(undefined, 7), true);
  assert.equal(isCurrentDiagnosticVersion(6, 7), false);
  assert.equal(isCurrentDiagnosticVersion(null, 7), false);
  assert.equal(isCurrentDiagnosticVersion('7', 7), false);
});

test('mount fallback edits one target file instead of a JSON blob', async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Worker: globalThis.Worker,
  };
  const fakeDocument = new FakeDocument();
  globalThis.document = fakeDocument;
  globalThis.window = { prompt: () => null, confirm: () => true };
  delete globalThis.Worker;
  const host = fakeDocument.createElement('host');
  const cloudProject = sampleProject();
  const provider = sampleProvider(cloudProject);
  try {
    const handle = await mountCrowdyStudio(host, {
      projectProvider: provider,
      playerCompute: sampleCompute(),
      appId: '1',
      gridId: '2',
    });
    assert.equal(handle.editorMode, 'textarea');
    for (const label of [
      'Test draft',
      'Deploy live',
      'Stop project',
      'Problems',
      'Build',
      'Logs',
      'Runs',
      'Invoke',
    ]) {
      assert.ok(findByText(host, label), `${label} surface should be mounted`);
    }
    const textarea = findByClass(host, 'ck-crowdy-studio-textarea');
    assert.ok(textarea);
    assert.equal(textarea.dataset.target, 'SERVER');
    assert.equal(textarea.dataset.path, 'src/lib.rs');
    assert.equal(textarea.value, 'fn server() {}');
    assert.doesNotMatch(textarea.value, /^\s*\{/u);

    handle.controller.openFile({
      source: 'PROJECT',
      target: 'CLIENT',
      path: 'src/lib.rs',
    });
    assert.equal(textarea.dataset.target, 'CLIENT');
    textarea.value = 'fn changed_client() {}';
    textarea.emit('input', { target: textarea });
    assert.equal(
      handle.controller.fileContent({
        source: 'PROJECT',
        target: 'CLIENT',
        path: 'src/lib.rs',
      }),
      'fn changed_client() {}',
    );
    handle.destroy();
    assert.equal(host.children.length, 0);
  } finally {
    restoreGlobal('document', previous.document);
    restoreGlobal('window', previous.window);
    restoreGlobal('Worker', previous.Worker);
  }
});

test('mount derives the selected project for BUILD and fences project switches', async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Worker: globalThis.Worker,
  };
  const fakeDocument = new FakeDocument();
  globalThis.document = fakeDocument;
  globalThis.window = { prompt: () => null, confirm: () => true };
  delete globalThis.Worker;
  const host = fakeDocument.createElement('host');
  const first = sampleProject();
  const second = {
    ...structuredClone(first),
    projectId: 'p2',
    metadata: { ...first.metadata, name: 'Second project' },
  };
  const base = sampleProvider(first);
  const provider = {
    ...base,
    async listProjects() {
      return [first, second].map((project) => ({
        projectId: project.projectId,
        name: project.metadata.name,
        kind: project.kind,
        revisionId: project.revision.id,
        serverModuleName: project.metadata.serverModuleName,
        clientModuleName: project.metadata.clientModuleName,
        updatedAt: project.updatedAt,
      }));
    },
    async getProject({ projectId }) {
      return structuredClone(projectId === 'p2' ? second : first);
    },
  };
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
  } = await import('../../dist/crowdy-agent/index.js');
  let createInput;
  let currentSession;
  const transport = {
    async getSession() {
      return structuredClone(currentSession);
    },
    async listSessions() {
      return {
        edges: [],
        pageInfo: { hasNextPage: false },
        nodes: [],
        hasNextPage: false,
      };
    },
    async history() {
      return {
        edges: [],
        pageInfo: { hasNextPage: false },
        events: [],
        hasMore: false,
      };
    },
    async toolDescriptors() {
      return {
        registryDigest: registry.registryDigest,
        tools: registry.list(),
      };
    },
    async budget() {
      return { dimensions: [], platformFunded: true, payer: 'PLATFORM' };
    },
    async createSession(input) {
      createInput = structuredClone(input);
      currentSession = {
        contractVersion: 'crowdy.studio-agent/1',
        sessionId: 'session-project',
        appId: input.appId,
        projectId: input.projectId,
        gridId: input.gridId,
        mode: input.mode,
        status: 'ACTIVE',
        requestedModel: 'fake/model',
        providerDataConsent: false,
        registryDigest: registry.registryDigest,
        providerPolicyVersion: 'provider-1',
        appPolicyVersion: 'app-1',
        contextVersion: 'context-1',
        currentClientEpoch: '0',
        lastEventSeq: '0',
        activeLeases: [],
        createdAt: '2026-07-24T00:00:00Z',
        updatedAt: '2026-07-24T00:00:00Z',
      };
      return structuredClone(currentSession);
    },
    async attachClient() {
      currentSession = {
        ...currentSession,
        currentClientEpoch: '1',
        clientEpoch: '1',
      };
      return {
        session: structuredClone(currentSession),
        clientEpoch: '1',
        replayAfterSeq: '0',
      };
    },
    async acknowledgeEvents({ throughSeq }) {
      return { throughSeq };
    },
    async heartbeat() {
      return { serverTime: new Date().toISOString() };
    },
    async sendMessage() {
      throw new Error('not used');
    },
    async setMode() {
      return structuredClone(currentSession);
    },
    async approveTool() {
      throw new Error('not used');
    },
    async rejectTool() {
      throw new Error('not used');
    },
    async toolResult() {
      throw new Error('not used');
    },
    async grantLease() {
      throw new Error('not used');
    },
    async revokeLease() {
      throw new Error('not used');
    },
    async pause() {
      return structuredClone(currentSession);
    },
    async resume() {
      return structuredClone(currentSession);
    },
    async cancelRun() {
      throw new Error('not used');
    },
    async closeSession() {
      return structuredClone(currentSession);
    },
    subscribeEvents() {
      return { close() {} };
    },
  };
  try {
    const handle = await mountCrowdyStudio(host, {
      projectProvider: provider,
      playerCompute: sampleCompute(),
      appId: '1',
      gridId: '2',
      agent: {
        transport,
        createSession: {
          appId: '1',
          projectId: 'caller-guess-is-ignored',
          mode: 'BUILD',
          idempotencyKey: 'create-bound-session',
        },
      },
    });
    assert.equal(createInput.projectId, 'p1');
    assert.equal(createInput.gridId, '2');
    assert.equal(handle.agent.getState().session.projectId, 'p1');

    await handle.controller.switchProject('p2');
    assert.equal(handle.agent.getState().connection, 'ERROR');
    assert.equal(
      handle.agent.getState().lastError.code,
      'AGENT_CONTEXT_CHANGED',
    );
    handle.destroy();
  } finally {
    restoreGlobal('document', previous.document);
    restoreGlobal('window', previous.window);
    restoreGlobal('Worker', previous.Worker);
  }
});

function sampleProject() {
  return {
    projectId: 'p1',
    appId: '1',
    gridId: '2',
    kind: 'FULL_STACK',
    metadata: {
      name: 'Example',
      serverModuleName: 'example-server',
      clientModuleName: 'example-client',
      pairingPreference: 'REQUIRED',
    },
    files: [
      { target: 'SERVER', path: 'src/lib.rs', content: 'fn server() {}' },
      { target: 'CLIENT', path: 'src/lib.rs', content: 'fn client() {}' },
    ],
    revision: { id: 'r1', savedAt: '2026-07-23T00:00:00Z' },
    createdAt: '2026-07-23T00:00:00Z',
    updatedAt: '2026-07-23T00:00:00Z',
  };
}

function sampleProvider(project) {
  return {
    async listProjects() {
      return [{
        projectId: project.projectId,
        name: project.metadata.name,
        kind: project.kind,
        revisionId: project.revision.id,
        serverModuleName: project.metadata.serverModuleName,
        clientModuleName: project.metadata.clientModuleName,
        updatedAt: project.updatedAt,
      }];
    },
    async getProject() {
      return structuredClone(project);
    },
    async createProject() {
      return structuredClone(project);
    },
    async saveProject(input) {
      return {
        ...structuredClone(project),
        metadata: structuredClone(input.metadata),
        files: structuredClone(input.files),
        revision: { id: 'r2', savedAt: project.updatedAt },
      };
    },
    async listPersonalLibraryFiles() {
      return [];
    },
    async listCommonFiles() {
      return [];
    },
  };
}

function sampleCompute() {
  return {
    async deploy() { return { versionId: 'v1' }; },
    async versions() { return []; },
    async setEnabled() {},
    async setRequires() {},
    async artifactBytes() {
      return {
        bytes: new ArrayBuffer(1),
        artifactHash: 'a',
        fuelPerDispatch: 1n,
        versionId: 'v1',
      };
    },
    async usage() {
      return {
        hourUnitsUsed: '0',
        dayUnitsUsed: '0',
        unitsPerHour: null,
        unitsPerDay: null,
        compilesThisHour: 0,
        maxCompilesPerHour: 1,
        gateStatus: 'active',
        gateReason: null,
      };
    },
    async runs() { return []; },
    async logs() { return []; },
    async invoke() { return {}; },
  };
}

class FakeDocument {
  activeElement = null;
  visibilityState = 'visible';
  listeners = new Map();
  body;

  constructor() {
    this.body = new FakeElement('body', this);
  }
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
  addEventListener(type, listener) {
    let values = this.listeners.get(type);
    if (!values) this.listeners.set(type, (values = new Set()));
    values.add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

class FakeElement {
  children = [];
  className = '';
  dataset = {};
  attributes = new Map();
  listeners = new Map();
  parent = null;
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  readOnly = false;
  required = false;
  rows = 0;
  style = {};

  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  append(...children) {
    for (const child of children) this.appendChild(child);
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...children);
  }
  addEventListener(type, listener) {
    let values = this.listeners.get(type);
    if (!values) this.listeners.set(type, (values = new Set()));
    values.add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault() {}, stopPropagation() {}, ...event });
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

function findByClass(root, className) {
  if (root.className === className) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findByText(root, text) {
  if (root.textContent === text) return root;
  for (const child of root.children) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

function restoreGlobal(key, value) {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
}
