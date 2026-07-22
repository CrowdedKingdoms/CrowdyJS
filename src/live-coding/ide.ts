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
  PLAYER_CODE_TEMPLATES,
} from './templates.js';

export interface MountLiveCodingIDEOptions extends MountLiveCodingOptions {
  /** Authenticated wss endpoint ending in /authoring-lsp. */
  languageServiceUrl?: string;
  /** Current app token or a getter. Tokens are sent only after WSS connects. */
  appToken?: string | (() => string | null);
  /** Consumer-provided Monaco editor worker (bundler-specific). */
  editorWorkerFactory?: () => Worker;
}

interface EditorModel {
  path: string;
  model: {
    getValue(): string;
    dispose(): void;
  };
}

let vscodeServicesPromise: Promise<void> | null = null;

/**
 * Lazy Monaco live-coding IDE. Monaco and the language-client stack stay out
 * of the importing game's hot bundle until this async mount is called.
 * Missing LSP configuration degrades to the dependency-free textarea panel.
 */
export async function mountLiveCodingIDE(
  el: HTMLElement,
  options: MountLiveCodingIDEOptions,
): Promise<LiveCodingHandle> {
  const token = resolveToken(options.appToken);
  if (!options.languageServiceUrl || !token) {
    return mountLiveCoding(el, options);
  }
  if (options.editorWorkerFactory) {
    (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: () => Worker };
      }
    ).MonacoEnvironment = { getWorker: options.editorWorkerFactory };
  }

  try {
    const [
      monaco,
      languageClientModule,
      wsJsonRpc,
      vscodeWrapperModule,
      workerFactoryModule,
    ] = await Promise.all([
      import('@codingame/monaco-vscode-editor-api'),
      import('monaco-languageclient'),
      import('vscode-ws-jsonrpc'),
      import('monaco-languageclient/vscodeApiWrapper'),
      import('monaco-languageclient/workerFactory'),
    ]);
    if (!vscodeServicesPromise) {
      const wrapper = new vscodeWrapperModule.MonacoVscodeApiWrapper({
        $type: 'classic',
        viewsConfig: { $type: 'EditorService' },
        userConfiguration: {
          json: JSON.stringify({
            'workbench.colorTheme': 'Default Dark Modern',
            'editor.wordBasedSuggestions': 'off',
          }),
        },
        monacoWorkerFactory: workerFactoryModule.configureDefaultWorkerFactory,
      });
      vscodeServicesPromise = wrapper.start();
    }
    await vscodeServicesPromise;
    monaco.languages.register({ id: 'rust', extensions: ['.rs'] });
    installRustSyntaxHighlighting(monaco);
    monaco.languages.register({ id: 'toml', extensions: ['.toml'] });

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
    const editor = monaco.editor.create(editorHost, {
      automaticLayout: true,
      minimap: { enabled: false },
      theme: 'vs-dark',
      fontSize: 14,
      tabSize: 2,
    });
    let models: EditorModel[] = [];
    let languageClient: { start(): Promise<void>; stop(): Promise<void> } | null =
      null;
    let socket: WebSocket | null = null;
    let modelRootUri = 'file:///player-mod';

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

    const setFiles = (sourceFilesJson: string): void => {
      for (const entry of models) entry.model.dispose();
      models = [];
      tabs.replaceChildren();
      const files = parseFiles(sourceFilesJson);
      for (const [path, content] of Object.entries(files)) {
        const uri = monaco.Uri.parse(`${modelRootUri}/${path}`);
        const model = monaco.editor.createModel(
          content,
          path.endsWith('.rs') ? 'rust' : path.endsWith('.toml') ? 'toml' : 'plaintext',
          uri,
        );
        models.push({ path, model });
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
      for (const item of matching) {
        template.append(new Option(item.title, item.id));
      }
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
      const markers = monaco.editor.getModelMarkers({});
      const errors = markers.filter(
        (marker) => marker.severity === monaco.MarkerSeverity.Error,
      ).length;
      const warnings = markers.filter(
        (marker) => marker.severity === monaco.MarkerSeverity.Warning,
      ).length;
      problems.textContent = `${errors} error(s) · ${warnings} warning(s)`;
    });

    refreshTemplates();
    const authenticated = await authenticatedSocket(
      options.languageServiceUrl,
      token,
      String(options.appId),
      sourceJson(),
    );
    socket = authenticated.socket;
    const initialSource = sourceJson();
    modelRootUri = authenticated.workspaceUri.replace(/\/$/, '');
    setFiles(initialSource);
    const adapter = websocketAdapter(socket);
    const reader = new wsJsonRpc.WebSocketMessageReader(adapter);
    const writer = new wsJsonRpc.WebSocketMessageWriter(adapter);
    languageClient = new languageClientModule.MonacoLanguageClient({
      name: 'Crowdy Rust',
      clientOptions: {
        documentSelector: [{ language: 'rust' }, { language: 'toml' }],
        workspaceFolder: {
          uri: monaco.Uri.parse(modelRootUri) as never,
          name: 'player-mod',
          index: 0,
        },
      },
      messageTransports: { reader, writer },
    });
    await languageClient.start();
    void controller.refreshUsage().catch(() => {});

    return {
      controller,
      destroy: () => {
        markerSubscription.dispose();
        controller.stop();
        void languageClient?.stop().catch(() => {});
        socket?.close();
        editor.dispose();
        for (const entry of models) entry.model.dispose();
        root.remove();
      },
    };
  } catch (error) {
    console.warn('Monaco live-coding IDE unavailable; using textarea fallback', error);
    el.replaceChildren();
    return mountLiveCoding(el, options);
  }
}

function installRustSyntaxHighlighting(
  monaco: typeof import('@codingame/monaco-vscode-editor-api'),
): void {
  const keywords = new Set([
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
  ]);
  const types = new Set([
    'Self',
    'String',
    'Vec',
    'Option',
    'Result',
    'bool',
    'char',
    'str',
    'usize',
    'isize',
    'u8',
    'u16',
    'u32',
    'u64',
    'u128',
    'i8',
    'i16',
    'i32',
    'i64',
    'i128',
    'f32',
    'f64',
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
        if ((match = rest.match(/^\s+/))) {
          tokens.push({ startIndex: index, scopes: '' });
        } else if ((match = rest.match(/^\/\/.*$/))) {
          tokens.push({ startIndex: index, scopes: 'comment.rust' });
        } else if ((match = rest.match(/^\/\*.*?(?:\*\/|$)/))) {
          tokens.push({ startIndex: index, scopes: 'comment.rust' });
        } else if ((match = rest.match(/^"(?:\\.|[^"\\])*"?/))) {
          tokens.push({ startIndex: index, scopes: 'string.rust' });
        } else if ((match = rest.match(/^(?:0x[\da-fA-F_]+|\d[\d_]*)/))) {
          tokens.push({ startIndex: index, scopes: 'number.rust' });
        } else if ((match = rest.match(/^[A-Za-z_]\w*!/))) {
          tokens.push({ startIndex: index, scopes: 'macro.rust' });
        } else if ((match = rest.match(/^[A-Za-z_]\w*/))) {
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
          match = rest.match(/^./);
          tokens.push({ startIndex: index, scopes: 'delimiter.rust' });
        }
        index += match?.[0].length ?? 1;
      }
      return { tokens, endState: currentState };
    },
  });
}

function resolveToken(
  token: MountLiveCodingIDEOptions['appToken'],
): string | null {
  const value = typeof token === 'function' ? token() : token;
  return value && value.length > 0 ? value : null;
}

function parseFiles(sourceFilesJson: string): Record<string, string> {
  const parsed = JSON.parse(sourceFilesJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('sourceFilesJson must be an object');
  }
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([path, value]) => {
      if (typeof value !== 'string') throw new Error(`Invalid source file ${path}`);
      return [path, value];
    }),
  );
}

async function authenticatedSocket(
  url: string,
  token: string,
  appId: string,
  sourceFilesJson: string,
): Promise<{ socket: WebSocket; workspaceUri: string }> {
  const socket = new WebSocket(url);
  let workspaceUri = 'file:///player-mod';
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('language service timeout')), 10_000);
    socket.addEventListener(
      'open',
      () => {
        socket.send(
          JSON.stringify({
            type: 'authenticate',
            token,
            appId,
            sourceFilesJson,
          }),
        );
      },
      { once: true },
    );
    socket.addEventListener(
      'message',
      (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            workspaceUri?: string;
          };
          if (message.type !== 'ready' || !message.workspaceUri) {
            throw new Error('language service refused session');
          }
          workspaceUri = message.workspaceUri;
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      },
      { once: true },
    );
    socket.addEventListener(
      'close',
      (event) => {
        clearTimeout(timeout);
        reject(new Error(event.reason || 'language service closed'));
      },
      { once: true },
    );
  });
  return { socket, workspaceUri };
}

function websocketAdapter(socket: WebSocket): {
  send(content: string): void;
  onMessage(callback: (data: unknown) => void): void;
  onError(callback: (reason: unknown) => void): void;
  onClose(callback: (code: number, reason: string) => void): void;
  dispose(): void;
} {
  return {
    send: (content) => socket.send(content),
    onMessage: (callback) =>
      socket.addEventListener('message', (event) => callback(event.data)),
    onError: (callback) =>
      socket.addEventListener('error', (event) => callback(event)),
    onClose: (callback) =>
      socket.addEventListener('close', (event) =>
        callback(event.code, event.reason),
      ),
    dispose: () => socket.close(),
  };
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
