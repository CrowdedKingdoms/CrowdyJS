import {
  LiveCodingController,
  type LiveCodingStatus,
} from './live-coding-controller.js';
import {
  mountLiveCoding,
  type LiveCodingHandle,
  type MountLiveCodingOptions,
} from './mount.js';
import {
  isRecord,
  type CompletionItem,
  type Diagnostic,
  type DocumentSymbol,
  type Hover,
  type Location,
  type Range,
} from './lsp-protocol.js';
import {
  loadPlatformIndex,
  type PlatformIndex,
} from './platform-index.js';
import { PLAYER_CODE_TEMPLATES } from './templates.js';
import {
  acquireMonacoWorkspace,
  ensureMonacoServicesInitialized,
} from './monaco-services.js';
import type {
  Disposable,
  LanguageWorkerLike,
  WorkerLanguageClient,
} from './worker-transport.js';

export interface MountLiveCodingIDEOptions extends MountLiveCodingOptions {
  /** Consumer-provided Monaco editor worker (bundler-specific). */
  editorWorkerFactory?: () => Worker;
  /** Optional module-worker factory; one worker is created for this editor. */
  languageWorkerFactory?: () => Worker;
  /**
   * Generated platform symbol index. The worker strictly validates its schema;
   * omit it to use the byte-identical embedded game export.
   */
  platformIndex?: PlatformIndex | unknown;
  /** JSON-RPC request timeout; defaults to 3 seconds. */
  languageRequestTimeoutMs?: number;
}

interface EditorModel {
  path: string;
  model: {
    uri: { toString(): string };
    getValue(): string;
    getVersionId(): number;
    onDidChangeContent(listener: () => void): { dispose(): void };
    dispose(): void;
  };
  changeSubscription: { dispose(): void };
}

let monacoLanguagesRegistered = false;

/**
 * Lazy Monaco live-coding IDE backed only by a browser module worker and local
 * WASM parser assets. If Monaco, Worker, or WASM startup fails, the dependency-
 * free textarea is mounted; there is deliberately no server fallback.
 */
export async function mountLiveCodingIDE(
  el: HTMLElement,
  options: MountLiveCodingIDEOptions,
): Promise<LiveCodingHandle> {
  if (!options.languageWorkerFactory && typeof Worker === 'undefined') {
    return mountLiveCoding(el, options);
  }
  if (options.editorWorkerFactory) {
    (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: () => Worker };
      }
    ).MonacoEnvironment = { getWorker: options.editorWorkerFactory };
  }

  let languageWorker: LanguageWorkerLike | null = null;
  let languageClient: WorkerLanguageClient | null = null;
  let releaseWorkspace: (() => void) | null = null;
  let teardownMountedIde: ((graceful: boolean) => void) | null = null;
  try {
    const platformIndex =
      options.platformIndex === undefined
        ? undefined
        : loadPlatformIndex(options.platformIndex);
    const workerTransportPromise = import('./worker-transport.js');
    await ensureMonacoServicesInitialized();
    const [monaco, workerTransport] = await Promise.all([
      import('@codingame/monaco-vscode-editor-api'),
      workerTransportPromise,
    ]);
    if (!monacoLanguagesRegistered) {
      monaco.languages.register({ id: 'rust', extensions: ['.rs'] });
      installRustSyntaxHighlighting(monaco);
      monaco.languages.register({ id: 'toml', extensions: ['.toml'] });
      monacoLanguagesRegistered = true;
    }

    const templates = options.templates ?? PLAYER_CODE_TEMPLATES;
    const root = document.createElement('div');
    root.className = 'ck-live-coding ck-live-coding-ide';
    root.style.cssText =
      'display:grid;grid-template-rows:auto auto minmax(320px,1fr) auto auto;' +
      'gap:6px;min-height:520px;';
    const controls = document.createElement('div');
    controls.className = 'ck-live-coding-controls';
    const target = select(['server', 'client']);
    const template = document.createElement('select');
    const deploy = button('Deploy');
    const draft = button('Deploy draft');
    const stop = button('Stop');
    controls.append(target, template, deploy, draft, stop);
    const tabs = document.createElement('div');
    tabs.className = 'ck-live-coding-tabs';
    tabs.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    const editorHost = document.createElement('div');
    editorHost.className = 'ck-live-coding-monaco';
    editorHost.style.cssText = 'min-height:320px;border:1px solid #333;';
    const problems = document.createElement('div');
    problems.className = 'ck-live-coding-problems';
    const status = document.createElement('pre');
    status.className = 'ck-live-coding-status';
    const meter = document.createElement('div');
    meter.className = 'ck-live-coding-meter';
    root.append(controls, tabs, editorHost, problems, status, meter);
    el.appendChild(root);

    const controller = new LiveCodingController({
      ...options,
      onStatus: (value) => renderStatus(status, meter, value),
    });
    const workspaceLease = acquireMonacoWorkspace();
    releaseWorkspace = workspaceLease.release;
    const modelRootUri = workspaceLease.uri;
    const ownsModel = (uri: { toString(): string }): boolean =>
      uri.toString().startsWith(`${modelRootUri}/`);
    const editor = monaco.editor.create(editorHost, {
      automaticLayout: true,
      minimap: { enabled: false },
      theme: 'vs-dark',
      fontSize: 14,
      tabSize: 2,
    });
    let models: EditorModel[] = [];
    const languageDisposables: Disposable[] = [];

    const sourceJson = (): string =>
      JSON.stringify(
        Object.fromEntries(models.map(({ path, model }) => [path, model.getValue()])),
      );

    const showModel = (path: string): void => {
      const found = models.find((entry) => entry.path === path);
      if (found) editor.setModel(found.model as never);
      for (const child of Array.from(tabs.children)) {
        (child as HTMLElement).dataset.active =
          (child as HTMLElement).dataset.path === path ? 'true' : 'false';
      }
    };

    const closeModels = (): void => {
      for (const entry of models) {
        if (entry.path.endsWith('.rs')) {
          void languageClient
            ?.notify('textDocument/didClose', {
              textDocument: { uri: entry.model.uri.toString() },
            })
            .catch(() => {});
        }
        entry.changeSubscription.dispose();
        entry.model.dispose();
      }
      models = [];
    };

    const openModel = (entry: EditorModel): void => {
      if (!entry.path.endsWith('.rs')) return;
      void languageClient
        ?.notify('textDocument/didOpen', {
          textDocument: {
            uri: entry.model.uri.toString(),
            languageId: 'rust',
            version: entry.model.getVersionId(),
            text: entry.model.getValue(),
          },
        })
        .catch(() => {});
    };

    const setFiles = (sourceFilesJson: string): void => {
      closeModels();
      tabs.replaceChildren();
      const files = parseFiles(sourceFilesJson);
      for (const [path, content] of Object.entries(files)) {
        const uri = monaco.Uri.parse(`${modelRootUri}/${path}`);
        const model = monaco.editor.createModel(
          content,
          path.endsWith('.rs') ? 'rust' : path.endsWith('.toml') ? 'toml' : 'plaintext',
          uri,
        );
        const entry: EditorModel = {
          path,
          model,
          changeSubscription: { dispose: () => {} },
        };
        entry.changeSubscription = model.onDidChangeContent(() => {
          if (!path.endsWith('.rs')) return;
          void languageClient
            ?.notify('textDocument/didChange', {
              textDocument: {
                uri: model.uri.toString(),
                version: model.getVersionId(),
              },
              contentChanges: [{ text: model.getValue() }],
            })
            .catch(() => {});
        });
        models.push(entry);
        openModel(entry);
        const tab = button(path);
        tab.dataset.path = path;
        tab.addEventListener('click', () => showModel(path));
        tabs.appendChild(tab);
      }
      const preferred =
        models.find((entry) => entry.path === 'src/lib.rs') ?? models[0];
      if (preferred) showModel(preferred.path);
    };

    const refreshTemplates = (): void => {
      template.replaceChildren();
      const matching = templates.filter((item) => item.target === target.value);
      for (const item of matching) template.append(new Option(item.title, item.id));
      if (matching[0]) setFiles(matching[0].sourceFilesJson);
    };
    target.addEventListener('change', refreshTemplates);
    template.addEventListener('change', () => {
      const selected = templates.find((item) => item.id === template.value);
      if (selected) setFiles(selected.sourceFilesJson);
    });

    const doDeploy = (draftMode: boolean): void => {
      void controller
        .deploy({
          name: options.moduleName ?? 'scratch-mod',
          target: target.value as 'server' | 'client',
          sourceFilesJson: sourceJson(),
          draft: draftMode || options.draftByDefault,
        })
        .catch((error) => {
          status.textContent = `error: ${(error as Error).message}`;
        });
    };
    deploy.addEventListener('click', () => doDeploy(false));
    draft.addEventListener('click', () => doDeploy(true));
    stop.addEventListener('click', () => controller.stop());

    const markerSubscription = monaco.editor.onDidChangeMarkers(() => {
      const markers = monaco.editor.getModelMarkers({ owner: 'crowdy-rust' });
      const errors = markers.filter(
        (marker) => marker.severity === monaco.MarkerSeverity.Error,
      ).length;
      const warnings = markers.filter(
        (marker) => marker.severity === monaco.MarkerSeverity.Warning,
      ).length;
      problems.textContent = `${errors} error(s) · ${warnings} warning(s)`;
    });

    let tornDown = false;
    teardownMountedIde = (graceful): void => {
      if (tornDown) return;
      tornDown = true;
      markerSubscription.dispose();
      for (const disposable of languageDisposables) disposable.dispose();
      controller.stop();
      closeModels();
      if (graceful) languageClient?.shutdown();
      else languageClient?.dispose();
      editor.dispose();
      root.remove();
      releaseWorkspace?.();
      releaseWorkspace = null;
    };

    refreshTemplates();
    languageWorker =
      options.languageWorkerFactory?.() ??
      workerTransport.createDefaultRustLanguageWorker();
    languageClient = new workerTransport.WorkerLanguageClient(languageWorker, {
      requestTimeoutMs: options.languageRequestTimeoutMs,
    });
    languageDisposables.push(
      languageClient.onNotification('textDocument/publishDiagnostics', (params) => {
        if (!isRecord(params) || typeof params.uri !== 'string') return;
        const model = monaco.editor.getModel(monaco.Uri.parse(params.uri));
        if (!model) return;
        if (!isCurrentDiagnosticVersion(params.version, model.getVersionId())) {
          return;
        }
        const diagnostics = Array.isArray(params.diagnostics)
          ? (params.diagnostics as Diagnostic[])
          : [];
        monaco.editor.setModelMarkers(
          model,
          'crowdy-rust',
          diagnostics.map((diagnostic) => ({
            ...toMonacoRange(diagnostic.range),
            severity: diagnosticSeverity(monaco, diagnostic.severity),
            message: diagnostic.message,
            code: diagnostic.code,
            source: diagnostic.source,
          })),
        );
      }),
    );
    await languageClient.initialize({
      processId: null,
      clientInfo: { name: 'CrowdyJS Monaco', version: '1' },
      rootUri: modelRootUri,
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
        ...(platformIndex === undefined
          ? {}
          : { platformIndex }),
      },
    });
    for (const entry of models) openModel(entry);

    languageDisposables.push(
      monaco.languages.registerCompletionItemProvider('rust', {
        triggerCharacters: [':', '.'],
        provideCompletionItems: async (model, position) => {
          if (!ownsModel(model.uri)) return { suggestions: [] };
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
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
              range,
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
    void controller.refreshUsage().catch(() => {});

    return {
      controller,
      destroy: () => teardownMountedIde?.(true),
    };
  } catch (error) {
    if (teardownMountedIde) {
      teardownMountedIde(false);
    } else {
      languageClient?.dispose();
      if (!languageClient) languageWorker?.terminate();
      releaseWorkspace?.();
      releaseWorkspace = null;
    }
    console.warn(
      'Browser Rust IDE unavailable; using textarea fallback',
      error,
    );
    el.replaceChildren();
    return mountLiveCoding(el, options);
  }
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

function parseFiles(sourceFilesJson: string): Record<string, string> {
  const parsed = JSON.parse(sourceFilesJson) as unknown;
  if (!isRecord(parsed)) throw new Error('sourceFilesJson must be an object');
  return Object.fromEntries(
    Object.entries(parsed).map(([path, value]) => {
      if (
        typeof value !== 'string' ||
        path.startsWith('/') ||
        path.split('/').some((part) => part === '' || part === '.' || part === '..')
      ) {
        throw new Error(`Invalid source file ${path}`);
      }
      return [path, value];
    }),
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

export function isCurrentDiagnosticVersion(
  version: unknown,
  currentVersion: number,
): boolean {
  return (
    version === undefined ||
    (Number.isSafeInteger(version) && version === currentVersion)
  );
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

function select(values: string[]): HTMLSelectElement {
  const element = document.createElement('select');
  for (const value of values) element.append(new Option(value, value));
  return element;
}

function button(label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  return element;
}

function renderStatus(
  status: HTMLElement,
  meter: HTMLElement,
  value: LiveCodingStatus,
): void {
  status.textContent = [
    `[${value.target}] ${value.phase}`,
    value.message,
    value.compileLog,
  ]
    .filter(Boolean)
    .join('\n');
  if (value.usage) {
    meter.textContent =
      `units ${value.usage.hourUnitsUsed}/${value.usage.unitsPerHour ?? '∞'} · ` +
      `compiles ${value.usage.compilesThisHour}/${value.usage.maxCompilesPerHour} · ` +
      `gate ${value.usage.gateStatus}${value.usage.gateReason ? ` (${value.usage.gateReason})` : ''}`;
  }
}
