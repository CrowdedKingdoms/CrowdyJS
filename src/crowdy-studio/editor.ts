import type { CrowdyStudioState } from './controller.js';
import type { CrowdyStudioFileRef } from './models.js';

export type CrowdyStudioEditorMode = 'monaco' | 'textarea';

/** Editor implementation used by the DOM mount. */
export interface CrowdyStudioEditorAdapter {
  readonly mode: CrowdyStudioEditorMode;
  sync(state: CrowdyStudioState): void;
  layout(): void;
  dispose(): void;
}

export interface CrowdyStudioEditorCallbacks {
  onProjectFileChange(
    target: 'SERVER' | 'CLIENT',
    path: string,
    content: string,
  ): void;
  onLocalDiagnostics(
    diagnostics: CrowdyStudioState['localDiagnostics'],
  ): void;
  onOpenFile(ref: CrowdyStudioFileRef): void;
  onFailure?(error: Error): void;
}
