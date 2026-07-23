import type { ModStudioState } from './controller.js';
import type { ModStudioFileRef } from './models.js';

export type ModStudioEditorMode = 'monaco' | 'textarea';

/** Editor implementation used by the DOM mount. */
export interface ModStudioEditorAdapter {
  readonly mode: ModStudioEditorMode;
  sync(state: ModStudioState): void;
  layout(): void;
  dispose(): void;
}

export interface ModStudioEditorCallbacks {
  onProjectFileChange(
    target: 'SERVER' | 'CLIENT',
    path: string,
    content: string,
  ): void;
  onLocalDiagnostics(
    diagnostics: ModStudioState['localDiagnostics'],
  ): void;
  onOpenFile(ref: ModStudioFileRef): void;
  onFailure?(error: Error): void;
}
