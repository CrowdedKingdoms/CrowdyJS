import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isCurrentDiagnosticVersion,
  mountLiveCodingIDE,
} from '../../dist/live-coding/ide.js';
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
      queueMicrotask(() =>
        this.emit('message', {
          data: {
            jsonrpc: '2.0',
            id: message.id,
            result:
              message.method === 'initialize'
                ? { capabilities: {} }
                : null,
          },
        }),
      );
    }
  }

  terminate() {
    this.terminated++;
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test('worker transport supports request/response and deterministic teardown', async () => {
  const worker = new FakeWorker();
  const client = new WorkerLanguageClient(worker, { requestTimeoutMs: 30 });
  await client.initialize({ rootUri: 'file:///player-mod' });
  assert.equal(worker.sent[0].method, 'initialize');
  assert.equal(worker.sent[1].method, 'initialized');
  client.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(worker.sent.some((message) => message.method === 'shutdown'));
  assert.ok(worker.sent.some((message) => message.method === 'exit'));
  assert.equal(worker.terminated, 1);
  client.dispose();
  assert.equal(worker.terminated, 1);
});

test('worker requests time out, cancel, and reject malformed replies', async () => {
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

  const malformedWorker = new FakeWorker();
  malformedWorker.respond = false;
  const malformedClient = new WorkerLanguageClient(malformedWorker, {
    requestTimeoutMs: 100,
  });
  const pending = malformedClient.request('textDocument/completion', {});
  malformedWorker.emit('message', { data: '{not-json' });
  await assert.rejects(pending, /Parse error/u);
  malformedClient.dispose();
});

test('reader ignores malformed notifications without throwing', () => {
  const worker = new FakeWorker();
  const reader = new WorkerMessageReader(worker);
  const errors = [];
  reader.onError((error) => errors.push(error.message));
  const subscription = reader.listen(() => assert.fail('must not dispatch'));
  worker.emit('message', { data: { jsonrpc: '1.0', method: 'bad' } });
  assert.deepEqual(errors, ['Invalid Request']);
  subscription.dispose();
});

test('IDE has no token, websocket, or server-authoring path', async () => {
  const [source, workerSource, transportSource, driftSource, packageJson] =
    await Promise.all([
      readFile(new URL('../../src/live-coding/ide.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../../src/live-coding/rust-lsp.worker.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../src/live-coding/worker-transport.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../scripts/sync-browser-authoring-index.mjs', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ]);
  const packageMetadata = JSON.parse(packageJson);
  assert.doesNotMatch(source, /appToken|languageServiceUrl|authenticatedSocket/u);
  assert.doesNotMatch(source, /\bWebSocket\b|wss:|fetch\(/u);
  assert.doesNotMatch(workerSource, /token|WebSocket|wss:|fetch\(/u);
  assert.doesNotMatch(packageJson, /vscode-ws-jsonrpc|monaco-languageclient/u);
  assert.match(packageJson, /"vscode-jsonrpc": "8\.2\.0"/u);
  assert.match(packageJson, /"vscode-languageserver-protocol": "3\.17\.5"/u);
  assert.match(transportSource, /createProtocolConnection/u);
  assert.match(workerSource, /server\.observeIncoming\(event\.data\)/u);
  assert.doesNotMatch(driftSource, /cks-game-api/u);
  assert.match(driftSource, /argumentValue\('--source'\)/u);
  assert.doesNotMatch(
    packageMetadata.scripts.build,
    /authoring-index:drift|sync-browser-authoring-index/u,
  );
  assert.ok(
    source.indexOf('loadPlatformIndex(options.platformIndex)') <
      source.indexOf('await languageClient.initialize'),
    'custom indexes are bounded and verified before worker postMessage',
  );
  assert.equal(source.match(/monaco\.editor\.create\(editorHost/gu)?.length, 1);
  assert.equal(source.match(/createDefaultRustLanguageWorker\(\)/gu)?.length, 1);
});

test('diagnostic versions must match the current Monaco model', () => {
  assert.equal(isCurrentDiagnosticVersion(7, 7), true);
  assert.equal(isCurrentDiagnosticVersion(undefined, 7), true);
  assert.equal(isCurrentDiagnosticVersion(6, 7), false);
  assert.equal(isCurrentDiagnosticVersion(null, 7), false);
  assert.equal(isCurrentDiagnosticVersion('7', 7), false);
});

test('IDE falls back to the textarea when Worker is unavailable', async () => {
  const previousDocument = globalThis.document;
  const previousWorker = globalThis.Worker;
  const document = fakeDocument();
  globalThis.document = document;
  delete globalThis.Worker;
  const host = document.createElement('host');
  const playerCompute = {
    deploy: async () => ({ versionId: '1' }),
    setEnabled: async () => ({}),
    usage: async () => ({
      hourUnitsUsed: '0',
      unitsPerHour: null,
      compilesThisHour: 0,
      maxCompilesPerHour: 1,
      gateStatus: 'active',
      gateReason: null,
    }),
    runs: async () => [],
    logs: async () => [],
    versions: async () => [],
    artifactBytes: async () => ({ bytes: new ArrayBuffer(0) }),
  };
  try {
    const handle = await mountLiveCodingIDE(host, {
      playerCompute,
      appId: '1',
      gridId: '2',
      grid: {
        low: { x: 0n, y: 0n, z: 0n },
        high: { x: 1n, y: 1n, z: 1n },
      },
      workerUrl: 'glue.js',
      onHostCall: async () => ({ ok: true }),
    });
    assert.equal(host.children[0].className, 'ck-live-coding');
    assert.ok(
      host.children[0].children.some(
        (element) => element.className === 'ck-live-coding-editor',
      ),
    );
    handle.destroy();
    assert.equal(host.children.length, 0);
  } finally {
    globalThis.document = previousDocument;
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

function fakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

class FakeElement {
  children = [];
  className = '';
  value = '';
  textContent = '';
  rows = 0;
  parent = null;

  constructor(tagName) {
    this.tagName = tagName;
  }

  set innerHTML(_value) {
    this.children = [];
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  addEventListener() {}

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}
