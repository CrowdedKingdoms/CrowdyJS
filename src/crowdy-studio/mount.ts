import {
  CrowdyStudioController,
  type CrowdyStudioControllerOptions,
} from './controller.js';
import type { GraphQLClient } from '../client.js';
import { CrowdyStudioDshPane, CROWDY_STUDIO_DSH_STYLES } from '../crowdy-dsh/pane.js';
import { CrowdyStudioDshTransport } from '../crowdy-dsh/transport.js';
import type { CrowdyStudioDshHost } from '../crowdy-dsh/bridge.js';
import { CrowdyStudioDomShell } from './dom-shell.js';
import type {
  CrowdyStudioEditorAdapter,
  CrowdyStudioEditorCallbacks,
  CrowdyStudioEditorMode,
} from './editor.js';
import {
  createMonacoCrowdyStudioEditor,
  type MonacoCrowdyStudioEditorOptions,
} from './monaco-editor.js';
import { createTextareaCrowdyStudioEditor } from './textarea-editor.js';

export interface MountCrowdyStudioOptions
  extends CrowdyStudioControllerOptions,
    MonacoCrowdyStudioEditorOptions {
  /**
   * Optional Studio agent pane: the DeepSeek Harness running in the player's
   * browser, docked beside the editor. Omit for a Studio without an agent.
   */
  dsh?: MountCrowdyStudioDshOptions;
}

export interface MountCrowdyStudioDshOptions {
  /** GraphQL client the pane uses for consent/usage reads (the game's client). */
  graphql: GraphQLClient;
  /** Same-origin path the packed harness page is served from, e.g. `/dsh/`. */
  webBase: string;
  /** GraphQL endpoint the harness worker reads/writes project files through. */
  graphqlUrl: string;
  /** Origin of the game API for `/v1/model/*` (same origin as `graphqlUrl`). */
  apiOrigin: string;
  /** Current app token; re-read whenever the harness needs it. */
  getToken(): string | null;
  /** Stable per-player key for session persistence in the browser (never a token). */
  persistScope: string;
  /** What the game exposes to the model: captures, observation, client logs. */
  host?: CrowdyStudioDshHost;
  /** Studio origin for the wallet link in the pane. */
  studioOrigin?: string;
  /** Open the pane on mount (default true). */
  openOnMount?: boolean;
}

export interface CrowdyStudioHandle {
  controller: CrowdyStudioController;
  /** The agent pane when `dsh` was configured. */
  dsh: CrowdyStudioDshPane | null;
  editorMode: CrowdyStudioEditorMode;
  destroy(): void;
}

/**
 * Keep an embedded editor fitted to its host. Hosts can resize without a
 * window resize (for example when a game drags a dock splitter), so Monaco
 * must follow the element itself rather than the browser viewport.
 */
export function observeCrowdyStudioEditorLayout(
  host: HTMLElement,
  currentEditor: () => CrowdyStudioEditorAdapter | null,
): () => void {
  const Observer = globalThis.ResizeObserver;
  if (!Observer) return () => {};
  let stopped = false;
  let queued = false;
  const observer = new Observer(() => {
    if (stopped || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!stopped) currentEditor()?.layout();
    });
  });
  observer.observe(host);
  return () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
  };
}

/**
 * Mount the project-first Crowdy Studio. Monaco and its browser Rust worker are
 * loaded lazily; any editor/worker/WASM startup failure keeps the full project
 * UI and swaps in the target/file-aware textarea editor.
 */
export async function mountCrowdyStudio(
  host: HTMLElement,
  options: MountCrowdyStudioOptions,
): Promise<CrowdyStudioHandle> {
  if (typeof document === 'undefined') {
    throw new Error('mountCrowdyStudio requires a DOM document');
  }

  const controller = new CrowdyStudioController(options);
  let dsh: CrowdyStudioDshPane | null = null;
  const dshOptions = options.dsh;
  const shell = new CrowdyStudioDomShell(host, controller, {
    dock: dshOptions
      ? (workspace) => {
          const style = document.createElement('style');
          style.textContent = CROWDY_STUDIO_DSH_STYLES;
          workspace.append(style);
          dsh = new CrowdyStudioDshPane(workspace, {
            controller,
            transport: new CrowdyStudioDshTransport(dshOptions.graphql, {
              apiOrigin: dshOptions.apiOrigin,
              getToken: dshOptions.getToken,
            }),
            appId: options.appId,
            webBase: dshOptions.webBase,
            persistScope: dshOptions.persistScope,
            getToken: dshOptions.getToken,
            graphqlUrl: dshOptions.graphqlUrl,
            host: dshOptions.host,
            studioOrigin: dshOptions.studioOrigin,
          });
          return dsh;
        }
      : undefined,
    onFixWithAi: dshOptions
      ? (diagnostic) => {
          dsh?.bridge.prompt(
            `Fix this ${diagnostic.severity} in ${diagnostic.target.toLowerCase()}/${diagnostic.path}:${diagnostic.line}:${diagnostic.column} — ${diagnostic.message}. Read the file first, make the smallest correct change, then run draft_test.`,
          );
        }
      : undefined,
  });
  if (dshOptions && dshOptions.openOnMount !== false) {
    shell.layout.setVisible('agent', true);
  }
  let editor: CrowdyStudioEditorAdapter | null = null;
  let destroyed = false;
  let recoveringEditor = false;
  // Observe the editor box itself so pane toggles and splitter drags inside
  // the studio relayout Monaco, not only host/window resizes.
  const disconnectLayoutObserver = observeCrowdyStudioEditorLayout(
    shell.editorHost,
    () => editor,
  );
  const callbacks: CrowdyStudioEditorCallbacks = {
    onProjectFileChange: (
      target: 'SERVER' | 'CLIENT',
      path: string,
      content: string,
    ) => controller.updateFile(target, path, content),
    onLocalDiagnostics: (
      diagnostics: Parameters<CrowdyStudioController['setLocalDiagnostics']>[0],
    ) => controller.setLocalDiagnostics(diagnostics),
    onOpenFile: (ref: Parameters<CrowdyStudioController['openFile']>[0]) =>
      controller.openFile(ref),
    onFailure: (error: Error) => {
      queueMicrotask(() => {
        if (
          destroyed ||
          recoveringEditor ||
          editor?.mode !== 'monaco'
        ) {
          return;
        }
        recoveringEditor = true;
        console.warn(
          'Crowdy Studio Rust worker failed; switching to the file-aware fallback',
          error,
        );
        editor.dispose();
        controller.setLocalDiagnostics([]);
        editor = createTextareaCrowdyStudioEditor(shell.editorHost, callbacks);
        editor.sync(controller.getState());
        editor.layout();
        recoveringEditor = false;
      });
    },
  };

  const unsubscribe = controller.subscribe((state) => {
    shell.render(state);
    editor?.sync(state);
  });
  const onVisibilityChange = (): void => {
    const visible = document.visibilityState !== 'hidden';
    controller.setPageVisible(visible);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  onVisibilityChange();

  try {
    await controller.initialize();
    try {
      editor = await createMonacoCrowdyStudioEditor(
        shell.editorHost,
        options,
        callbacks,
      );
    } catch (error) {
      console.warn(
        'Crowdy Studio Monaco editor unavailable; using the file-aware fallback',
        error,
      );
      editor = createTextareaCrowdyStudioEditor(shell.editorHost, callbacks);
    }
    editor.sync(controller.getState());
    editor.layout();
  } catch (error) {
    disconnectLayoutObserver();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
    const failedEditor = editor as CrowdyStudioEditorAdapter | null;
    failedEditor?.dispose();
    shell.dispose();
    controller.destroy();
    throw error;
  }

  return {
    controller,
    get dsh() {
      return dsh;
    },
    get editorMode() {
      return editor?.mode ?? 'textarea';
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      disconnectLayoutObserver();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      editor?.dispose();
      editor = null;
      shell.dispose();
      dsh = null;
      controller.destroy();
    },
  };
}

