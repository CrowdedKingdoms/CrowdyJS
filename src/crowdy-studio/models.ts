/** Compile targets supported by player-authored projects. */
export type CrowdyStudioTarget = 'SERVER' | 'CLIENT';

/** The target layout selected when a project is created. */
export type CrowdyStudioProjectKind = 'SERVER' | 'CLIENT' | 'FULL_STACK';

/**
 * Whether a full-stack server should advertise its client companion.
 * `OPTIONAL` records author intent without creating a runtime requirement;
 * `REQUIRED` is applied with `playerCompute.setRequires` after both targets
 * compile successfully.
 */
export type CrowdyStudioPairingPreference = 'NONE' | 'OPTIONAL' | 'REQUIRED';

/** A source file in one project target. Paths are relative to that target. */
export interface CrowdyStudioProjectFile {
  target: CrowdyStudioTarget;
  path: string;
  content: string;
}

/** A read-only source file made available to the browser language worker. */
export interface CrowdyStudioReferenceFile {
  id: string;
  source: 'PERSONAL_LIBRARY' | 'COMMON';
  title: string;
  /** Optional target fence. Omitted files are useful from either target. */
  target?: CrowdyStudioTarget;
  path: string;
  content: string;
  tags?: string[];
  updatedAt?: string;
}

export interface CrowdyStudioProjectMetadata {
  name: string;
  description?: string;
  serverModuleName?: string;
  clientModuleName?: string;
  pairingPreference: CrowdyStudioPairingPreference;
}

/** Immutable revision identity returned by the cloud project service. */
export interface CrowdyStudioProjectRevision {
  id: string;
  savedAt: string;
}

/**
 * One atomic cloud project snapshot. SERVER and CLIENT files intentionally
 * share a project revision so a full-stack save cannot persist half a pair.
 */
export interface CrowdyStudioProject {
  projectId: string;
  appId: string;
  gridId: string;
  kind: CrowdyStudioProjectKind;
  metadata: CrowdyStudioProjectMetadata;
  files: CrowdyStudioProjectFile[];
  sdkVersion: string;
  abiVersion: number;
  revision: CrowdyStudioProjectRevision;
  createdAt: string;
  updatedAt: string;
}

export interface CrowdyStudioProjectSummary {
  projectId: string;
  name: string;
  kind: CrowdyStudioProjectKind;
  revisionId: string;
  serverModuleName?: string;
  clientModuleName?: string;
  updatedAt: string;
}

/** Explicit persistence state rendered by Crowdy Studio. */
export type CrowdyStudioSaveState = 'SAVING' | 'SAVED' | 'CONFLICT' | 'OFFLINE';

export interface CrowdyStudioFileRef {
  source: 'PROJECT' | 'PERSONAL_LIBRARY' | 'COMMON';
  target?: CrowdyStudioTarget;
  path: string;
  referenceId?: string;
}

export interface CreateCrowdyStudioProjectInput {
  appId: string;
  gridId: string;
  kind: CrowdyStudioProjectKind;
  metadata: CrowdyStudioProjectMetadata;
  files: CrowdyStudioProjectFile[];
}

export interface SaveCrowdyStudioProjectInput {
  appId: string;
  gridId: string;
  projectId: string;
  /** Optimistic-concurrency precondition for the atomic project write. */
  expectedRevisionId: string;
  metadata: CrowdyStudioProjectMetadata;
  files: CrowdyStudioProjectFile[];
}

export interface CrowdyStudioProjectScope {
  appId: string;
  gridId: string;
}

export interface ImportCrowdyStudioReferenceFileInput extends CrowdyStudioProjectScope {
  projectId: string;
  expectedRevisionId: string;
  source: 'PERSONAL_LIBRARY' | 'COMMON';
  referenceId: string;
  destinationPath?: string;
}

export interface SaveCrowdyStudioLibraryFileInput extends CrowdyStudioProjectScope {
  title: string;
  target: CrowdyStudioTarget;
  path: string;
  content: string;
  tags?: string[];
}

/**
 * Storage contract consumed by Crowdy Studio. It deliberately has no generated
 * GraphQL types, JSON source maps, or transport-specific errors.
 */
export interface CrowdyStudioProjectProvider {
  listProjects(scope: CrowdyStudioProjectScope): Promise<CrowdyStudioProjectSummary[]>;
  getProject(
    scope: CrowdyStudioProjectScope & { projectId: string },
  ): Promise<CrowdyStudioProject>;
  createProject(input: CreateCrowdyStudioProjectInput): Promise<CrowdyStudioProject>;
  saveProject(input: SaveCrowdyStudioProjectInput): Promise<CrowdyStudioProject>;
  listPersonalLibraryFiles(
    scope: CrowdyStudioProjectScope,
  ): Promise<CrowdyStudioReferenceFile[]>;
  listCommonFiles(scope: CrowdyStudioProjectScope): Promise<CrowdyStudioReferenceFile[]>;
  importReferenceFile(
    input: ImportCrowdyStudioReferenceFileInput,
  ): Promise<CrowdyStudioProject>;
  savePersonalLibraryFile(
    input: SaveCrowdyStudioLibraryFileInput,
  ): Promise<CrowdyStudioReferenceFile>;
}

/** Provider error indicating that the expected revision lost a save race. */
export class CrowdyStudioRevisionConflictError extends Error {
  readonly code = 'PROJECT_REVISION_CONFLICT';

  constructor(
    message = 'The project changed in another session',
    readonly remoteProject?: CrowdyStudioProject,
  ) {
    super(message);
    this.name = 'CrowdyStudioRevisionConflictError';
  }
}

/** Provider error indicating that the write should be retried when online. */
export class CrowdyStudioOfflineError extends Error {
  readonly code = 'PROJECT_OFFLINE';
  readonly cause?: unknown;

  constructor(message = 'The project service is offline', cause?: unknown) {
    super(message);
    this.name = 'CrowdyStudioOfflineError';
    this.cause = cause;
  }
}

/** Validate and normalize a target-relative project path. */
export function normalizeCrowdyStudioPath(path: string): string {
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
export function crowdyStudioFileKey(
  target: CrowdyStudioTarget,
  path: string,
): string {
  return `${target}:${normalizeCrowdyStudioPath(path)}`;
}

/**
 * Target-prefixed URI used by Monaco and the browser VFS. Both targets can
 * therefore load `Cargo.toml` and `src/lib.rs` at the same time.
 */
export function crowdyStudioFileUri(
  workspaceUri: string,
  target: CrowdyStudioTarget,
  path: string,
): string {
  const root = workspaceUri.replace(/\/+$/u, '');
  const encodedPath = normalizeCrowdyStudioPath(path)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `${root}/${target.toLowerCase()}/${encodedPath}`;
}

export function projectTargets(kind: CrowdyStudioProjectKind): CrowdyStudioTarget[] {
  if (kind === 'SERVER') return ['SERVER'];
  if (kind === 'CLIENT') return ['CLIENT'];
  return ['SERVER', 'CLIENT'];
}

export function cloneCrowdyStudioProject(project: CrowdyStudioProject): CrowdyStudioProject {
  return {
    ...project,
    metadata: { ...project.metadata },
    revision: { ...project.revision },
    files: project.files.map((file) => ({ ...file })),
  };
}
