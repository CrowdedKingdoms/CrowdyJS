import {
  ModStudioController,
  type ModStudioControllerOptions,
} from './controller.js';
import { ModStudioDomShell } from './dom-shell.js';
import type {
  ModStudioEditorAdapter,
  ModStudioEditorCallbacks,
  ModStudioEditorMode,
} from './editor.js';
import {
  createMonacoModStudioEditor,
  type MonacoModStudioEditorOptions,
} from './monaco-editor.js';
import { createTextareaModStudioEditor } from './textarea-editor.js';

export interface MountModStudioOptions
  extends ModStudioControllerOptions,
    MonacoModStudioEditorOptions {}

export interface ModStudioHandle {
  controller: ModStudioController;
  editorMode: ModStudioEditorMode;
  destroy(): void;
}

/**
 * Mount the project-first Mod Studio. Monaco and its browser Rust worker are
 * loaded lazily; any editor/worker/WASM startup failure keeps the full project
 * UI and swaps in the target/file-aware textarea editor.
 */
export async function mountModStudio(
  host: HTMLElement,
  options: MountModStudioOptions,
): Promise<ModStudioHandle> {
  if (typeof document === 'undefined') {
    throw new Error('mountModStudio requires a DOM document');
  }

  const controller = new ModStudioController(options);
  const shell = new ModStudioDomShell(host, controller);
  let editor: ModStudioEditorAdapter | null = null;
  let destroyed = false;
  let recoveringEditor = false;
  const callbacks: ModStudioEditorCallbacks = {
    onProjectFileChange: (
      target: 'SERVER' | 'CLIENT',
      path: string,
      content: string,
    ) => controller.updateFile(target, path, content),
    onLocalDiagnostics: (
      diagnostics: Parameters<ModStudioController['setLocalDiagnostics']>[0],
    ) => controller.setLocalDiagnostics(diagnostics),
    onOpenFile: (ref: Parameters<ModStudioController['openFile']>[0]) =>
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
          'Mod Studio Rust worker failed; switching to the file-aware fallback',
          error,
        );
        editor.dispose();
        controller.setLocalDiagnostics([]);
        editor = createTextareaModStudioEditor(shell.editorHost, callbacks);
        editor.sync(controller.getState());
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
      editor = await createMonacoModStudioEditor(
        shell.editorHost,
        options,
        callbacks,
      );
    } catch (error) {
      console.warn(
        'Mod Studio Monaco editor unavailable; using the file-aware fallback',
        error,
      );
      editor = createTextareaModStudioEditor(shell.editorHost, callbacks);
    }
    editor.sync(controller.getState());
  } catch (error) {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
    const failedEditor = editor as ModStudioEditorAdapter | null;
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      editor?.dispose();
      editor = null;
      shell.dispose();
      controller.destroy();
    },
  };
}
