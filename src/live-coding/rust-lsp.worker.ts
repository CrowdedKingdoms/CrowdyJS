import { RustAnalysis } from './rust-analysis.js';
import { RustLspServer } from './rust-lsp-server.js';

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const parserWasmUrl = new URL(
  './assets/web-tree-sitter.wasm',
  import.meta.url,
).href;
const grammarWasmUrl = new URL(
  './assets/tree-sitter-rust.wasm',
  import.meta.url,
).href;

const server = new RustLspServer({
  postMessage: (message) => scope.postMessage(message),
  createAnalysis: (platformIndex) =>
    RustAnalysis.create({ parserWasmUrl, grammarWasmUrl, platformIndex }),
});

let queue = Promise.resolve();
scope.onmessage = (event) => {
  if (server.observeIncoming(event.data)) return;
  queue = queue
    .then(() => server.handle(event.data))
    .catch((error: unknown) => {
      scope.postMessage({
        jsonrpc: '2.0',
        method: 'window/logMessage',
        params: {
          type: 1,
          message: error instanceof Error ? error.message : 'Worker failure',
        },
      });
    });
};
