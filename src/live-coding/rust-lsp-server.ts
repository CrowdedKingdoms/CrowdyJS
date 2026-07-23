import {
  JSON_RPC_ERRORS,
  decodeJsonRpcMessage,
  isRecord,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type Position,
  type TextDocumentContentChangeEvent,
} from './lsp-protocol.js';
import {
  EMBEDDED_PLATFORM_INDEX,
  loadPlatformIndex,
  type PlatformIndex,
} from './platform-index.js';
import { RustAnalysis } from './rust-analysis.js';
import {
  DEFAULT_VFS_LIMITS,
  VfsLimitError,
  VirtualFileSystem,
  type VirtualFileSystemLimits,
} from './vfs.js';

export interface RustLspServerOptions {
  postMessage: (message: unknown) => void;
  createAnalysis: (index: PlatformIndex) => Promise<RustAnalysis>;
  diagnosticDebounceMs?: number;
  requestTimeoutMs?: number;
}

class LspRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

interface RequestCancellationState {
  cancelled: boolean;
  active: boolean;
}

export const MAX_PENDING_LSP_REQUESTS = 256;

export class RustLspServer {
  private vfs: VirtualFileSystem | null = null;
  private analysis: RustAnalysis | null = null;
  private initialized = false;
  private shuttingDown = false;
  private disposed = false;
  private readonly requestStates = new Map<
    JsonRpcId,
    RequestCancellationState
  >();
  private readonly diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly diagnosticGenerations = new Map<string, number>();

  constructor(private readonly options: RustLspServerOptions) {}

  async handle(raw: unknown): Promise<void> {
    if (this.disposed) return;
    const decoded = decodeJsonRpcMessage(raw);
    if (!decoded.ok) {
      this.sendError(decoded.id, decoded.code, decoded.message);
      return;
    }
    const message = decoded.message;
    if (!('method' in message)) return;
    if (!('id' in message) && message.method === '$/cancelRequest') {
      this.cancelRequest(message.params);
      return;
    }
    if ('id' in message) {
      await this.handleRequest(message);
    } else {
      await this.handleNotification(message);
    }
  }

  /**
   * Observes a worker message before it enters the serialized dispatch queue.
   * Request state is bounded, and unknown cancellation ids are never retained.
   */
  observeIncoming(raw: unknown): boolean {
    const decoded = decodeJsonRpcMessage(raw);
    if (!decoded.ok) return false;
    const message = decoded.message;
    if (!('method' in message)) return false;
    if ('id' in message) {
      if (this.requestStates.has(message.id)) {
        this.sendError(
          message.id,
          JSON_RPC_ERRORS.invalidRequest,
          'Request id is already pending',
        );
        return true;
      }
      if (this.requestStates.size >= MAX_PENDING_LSP_REQUESTS) {
        this.sendError(
          message.id,
          -32000,
          `Pending request limit is ${MAX_PENDING_LSP_REQUESTS}`,
        );
        return true;
      }
      this.requestStates.set(message.id, { cancelled: false, active: false });
      return false;
    }
    if (message.method !== '$/cancelRequest') return false;
    this.cancelRequest(message.params);
    return true;
  }

  /** Backwards-compatible immediate cancellation hook for direct transports. */
  handleImmediate(raw: unknown): boolean {
    return this.observeIncoming(raw);
  }

  private cancelRequest(value: unknown): void {
    const params = optionalRecord(value);
    if (typeof params.id === 'string' || typeof params.id === 'number') {
      const request = this.requestStates.get(params.id);
      if (request) request.cancelled = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.diagnosticTimers.values()) clearTimeout(timer);
    this.diagnosticTimers.clear();
    this.diagnosticGenerations.clear();
    for (const request of this.requestStates.values()) {
      request.cancelled = true;
    }
    this.requestStates.clear();
    this.vfs?.clear();
    this.analysis?.dispose();
    this.vfs = null;
    this.analysis = null;
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    let cancellation = this.requestStates.get(request.id);
    if (!cancellation) {
      if (this.requestStates.size >= MAX_PENDING_LSP_REQUESTS) {
        this.sendError(
          request.id,
          -32000,
          `Pending request limit is ${MAX_PENDING_LSP_REQUESTS}`,
        );
        return;
      }
      cancellation = { cancelled: false, active: false };
      this.requestStates.set(request.id, cancellation);
    }
    if (cancellation.active) {
      this.sendError(
        request.id,
        JSON_RPC_ERRORS.invalidRequest,
        'Request id is already active',
      );
      return;
    }
    cancellation.active = true;
    try {
      if (cancellation.cancelled) {
        throw new LspRequestError(
          JSON_RPC_ERRORS.requestCancelled,
          'Request cancelled',
        );
      }
      if (request.method === 'initialize') {
        await this.initialize(request);
        return;
      }
      if (!this.initialized) {
        this.sendError(request.id, -32002, 'Server not initialized');
        return;
      }
      if (request.method === 'shutdown') {
        this.shuttingDown = true;
        this.sendResult(request.id, null);
        return;
      }
      if (this.shuttingDown) {
        this.sendError(
          request.id,
          JSON_RPC_ERRORS.invalidRequest,
          'Server is shutting down',
        );
        return;
      }
      const result = await withTimeout(
        this.dispatchAnalysisRequest(request, cancellation),
        this.options.requestTimeoutMs ?? 2_000,
      );
      if (cancellation.cancelled) {
        throw new LspRequestError(
          JSON_RPC_ERRORS.requestCancelled,
          'Request cancelled',
        );
      }
      this.sendResult(request.id, result);
    } catch (error) {
      const failure =
        error instanceof LspRequestError
          ? error
          : new LspRequestError(
              JSON_RPC_ERRORS.internalError,
              error instanceof Error ? error.message : 'Internal error',
            );
      this.sendError(request.id, failure.code, failure.message, failure.data);
    } finally {
      if (this.requestStates.get(request.id) === cancellation) {
        this.requestStates.delete(request.id);
      }
    }
  }

  private async initialize(request: JsonRpcRequest): Promise<void> {
    if (this.initialized) {
      this.sendError(request.id, JSON_RPC_ERRORS.invalidRequest, 'Already initialized');
      return;
    }
    try {
      const params = optionalRecord(request.params);
      const rootUri =
        typeof params.rootUri === 'string' ? params.rootUri : 'file:///player-mod';
      const initializationOptions = optionalRecord(params.initializationOptions);
      const limits = loadLimits(initializationOptions.limits);
      const index = loadPlatformIndex(
        initializationOptions.platformIndex ?? EMBEDDED_PLATFORM_INDEX,
      );
      this.vfs = new VirtualFileSystem(rootUri, limits);
      this.analysis = await this.options.createAnalysis(index);
      this.initialized = true;
      this.sendResult(request.id, {
        capabilities: {
          positionEncoding: 'utf-16',
          textDocumentSync: { openClose: true, change: 2 },
          completionProvider: { triggerCharacters: [':', '.'] },
          hoverProvider: true,
          documentSymbolProvider: true,
          definitionProvider: true,
        },
        serverInfo: {
          name: 'Crowdy browser Rust language service',
          version: '1',
        },
      });
    } catch (error) {
      this.sendError(
        request.id,
        JSON_RPC_ERRORS.invalidParams,
        error instanceof Error ? error.message : 'Invalid initialize parameters',
      );
    }
  }

  private async dispatchAnalysisRequest(
    request: JsonRpcRequest,
    cancellation: RequestCancellationState,
  ): Promise<unknown> {
    if (cancellation.cancelled) {
      throw new LspRequestError(JSON_RPC_ERRORS.requestCancelled, 'Request cancelled');
    }
    if (
      ![
        'textDocument/completion',
        'textDocument/hover',
        'textDocument/documentSymbol',
        'textDocument/definition',
      ].includes(request.method)
    ) {
      throw new LspRequestError(
        JSON_RPC_ERRORS.methodNotFound,
        `Method not found: ${request.method}`,
      );
    }
    const params = requireRecord(request.params, 'params');
    const textDocument = requireRecord(params.textDocument, 'textDocument');
    const uri = requiredString(textDocument.uri, 'textDocument.uri');
    const document = this.requireVfs().require(uri);
    const version = document.version;
    const analysis = this.requireAnalysis();
    let result: unknown;
    switch (request.method) {
      case 'textDocument/completion':
        result = analysis.completions(
          document,
          requiredPosition(params.position),
          this.requireVfs().documents(),
        );
        break;
      case 'textDocument/hover':
        result = analysis.hover(
          document,
          requiredPosition(params.position),
          this.requireVfs().documents(),
        );
        break;
      case 'textDocument/documentSymbol':
        result = analysis.documentSymbols(document);
        break;
      case 'textDocument/definition':
        result = analysis.definition(
          document,
          requiredPosition(params.position),
          this.requireVfs().documents(),
        );
        break;
      default:
        throw new LspRequestError(JSON_RPC_ERRORS.internalError, 'Unreachable method');
    }
    if (this.requireVfs().get(uri)?.version !== version) {
      throw new LspRequestError(
        JSON_RPC_ERRORS.contentModified,
        'Document changed while request was running',
      );
    }
    return result;
  }

  private async handleNotification(message: JsonRpcMessage): Promise<void> {
    if (!('method' in message)) return;
    if (message.method === 'exit') {
      this.dispose();
      return;
    }
    if (message.method === '$/cancelRequest') {
      this.handleImmediate(message);
      return;
    }
    if (!this.initialized || this.shuttingDown) return;
    try {
      const params = requireRecord(message.params, 'params');
      switch (message.method) {
        case 'initialized':
          return;
        case 'textDocument/didOpen': {
          const item = requireRecord(params.textDocument, 'textDocument');
          const document = this.requireVfs().open({
            uri: requiredString(item.uri, 'textDocument.uri'),
            languageId: requiredString(item.languageId, 'textDocument.languageId'),
            version: requiredVersion(item.version),
            text: requiredStringValue(item.text, 'textDocument.text'),
          });
          this.requireAnalysis().invalidate(document.uri);
          this.scheduleDiagnostics(document.uri);
          return;
        }
        case 'textDocument/didChange': {
          const item = requireRecord(params.textDocument, 'textDocument');
          if (!Array.isArray(params.contentChanges)) {
            throw new Error('contentChanges must be an array');
          }
          const uri = requiredString(item.uri, 'textDocument.uri');
          const changed = this.requireVfs().change(
            uri,
            requiredVersion(item.version),
            params.contentChanges.map(loadContentChange),
          );
          if (changed.applied) {
            this.requireAnalysis().invalidate(uri);
            this.scheduleDiagnostics(uri);
          }
          return;
        }
        case 'textDocument/didClose': {
          const item = requireRecord(params.textDocument, 'textDocument');
          const uri = requiredString(item.uri, 'textDocument.uri');
          this.cancelDiagnostics(uri);
          this.requireVfs().close(uri);
          this.requireAnalysis().invalidate(uri);
          this.publishDiagnostics(uri, null, []);
          return;
        }
        default:
          return;
      }
    } catch (error) {
      const textDocument = isRecord(message.params)
        ? optionalRecord(message.params.textDocument)
        : {};
      const uri =
        typeof textDocument.uri === 'string' ? textDocument.uri : undefined;
      if (uri && error instanceof VfsLimitError) {
        this.publishDiagnostics(uri, null, [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            severity: 1,
            source: 'crowdy-rust',
            code: 'workspace-limit',
            message: error.message,
          },
        ]);
      }
      this.options.postMessage({
        jsonrpc: '2.0',
        method: 'window/logMessage',
        params: {
          type: 1,
          message: error instanceof Error ? error.message : 'Invalid notification',
        },
      });
    }
  }

  private scheduleDiagnostics(uri: string): void {
    this.cancelDiagnostics(uri);
    const generation = (this.diagnosticGenerations.get(uri) ?? 0) + 1;
    this.diagnosticGenerations.set(uri, generation);
    const timer = setTimeout(() => {
      this.diagnosticTimers.delete(uri);
      if (
        this.disposed ||
        generation !== this.diagnosticGenerations.get(uri)
      ) {
        return;
      }
      const document = this.vfs?.get(uri);
      if (!document || !this.analysis) return;
      const diagnostics = this.analysis.diagnostics(document);
      if (
        generation === this.diagnosticGenerations.get(uri) &&
        this.vfs?.get(uri)?.version === document.version
      ) {
        this.publishDiagnostics(uri, document.version, diagnostics);
      }
    }, this.options.diagnosticDebounceMs ?? 75);
    this.diagnosticTimers.set(uri, timer);
  }

  private cancelDiagnostics(uri: string): void {
    const timer = this.diagnosticTimers.get(uri);
    if (timer) clearTimeout(timer);
    this.diagnosticTimers.delete(uri);
    this.diagnosticGenerations.set(
      uri,
      (this.diagnosticGenerations.get(uri) ?? 0) + 1,
    );
  }

  private publishDiagnostics(
    uri: string,
    version: number | null,
    diagnostics: unknown[],
  ): void {
    this.options.postMessage({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri,
        ...(version === null ? {} : { version }),
        diagnostics,
      },
    });
  }

  private requireVfs(): VirtualFileSystem {
    if (!this.vfs) throw new Error('Server VFS is unavailable');
    return this.vfs;
  }

  private requireAnalysis(): RustAnalysis {
    if (!this.analysis) throw new Error('Rust analysis is unavailable');
    return this.analysis;
  }

  private sendResult(id: JsonRpcId, result: unknown): void {
    this.options.postMessage({ jsonrpc: '2.0', id, result });
  }

  private sendError(
    id: JsonRpcId | null,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    this.options.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    });
  }
}

function loadLimits(value: unknown): Partial<VirtualFileSystemLimits> {
  if (value === undefined) return DEFAULT_VFS_LIMITS;
  const input = requireRecord(value, 'limits');
  const allowed = new Set(['maxFiles', 'maxFileBytes', 'maxWorkspaceBytes']);
  const unexpected = Object.keys(input).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`limits has unexpected field ${unexpected}`);
  return Object.fromEntries(
    Object.entries(input).map(([key, item]) => {
      if (!Number.isSafeInteger(item) || (item as number) <= 0) {
        throw new Error(`limits.${key} must be a positive safe integer`);
      }
      return [key, item];
    }),
  );
}

function loadContentChange(value: unknown): TextDocumentContentChangeEvent {
  const input = requireRecord(value, 'contentChanges[]');
  const text = requiredStringValue(input.text, 'contentChanges[].text');
  if (input.range === undefined) return { text };
  const range = requireRecord(input.range, 'contentChanges[].range');
  return {
    text,
    range: {
      start: requiredPosition(range.start),
      end: requiredPosition(range.end),
    },
  };
}

function requiredPosition(value: unknown): Position {
  const input = requireRecord(value, 'position');
  if (
    !Number.isSafeInteger(input.line) ||
    !Number.isSafeInteger(input.character) ||
    (input.line as number) < 0 ||
    (input.character as number) < 0
  ) {
    throw new LspRequestError(JSON_RPC_ERRORS.invalidParams, 'Invalid position');
  }
  return { line: input.line as number, character: input.character as number };
}

function requireRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LspRequestError(
      JSON_RPC_ERRORS.invalidParams,
      `${field} must be an object`,
    );
  }
  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) {
    throw new LspRequestError(
      JSON_RPC_ERRORS.invalidParams,
      `${field} must be a non-empty bounded string`,
    );
  }
  return value;
}

function requiredStringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new LspRequestError(
      JSON_RPC_ERRORS.invalidParams,
      `${field} must be a string`,
    );
  }
  return value;
}

function requiredVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LspRequestError(
      JSON_RPC_ERRORS.invalidParams,
      'Document version must be a non-negative safe integer',
    );
  }
  return value as number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new LspRequestError(-32001, 'Request timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
