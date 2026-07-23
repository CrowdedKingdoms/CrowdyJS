import type { ModStudioState } from './controller.js';
import type {
  ModStudioEditorAdapter,
  ModStudioEditorCallbacks,
} from './editor.js';
import {
  modStudioFileUri,
  type ModStudioFileRef,
  type ModStudioReferenceFile,
} from './models.js';
import {
  isRecord,
  type CompletionItem,
  type Diagnostic,
  type DocumentSymbol,
  type Hover,
  type Location,
  type Range,
} from '../live-coding/lsp-protocol.js';
import {
  loadPlatformIndex,
  type PlatformIndex,
} from '../live-coding/platform-index.js';
import {
  acquireMonacoWorkspace,
  ensureMonacoServicesInitialized,
} from '../live-coding/monaco-services.js';
import type {
  Disposable,
  LanguageWorkerLike,
  WorkerLanguageClient,
} from '../live-coding/worker-transport.js';

export interface MonacoModStudioEditorOptions {
  editorWorkerFactory?: () => Worker;
  languageWorkerFactory?: () => Worker;
  platformIndex?: PlatformIndex | unknown;
  languageRequestTimeoutMs?: number;
}

interface EditorModel {
  key: string;
  ref: ModStudioFileRef;
  model: {
    uri: { toString(): string };
    getValue(): string;
    setValue(value: string): void;
    getVersionId(): number;
    onDidChangeContent(listener: () => void): { dispose(): void };
    dispose(): void;
  };
  changeSubscription: { dispose(): void };
  suppressChanges: boolean;
}

let rustLanguagesRegistered = false;

/**
 * Create the Monaco adapter backed by the browser-local Rust LSP worker. Every
 * loaded project/reference file is opened in the worker; project URIs include
 * `/server/` or `/client/`, so duplicate Cargo and lib paths never collide.
 */
export async function createMonacoModStudioEditor(
  host: HTMLElement,
  options: MonacoModStudioEditorOptions,
  callbacks: ModStudioEditorCallbacks,
): Promise<ModStudioEditorAdapter> {
  if (!options.languageWorkerFactory && typeof Worker === 'undefined') {
    throw new Error('Worker is unavailable');
  }
  if (options.editorWorkerFactory) {
    (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: () => Worker };
      }
    ).MonacoEnvironment = { getWorker: options.editorWorkerFactory };
  }

  const platformIndex =
    options.platformIndex === undefined
      ? undefined
      : loadPlatformIndex(options.platformIndex);
  let languageWorker: LanguageWorkerLike | null = null;
  let languageClient: WorkerLanguageClient | null = null;
  let releaseWorkspace: (() => void) | null = null;
  let editor:
    | ReturnType<
        typeof import('@codingame/monaco-vscode-editor-api')['editor']['create']
      >
    | null = null;
  const models = new Map<string, EditorModel>();
  const localDiagnostics = new Map<string, ModStudioState['localDiagnostics']>();
  const disposables: Disposable[] = [];

  try {
    const workerTransportPromise = import('../live-coding/worker-transport.js');
    await ensureMonacoServicesInitialized();
    const [monaco, workerTransport] = await Promise.all([
      import('@codingame/monaco-vscode-editor-api'),
      workerTransportPromise,
    ]);
    registerRustLanguages(monaco);

    const workspace = acquireMonacoWorkspace();
    releaseWorkspace = workspace.release;
    const workspaceUri = workspace.uri;
    const ownsModel = (uri: { toString(): string }): boolean =>
      uri.toString().startsWith(`${workspaceUri}/`);

    editor = monaco.editor.create(host, {
      automaticLayout: true,
      minimap: { enabled: false },
      theme: 'vs-dark',
      fontSize: 14,
      tabSize: 2,
    });

    languageWorker =
      options.languageWorkerFactory?.() ??
      workerTransport.createDefaultRustLanguageWorker();
    languageClient = new workerTransport.WorkerLanguageClient(languageWorker, {
      requestTimeoutMs: options.languageRequestTimeoutMs,
    });
    let failureReported = false;
    disposables.push(
      languageClient.onError((error) => {
        if (failureReported) return;
        failureReported = true;
        callbacks.onFailure?.(error);
      }),
    );

    disposables.push(
      languageClient.onNotification(
        'textDocument/publishDiagnostics',
        (params) => {
          if (!isRecord(params) || typeof params.uri !== 'string') return;
          const entry = [...models.values()].find(
            (candidate) => candidate.model.uri.toString() === params.uri,
          );
          if (!entry) return;
          if (
            !isCurrentDiagnosticVersion(
              params.version,
              entry.model.getVersionId(),
            )
          ) {
            return;
          }
          const diagnostics = Array.isArray(params.diagnostics)
            ? (params.diagnostics as Diagnostic[])
            : [];
          monaco.editor.setModelMarkers(
            entry.model as never,
            'crowdy-rust-advisory',
            diagnostics.map((diagnostic) => ({
              ...toMonacoRange(diagnostic.range),
              severity: diagnosticSeverity(monaco, diagnostic.severity),
              message: diagnostic.message,
              code: diagnostic.code,
              source: 'local advisory',
            })),
          );
          const projectDiagnostics =
            entry.ref.source === 'PROJECT' && entry.ref.target
              ? diagnostics.map((diagnostic) => ({
                  target: entry.ref.target!,
                  path: entry.ref.path,
                  line: diagnostic.range.start.line + 1,
                  column: diagnostic.range.start.character + 1,
                  endLine: diagnostic.range.end.line + 1,
                  endColumn: diagnostic.range.end.character + 1,
                  severity: lspSeverity(diagnostic.severity),
                  message: diagnostic.message,
                  ...(diagnostic.code !== undefined
                    ? { code: String(diagnostic.code) }
                    : {}),
                  source: 'local-advisory' as const,
                }))
              : [];
          localDiagnostics.set(entry.key, projectDiagnostics);
          callbacks.onLocalDiagnostics(
            [...localDiagnostics.values()].flat(),
          );
        },
      ),
    );

    await languageClient.initialize({
      processId: null,
      clientInfo: { name: 'CrowdyJS Mod Studio', version: '1' },
      rootUri: workspaceUri,
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        textDocument: {
          completion: {},
          hover: { contentFormat: ['markdown', 'plaintext'] },
          documentSymbol: {},
          definition: {},
          publishDiagnostics: { versionSupport: true },
        },
      },
      initializationOptions: {
        ...(platformIndex === undefined ? {} : { platformIndex }),
      },
    });

    disposables.push(
      monaco.languages.registerCompletionItemProvider('rust', {
        triggerCharacters: [':', '.'],
        provideCompletionItems: async (model, position) => {
          if (!ownsModel(model.uri)) return { suggestions: [] };
          const word = model.getWordUntilPosition(position);
          const response = (await languageClient?.request(
            'textDocument/completion',
            lspDocumentPosition(model.uri.toString(), position),
          )) as CompletionItem[] | undefined;
          return {
            suggestions: (response ?? []).map((item) => ({
              label: item.label,
              kind: completionKind(monaco, item.kind),
              detail: item.detail,
              documentation: item.documentation,
              insertText: item.insertText ?? item.label,
              insertTextRules:
                item.kind === 15
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            })),
          };
        },
      }),
      monaco.languages.registerHoverProvider('rust', {
        provideHover: async (model, position) => {
          if (!ownsModel(model.uri)) return null;
          const response = (await languageClient?.request(
            'textDocument/hover',
            lspDocumentPosition(model.uri.toString(), position),
          )) as Hover | null | undefined;
          if (!response) return null;
          return {
            contents: [{ value: response.contents.value }],
            range: response.range
              ? new monaco.Range(
                  response.range.start.line + 1,
                  response.range.start.character + 1,
                  response.range.end.line + 1,
                  response.range.end.character + 1,
                )
              : undefined,
          };
        },
      }),
      monaco.languages.registerDocumentSymbolProvider('rust', {
        provideDocumentSymbols: async (model) => {
          if (!ownsModel(model.uri)) return [];
          const response = (await languageClient?.request(
            'textDocument/documentSymbol',
            { textDocument: { uri: model.uri.toString() } },
          )) as DocumentSymbol[] | undefined;
          return (response ?? []).map((symbol) => ({
            name: symbol.name,
            detail: symbol.detail ?? '',
            kind: symbolKind(monaco, symbol.kind),
            tags: [],
            range: toMonacoRange(symbol.range),
            selectionRange: toMonacoRange(symbol.selectionRange),
          }));
        },
      }),
      monaco.languages.registerDefinitionProvider('rust', {
        provideDefinition: async (model, position) => {
          if (!ownsModel(model.uri)) return null;
          const response = (await languageClient?.request(
            'textDocument/definition',
            lspDocumentPosition(model.uri.toString(), position),
          )) as Location | null | undefined;
          if (!response) return null;
          return {
            uri: monaco.Uri.parse(response.uri),
            range: toMonacoRange(response.range),
          };
        },
      }),
    );

    let disposed = false;
    let previousActiveKey: string | null = null;
    const adapter: ModStudioEditorAdapter = {
      mode: 'monaco',
      sync(state) {
        if (disposed || !editor) return;
        const desired = collectFiles(state, workspaceUri);
        const desiredKeys = new Set(desired.map((file) => file.key));
        let removedDiagnostics = false;

        for (const [key, entry] of models) {
          if (desiredKeys.has(key)) continue;
          closeModel(entry, languageClient, monaco);
          models.delete(key);
          removedDiagnostics = localDiagnostics.delete(key) || removedDiagnostics;
        }
        if (removedDiagnostics) {
          callbacks.onLocalDiagnostics(
            [...localDiagnostics.values()].flat(),
          );
        }

        for (const file of desired) {
          const existing = models.get(file.key);
          if (existing) {
            existing.ref = file.ref;
            if (existing.model.getValue() !== file.content) {
              existing.suppressChanges = true;
              existing.model.setValue(file.content);
              existing.suppressChanges = false;
            }
            continue;
          }
          const uri = monaco.Uri.parse(file.uri);
          const model = monaco.editor.createModel(
            file.content,
            languageFor(file.ref.path),
            uri,
          );
          const entry: EditorModel = {
            key: file.key,
            ref: file.ref,
            model,
            suppressChanges: false,
            changeSubscription: { dispose() {} },
          };
          entry.changeSubscription = model.onDidChangeContent(() => {
            if (entry.ref.path.endsWith('.rs')) {
              void languageClient
                ?.notify('textDocument/didChange', {
                  textDocument: {
                    uri: model.uri.toString(),
                    version: model.getVersionId(),
                  },
                  contentChanges: [{ text: model.getValue() }],
                })
                .catch(() => {});
            }
            if (
              !entry.suppressChanges &&
              entry.ref.source === 'PROJECT' &&
              entry.ref.target
            ) {
              callbacks.onProjectFileChange(
                entry.ref.target,
                entry.ref.path,
                model.getValue(),
              );
            }
          });
          models.set(file.key, entry);
          openModel(entry, languageClient);
        }

        for (const entry of models.values()) {
          const markers =
            entry.ref.source === 'PROJECT' && entry.ref.target
              ? state.authoritativeDiagnostics
                  .filter(
                    (diagnostic) =>
                      diagnostic.target === entry.ref.target &&
                      diagnostic.path === entry.ref.path,
                  )
                  .map((diagnostic) => ({
                    startLineNumber: diagnostic.line,
                    startColumn: diagnostic.column,
                    endLineNumber: diagnostic.endLine ?? diagnostic.line,
                    endColumn:
                      diagnostic.endColumn ?? diagnostic.column + 1,
                    severity: publicSeverity(monaco, diagnostic.severity),
                    message: diagnostic.message,
                    code: diagnostic.code,
                    source: 'rustc (authoritative)',
                  }))
              : [];
          monaco.editor.setModelMarkers(
            entry.model as never,
            'crowdy-rustc',
            markers,
          );
        }

        const activeKey = state.activeFile
          ? keyForRef(state.activeFile)
          : null;
        if (activeKey !== previousActiveKey) {
          const active = activeKey ? models.get(activeKey) : undefined;
          editor.setModel((active?.model ?? null) as never);
          editor.updateOptions({ readOnly: active?.ref.source !== 'PROJECT' });
          previousActiveKey = activeKey;
        }
      },
      layout() {
        editor?.layout();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const disposable of disposables) disposable.dispose();
        for (const entry of models.values()) {
          closeModel(entry, languageClient, monaco);
        }
        models.clear();
        localDiagnostics.clear();
        languageClient?.shutdown();
        editor?.dispose();
        editor = null;
        releaseWorkspace?.();
        releaseWorkspace = null;
        host.replaceChildren();
      },
    };
    return adapter;
  } catch (error) {
    for (const disposable of disposables) disposable.dispose();
    for (const entry of models.values()) {
      entry.changeSubscription.dispose();
      entry.model.dispose();
    }
    languageClient?.dispose();
    if (!languageClient) languageWorker?.terminate();
    editor?.dispose();
    releaseWorkspace?.();
    host.replaceChildren();
    throw error;
  }
}

interface CollectedFile {
  key: string;
  ref: ModStudioFileRef;
  content: string;
  uri: string;
}

function collectFiles(
  state: ModStudioState,
  workspaceUri: string,
): CollectedFile[] {
  const projectFiles =
    state.project?.files.map((file) => {
      const ref: ModStudioFileRef = {
        source: 'PROJECT',
        target: file.target,
        path: file.path,
      };
      return {
        key: keyForRef(ref),
        ref,
        content: file.content,
        uri: modStudioFileUri(workspaceUri, file.target, file.path),
      };
    }) ?? [];
  return [
    ...projectFiles,
    ...state.personalLibraryFiles.map((file) =>
      collectReference(workspaceUri, file),
    ),
    ...state.commonFiles.map((file) => collectReference(workspaceUri, file)),
  ];
}

function collectReference(
  workspaceUri: string,
  file: ModStudioReferenceFile,
): CollectedFile {
  const ref: ModStudioFileRef = {
    source: file.source,
    target: file.target,
    path: file.path,
    referenceId: file.id,
  };
  const bucket = file.source === 'PERSONAL_LIBRARY' ? 'library' : 'common';
  const target = file.target?.toLowerCase() ?? 'shared';
  const id = file.id.replace(/[^A-Za-z0-9._-]/gu, '_') || 'file';
  const path = file.path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return {
    key: keyForRef(ref),
    ref,
    content: file.content,
    uri: `${workspaceUri}/${bucket}/${target}/${id}/${path}`,
  };
}

function keyForRef(ref: ModStudioFileRef): string {
  return [
    ref.source,
    ref.target ?? 'SHARED',
    ref.referenceId ?? '',
    ref.path,
  ].join(':');
}

function openModel(
  entry: EditorModel,
  client: WorkerLanguageClient | null,
): void {
  if (!entry.ref.path.endsWith('.rs')) return;
  void client
    ?.notify('textDocument/didOpen', {
      textDocument: {
        uri: entry.model.uri.toString(),
        languageId: 'rust',
        version: entry.model.getVersionId(),
        text: entry.model.getValue(),
      },
    })
    .catch(() => {});
}

function closeModel(
  entry: EditorModel,
  client: WorkerLanguageClient | null,
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
): void {
  if (entry.ref.path.endsWith('.rs')) {
    void client
      ?.notify('textDocument/didClose', {
        textDocument: { uri: entry.model.uri.toString() },
      })
      .catch(() => {});
  }
  monaco.editor.setModelMarkers(entry.model as never, 'crowdy-rustc', []);
  monaco.editor.setModelMarkers(
    entry.model as never,
    'crowdy-rust-advisory',
    [],
  );
  entry.changeSubscription.dispose();
  entry.model.dispose();
}

export function isCurrentDiagnosticVersion(
  version: unknown,
  currentVersion: number,
): boolean {
  return (
    version === undefined ||
    (Number.isSafeInteger(version) && version === currentVersion)
  );
}

function lspDocumentPosition(
  uri: string,
  position: { lineNumber: number; column: number },
): unknown {
  return {
    textDocument: { uri },
    position: {
      line: position.lineNumber - 1,
      character: position.column - 1,
    },
  };
}

function toMonacoRange(range: Range): {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function diagnosticSeverity(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
  severity: Diagnostic['severity'],
): number {
  return severity === 1
    ? monaco.MarkerSeverity.Error
    : severity === 2
      ? monaco.MarkerSeverity.Warning
      : severity === 3
        ? monaco.MarkerSeverity.Info
        : monaco.MarkerSeverity.Hint;
}

function lspSeverity(
  severity: Diagnostic['severity'],
): 'error' | 'warning' | 'info' | 'hint' {
  if (severity === 1) return 'error';
  if (severity === 2) return 'warning';
  if (severity === 3) return 'info';
  return 'hint';
}

function publicSeverity(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
  severity: 'error' | 'warning' | 'info' | 'hint',
): number {
  if (severity === 'error') return monaco.MarkerSeverity.Error;
  if (severity === 'warning') return monaco.MarkerSeverity.Warning;
  if (severity === 'info') return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Hint;
}

function completionKind(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
  kind: number,
): number {
  const kinds = monaco.languages.CompletionItemKind;
  return (
    {
      3: kinds.Function,
      5: kinds.Field,
      6: kinds.Variable,
      7: kinds.Class,
      9: kinds.Module,
      13: kinds.Enum,
      14: kinds.Keyword,
      15: kinds.Snippet,
      21: kinds.Constant,
    }[kind] ?? kinds.Text
  );
}

function symbolKind(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
  kind: number,
): number {
  const kinds = monaco.languages.SymbolKind;
  return (
    {
      2: kinds.Module,
      5: kinds.Class,
      6: kinds.Method,
      10: kinds.Enum,
      11: kinds.Interface,
      12: kinds.Function,
      13: kinds.Variable,
      14: kinds.Constant,
      23: kinds.Struct,
    }[kind] ?? kinds.Object
  );
}

function languageFor(path: string): string {
  if (path.endsWith('.rs')) return 'rust';
  if (path.endsWith('.toml')) return 'toml';
  if (path.endsWith('.json')) return 'json';
  return 'plaintext';
}

function registerRustLanguages(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
): void {
  if (rustLanguagesRegistered) return;
  monaco.languages.register({ id: 'rust', extensions: ['.rs'] });
  installRustSyntaxHighlighting(monaco);
  monaco.languages.register({ id: 'toml', extensions: ['.toml'] });
  rustLanguagesRegistered = true;
}

function installRustSyntaxHighlighting(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
): void {
  const keywords = new Set([
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
    'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
    'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
    'self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe',
    'use', 'where', 'while',
  ]);
  const types = new Set([
    'Self', 'String', 'Vec', 'Option', 'Result', 'bool', 'char', 'str',
    'usize', 'isize', 'u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16',
    'i32', 'i64', 'i128', 'f32', 'f64',
  ]);
  const state = {
    clone() {
      return this;
    },
    equals(other: unknown) {
      return other === this;
    },
  };
  monaco.languages.setTokensProvider('rust', {
    getInitialState: () => state,
    tokenize: (line, currentState) => {
      const tokens: Array<{ startIndex: number; scopes: string }> = [];
      let index = 0;
      while (index < line.length) {
        const rest = line.slice(index);
        let match: RegExpMatchArray | null;
        if ((match = rest.match(/^\s+/u))) {
          tokens.push({ startIndex: index, scopes: '' });
        } else if ((match = rest.match(/^\/\/.*$/u))) {
          tokens.push({ startIndex: index, scopes: 'comment.rust' });
        } else if ((match = rest.match(/^\/\*.*?(?:\*\/|$)/u))) {
          tokens.push({ startIndex: index, scopes: 'comment.rust' });
        } else if ((match = rest.match(/^"(?:\\.|[^"\\])*"?/u))) {
          tokens.push({ startIndex: index, scopes: 'string.rust' });
        } else if ((match = rest.match(/^(?:0x[\da-fA-F_]+|\d[\d_]*)/u))) {
          tokens.push({ startIndex: index, scopes: 'number.rust' });
        } else if ((match = rest.match(/^[A-Za-z_]\w*!/u))) {
          tokens.push({ startIndex: index, scopes: 'macro.rust' });
        } else if ((match = rest.match(/^[A-Za-z_]\w*/u))) {
          const word = match[0];
          tokens.push({
            startIndex: index,
            scopes: keywords.has(word)
              ? 'keyword.rust'
              : types.has(word)
                ? 'type.rust'
                : 'identifier.rust',
          });
        } else {
          match = rest.match(/^./u);
          tokens.push({ startIndex: index, scopes: 'delimiter.rust' });
        }
        index += match?.[0].length ?? 1;
      }
      return { tokens, endState: currentState };
    },
  });
}
