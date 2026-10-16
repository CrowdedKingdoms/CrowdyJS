import {
  AbstractMessageReader,
  AbstractMessageWriter,
  CancellationTokenSource,
  RAL,
  type DataCallback,
  type Disposable,
  type Message,
} from 'vscode-jsonrpc';
import {
  ExitNotification,
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  createProtocolConnection,
  type ProtocolConnection,
} from 'vscode-languageserver-protocol';
import {
  decodeJsonRpcMessage,
  type JsonRpcMessage,
} from './lsp-protocol.js';

export type { Disposable };

export interface LanguageWorkerLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: EventListener,
  ): void;
  removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: EventListener,
  ): void;
  terminate(): void;
}

/**
 * vscode-jsonrpc 9 does not install a runtime when imported from its main
 * entry. The protocol connection schedules incoming messages through that
 * runtime, so the first message throws and the request waits out its timeout.
 * The browser runtime is the one this worker transport can run: it only needs
 * timers and text encoding, which exist in a page and under Node's test runner.
 */
function installJsonRpcRuntime(): void {
  try {
    RAL();
    return;
  } catch {
    // Not installed yet.
  }
  RAL.install({
    applicationJson: {
      encoder: {
        name: 'application/json',
        encode: (msg) => Promise.resolve(new TextEncoder().encode(JSON.stringify(msg))),
      },
      decoder: {
        name: 'application/json',
        decode: (buffer) => {
          const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
          return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
        },
      },
    },
    messageBuffer: {
      create: () => {
        throw new Error('Worker language transport does not frame byte streams');
      },
    },
    console,
    timer: {
      setTimeout(callback, ms, ...args) {
        const handle = setTimeout(callback, ms, ...args);
        return { dispose: () => clearTimeout(handle) };
      },
      setImmediate(callback, ...args) {
        let cancelled = false;
        queueMicrotask(() => {
          if (!cancelled) callback(...args);
        });
        return { dispose: () => { cancelled = true; } };
      },
      setInterval(callback, ms, ...args) {
        const handle = setInterval(callback, ms, ...args);
        return { dispose: () => clearInterval(handle) };
      },
    },
  });
}

/** Standard vscode-jsonrpc MessageReader over structured-clone worker messages. */
export class WorkerMessageReader extends AbstractMessageReader {
  private callback: DataCallback | null = null;
  private listening = false;

  constructor(private readonly worker: LanguageWorkerLike) {
    super();
  }

  listen(callback: DataCallback): Disposable {
    if (this.listening) throw new Error('WorkerMessageReader is already listening');
    this.listening = true;
    this.callback = callback;
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('messageerror', this.onMessageError);
    this.worker.addEventListener('error', this.onWorkerError);
    return { dispose: () => this.dispose() };
  }

  override dispose(): void {
    if (this.listening) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('messageerror', this.onMessageError);
      this.worker.removeEventListener('error', this.onWorkerError);
    }
    this.listening = false;
    this.callback = null;
    super.dispose();
  }

  private readonly onMessage = (event: Event): void => {
    const decoded = decodeJsonRpcMessage((event as MessageEvent<unknown>).data);
    if (!decoded.ok) {
      this.fireError(new Error(decoded.message));
      return;
    }
    this.callback?.(decoded.message as Message);
  };

  private readonly onMessageError = (): void => {
    this.fireError(new Error('Language worker sent an unreadable message'));
  };

  private readonly onWorkerError = (event: Event): void => {
    const message =
      'message' in event && typeof event.message === 'string'
        ? event.message
        : 'Language worker failed';
    this.fireError(new Error(message));
  };
}

/** Standard vscode-jsonrpc MessageWriter over structured-clone worker messages. */
export class WorkerMessageWriter extends AbstractMessageWriter {
  private disposed = false;
  private errorCount = 0;

  constructor(private readonly worker: LanguageWorkerLike) {
    super();
  }

  write(message: Message): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Worker writer is disposed'));
    try {
      this.worker.postMessage(message);
      return Promise.resolve();
    } catch (error) {
      this.errorCount++;
      this.fireError(error, message, this.errorCount);
      return Promise.reject(error);
    }
  }

  end(): void {
    this.dispose();
  }

  override dispose(): void {
    this.disposed = true;
    super.dispose();
  }
}

export interface WorkerLanguageClientOptions {
  requestTimeoutMs?: number;
}

/**
 * LSP JSON-RPC client over a real vscode-jsonrpc MessageConnection.
 * Monaco providers adapt editor calls to this connection; transport framing,
 * request ids, cancellation, errors, and notifications are standard JSON-RPC.
 */
export class WorkerLanguageClient {
  private readonly reader: WorkerMessageReader;
  private readonly writer: WorkerMessageWriter;
  private readonly connection: ProtocolConnection;
  private readonly transportErrorHandlers = new Set<(error: Error) => void>();
  private readonly persistentErrorHandlers = new Set<(error: Error) => void>();
  private readonly readerErrorDisposable: Disposable;
  private disposed = false;
  private terminateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly worker: LanguageWorkerLike,
    private readonly options: WorkerLanguageClientOptions = {},
  ) {
    installJsonRpcRuntime();
    this.reader = new WorkerMessageReader(worker);
    this.writer = new WorkerMessageWriter(worker);
    this.readerErrorDisposable = this.reader.onError((error) => {
      for (const handler of this.transportErrorHandlers) handler(error);
      for (const handler of this.persistentErrorHandlers) handler(error);
    });
    this.connection = createProtocolConnection(this.reader, this.writer);
    this.connection.listen();
  }

  async initialize(params: unknown): Promise<unknown> {
    const result = await this.request(InitializeRequest.type.method, params);
    await this.notify(InitializedNotification.type.method, {});
    return result;
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error('Language client is disposed'));
    const cancellation = new CancellationTokenSource();
    const timeoutMs = this.options.requestTimeoutMs ?? 3_000;
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const onTransportError = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancellation.cancel();
        cancellation.dispose();
        this.transportErrorHandlers.delete(onTransportError);
        reject(error);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cancellation.cancel();
        cancellation.dispose();
        this.transportErrorHandlers.delete(onTransportError);
        reject(new Error(`Language request timed out: ${method}`));
      }, timeoutMs);
      this.transportErrorHandlers.add(onTransportError);
      const request =
        params === undefined
          ? this.connection.sendRequest(method, cancellation.token)
          : this.connection.sendRequest(method, params, cancellation.token);
      void request
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cancellation.dispose();
            this.transportErrorHandlers.delete(onTransportError);
            resolve(value);
          },
          (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cancellation.dispose();
            this.transportErrorHandlers.delete(onTransportError);
            reject(
              error instanceof Error
                ? error
                : new Error('Language request failed'),
            );
          },
        );
    });
  }

  notify(method: string, params?: unknown): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Language client is disposed'));
    return this.connection.sendNotification(method, params);
  }

  onNotification(
    method: string,
    callback: (params: unknown) => void,
  ): Disposable {
    return this.connection.onNotification(method, callback);
  }

  /** Observe worker/transport failures for editor fallback and telemetry. */
  onError(callback: (error: Error) => void): Disposable {
    if (this.disposed) return { dispose() {} };
    this.persistentErrorHandlers.add(callback);
    return {
      dispose: () => this.persistentErrorHandlers.delete(callback),
    };
  }

  shutdown(): void {
    if (this.disposed || this.terminateTimer) return;
    const finish = (): void => {
      if (this.disposed) return;
      void this.connection
        .sendNotification(ExitNotification.type.method)
        .catch(() => {})
        .finally(() => this.dispose());
    };
    void this.request(ShutdownRequest.type.method)
      .catch(() => {})
      .finally(finish);
    this.terminateTimer = setTimeout(finish, this.options.requestTimeoutMs ?? 3_000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.terminateTimer) clearTimeout(this.terminateTimer);
    this.terminateTimer = null;
    this.transportErrorHandlers.clear();
    this.persistentErrorHandlers.clear();
    this.readerErrorDisposable.dispose();
    this.connection.dispose();
    this.reader.dispose();
    this.writer.dispose();
    this.worker.terminate();
  }
}

export function createDefaultRustLanguageWorker(): Worker {
  return new Worker(new URL('./rust-lsp.worker.js', import.meta.url), {
    type: 'module',
    name: 'crowdy-rust-lsp',
  });
}

export function isWorkerLspMessage(value: unknown): value is JsonRpcMessage {
  return decodeJsonRpcMessage(value).ok;
}
