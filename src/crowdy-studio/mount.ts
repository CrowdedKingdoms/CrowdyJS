import {
  CrowdyStudioController,
  type CrowdyStudioControllerOptions,
} from './controller.js';
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
    MonacoCrowdyStudioEditorOptions {}

export interface CrowdyStudioHandle {
  controller: CrowdyStudioController;
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
  const shell = new CrowdyStudioDomShell(host, controller);
  let editor: CrowdyStudioEditorAdapter | null = null;
  let destroyed = false;
  let recoveringEditor = false;
  const disconnectLayoutObserver = observeCrowdyStudioEditorLayout(
    host,
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
    controller.setPageVisible(document.visibilityState !== 'hidden');
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
      controller.destroy();
    },
  };
}
