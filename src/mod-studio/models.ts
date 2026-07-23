/** Compile targets supported by player-authored projects. */
export type ModStudioTarget = 'SERVER' | 'CLIENT';

/** The target layout selected when a project is created. */
export type ModStudioProjectKind = 'SERVER' | 'CLIENT' | 'FULL_STACK';

/**
 * Whether a full-stack server should advertise its client companion.
 * `OPTIONAL` records author intent without creating a runtime requirement;
 * `REQUIRED` is applied with `playerCompute.setRequires` after both targets
 * compile successfully.
 */
export type ModStudioPairingPreference = 'NONE' | 'OPTIONAL' | 'REQUIRED';

/** A source file in one project target. Paths are relative to that target. */
export interface ModStudioProjectFile {
  target: ModStudioTarget;
  path: string;
  content: string;
}

/** A read-only source file made available to the browser language worker. */
export interface ModStudioReferenceFile {
  id: string;
  source: 'PERSONAL_LIBRARY' | 'COMMON';
  title: string;
  /** Optional target fence. Omitted files are useful from either target. */
  target?: ModStudioTarget;
  path: string;
  content: string;
  tags?: string[];
  updatedAt?: string;
}

export interface ModStudioProjectMetadata {
  name: string;
  description?: string;
  serverModuleName?: string;
  clientModuleName?: string;
  pairingPreference: ModStudioPairingPreference;
}

/** Immutable revision identity returned by the cloud project service. */
export interface ModStudioProjectRevision {
  id: string;
  savedAt: string;
}

/**
 * One atomic cloud project snapshot. SERVER and CLIENT files intentionally
 * share a project revision so a full-stack save cannot persist half a pair.
 */
export interface ModStudioProject {
  projectId: string;
  appId: string;
  gridId: string;
  kind: ModStudioProjectKind;
  metadata: ModStudioProjectMetadata;
  files: ModStudioProjectFile[];
  sdkVersion: string;
  abiVersion: number;
  revision: ModStudioProjectRevision;
  createdAt: string;
  updatedAt: string;
}

export interface ModStudioProjectSummary {
  projectId: string;
  name: string;
  kind: ModStudioProjectKind;
  revisionId: string;
  serverModuleName?: string;
  clientModuleName?: string;
  updatedAt: string;
}

/** Explicit persistence state rendered by Mod Studio. */
export type ModStudioSaveState = 'SAVING' | 'SAVED' | 'CONFLICT' | 'OFFLINE';

export interface ModStudioFileRef {
  source: 'PROJECT' | 'PERSONAL_LIBRARY' | 'COMMON';
  target?: ModStudioTarget;
  path: string;
  referenceId?: string;
}

export interface CreateModStudioProjectInput {
  appId: string;
  gridId: string;
  kind: ModStudioProjectKind;
  metadata: ModStudioProjectMetadata;
  files: ModStudioProjectFile[];
}

export interface SaveModStudioProjectInput {
  appId: string;
  gridId: string;
  projectId: string;
  /** Optimistic-concurrency precondition for the atomic project write. */
  expectedRevisionId: string;
  metadata: ModStudioProjectMetadata;
  files: ModStudioProjectFile[];
}

export interface ModStudioProjectScope {
  appId: string;
  gridId: string;
}

export interface ImportModStudioReferenceFileInput extends ModStudioProjectScope {
  projectId: string;
  expectedRevisionId: string;
  source: 'PERSONAL_LIBRARY' | 'COMMON';
  referenceId: string;
  destinationPath?: string;
}

export interface SaveModStudioLibraryFileInput extends ModStudioProjectScope {
  title: string;
  target: ModStudioTarget;
  path: string;
  content: string;
  tags?: string[];
}

/**
 * Storage contract consumed by Mod Studio. It deliberately has no generated
 * GraphQL types, JSON source maps, or transport-specific errors.
 */
export interface ModStudioProjectProvider {
  listProjects(scope: ModStudioProjectScope): Promise<ModStudioProjectSummary[]>;
  getProject(
    scope: ModStudioProjectScope & { projectId: string },
  ): Promise<ModStudioProject>;
  createProject(input: CreateModStudioProjectInput): Promise<ModStudioProject>;
  saveProject(input: SaveModStudioProjectInput): Promise<ModStudioProject>;
  listPersonalLibraryFiles(
    scope: ModStudioProjectScope,
  ): Promise<ModStudioReferenceFile[]>;
  listCommonFiles(scope: ModStudioProjectScope): Promise<ModStudioReferenceFile[]>;
  importReferenceFile(
    input: ImportModStudioReferenceFileInput,
  ): Promise<ModStudioProject>;
  savePersonalLibraryFile(
    input: SaveModStudioLibraryFileInput,
  ): Promise<ModStudioReferenceFile>;
}

/** Provider error indicating that the expected revision lost a save race. */
export class ModStudioRevisionConflictError extends Error {
  readonly code = 'PROJECT_REVISION_CONFLICT';

  constructor(
    message = 'The project changed in another session',
    readonly remoteProject?: ModStudioProject,
  ) {
    super(message);
    this.name = 'ModStudioRevisionConflictError';
  }
}

/** Provider error indicating that the write should be retried when online. */
export class ModStudioOfflineError extends Error {
  readonly code = 'PROJECT_OFFLINE';
  readonly cause?: unknown;

  constructor(message = 'The project service is offline', cause?: unknown) {
    super(message);
    this.name = 'ModStudioOfflineError';
    this.cause = cause;
  }
}

/** Validate and normalize a target-relative project path. */
export function normalizeModStudioPath(path: string): string {
  const normalized = path.trim().replace(/\\/gu, '/').replace(/^\.\/+/u, '');
  if (
    normalized.length === 0 ||
    normalized.length > 240 ||
    normalized.startsWith('/') ||
    normalized.endsWith('/') ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..') ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error(`Invalid project file path: ${path}`);
  }
  return normalized;
}

/** Stable key for maps, tabs, diagnostics, and tests. */
export function modStudioFileKey(
  target: ModStudioTarget,
  path: string,
): string {
  return `${target}:${normalizeModStudioPath(path)}`;
}

/**
 * Target-prefixed URI used by Monaco and the browser VFS. Both targets can
 * therefore load `Cargo.toml` and `src/lib.rs` at the same time.
 */
export function modStudioFileUri(
  workspaceUri: string,
  target: ModStudioTarget,
  path: string,
): string {
  const root = workspaceUri.replace(/\/+$/u, '');
  const encodedPath = normalizeModStudioPath(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `${root}/${target.toLowerCase()}/${encodedPath}`;
}

export function projectTargets(kind: ModStudioProjectKind): ModStudioTarget[] {
  if (kind === 'SERVER') return ['SERVER'];
  if (kind === 'CLIENT') return ['CLIENT'];
  return ['SERVER', 'CLIENT'];
}

export function cloneModStudioProject(project: ModStudioProject): ModStudioProject {
  return {
    ...project,
    metadata: { ...project.metadata },
    revision: { ...project.revision },
    files: project.files.map((file) => ({ ...file })),
  };
}
