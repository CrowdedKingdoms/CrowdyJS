import test from 'node:test';
import assert from 'node:assert/strict';
import { EMBEDDED_PLATFORM_INDEX } from '../../dist/live-coding/platform-index.js';
import { RustAnalysis } from '../../dist/live-coding/rust-analysis.js';
import {
  MAX_PENDING_LSP_REQUESTS,
  RustLspServer,
} from '../../dist/live-coding/rust-lsp-server.js';

const assets = new URL('../../dist/live-coding/assets/', import.meta.url);
const parserWasmUrl = new URL('web-tree-sitter.wasm', assets).pathname;
const grammarWasmUrl = new URL('tree-sitter-rust.wasm', assets).pathname;

function createServer(messages, overrides = {}) {
  return new RustLspServer({
    postMessage: (message) => messages.push(message),
    diagnosticDebounceMs: 5,
    requestTimeoutMs: 500,
    createAnalysis: (platformIndex) =>
      RustAnalysis.create({ parserWasmUrl, grammarWasmUrl, platformIndex }),
    ...overrides,
  });
}

const request = (id, method, params) => ({
  jsonrpc: '2.0',
  id,
  method,
  ...(params === undefined ? {} : { params }),
});
const notify = (method, params) => ({
  jsonrpc: '2.0',
  method,
  ...(params === undefined ? {} : { params }),
});

test('protocol handles malformed input, lifecycle, stale versions, and floods', async () => {
  const messages = [];
  const server = createServer(messages);
  await server.handle('{bad json');
  assert.equal(messages.pop().error.code, -32700);
  await server.handle({ nope: true });
  assert.equal(messages.pop().error.code, -32600);

  await server.handle(
    request(1, 'initialize', {
      rootUri: 'file:///player-mod',
      capabilities: {},
      initializationOptions: { platformIndex: EMBEDDED_PLATFORM_INDEX },
    }),
  );
  const initialized = messages.find((message) => message.id === 1);
  assert.equal(initialized.result.capabilities.definitionProvider, true);
  await server.handle(notify('initialized', {}));

  const uri = 'file:///player-mod/src/lib.rs';
  await server.handle(
    notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'rust',
        version: 1,
        text: 'fn original() {}\n',
      },
    }),
  );
  await server.handle(
    notify('textDocument/didChange', {
      textDocument: { uri, version: 1 },
      contentChanges: [{ text: 'fn stale() {}\n' }],
    }),
  );
  await server.handle(
    request(2, 'textDocument/documentSymbol', { textDocument: { uri } }),
  );
  assert.deepEqual(
    messages.find((message) => message.id === 2).result.map((item) => item.name),
    ['original'],
  );

  for (let version = 2; version <= 51; version++) {
    await server.handle(
      notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: `fn value_${version}() {}\n` }],
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  const diagnostics = messages.filter(
    (message) => message.method === 'textDocument/publishDiagnostics',
  );
  assert.equal(diagnostics.length, 1, 'rapid changes collapse into one analysis');
  assert.equal(diagnostics[0].params.version, 51);

  await server.handle(request(3, 'shutdown'));
  assert.equal(messages.find((message) => message.id === 3).result, null);
  await server.handle(notify('exit'));
  server.dispose();
});

test('oversized documents are rejected without entering the VFS', async () => {
  const messages = [];
  const server = createServer(messages);
  await server.handle(
    request(1, 'initialize', {
      rootUri: 'file:///player-mod',
      initializationOptions: {
        platformIndex: EMBEDDED_PLATFORM_INDEX,
        limits: {
          maxFiles: 2,
          maxFileBytes: 32,
          maxWorkspaceBytes: 64,
        },
      },
    }),
  );
  const uri = 'file:///player-mod/src/huge.rs';
  await server.handle(
    notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'rust',
        version: 1,
        text: 'x'.repeat(33),
      },
    }),
  );
  const diagnostic = messages.find(
    (message) => message.method === 'textDocument/publishDiagnostics',
  );
  assert.equal(diagnostic.params.diagnostics[0].code, 'workspace-limit');
  await server.handle(
    request(2, 'textDocument/documentSymbol', { textDocument: { uri } }),
  );
  assert.match(
    messages.find((message) => message.id === 2).error.message,
    /not open/u,
  );
  server.dispose();
});

test('unknown methods and malformed parameters return JSON-RPC errors', async () => {
  const messages = [];
  const server = createServer(messages);
  await server.handle(request(1, 'initialize', {}));
  await server.handle(request(2, 'workspace/executeCommand', {}));
  assert.equal(messages.find((message) => message.id === 2).error.code, -32601);
  await server.handle(
    request(3, 'textDocument/hover', {
      textDocument: { uri: 42 },
      position: { line: -1, character: 0 },
    }),
  );
  assert.equal(messages.find((message) => message.id === 3).error.code, -32602);
  server.dispose();
});

test('queued cancellation skips dispatch and cancellation state stays bounded', async () => {
  const messages = [];
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let finishCompletion;
  const analysis = {
    completions() {
      markStarted();
      return new Promise((resolve) => {
        finishCompletion = resolve;
      });
    },
    diagnostics: () => [],
    documentSymbolsCalls: 0,
    documentSymbols() {
      this.documentSymbolsCalls++;
      return [];
    },
    hover: () => null,
    definition: () => null,
    invalidate() {},
    dispose() {},
  };
  const server = createServer(messages, {
    createAnalysis: async () => analysis,
  });
  await server.handle(
    request(1, 'initialize', {
      rootUri: 'file:///player-mod',
      initializationOptions: { platformIndex: EMBEDDED_PLATFORM_INDEX },
    }),
  );
  const uri = 'file:///player-mod/src/lib.rs';
  await server.handle(
    notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'rust',
        version: 1,
        text: 'fn run() {}\n',
      },
    }),
  );

  let queue = Promise.resolve();
  const receive = (message) => {
    if (server.observeIncoming(message)) return;
    queue = queue.then(() => server.handle(message));
  };
  receive(
    request(2, 'textDocument/completion', {
      textDocument: { uri },
      position: { line: 0, character: 3 },
    }),
  );
  await started;
  receive(
    request(3, 'textDocument/documentSymbol', {
      textDocument: { uri },
    }),
  );
  assert.equal(
    server.observeIncoming(notify('$/cancelRequest', { id: 3 })),
    true,
  );
  finishCompletion([]);
  await queue;
  assert.deepEqual(messages.find((message) => message.id === 2).result, []);
  assert.equal(messages.find((message) => message.id === 3).error.code, -32800);
  assert.equal(
    analysis.documentSymbolsCalls,
    0,
    'a canceled queued request must not reach analysis',
  );

  for (let id = 0; id < 10_000; id++) {
    assert.equal(
      server.observeIncoming(notify('$/cancelRequest', { id: id + 100 })),
      true,
    );
  }
  await server.handle(
    request(3, 'textDocument/documentSymbol', {
      textDocument: { uri },
    }),
  );
  const reused = messages.filter((message) => message.id === 3).at(-1);
  assert.deepEqual(reused.result, []);
  assert.equal(analysis.documentSymbolsCalls, 1);

  const queued = Array.from(
    { length: MAX_PENDING_LSP_REQUESTS },
    (_, index) =>
      request(20_000 + index, 'textDocument/documentSymbol', {
        textDocument: { uri },
      }),
  );
  for (const message of queued) {
    assert.equal(server.observeIncoming(message), false);
  }
  const overflow = request(30_000, 'textDocument/documentSymbol', {
    textDocument: { uri },
  });
  assert.equal(server.observeIncoming(overflow), true);
  assert.match(
    messages.find((message) => message.id === 30_000).error.message,
    /Pending request limit is 256/u,
  );
  for (const message of queued) await server.handle(message);
  assert.equal(
    server.observeIncoming(overflow),
    false,
    'completed request state must be released',
  );
  await server.handle(overflow);
  server.dispose();
});
