import type { ModStudioState } from './controller.js';
import type {
  ModStudioEditorAdapter,
  ModStudioEditorCallbacks,
} from './editor.js';
import type { ModStudioFileRef } from './models.js';

/**
 * Target/file-aware fallback used when Monaco or the local Rust worker cannot
 * start. It edits the active source file directly; project tabs and explorer
 * continue to work and no JSON source blob is exposed.
 */
export function createTextareaModStudioEditor(
  host: HTMLElement,
  callbacks: ModStudioEditorCallbacks,
): ModStudioEditorAdapter {
  const notice = document.createElement('div');
  notice.className = 'ck-mod-studio-editor-notice';
  notice.textContent =
    'Basic editor active — Monaco or the local Rust worker was unavailable.';
  const textarea = document.createElement('textarea');
  textarea.className = 'ck-mod-studio-textarea';
  textarea.rows = 24;
  textarea.spellcheck = false;
  textarea.setAttribute('aria-label', 'Project source editor');
  host.replaceChildren(notice, textarea);

  let active: ModStudioFileRef | null = null;
  let disposed = false;

  const onInput = (): void => {
    if (
      disposed ||
      active?.source !== 'PROJECT' ||
      !active.target
    ) {
      return;
    }
    callbacks.onProjectFileChange(active.target, active.path, textarea.value);
  };
  textarea.addEventListener('input', onInput);

  return {
    mode: 'textarea',
    sync(state) {
      if (disposed) return;
      const next = state.activeFile;
      active = next;
      if (!next) {
        textarea.value = '';
        textarea.disabled = true;
        textarea.placeholder = 'Create or open a project file';
        delete textarea.dataset.target;
        delete textarea.dataset.path;
        return;
      }
      textarea.disabled = false;
      textarea.readOnly = next.source !== 'PROJECT';
      textarea.dataset.target = next.target ?? 'SHARED';
      textarea.dataset.path = next.path;
      const content = contentFor(state, next);
      if (textarea.value !== content) textarea.value = content;
    },
    layout() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      textarea.removeEventListener('input', onInput);
      host.replaceChildren();
    },
  };
}

function contentFor(state: ModStudioState, ref: ModStudioFileRef): string {
  if (ref.source === 'PROJECT') {
    return (
      state.project?.files.find(
        (file) =>
          file.target === ref.target && file.path === ref.path,
      )?.content ?? ''
    );
  }
  const files =
    ref.source === 'PERSONAL_LIBRARY'
      ? state.personalLibraryFiles
      : state.commonFiles;
  return (
    files.find((file) =>
      ref.referenceId
        ? file.id === ref.referenceId
        : file.path === ref.path && file.target === ref.target,
    )?.content ?? ''
  );
}
