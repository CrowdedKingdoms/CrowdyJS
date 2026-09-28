import {
  PlayerCodeBroker,
  type PlayerCodeBrokerOptions,
  type PlayerCodeGridBounds,
} from '../player-runtime/player-code-broker.js';
import type {
  ExecAPI,
  ExecBuild,
  ExecConnection,
  ExecLogLine,
  ExecModClientArtifactBytes,
} from '../domains/exec.js';
import { CrowdyError, CrowdyGraphQLError } from '../errors.js';
import type { PlayerWalletAPI } from '../domains/playerWallet.js';
import {
  digestCanonicalJson,
  sha256Digest,
} from '../player-host/json-schema.js';
import { parseRustcDiagnostics, type CrowdyStudioDiagnostic } from './diagnostics.js';
import type {
  CrowdyStudioGitHubBindInitial,
  CrowdyStudioGitHubStatus,
  CrowdyStudioGitHubTransport,
} from './github/transport.js';
import { githubNewRepositoryUrl, githubRepositorySlug } from './github/new-repo.js';
import {
  cloneCrowdyStudioProject,
  crowdyStudioFileKey,
  normalizeCrowdyStudioPath,
  projectTargets,
  CrowdyStudioOfflineError,
  CrowdyStudioRevisionConflictError,
  type CrowdyStudioAtomicPatchInput,
  type CrowdyStudioAtomicPatchResult,
  type CrowdyStudioCheckpointMetadata,
  type CrowdyStudioFileRef,
  type CrowdyStudioPairingPreference,
  type CrowdyStudioProject,
  type CrowdyStudioProjectFile,
  type CrowdyStudioProjectMetadata,
  type CrowdyStudioProjectProvider,
  type CrowdyStudioProjectSummary,
  type CrowdyStudioReferenceFile,
  type CrowdyStudioSaveState,
  type CrowdyStudioSynchronizationProvider,
  type CrowdyStudioTarget,
  type CrowdyStudioProjectSynchronization,
} from './models.js';
import {
  createCrowdyStudioStarterProject,
  type CrowdyStudioNewProjectOptions,
} from './starter-projects.js';

export type CrowdyStudioPhase =
  | 'IDLE'
  | 'TESTING_DRAFT'
  | 'DEPLOYING_LIVE'
  | 'COMPILING'
  | 'ENABLING'
  | 'RUNNING'
  | 'COMPILE_FAILED'
  | 'STOPPING'
  | 'STOPPED'
  | 'PARTIAL_FAILURE'
  | 'ERROR';

export type CrowdyStudioPolledSurface = 'logs' | 'usage';

export interface CrowdyStudioRuntimeStatus {
  phase: CrowdyStudioPhase;
  target?: CrowdyStudioTarget;
  message?: string;
}

export type CrowdyStudioRuntimeSyncState =
  | 'NEVER_RUN'
  | 'RUNNING_SAVED'
  | 'RUNNING_STALE'
  | 'STOPPED';

export interface CrowdyStudioRuntimeSync {
  state: CrowdyStudioRuntimeSyncState;
  savedRevisionId?: string;
  runningRevisionId?: string;
  deployment?: 'DRAFT' | 'LIVE';
  startedAt?: string;
}

export interface CrowdyStudioDeployResult {
  deployment: 'DRAFT' | 'LIVE';
  status: 'RUNNING' | 'COMPILE_FAILED' | 'FAILED';
  projectRevisionId: string;
  targets: readonly CrowdyStudioTarget[];
  message: string;
}

export interface CrowdyStudioDeploymentPlan {
  expectedRevisionId: string;
  targets: readonly CrowdyStudioTarget[];
  pairingPreference?: CrowdyStudioPairingPreference;
  projectContentHash?: string;
}

export interface CrowdyStudioAgentWorkContext {
  projectId?: string;
  projectRevisionId?: string;
  saveState: 'SAVED';
  runtimeSync: CrowdyStudioRuntimeSync;
}

export interface CrowdyStudioWalletSnapshot {
  balanceCents: string;
  currency: string;
}

/** One line the SERVER target's mod logged (`ctx.log`), newest first in the state. */
export interface CrowdyStudioLogLine {
  id: string;
  moduleName: string;
  level: CrowdyStudioLogLevel;
  at: string;
  text: string;
}

export type CrowdyStudioLogLevel = 'error' | 'warn' | 'info' | 'debug';

/** A mod endpoint's decoded reply as JSON, and the call's round trip. */
export interface CrowdyStudioInvokeResult {
  resultJson: string;
  durationUs: number;
}

export interface CrowdyStudioState {
  projects: readonly CrowdyStudioProjectSummary[];
  project: CrowdyStudioProject | null;
  personalLibraryFiles: readonly CrowdyStudioReferenceFile[];
  commonFiles: readonly CrowdyStudioReferenceFile[];
  openFiles: readonly CrowdyStudioFileRef[];
  activeFile: CrowdyStudioFileRef | null;
  saveState: CrowdyStudioSaveState;
  saveMessage?: string;
  /** GitHub repository bound to the open project; null until fetched or when the SDK has no GitHub transport. */
  github: CrowdyStudioGitHubStatus | null;
  githubMessage?: string;
  githubBusy: boolean;
  /** `owner/name` the modder was sent to create on GitHub; the bind input is prefilled with it. */
  githubPendingRepo?: string;
  runtime: CrowdyStudioRuntimeStatus;
  runtimeSync: CrowdyStudioRuntimeSync;
  agentActivity: 'IDLE' | 'PREPARING' | 'WORKING' | 'PAUSED';
  checkpoints: readonly CrowdyStudioCheckpointMetadata[];
  buildOutput: string;
  authoritativeDiagnostics: readonly CrowdyStudioDiagnostic[];
  localDiagnostics: readonly CrowdyStudioDiagnostic[];
  logs: readonly CrowdyStudioLogLine[];
  wallet: CrowdyStudioWalletSnapshot | null;
  invokeResult: CrowdyStudioInvokeResult | null;
}

export type CrowdyStudioPlayerWallet = Pick<PlayerWalletAPI, 'balance'>;

/**
 * ck-exec mods (`client.exec`), what runs a project. The SERVER target of a new project starts
 * from the mod starter, builds the project's server crate and runs it as the grid's mod; the
 * Invoke and Logs panels call and read that mod. The CLIENT target is a `crowdy-client-sdk`
 * crate built as that mod's CLIENT half (`modClientBuild`), attached to it (`modClientDeploy`)
 * and previewed from the served artifact once its author consents to it. A CLIENT-only
 * project's CLIENT half rides the mod named for its CLIENT module, which Studio deploys from the
 * mod starter when the player has no mod of that name on the grid.
 */
export type CrowdyStudioMods = Pick<
  ExecAPI,
  | 'modStarter'
  | 'modBuild'
  | 'modBuildStatus'
  | 'modDeploy'
  | 'modSetEnabled'
  | 'modLogs'
  | 'myMods'
  | 'modClientBuild'
  | 'modClientDeploy'
  | 'consentClientMod'
  | 'modClientArtifactBytes'
  | 'connect'
>;

/** As ck-exec's mod names. */
const MOD_NAME = /^[a-z0-9_-]{1,48}$/;
/** As a ck-exec build's crate names. */
const CRATE_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const LOG_LEVELS: readonly CrowdyStudioLogLevel[] = ['error', 'warn', 'info', 'debug'];

export interface CrowdyStudioBroker {
  start(bytes: ArrayBuffer): Promise<void>;
  stop(): void;
}

export interface CrowdyStudioControllerOptions {
  projectProvider: CrowdyStudioProjectProvider;
  /** The project as a ck-exec mod and its CLIENT half (see {@link CrowdyStudioMods}). */
  mods: CrowdyStudioMods;
  playerWallet?: CrowdyStudioPlayerWallet;
  /**
   * GitHub repository card (bring-your-own repo). Optional: without it the
   * card is hidden. Reads and writes are resolved server-side from the
   * project's bind. Persistence of a bound project's files does NOT go
   * through this option — the project provider commits them itself — so the
   * card is purely bind / unbind / refresh / status.
   */
  github?: CrowdyStudioGitHubTransport;
  appId: string;
  gridId: string;
  initialProjectId?: string;
  /** Required only when a project has a CLIENT target. */
  grid?: PlayerCodeGridBounds;
  /** Platform-owned glue worker; required only for CLIENT execution. */
  workerUrl?: string | URL;
  /** Page-side allow-listed host-call router; required only for CLIENT execution. */
  onHostCall?: PlayerCodeBrokerOptions['onHostCall'];
  onPresentation?: PlayerCodeBrokerOptions['onPresentation'];
  /** Host-visible effective permissions; server authorization remains final. */
  targetPermissions?: Partial<
    Record<CrowdyStudioTarget, { canWrite: boolean; canRun: boolean }>
  >;
  /**
   * Local CLIENT tick cadence in ms, forwarded to
   * {@link PlayerCodeBrokerOptions.tickIntervalMs}. The host only ticks
   * when this is set (or when this default of 1000 ms applies). Omit/0 on
   * a raw {@link PlayerCodeBroker} is invoke-only.
   */
  /**
   * Override CLIENT tick cadence. When omitted, Studio reads
   * `[package.metadata.crowdy] tick_interval_ms` from the project's CLIENT
   * Cargo.toml (default 1000, clamped 16–1000); on ck-exec the served CLIENT
   * half carries the value its build read from that line.
   */
  clientTickIntervalMs?: number;
  autosaveMs?: number;
  retryMs?: number;
  compilePollMs?: number;
  compilePollLimit?: number;
  monitorPollMs?: number;
  /** Durable atomic-patch and checkpoint adapter, independent of GraphQL types. */
  synchronizationProvider?: CrowdyStudioSynchronizationProvider;
  onProjectSynchronized?: (
    project: CrowdyStudioProject,
    synchronization: CrowdyStudioProjectSynchronization,
  ) => void;
  sleep?: (ms: number) => Promise<void>;
  brokerFactory?: (options: PlayerCodeBrokerOptions) => CrowdyStudioBroker;
  isOnline?: () => boolean;
  onStateChange?: (state: CrowdyStudioState) => void;
}

export interface CrowdyStudioStopResult {
  serverStopped: boolean | null;
  clientStopped: boolean | null;
  failures: string[];
}

interface CompiledTarget {
  target: CrowdyStudioTarget;
  name: string;
  /** Player compute's version, a mod's version, or a CLIENT half's build id. */
  versionId: string;
}

class OperationCancelledError extends Error {}

/**
 * Headless project-first Crowdy Studio driver. It owns optimistic project saves,
 * file CRUD, deployment ordering, runtime polling, and client hot swaps; the
 * DOM mount is only a view over this state.
 */
export class CrowdyStudioController {
  private state: CrowdyStudioState = {
    projects: [],
    project: null,
    personalLibraryFiles: [],
    commonFiles: [],
    openFiles: [],
    activeFile: null,
    saveState: 'SAVED',
    github: null,
    githubBusy: false,
    runtime: { phase: 'IDLE' },
    runtimeSync: { state: 'NEVER_RUN' },
    agentActivity: 'IDLE',
    checkpoints: [],
    buildOutput: '',
    authoritativeDiagnostics: [],
    localDiagnostics: [],
    logs: [],
    wallet: null,
    invokeResult: null,
  };
  private readonly listeners = new Set<(state: CrowdyStudioState) => void>();
  private readonly humanEditListeners = new Set<() => void>();
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<boolean> | null = null;
  private editGeneration = 0;
  private persistedGeneration = 0;
  private conflictRemote: CrowdyStudioProject | null = null;
  private broker: CrowdyStudioBroker | null = null;
  private operationGeneration = 0;
  private agentOperationGeneration = 0;
  private readonly visibleSurfaces = new Set<CrowdyStudioPolledSurface>();
  private readonly surfaceTimers = new Map<
    CrowdyStudioPolledSurface,
    ReturnType<typeof setTimeout>
  >();
  private pageVisible = true;
  private destroyed = false;
  private readonly mods: CrowdyStudioMods;
  private modConnection: { name: string; connection: Promise<ExecConnection> } | null = null;

  constructor(private readonly options: CrowdyStudioControllerOptions) {
    if (!options.mods) {
      throw new Error('Crowdy Studio needs mods (client.exec): the SERVER target runs as a ck-exec mod');
    }
    this.mods = options.mods;
    if (options.onStateChange) this.listeners.add(options.onStateChange);
  }

  getState(): CrowdyStudioState {
    return this.state;
  }

  subscribe(listener: (state: CrowdyStudioState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to synchronous human-edit preemption signals. */
  onHumanEdit(listener: () => void): () => void {
    this.humanEditListeners.add(listener);
    return () => this.humanEditListeners.delete(listener);
  }

  /**
   * Flush autosave before a durable agent turn. Conflict/offline state fails
   * closed so Build never starts from an uncommitted browser snapshot.
   */
  async prepareForAgentWork(): Promise<CrowdyStudioAgentWorkContext> {
    this.ensureAlive();
    this.update({ agentActivity: 'PREPARING' });
    const saved = await this.saveNow();
    if (!saved || this.state.saveState !== 'SAVED') {
      this.update({ agentActivity: 'PAUSED' });
      throw new Error('Resolve the project save before starting agent work');
    }
    const project = this.state.project;
    this.update({ agentActivity: 'WORKING' });
    return {
      ...(project
        ? {
            projectId: project.projectId,
            projectRevisionId: project.revision.id,
          }
        : {}),
      saveState: 'SAVED',
      runtimeSync: { ...this.state.runtimeSync },
    };
  }

  finishAgentWork(paused = false): void {
    this.update({ agentActivity: paused ? 'PAUSED' : 'IDLE' });
  }

  beginAgentOperation(): number {
    return ++this.agentOperationGeneration;
  }

  /** Synchronously fence an in-flight agent compile/deploy/invoke operation. */
  cancelAgentOperation(message = 'Agent operation cancelled'): void {
    ++this.agentOperationGeneration;
    ++this.operationGeneration;
    this.update({
      agentActivity: 'PAUSED',
      runtime: { phase: 'IDLE', message },
    });
  }

  canTarget(
    target: CrowdyStudioTarget,
    action: 'write' | 'run',
  ): boolean {
    const permission = this.options.targetPermissions?.[target];
    return permission
      ? action === 'write'
        ? permission.canWrite
        : permission.canRun
      : true;
  }

  /** Credential-free context projection used by exact browser agent tools. */
  getAgentContext(): {
    appRef: string;
    projectRef?: string;
    gridRef: string;
    contextVersion: string;
    projectContentHash?: string;
  } {
    const project = this.state.project;
    return {
      appRef: this.options.appId,
      ...(project ? { projectRef: project.projectId } : {}),
      gridRef: this.options.gridId,
      contextVersion: digestCanonicalJson({
        contract: 'crowdy.studio-context/1',
        appRef: this.options.appId,
        gridRef: this.options.gridId,
        ...(project
          ? {
              projectRef: project.projectId,
              projectRevisionId: project.revision.id,
              projectContentHash: projectContentHash(project),
            }
          : {}),
        saveState: this.state.saveState,
        runtimeSync: this.state.runtimeSync,
      }),
      ...(project
        ? { projectContentHash: projectContentHash(project) }
        : {}),
    };
  }

  async initialize(): Promise<void> {
    this.ensureAlive();
    const scope = this.scope();
    let loaded: [
      CrowdyStudioProjectSummary[],
      CrowdyStudioReferenceFile[],
      CrowdyStudioReferenceFile[],
    ];
    try {
      loaded = await Promise.all([
        this.options.projectProvider.listProjects(scope),
        this.options.projectProvider.listPersonalLibraryFiles(scope),
        this.options.projectProvider.listCommonFiles(scope),
      ]);
    } catch (error) {
      if (
        error instanceof CrowdyStudioOfflineError ||
        this.options.isOnline?.() === false
      ) {
        this.update({
          saveState: 'OFFLINE',
          saveMessage: errorMessage(error),
        });
        return;
      }
      throw error;
    }
    const [projects, personalLibraryFiles, commonFiles] = loaded;
    this.update({
      projects,
      personalLibraryFiles,
      commonFiles,
      saveState: 'SAVED',
      saveMessage: undefined,
    });
    const first =
      projects.find(
        (project) => project.projectId === this.options.initialProjectId,
      ) ?? projects[0];
    if (first) await this.loadProject(first.projectId);
  }

  async createProject(
    options: Omit<CrowdyStudioNewProjectOptions, 'appId' | 'gridId'>,
  ): Promise<CrowdyStudioProject> {
    this.ensureAlive();
    if (this.state.project && !(await this.saveNow())) {
      throw new Error('Resolve or retry the current project save before creating another');
    }
    const modStarter = projectTargets(options.kind).includes('SERVER')
      ? await this.mods.modStarter(this.options.appId)
      : undefined;
    const input = createCrowdyStudioStarterProject({
      ...options,
      ...this.scope(),
      ...(modStarter ? { modStarter } : {}),
    });
    const project = await this.options.projectProvider.createProject(input);
    this.installProject(project);
    this.update({
      projects: upsertSummary(this.state.projects, summaryOf(project)),
      saveState: 'SAVED',
      saveMessage: undefined,
    });
    return project;
  }

  async switchProject(projectId: string): Promise<void> {
    if (this.state.project?.projectId === projectId) return;
    if (this.state.project && !(await this.saveNow())) {
      throw new Error('Resolve or retry the current project save before switching');
    }
    await this.loadProject(projectId);
  }

  /**
   * Re-fetch the open project after another writer changed it (the Studio
   * agent writes through the game API, not through this editor). Open files
   * and the active file survive when their paths still exist. Refused while
   * local edits are unsaved: the human's keystrokes win over a reload, and the
   * ordinary conflict recovery reconciles on the next save.
   */
  async reloadProject(): Promise<void> {
    this.ensureAlive();
    const current = this.state.project;
    if (!current) return;
    if (this.state.saveState !== 'SAVED') {
      throw new Error('Unsaved local edits; the reload waits for the next save');
    }
    const project = await this.options.projectProvider.getProject({
      ...this.scope(),
      projectId: current.projectId,
    });
    const openFiles = this.state.openFiles;
    const activeFile = this.state.activeFile;
    this.installProject(project);
    const stillThere = (ref: CrowdyStudioFileRef): boolean =>
      ref.source !== 'PROJECT' ||
      project.files.some((file) => file.target === ref.target && file.path === ref.path);
    const keptOpen = openFiles.filter(stillThere);
    if (keptOpen.length > 0) {
      this.update({
        openFiles: keptOpen,
        activeFile: activeFile && stillThere(activeFile) ? activeFile : keptOpen[0]!,
      });
    }
  }

  private async loadProject(projectId: string): Promise<void> {
    const project = await this.options.projectProvider.getProject({
      ...this.scope(),
      projectId,
    });
    this.installProject(project);
    if (this.options.synchronizationProvider) {
      await this.refreshCheckpoints();
    }
  }

  private installProject(project: CrowdyStudioProject): void {
    ++this.operationGeneration;
    this.stopSurfacePolling();
    this.broker?.stop();
    this.broker = null;
    this.closeModConnection();
    this.clearSaveTimers();
    this.editGeneration = 0;
    this.persistedGeneration = 0;
    this.conflictRemote = null;
    const clone = cloneCrowdyStudioProject(project);
    const preferred =
      clone.files.find((file) => file.path === 'src/lib.rs') ?? clone.files[0];
    const activeFile = preferred ? projectFileRef(preferred) : null;
    this.update({
      project: clone,
      openFiles: activeFile ? [activeFile] : [],
      activeFile,
      saveState: 'SAVED',
      saveMessage: undefined,
      runtime: { phase: 'IDLE' },
      runtimeSync: {
        state: 'NEVER_RUN',
        savedRevisionId: clone.revision.id,
      },
      agentActivity: 'IDLE',
      checkpoints: [],
      buildOutput: '',
      authoritativeDiagnostics: [],
      localDiagnostics: [],
      logs: [],
      invokeResult: null,
      github: null,
      githubMessage: undefined,
      githubBusy: false,
      githubPendingRepo: undefined,
    });
    this.restartVisibleSurfacePolling();
    // Status only; a pull is always the modder's explicit action.
    void this.refreshGitHubStatus();
  }

  openFile(ref: CrowdyStudioFileRef): void {
    this.requireFile(ref);
    const exists = this.state.openFiles.some((entry) => sameFileRef(entry, ref));
    this.update({
      openFiles: exists ? this.state.openFiles : [...this.state.openFiles, ref],
      activeFile: ref,
    });
  }

  closeFile(ref: CrowdyStudioFileRef): void {
    const openFiles = this.state.openFiles.filter(
      (entry) => !sameFileRef(entry, ref),
    );
    const activeFile =
      this.state.activeFile && sameFileRef(this.state.activeFile, ref)
        ? openFiles.at(-1) ?? null
        : this.state.activeFile;
    this.update({ openFiles, activeFile });
  }

  fileContent(ref: CrowdyStudioFileRef): string {
    return this.requireFile(ref).content;
  }

  addFile(target: CrowdyStudioTarget, path: string, content = ''): void {
    const project = this.requireProject();
    this.assertProjectTarget(project, target);
    const normalized = normalizeCrowdyStudioPath(path);
    if (
      project.files.some(
        (file) => file.target === target && file.path === normalized,
      )
    ) {
      throw new Error(`${target}:${normalized} already exists`);
    }
    project.files.push({ target, path: normalized, content });
    project.files.sort(compareProjectFile);
    const ref: CrowdyStudioFileRef = {
      source: 'PROJECT',
      target,
      path: normalized,
    };
    this.markEdited();
    this.openFile(ref);
  }

  renameFile(target: CrowdyStudioTarget, path: string, nextPath: string): void {
    const project = this.requireProject();
    const normalized = normalizeCrowdyStudioPath(path);
    const renamed = normalizeCrowdyStudioPath(nextPath);
    const file = project.files.find(
      (entry) => entry.target === target && entry.path === normalized,
    );
    if (!file) throw new Error(`${target}:${normalized} does not exist`);
    if (
      project.files.some(
        (entry) => entry.target === target && entry.path === renamed,
      )
    ) {
      throw new Error(`${target}:${renamed} already exists`);
    }
    file.path = renamed;
    project.files.sort(compareProjectFile);
    const replaceRef = (ref: CrowdyStudioFileRef): CrowdyStudioFileRef =>
      ref.source === 'PROJECT' &&
      ref.target === target &&
      ref.path === normalized
        ? { ...ref, path: renamed }
        : ref;
    this.update({
      openFiles: this.state.openFiles.map(replaceRef),
      activeFile: this.state.activeFile
        ? replaceRef(this.state.activeFile)
        : null,
    });
    this.markEdited();
  }

  deleteFile(target: CrowdyStudioTarget, path: string): void {
    const project = this.requireProject();
    const normalized = normalizeCrowdyStudioPath(path);
    const index = project.files.findIndex(
      (entry) => entry.target === target && entry.path === normalized,
    );
    if (index < 0) throw new Error(`${target}:${normalized} does not exist`);
    project.files.splice(index, 1);
    this.closeFile({ source: 'PROJECT', target, path: normalized });
    this.markEdited();
  }

  async importReferenceFile(
    reference: CrowdyStudioReferenceFile,
    destinationPath = reference.path,
  ): Promise<void> {
    this.requireProject();
    if (!(await this.saveNow())) {
      throw new Error('Resolve the current project save before importing a file');
    }
    const project = this.requireProject();
    const saved = await this.options.projectProvider.importReferenceFile({
      ...this.scope(),
      projectId: project.projectId,
      expectedRevisionId: project.revision.id,
      source: reference.source,
      referenceId: reference.id,
      destinationPath,
    });
    this.installProject(saved);
    this.update({
      projects: upsertSummary(this.state.projects, summaryOf(saved)),
    });
    const imported = saved.files.find(
      (file) =>
        file.target === reference.target &&
        file.path === normalizeCrowdyStudioPath(destinationPath),
    );
    if (imported) this.openFile(projectFileRef(imported));
  }

  async saveProjectFileToLibrary(
    target: CrowdyStudioTarget,
    path: string,
    title?: string,
  ): Promise<CrowdyStudioReferenceFile> {
    const file = this.requireProject().files.find(
      (entry) =>
        entry.target === target &&
        entry.path === normalizeCrowdyStudioPath(path),
    );
    if (!file) throw new Error(`${target}:${path} does not exist`);
    const saved = await this.options.projectProvider.savePersonalLibraryFile({
      ...this.scope(),
      title: title?.trim() || file.path.split('/').at(-1) || file.path,
      target,
      path: file.path,
      content: file.content,
    });
    this.update({
      personalLibraryFiles: upsertReference(
        this.state.personalLibraryFiles,
        saved,
      ),
    });
    return saved;
  }

  updateFile(target: CrowdyStudioTarget, path: string, content: string): void {
    const project = this.requireProject();
    const normalized = normalizeCrowdyStudioPath(path);
    const file = project.files.find(
      (entry) => entry.target === target && entry.path === normalized,
    );
    if (!file) throw new Error(`${target}:${normalized} does not exist`);
    if (file.content === content) return;
    file.content = content;
    this.markEdited();
  }

  updateSettings(
    patch: Partial<
      Pick<
        CrowdyStudioProjectMetadata,
        | 'name'
        | 'description'
        | 'serverModuleName'
        | 'clientModuleName'
        | 'pairingPreference'
      >
    >,
  ): void {
    const project = this.requireProject();
    project.metadata = {
      ...project.metadata,
      ...patch,
      pairingPreference:
        patch.pairingPreference ?? project.metadata.pairingPreference,
    };
    this.markEdited();
  }

  setPairingPreference(preference: CrowdyStudioPairingPreference): void {
    this.updateSettings({ pairingPreference: preference });
  }

  setLocalDiagnostics(diagnostics: readonly CrowdyStudioDiagnostic[]): void {
    this.update({ localDiagnostics: [...diagnostics] });
  }

  /**
   * Flush all edits in one optimistic-concurrency save. If edits arrive while
   * the request is in flight, a second atomic save follows with the new
   * revision instead of overwriting local content with the earlier response.
   */
  async saveNow(): Promise<boolean> {
    this.ensureAlive();
    this.clearTimer('autosave');
    if (!this.state.project) return true;
    if (this.savePromise) {
      await this.savePromise;
      if (this.persistedGeneration === this.editGeneration) return true;
    }
    this.savePromise = this.performSaveLoop();
    try {
      return await this.savePromise;
    } finally {
      this.savePromise = null;
    }
  }

  // ----- GitHub repository card ------------------------------------------

  private githubStatusGeneration = 0;

  /** Re-read connection + bind for the open project. Never changes files on its own. */
  async refreshGitHubStatus(): Promise<void> {
    if (!this.options.github) return;
    const generation = ++this.githubStatusGeneration;
    try {
      const github = await this.options.github.status({
        appId: this.options.appId,
        projectId: this.state.project?.projectId,
      });
      if (generation !== this.githubStatusGeneration) return;
      this.update({ github, githubMessage: undefined });
    } catch (error) {
      if (generation !== this.githubStatusGeneration) return;
      this.update({ githubMessage: errorMessage(error) });
    }
  }

  private githubScope(): { appId: string; projectId: string } | null {
    const projectId = this.state.project?.projectId;
    return projectId ? { appId: this.options.appId, projectId } : null;
  }

  /** Opens the install page in a new tab; identity comes back through the signed state, never the browser. */
  async connectGitHub(): Promise<string> {
    if (!this.options.github) throw new Error('GitHub is not available in this Studio.');
    const { connectUrl } = await this.options.github.connectUrl();
    if (typeof window !== 'undefined') window.open(connectUrl, '_blank', 'noopener,noreferrer');
    this.update({ githubMessage: 'Finish installing on GitHub in the new tab, then Refresh.' });
    return connectUrl;
  }

  /**
   * Open GitHub's "new repository" page prefilled for the open project
   * (connected login as owner, project name as the repository name, private).
   * The App cannot create the repository itself — it holds installation
   * tokens only — so this is the modder's click; what comes back is a
   * repository the bind form already names. Returns the URL it opened.
   *
   * The card's bind input is prefilled with `owner/name` so that, on a host
   * whose GitHub transport carries the identity session (hosted Studio), Bind
   * is the next click. A game's app token cannot bind; there the message says
   * to finish in Crowdy Studio.
   */
  createGitHubRepository(): string {
    if (!this.options.github) throw new Error('GitHub is not available in this Studio.');
    const project = this.requireProject();
    const github = this.state.github;
    if (!github?.connected) {
      throw new Error('Connect GitHub first; the repository is created under your GitHub account.');
    }
    const owner = github.accountLogin ?? undefined;
    const name = githubRepositorySlug(project.metadata.name);
    const url = githubNewRepositoryUrl({
      owner,
      name,
      description: project.metadata.description ?? `Crowdy Studio mod: ${project.metadata.name}`,
    });
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    const slug = owner ? `${owner}/${name}` : name;
    this.update({
      githubPendingRepo: slug,
      githubMessage:
        github.repositorySelection === 'selected'
          ? `Create ${slug} on GitHub, add it to your Crowdy Studio installation, then bind it (Push this project).`
          : `Create ${slug} on GitHub, then bind it (Push this project).`,
    });
    return url;
  }

  /**
   * Bind the open project to `owner/repo` or `owner/repo@branch`, choosing
   * which side is the truth for the first commit. Refuses over unsaved edits
   * so what is pushed (or replaced) is exactly what the server holds. The
   * project is re-read afterwards: TAKE_REPOSITORY replaced its files, and
   * both paths gave it a `github.sha`.
   */
  async bindGitHubRepo(
    slug: string,
    initial: CrowdyStudioGitHubBindInitial = 'PUSH_PROJECT',
  ): Promise<void> {
    if (!this.options.github) throw new Error('GitHub is not available in this Studio.');
    const scope = this.githubScope();
    if (!scope) throw new Error('Open a Studio project before binding a repository.');
    if (this.editGeneration !== this.persistedGeneration) {
      throw new Error('Save Studio edits before binding a repository.');
    }
    const trimmed = slug.trim();
    const at = trimmed.lastIndexOf('@');
    const repoPath = at > 0 ? trimmed.slice(0, at) : trimmed;
    const branch = at > 0 ? trimmed.slice(at + 1).trim() : '';
    const slash = repoPath.indexOf('/');
    if (slash <= 0 || slash === repoPath.length - 1) {
      throw new Error('Use owner/repo or owner/repo@branch');
    }
    this.update({ githubBusy: true });
    try {
      const github = await this.options.github.bind({
        ...scope,
        owner: repoPath.slice(0, slash),
        repo: repoPath.slice(slash + 1),
        ...(branch ? { branch } : {}),
        initial,
      });
      await this.reloadProject();
      this.update({
        github,
        githubPendingRepo: undefined,
        githubMessage:
          initial === 'PUSH_PROJECT'
            ? `Pushed the project to ${github.owner}/${github.repo}@${github.branch}. It is the working tree now; edits commit as you save.`
            : `Took ${github.owner}/${github.repo}@${github.branch} as the project. Edits commit as you save.`,
      });
    } finally {
      this.update({ githubBusy: false });
    }
  }

  /** Clear the bind. The files stay; the project is a Studio project again. */
  async unbindGitHub(): Promise<void> {
    if (!this.options.github) return;
    const scope = this.githubScope();
    if (!scope) return;
    if (this.editGeneration !== this.persistedGeneration) {
      this.update({ githubMessage: 'Save edits before unbinding.' });
      return;
    }
    this.update({ githubBusy: true });
    try {
      const github = await this.options.github.unbind(scope);
      await this.reloadProject();
      this.update({ github, githubMessage: 'Repository unbound. The files stay in Studio.' });
    } finally {
      this.update({ githubBusy: false });
    }
  }

  /**
   * Bring the project to the branch head after a push made outside Studio.
   * Refuses over unsaved edits (they would be committed against the old head
   * and refused anyway, less legibly).
   */
  async refreshFromGitHub(): Promise<boolean> {
    if (!this.options.github) return false;
    const scope = this.githubScope();
    if (!scope || !this.state.project?.github) {
      this.update({ githubMessage: 'Bind a repository first.' });
      return false;
    }
    if (this.editGeneration !== this.persistedGeneration) {
      this.update({ githubMessage: 'Save Studio edits before refreshing from GitHub.' });
      return false;
    }
    this.update({ githubBusy: true });
    try {
      const before = this.state.project.github.sha;
      const github = await this.options.github.refresh(scope);
      await this.reloadProject();
      this.update({
        github,
        githubMessage:
          github.githubSha === before
            ? 'Already at the branch head.'
            : `Refreshed to ${github.githubSha?.slice(0, 7) ?? 'head'}.`,
      });
      return true;
    } catch (error) {
      this.update({ githubMessage: `GitHub refresh failed: ${errorMessage(error)}` });
      return false;
    } finally {
      this.update({ githubBusy: false });
    }
  }

  async retrySave(): Promise<boolean> {
    this.clearTimer('retry');
    if (!this.state.project) {
      this.update({ saveState: 'SAVING', saveMessage: undefined });
      await this.initialize();
      return this.state.saveState !== 'OFFLINE';
    }
    if (this.state.saveState === 'CONFLICT') return false;
    this.update({ saveState: 'SAVING', saveMessage: undefined });
    return this.saveNow();
  }

  async acceptRemoteConflict(): Promise<void> {
    if (this.state.saveState !== 'CONFLICT') return;
    const remote =
      this.conflictRemote ??
      (await this.options.projectProvider.getProject({
        ...this.scope(),
        projectId: this.requireProject().projectId,
      }));
    this.installProject(remote);
  }

  async overwriteConflict(): Promise<boolean> {
    if (this.state.saveState !== 'CONFLICT') return this.saveNow();
    const project = this.requireProject();
    const remote =
      this.conflictRemote ??
      (await this.options.projectProvider.getProject({
        ...this.scope(),
        projectId: project.projectId,
      }));
    project.revision = { ...remote.revision };
    this.conflictRemote = null;
    this.update({ saveState: 'SAVING', saveMessage: undefined });
    return this.saveNow();
  }

  async refreshCheckpoints(): Promise<readonly CrowdyStudioCheckpointMetadata[]> {
    const project = this.requireProject();
    const checkpoints = this.options.synchronizationProvider
      ? await this.options.synchronizationProvider.listCheckpoints({
          ...this.scope(),
          projectId: project.projectId,
        })
      : this.state.checkpoints;
    this.update({ checkpoints: [...checkpoints] });
    return checkpoints;
  }

  /**
   * Validate every change against one immutable baseline, then persist and
   * synchronize all files or none. Routine agent patches cannot delete/rename.
   */
  async applyAtomicPatch(
    input: CrowdyStudioAtomicPatchInput,
  ): Promise<CrowdyStudioAtomicPatchResult> {
    if (!(await this.saveNow())) {
      throw new Error('Resolve the current project save before applying an agent patch');
    }
    const baseline = cloneCrowdyStudioProject(this.requireProject());
    if (baseline.revision.id !== input.expectedRevisionId) {
      throw new CrowdyStudioRevisionConflictError(
        `Expected revision ${input.expectedRevisionId}, found ${baseline.revision.id}`,
        baseline,
      );
    }
    applyValidatedPatch(baseline, input);
    if (!this.options.synchronizationProvider) {
      throw new Error(
        'Atomic agent patches require a durable synchronization provider',
      );
    }
    const result = await this.options.synchronizationProvider.applyAtomicPatch({
      ...this.scope(),
      projectId: baseline.projectId,
      expectedRevisionId: input.expectedRevisionId,
      changes: input.changes,
    });
    if (result.project.projectId !== baseline.projectId) {
      throw new Error('Atomic patch returned a different project');
    }
    if (
      result.project.revision.id === baseline.revision.id ||
      result.checkpoint.projectRevisionId !== baseline.revision.id
    ) {
      throw new Error('Atomic patch returned invalid revision/checkpoint metadata');
    }
    for (const change of input.changes) {
      const persisted = result.project.files.find(
        (file) =>
          file.target === change.target &&
          file.path === normalizeCrowdyStudioPath(change.path),
      );
      if (!persisted || persisted.content !== change.content) {
        throw new Error(`Atomic patch did not synchronize ${change.target}:${change.path}`);
      }
    }
    this.synchronizeProject(result.project, {
      source: 'AGENT',
      expectedPreviousRevisionId: baseline.revision.id,
      checkpoint: result.checkpoint,
    });
    return result;
  }

  /**
   * Apply a server-published project revision to Monaco/kernel state. Pending
   * human edits win and turn the update into an explicit conflict.
   */
  synchronizeProject(
    project: CrowdyStudioProject,
    synchronization: CrowdyStudioProjectSynchronization,
  ): void {
    const current = this.requireProject();
    if (project.projectId !== current.projectId) {
      throw new Error('Project synchronization target does not match the open project');
    }
    if (
      synchronization.expectedPreviousRevisionId &&
      synchronization.expectedPreviousRevisionId !== current.revision.id
    ) {
      throw new CrowdyStudioRevisionConflictError(
        'Project synchronization started from a stale revision',
        project,
      );
    }
    if (this.persistedGeneration !== this.editGeneration) {
      this.conflictRemote = cloneCrowdyStudioProject(project);
      this.update({
        saveState: 'CONFLICT',
        saveMessage: 'Human edits preempted an incoming agent project revision',
        agentActivity: 'PAUSED',
      });
      throw new CrowdyStudioRevisionConflictError(
        'Human edits preempted the agent project synchronization',
        project,
      );
    }
    this.clearSaveTimers();
    const clone = cloneCrowdyStudioProject(project);
    this.editGeneration = 0;
    this.persistedGeneration = 0;
    this.conflictRemote = null;
    const openFiles = this.state.openFiles.filter((ref) =>
      fileRefExists(clone, this.state, ref),
    );
    const activeFile =
      this.state.activeFile &&
      openFiles.some((ref) => sameFileRef(ref, this.state.activeFile!))
        ? this.state.activeFile
        : openFiles.at(-1) ?? null;
    const checkpoint = synchronization.checkpoint;
    this.update({
      project: clone,
      projects: upsertSummary(this.state.projects, summaryOf(clone)),
      openFiles,
      activeFile,
      saveState: 'SAVED',
      saveMessage: undefined,
      checkpoints: checkpoint
        ? upsertCheckpoint(this.state.checkpoints, checkpoint)
        : this.state.checkpoints,
      runtimeSync: {
        ...this.state.runtimeSync,
        savedRevisionId: clone.revision.id,
        state:
          this.state.runtimeSync.state === 'RUNNING_SAVED' ||
          this.state.runtimeSync.state === 'RUNNING_STALE'
            ? this.state.runtimeSync.runningRevisionId === clone.revision.id
              ? 'RUNNING_SAVED'
              : 'RUNNING_STALE'
            : this.state.runtimeSync.state,
      },
    });
    this.options.onProjectSynchronized?.(
      cloneCrowdyStudioProject(clone),
      synchronization,
    );
  }

  async restoreCheckpoint(
    checkpointId: string,
    approvalGrant: string,
    expectedRevisionId = this.requireProject().revision.id,
  ): Promise<CrowdyStudioCheckpointMetadata> {
    if (approvalGrant.trim().length < 8) {
      throw new Error('Checkpoint restore requires an opaque exact approval grant');
    }
    if (!(await this.saveNow())) {
      throw new Error('Resolve the current project save before restoring a checkpoint');
    }
    const current = cloneCrowdyStudioProject(this.requireProject());
    if (current.revision.id !== expectedRevisionId) {
      throw new CrowdyStudioRevisionConflictError(
        `Expected revision ${expectedRevisionId}, found ${current.revision.id}`,
        current,
      );
    }
    let restoredProject: CrowdyStudioProject;
    let preRestoreCheckpoint: CrowdyStudioCheckpointMetadata;
    if (!this.options.synchronizationProvider) {
      throw new Error(
        'Checkpoint restore requires a durable synchronization provider',
      );
    }
    const restored = await this.options.synchronizationProvider.restoreCheckpoint({
      ...this.scope(),
      projectId: current.projectId,
      checkpointId,
      expectedRevisionId,
      approvalGrant,
    });
    restoredProject = restored.project;
    preRestoreCheckpoint = restored.preRestoreCheckpoint;
    if (
      restoredProject.projectId !== current.projectId ||
      restoredProject.revision.id === current.revision.id ||
      preRestoreCheckpoint.projectRevisionId !== current.revision.id
    ) {
      throw new Error('Checkpoint restore returned invalid synchronization metadata');
    }
    this.synchronizeProject(restoredProject, {
      source: 'AGENT',
      expectedPreviousRevisionId: expectedRevisionId,
      checkpoint: preRestoreCheckpoint,
    });
    return preRestoreCheckpoint;
  }

  async testDraft(agentOperation?: number): Promise<CrowdyStudioDeployResult> {
    return this.deployProject(true, agentOperation);
  }

  async testDraftPlan(
    plan: CrowdyStudioDeploymentPlan,
    agentOperation?: number,
  ): Promise<CrowdyStudioDeployResult> {
    return this.deployProject(true, agentOperation, plan);
  }

  async deployLive(agentOperation?: number): Promise<CrowdyStudioDeployResult> {
    return this.deployProject(false, agentOperation);
  }

  async deployLivePlan(
    plan: CrowdyStudioDeploymentPlan,
    agentOperation?: number,
  ): Promise<CrowdyStudioDeployResult> {
    return this.deployProject(false, agentOperation, plan);
  }

  private async deployProject(
    draft: boolean,
    agentOperation?: number,
    plan?: CrowdyStudioDeploymentPlan,
  ): Promise<CrowdyStudioDeployResult> {
    this.checkAgentOperation(agentOperation);
    this.requireProject();
    if (!(await this.saveNow())) {
      this.setRuntime('ERROR', 'Project must be saved before it can be built');
      return {
        deployment: draft ? 'DRAFT' : 'LIVE',
        status: 'FAILED',
        projectRevisionId: this.requireProject().revision.id,
        targets: projectTargets(this.requireProject().kind),
        message: 'Project must be saved before it can be built',
      };
    }
    this.checkAgentOperation(agentOperation);
    const project = this.requireProject();
    if (plan) this.assertDeploymentPlan(project, plan, draft);
    const targets = plan ? [...plan.targets] : projectTargets(project.kind);
    const operation = ++this.operationGeneration;
    this.stopSurfacePolling();
    this.update({
      runtime: { phase: draft ? 'TESTING_DRAFT' : 'DEPLOYING_LIVE' },
      buildOutput: '',
      authoritativeDiagnostics: [],
    });
    try {
      if (targets.length === 1) {
        const target = targets[0];
        const compiled = await this.compileTarget(project, target, operation);
        if (!compiled) {
          return {
            deployment: draft ? 'DRAFT' : 'LIVE',
            status: 'COMPILE_FAILED',
            projectRevisionId: project.revision.id,
            targets,
            message: this.state.runtime.message ?? 'Compilation failed',
          };
        }
        if (target === 'SERVER') {
          await this.enableServer(compiled.name, operation);
        } else {
          await this.runClient(compiled, operation);
        }
      } else {
        // Compile the client first so a client failure never publishes a new
        // server version.
        const client = await this.compileTarget(project, 'CLIENT', operation);
        if (!client) {
          return {
            deployment: draft ? 'DRAFT' : 'LIVE',
            status: 'COMPILE_FAILED',
            projectRevisionId: project.revision.id,
            targets,
            message: this.state.runtime.message ?? 'Client compilation failed',
          };
        }
        const server = await this.compileTarget(project, 'SERVER', operation);
        if (!server) {
          return {
            deployment: draft ? 'DRAFT' : 'LIVE',
            status: 'COMPILE_FAILED',
            projectRevisionId: project.revision.id,
            targets,
            message: this.state.runtime.message ?? 'Server compilation failed',
          };
        }
        this.checkOperation(operation);
        // A mod has no client pairing: its players call it by name.
        await this.enableServer(server.name, operation);
        await this.runClient(client, operation);
      }
      this.update({
        runtime: {
          phase: 'RUNNING',
          message: draft ? 'Draft test is running' : 'Project is live',
        },
        runtimeSync: {
          state: 'RUNNING_SAVED',
          savedRevisionId: project.revision.id,
          runningRevisionId: project.revision.id,
          deployment: draft ? 'DRAFT' : 'LIVE',
          startedAt: new Date().toISOString(),
        },
      });
      await this.refreshSurface('usage').catch(() => {});
      return {
        deployment: draft ? 'DRAFT' : 'LIVE',
        status: 'RUNNING',
        projectRevisionId: project.revision.id,
        targets,
        message: draft ? 'Draft test is running' : 'Project is live',
      };
    } catch (error) {
      if (error instanceof OperationCancelledError) {
        return {
          deployment: draft ? 'DRAFT' : 'LIVE',
          status: 'FAILED',
          projectRevisionId: project.revision.id,
          targets,
          message: 'Deployment was cancelled',
        };
      }
      this.setRuntime('ERROR', errorMessage(error));
      return {
        deployment: draft ? 'DRAFT' : 'LIVE',
        status: 'FAILED',
        projectRevisionId: project.revision.id,
        targets,
        message: errorMessage(error),
      };
    } finally {
      if (operation === this.operationGeneration) {
        this.restartVisibleSurfacePolling();
      }
    }
  }

  private async compileTarget(
    project: CrowdyStudioProject,
    target: CrowdyStudioTarget,
    operation: number,
  ): Promise<CompiledTarget | null> {
    if (!this.canTarget(target, 'write')) {
      throw new Error(`${target} authoring is unavailable on this grid`);
    }
    const name = moduleNameFor(project, target);
    const files = project.files.filter((file) => file.target === target);
    if (files.length === 0) throw new Error(`${target} has no project files`);
    this.update({
      runtime: {
        phase: 'COMPILING',
        target,
        message: `Submitting ${name}`,
      },
    });
    return target === 'SERVER'
      ? this.buildMod(name, files, operation)
      : this.buildClientHalf(name, files, operation);
  }

  /**
   * The SERVER target as a ck-exec mod: the project's server crate files, built on the
   * platform, then deployed to this grid (switched off until {@link enableServer}). Other
   * project files, such as grid program assets, are not part of the crate.
   */
  private async buildMod(
    name: string,
    files: readonly { path: string; content: string }[],
    operation: number,
  ): Promise<CompiledTarget | null> {
    const mods = this.mods;
    const problem = modNameProblem(this.requireProject());
    if (problem) throw new Error(problem);
    const { appId, gridId } = this.scope();
    const queued = await mods.modBuild(appId, {
      name: crateName(name),
      files: crateFiles(files),
    });
    this.checkOperation(operation);
    const built = await this.awaitModBuild('SERVER', name, queued.buildId, operation);
    if (!built) return null;
    const mod = await mods.modDeploy(appId, gridId, name, built.buildId);
    this.checkOperation(operation);
    return { target: 'SERVER', name, versionId: String(mod.version) };
  }

  /**
   * The CLIENT target as a ck-exec mod's CLIENT half: the project's `crowdy-client-sdk` crate,
   * built on the platform (`modClientBuild`, a build of `kind` `client`). It is attached to the
   * project's mod when the project runs ({@link attachClientHalf}).
   */
  private async buildClientHalf(
    name: string,
    files: readonly { path: string; content: string }[],
    operation: number,
  ): Promise<CompiledTarget | null> {
    const problem = modNameProblem(this.requireProject());
    if (problem) throw new Error(problem);
    const cargo = files.find((file) => file.path === 'Cargo.toml')?.content ?? '';
    if (/^\s*crowdy-compute-sdk\s*=/m.test(cargo)) {
      this.recordBuild('CLIENT', LEGACY_CLIENT_CRATE);
      this.update({
        runtime: {
          phase: 'COMPILE_FAILED',
          target: 'CLIENT',
          message: `${name} is a legacy player compute crate; a CLIENT half builds on crowdy-client-sdk`,
        },
      });
      return null;
    }
    const queued = await this.mods.modClientBuild(this.options.appId, {
      name: crateName(name),
      files: crateFiles(files),
    });
    this.checkOperation(operation);
    const built = await this.awaitModBuild('CLIENT', name, queued.buildId, operation);
    return built ? { target: 'CLIENT', name, versionId: built.buildId } : null;
  }

  /** Polls a mod build, a mod's or a CLIENT half's, recording its log; null when it did not succeed. */
  private async awaitModBuild(
    target: CrowdyStudioTarget,
    name: string,
    buildId: string,
    operation: number,
  ): Promise<ExecBuild | null> {
    const mods = this.mods;
    const limit = this.options.compilePollLimit ?? 60;
    const pollMs = this.options.compilePollMs ?? 1_500;
    for (let attempt = 0; attempt < limit; attempt++) {
      const b = await mods.modBuildStatus(this.options.appId, buildId);
      this.checkOperation(operation);
      if (b.status === 'succeeded') {
        this.recordBuild(target, b.log ?? '');
        return b;
      }
      if (b.status === 'failed') {
        this.recordBuild(target, b.log ?? 'Compilation failed without output');
        this.update({
          runtime: {
            phase: 'COMPILE_FAILED',
            target,
            message: `${name} failed to compile`,
          },
        });
        return null;
      }
      await this.sleep(pollMs);
      this.checkOperation(operation);
    }
    const timeout = `Compilation timed out after ${limit} polls`;
    this.recordBuild(target, timeout);
    this.update({
      runtime: { phase: 'COMPILE_FAILED', target, message: timeout },
    });
    return null;
  }

  /**
   * Attaches a built CLIENT half to the project's mod, consents to it as its author (the API
   * serves a CLIENT half only to a player who consented or trusts its author, the author too) and
   * fetches the served module for this browser's preview. A CLIENT-only project first makes sure
   * the mod it rides is the player's and switched on.
   */
  private async attachClientHalf(
    compiled: CompiledTarget,
    operation: number,
  ): Promise<ExecModClientArtifactBytes> {
    const mods = this.mods;
    const { appId, gridId } = this.scope();
    const project = this.requireProject();
    const modName = projectModName(project);
    if (!projectTargets(project.kind).includes('SERVER')) {
      await this.ensureClientOnlyMod(modName, operation);
    }
    this.update({
      runtime: { phase: 'ENABLING', target: 'CLIENT', message: `Attaching ${compiled.name} to ${modName}` },
    });
    const attached = await mods.modClientDeploy(appId, gridId, modName, compiled.versionId);
    this.checkOperation(operation);
    await mods.consentClientMod(appId, attached.modId, attached.capabilityHash);
    this.checkOperation(operation);
    this.recordNote(
      'CLIENT',
      `Attached to mod '${modName}' as CLIENT version ${attached.clientVersion} (capabilities ` +
        `${attached.capabilityHash}; ticks every ${attached.tickIntervalMs} ms). Visitors of grid ` +
        `${gridId} run it once they consent to it or trust you; you consented to it as its author.`,
    );
    let artifact: ExecModClientArtifactBytes;
    try {
      artifact = await mods.modClientArtifactBytes(appId, attached.modId);
    } catch (error) {
      if (error instanceof CrowdyGraphQLError && error.code === 'NOT_FOUND') {
        throw new CrowdyError({
          message:
            `${compiled.name} is attached to mod '${modName}', but its preview did not load: the ` +
            'API serves a CLIENT half only while its mod is switched on and not held, to a player ' +
            `with run_client_code who stands in grid ${gridId}`,
          cause: error,
        });
      }
      if (error instanceof CrowdyGraphQLError && error.code === 'RATE_LIMITED') {
        throw new CrowdyError({
          message:
            `${compiled.name} is attached to mod '${modName}', but its preview was fetched too ` +
            'often (12 a minute); deploy again in a minute',
          cause: error,
        });
      }
      throw error;
    }
    this.checkOperation(operation);
    if (artifact.digest !== attached.digest || artifact.clientVersion !== attached.clientVersion) {
      throw new Error('The served CLIENT half is not the one just attached; deploy again');
    }
    return artifact;
  }

  /**
   * A CLIENT half rides a mod: without a mod of this name running as the player on the grid,
   * the mod starter's server half is deployed under it first, and the log says so. The mod is
   * switched on, since only a running mod's CLIENT half is served.
   */
  private async ensureClientOnlyMod(name: string, operation: number): Promise<void> {
    const mods = this.mods;
    const { appId, gridId } = this.scope();
    const mine = (await mods.myMods(appId)).find(
      (mod) => String(mod.gridId) === gridId && mod.name === name,
    );
    this.checkOperation(operation);
    if (!mine) {
      if (!this.canTarget('SERVER', 'write') || !this.canTarget('SERVER', 'run')) {
        throw new Error(
          `A CLIENT half rides a mod, and grid ${gridId} has no mod '${name}' of yours; deploying one needs SERVER write and run permissions here`,
        );
      }
      this.update({
        runtime: { phase: 'COMPILING', target: 'SERVER', message: `Deploying the mod starter as ${name}` },
      });
      const starter = await mods.modStarter(appId);
      this.checkOperation(operation);
      const queued = await mods.modBuild(appId, { name: crateName(name), files: starter.files });
      this.checkOperation(operation);
      const built = await this.awaitModBuild('SERVER', name, queued.buildId, operation);
      if (!built) {
        throw new Error(`The mod starter did not build, so the CLIENT half has no mod '${name}' to ride`);
      }
      await mods.modDeploy(appId, gridId, name, built.buildId);
      this.checkOperation(operation);
      this.recordNote(
        'SERVER',
        `Grid ${gridId} had no mod '${name}' of yours, and a CLIENT half rides a mod: deployed the ` +
          `ck-exec mod starter (${starter.crate}) as '${name}', its server half.`,
      );
    }
    if (!mine?.enabled) {
      await mods.modSetEnabled(appId, gridId, name, true);
      this.checkOperation(operation);
      if (mine) this.recordNote('SERVER', `Switched mod '${name}' on, so its CLIENT half is served.`);
    }
  }

  private recordNote(target: CrowdyStudioTarget, note: string): void {
    this.update({
      buildOutput: [this.state.buildOutput, `## ${target}\n${note}`].filter(Boolean).join('\n\n'),
    });
  }

  private recordBuild(target: CrowdyStudioTarget, log: string): void {
    const section = `## ${target}\n${log || 'Compiled successfully.'}`;
    const authoritativeDiagnostics = [
      ...this.state.authoritativeDiagnostics.filter(
        (diagnostic) => diagnostic.target !== target,
      ),
      ...parseRustcDiagnostics(log, target),
    ];
    this.update({
      buildOutput: [this.state.buildOutput, section].filter(Boolean).join('\n\n'),
      authoritativeDiagnostics,
    });
  }

  private async enableServer(name: string, operation: number): Promise<void> {
    if (!this.canTarget('SERVER', 'run')) {
      throw new Error(
        `${name} compiled successfully, but run_server_code is unavailable on this grid`,
      );
    }
    this.update({
      runtime: { phase: 'ENABLING', target: 'SERVER', message: `Enabling ${name}` },
    });
    await this.setServerEnabled(name, true);
    this.checkOperation(operation);
  }

  private async setServerEnabled(name: string, enabled: boolean): Promise<void> {
    const { appId, gridId } = this.scope();
    await this.mods.modSetEnabled(appId, gridId, name, enabled);
  }

  private async runClient(
    compiled: CompiledTarget,
    operation: number,
  ): Promise<void> {
    if (!this.canTarget('CLIENT', 'run')) {
      throw new Error(
        `${compiled.name} compiled successfully, but run_client_code is unavailable on this grid`,
      );
    }
    const runtime = this.clientRuntimeOptions();
    const half = await this.attachClientHalf(compiled, operation);
    const brokerOptions: PlayerCodeBrokerOptions = {
      ...runtime,
      engine: 'ck-exec',
      moduleName: half.name,
      artifactHash: half.digest,
      fuelPerDispatch: half.fuelPerDispatch,
      consentedHostCalls: half.capabilitySummary.hostFunctions,
      onPresentation: this.options.onPresentation,
      tickIntervalMs: this.options.clientTickIntervalMs ?? half.tickIntervalMs,
    };
    const broker =
      this.options.brokerFactory?.(brokerOptions) ??
      new PlayerCodeBroker(brokerOptions);
    await broker.start(half.bytes);
    this.checkOperation(operation);
    const previous = this.broker;
    this.broker = broker;
    previous?.stop();
  }

  async stopProject(): Promise<CrowdyStudioStopResult> {
    const project = this.requireProject();
    ++this.operationGeneration;
    this.stopSurfacePolling();
    this.update({ runtime: { phase: 'STOPPING' } });
    const failures: string[] = [];
    let serverStopped: boolean | null = null;
    let clientStopped: boolean | null = null;

    if (projectTargets(project.kind).includes('CLIENT')) {
      clientStopped = true;
      try {
        this.broker?.stop();
      } catch (error) {
        clientStopped = false;
        failures.push(`Client: ${errorMessage(error)}`);
      } finally {
        this.broker = null;
      }
    }

    // A CLIENT-only project's CLIENT half rides a mod too: switched off, it is no longer served
    // to visitors.
    serverStopped = false;
    try {
      await this.setServerEnabled(projectModName(project), false);
      serverStopped = true;
    } catch (error) {
      failures.push(`Server: ${errorMessage(error)}`);
    }

    const result = { serverStopped, clientStopped, failures };
    this.update({
      runtime:
        failures.length === 0
          ? { phase: 'STOPPED', message: 'Project stopped' }
          : {
              phase: 'PARTIAL_FAILURE',
              message: failures.join(' · '),
            },
      runtimeSync: {
        ...this.state.runtimeSync,
        state: 'STOPPED',
      },
    });
    return result;
  }

  async invoke(
    exportName: string,
    paramsJson?: string,
    agentOperation?: number,
  ): Promise<CrowdyStudioInvokeResult> {
    this.checkAgentOperation(agentOperation);
    const project = this.requireProject();
    if (!projectTargets(project.kind).includes('SERVER')) {
      throw new Error('Invoke requires a SERVER target');
    }
    const result = await this.callMod(
      moduleNameFor(project, 'SERVER'),
      exportName.trim() || 'state',
      paramsJson,
    );
    this.checkAgentOperation(agentOperation);
    this.update({ invokeResult: result });
    return result;
  }

  setSurfaceVisible(surface: CrowdyStudioPolledSurface, visible: boolean): void {
    if (visible) {
      this.visibleSurfaces.add(surface);
      if (this.pageVisible) {
        void this.refreshSurface(surface).catch(() => {});
        this.scheduleSurfacePoll(surface);
      }
    } else {
      this.visibleSurfaces.delete(surface);
      this.clearSurfaceTimer(surface);
    }
  }

  setPageVisible(visible: boolean): void {
    if (this.pageVisible === visible) return;
    this.pageVisible = visible;
    if (visible) this.restartVisibleSurfacePolling();
    else this.stopSurfacePolling();
  }

  /**
   * The mod's endpoint `method` with `paramsJson` as its arguments, through one exec
   * connection to the mod (`mod:<name>`, keyed by the grid) that later calls reuse.
   */
  private async callMod(
    name: string,
    method: string,
    paramsJson?: string,
  ): Promise<CrowdyStudioInvokeResult> {
    const text = paramsJson?.trim();
    let args: unknown = null;
    if (text) {
      try {
        args = JSON.parse(text);
      } catch {
        throw new Error('The call arguments must be JSON');
      }
    }
    if (this.modConnection?.name !== name) {
      this.closeModConnection();
      const connection = this.mods.connect(this.options.appId, {
        nodeType: modNodeType(name),
        key: this.options.gridId,
      });
      connection.catch(() => {
        if (this.modConnection?.connection === connection) this.modConnection = null;
      });
      this.modConnection = { name, connection };
    }
    const connection = await this.modConnection.connection;
    const started = Date.now();
    const value = await connection.call(modNodeType(name), this.options.gridId, method, args);
    return {
      resultJson: JSON.stringify(value ?? null, (_key, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
      durationUs: (Date.now() - started) * 1000,
    };
  }

  private closeModConnection(): void {
    const open = this.modConnection;
    this.modConnection = null;
    void open?.connection.then((connection) => connection.close(), () => {});
  }

  async refreshSurface(surface: CrowdyStudioPolledSurface): Promise<void> {
    if (!this.state.project) return;
    if (surface === 'logs') {
      // The `ctx.log` lines of the project's mod, which a CLIENT-only project's CLIENT half rides.
      const name = projectModNameOrNull(this.state.project);
      const lines = name
        ? await this.mods.modLogs(this.options.appId, this.options.gridId, name, { limit: 50 })
        : [];
      this.update({ logs: lines.map((line) => modLogLine(name!, line)) });
      return;
    }
    this.update({ wallet: (await this.options.playerWallet?.balance()) ?? null });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.operationGeneration;
    this.clearSaveTimers();
    this.stopSurfacePolling();
    this.broker?.stop();
    this.broker = null;
    this.closeModConnection();
    this.listeners.clear();
    this.humanEditListeners.clear();
  }

  private async performSaveLoop(): Promise<boolean> {
    while (this.persistedGeneration !== this.editGeneration) {
      const project = this.requireProject();
      const savingGeneration = this.editGeneration;
      const snapshot = cloneCrowdyStudioProject(project);
      this.update({ saveState: 'SAVING', saveMessage: undefined });
      try {
        const saved = await this.options.projectProvider.saveProject({
          ...this.scope(),
          projectId: snapshot.projectId,
          expectedRevisionId: snapshot.revision.id,
          metadata: snapshot.metadata,
          files: snapshot.files,
        });
        this.persistedGeneration = savingGeneration;
        if (this.state.project?.projectId !== saved.projectId) return true;
        if (this.editGeneration === savingGeneration) {
          this.state.project = cloneCrowdyStudioProject(saved);
        } else {
          // Preserve newer local edits while advancing the revision precondition.
          this.state.project.revision = { ...saved.revision };
          this.state.project.updatedAt = saved.updatedAt;
        }
        this.update({
          projects: upsertSummary(this.state.projects, summaryOf(saved)),
          saveState:
            this.persistedGeneration === this.editGeneration ? 'SAVED' : 'SAVING',
          saveMessage: undefined,
          runtimeSync: {
            ...this.state.runtimeSync,
            savedRevisionId: saved.revision.id,
            state:
              this.state.runtimeSync.state === 'RUNNING_SAVED' ||
              this.state.runtimeSync.state === 'RUNNING_STALE'
                ? this.state.runtimeSync.runningRevisionId === saved.revision.id
                  ? 'RUNNING_SAVED'
                  : 'RUNNING_STALE'
                : this.state.runtimeSync.state,
          },
        });
      } catch (error) {
        if (error instanceof CrowdyStudioRevisionConflictError) {
          this.conflictRemote = error.remoteProject ?? null;
          this.update({ saveState: 'CONFLICT', saveMessage: error.message });
          return false;
        }
        if (
          error instanceof CrowdyStudioOfflineError ||
          this.options.isOnline?.() === false
        ) {
          this.update({ saveState: 'OFFLINE', saveMessage: errorMessage(error) });
          this.scheduleRetry();
          return false;
        }
        this.update({ saveState: 'OFFLINE', saveMessage: errorMessage(error) });
        throw error;
      }
    }
    this.update({ saveState: 'SAVED', saveMessage: undefined });
    return true;
  }

  private markEdited(): void {
    for (const listener of this.humanEditListeners) listener();
    this.editGeneration++;
    this.update({
      saveState: 'SAVING',
      saveMessage: undefined,
      agentActivity:
        this.state.agentActivity === 'WORKING'
          ? 'PAUSED'
          : this.state.agentActivity,
      runtimeSync:
        this.state.runtimeSync.state === 'RUNNING_SAVED'
          ? { ...this.state.runtimeSync, state: 'RUNNING_STALE' }
          : this.state.runtimeSync,
    });
    this.clearTimer('autosave');
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.saveNow().catch(() => {});
    }, this.options.autosaveMs ?? 700);
  }

  private scheduleRetry(): void {
    this.clearTimer('retry');
    if (this.destroyed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.retrySave().catch(() => {});
    }, this.options.retryMs ?? 3_000);
  }

  private scheduleSurfacePoll(surface: CrowdyStudioPolledSurface): void {
    this.clearSurfaceTimer(surface);
    if (
      !this.pageVisible ||
      !this.visibleSurfaces.has(surface) ||
      this.destroyed
    ) {
      return;
    }
    const timer = setTimeout(() => {
      this.surfaceTimers.delete(surface);
      void this.refreshSurface(surface)
        .catch(() => {})
        .finally(() => this.scheduleSurfacePoll(surface));
    }, this.options.monitorPollMs ?? 5_000);
    this.surfaceTimers.set(surface, timer);
  }

  private restartVisibleSurfacePolling(): void {
    if (!this.pageVisible || this.destroyed) return;
    for (const surface of this.visibleSurfaces) {
      void this.refreshSurface(surface).catch(() => {});
      this.scheduleSurfacePoll(surface);
    }
  }

  private stopSurfacePolling(): void {
    for (const timer of this.surfaceTimers.values()) clearTimeout(timer);
    this.surfaceTimers.clear();
  }

  private clearSurfaceTimer(surface: CrowdyStudioPolledSurface): void {
    const timer = this.surfaceTimers.get(surface);
    if (timer) clearTimeout(timer);
    this.surfaceTimers.delete(surface);
  }

  private clearSaveTimers(): void {
    this.clearTimer('autosave');
    this.clearTimer('retry');
  }

  private clearTimer(kind: 'autosave' | 'retry'): void {
    const timer = kind === 'autosave' ? this.autosaveTimer : this.retryTimer;
    if (timer) clearTimeout(timer);
    if (kind === 'autosave') this.autosaveTimer = null;
    else this.retryTimer = null;
  }

  private clientRuntimeOptions(): Pick<
    PlayerCodeBrokerOptions,
    'workerUrl' | 'grid' | 'onHostCall'
  > {
    if (!this.options.workerUrl || !this.options.grid || !this.options.onHostCall) {
      throw new Error(
        'CLIENT projects require workerUrl, grid, and an allow-listed onHostCall router',
      );
    }
    return {
      workerUrl: this.options.workerUrl,
      grid: this.options.grid,
      onHostCall: this.options.onHostCall,
    };
  }

  private assertDeploymentPlan(
    project: CrowdyStudioProject,
    plan: CrowdyStudioDeploymentPlan,
    draft: boolean,
  ): void {
    if (project.revision.id !== plan.expectedRevisionId) {
      throw new CrowdyStudioRevisionConflictError(
        `Expected revision ${plan.expectedRevisionId}, found ${project.revision.id}`,
        project,
      );
    }
    const authoritativeTargets = [...projectTargets(project.kind)].sort();
    const requestedTargets = [...new Set(plan.targets)].sort();
    if (
      requestedTargets.length !== authoritativeTargets.length ||
      requestedTargets.some(
        (target, index) => target !== authoritativeTargets[index],
      )
    ) {
      throw new Error(
        `Deployment targets must exactly match ${authoritativeTargets.join(', ')}`,
      );
    }
    if (
      plan.pairingPreference !== undefined &&
      plan.pairingPreference !== project.metadata.pairingPreference
    ) {
      throw new Error('Deployment pairing preference changed after approval');
    }
    if (
      plan.projectContentHash !== undefined &&
      plan.projectContentHash !== projectContentHash(project)
    ) {
      throw new Error('Deployment project content changed after approval');
    }
    if (
      !draft &&
      (plan.pairingPreference === undefined ||
        plan.projectContentHash === undefined)
    ) {
      throw new Error(
        'Live deployment requires exact pairing and project content bindings',
      );
    }
  }

  private checkOperation(generation: number): void {
    if (generation !== this.operationGeneration || this.destroyed) {
      throw new OperationCancelledError();
    }
  }

  private checkAgentOperation(generation?: number): void {
    if (
      generation !== undefined &&
      (generation !== this.agentOperationGeneration || this.destroyed)
    ) {
      throw new OperationCancelledError();
    }
  }

  private sleep(ms: number): Promise<void> {
    return (
      this.options.sleep ??
      ((delay) => new Promise((resolve) => setTimeout(resolve, delay)))
    )(ms);
  }

  private requireProject(): CrowdyStudioProject {
    if (!this.state.project) throw new Error('No Crowdy Studio project is open');
    return this.state.project;
  }

  private requireFile(
    ref: CrowdyStudioFileRef,
  ): CrowdyStudioProjectFile | CrowdyStudioReferenceFile {
    if (ref.source === 'PROJECT') {
      const file = this.requireProject().files.find(
        (entry) =>
          entry.target === ref.target &&
          entry.path === normalizeCrowdyStudioPath(ref.path),
      );
      if (file) return file;
    } else {
      const files =
        ref.source === 'PERSONAL_LIBRARY'
          ? this.state.personalLibraryFiles
          : this.state.commonFiles;
      const file = files.find((entry) =>
        ref.referenceId
          ? entry.id === ref.referenceId
          : entry.path === ref.path && entry.target === ref.target,
      );
      if (file) return file;
    }
    throw new Error(`File is not loaded: ${ref.source}:${ref.path}`);
  }

  private assertProjectTarget(
    project: CrowdyStudioProject,
    target: CrowdyStudioTarget,
  ): void {
    if (!projectTargets(project.kind).includes(target)) {
      throw new Error(`${project.kind} projects do not have a ${target} target`);
    }
  }

  private scope(): { appId: string; gridId: string } {
    return { appId: this.options.appId, gridId: this.options.gridId };
  }

  private setRuntime(phase: CrowdyStudioPhase, message: string): void {
    this.update({ runtime: { phase, message } });
  }

  private update(patch: Partial<CrowdyStudioState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private ensureAlive(): void {
    if (this.destroyed) throw new Error('CrowdyStudioController is destroyed');
  }
}

function projectFileRef(file: CrowdyStudioProjectFile): CrowdyStudioFileRef {
  return { source: 'PROJECT', target: file.target, path: file.path };
}

function sameFileRef(a: CrowdyStudioFileRef, b: CrowdyStudioFileRef): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.path === b.path &&
    a.referenceId === b.referenceId
  );
}

function compareProjectFile(a: CrowdyStudioProjectFile, b: CrowdyStudioProjectFile): number {
  return crowdyStudioFileKey(a.target, a.path).localeCompare(
    crowdyStudioFileKey(b.target, b.path),
  );
}

/** The node type players call a mod by, as `execModType`. */
function modNodeType(name: string): string {
  return `mod:${name}`;
}

/** What a mod build takes: `Cargo.toml`, `README.md` and Rust under `src/`. */
function isModCrateFile(path: string): boolean {
  return (
    path === 'Cargo.toml' ||
    path === 'README.md' ||
    (path.startsWith('src/') && path.endsWith('.rs'))
  );
}

function crateFiles(
  files: readonly { path: string; content: string }[],
): Array<{ path: string; content: string }> {
  return files
    .filter((file) => isModCrateFile(file.path))
    .map((file) => ({ path: file.path, content: file.content }));
}

/** A build's crate name for a module: its own when it is one, else `mod-<name>`. */
function crateName(name: string): string {
  return CRATE_NAME.test(name) ? name : `mod-${name}`;
}

/**
 * The mod a ck-exec project runs as: its SERVER module's name, or for a CLIENT-only project the
 * CLIENT module's, which names the mod its CLIENT half rides.
 */
function projectModName(project: CrowdyStudioProject): string {
  return moduleNameFor(
    project,
    projectTargets(project.kind).includes('SERVER') ? 'SERVER' : 'CLIENT',
  );
}

function projectModNameOrNull(project: CrowdyStudioProject): string | null {
  try {
    return projectModName(project);
  } catch {
    return null;
  }
}

/** Why a ck-exec project's mod name cannot be a mod's, or null. */
function modNameProblem(project: CrowdyStudioProject): string | null {
  const name = projectModName(project);
  if (MOD_NAME.test(name)) return null;
  return projectTargets(project.kind).includes('SERVER')
    ? `The server module name '${name}' must be 1-48 lowercase letters, digits, - or _ to run as a mod`
    : `The CLIENT module name '${name}' names the mod its CLIENT half rides, so it must be 1-48 lowercase letters, digits, - or _`;
}

const LEGACY_CLIENT_CRATE =
  'This CLIENT crate depends on crowdy-compute-sdk, legacy player compute. On ck-exec a CLIENT ' +
  'target is a mod\u2019s CLIENT half, one crowdy-client-sdk crate: in Cargo.toml replace the ' +
  'crowdy-compute-sdk line with crowdy-client-sdk = "0.1.0", and in src/ use crowdy_client_sdk ' +
  'in place of crowdy_compute_sdk. Its host calls are the same, less the Game Model and sessions.';

function modLogLine(moduleName: string, line: ExecLogLine): CrowdyStudioLogLine {
  return {
    id: line.id,
    moduleName,
    level: LOG_LEVELS[line.level] ?? 'debug',
    at: line.at,
    text: line.text,
  };
}

function moduleNameFor(
  project: CrowdyStudioProject,
  target: CrowdyStudioTarget,
): string {
  const name =
    target === 'SERVER'
      ? project.metadata.serverModuleName
      : project.metadata.clientModuleName;
  if (!name?.trim()) {
    throw new Error(`${target} module name is required in Project settings`);
  }
  return name.trim();
}

function summaryOf(project: CrowdyStudioProject): CrowdyStudioProjectSummary {
  return {
    projectId: project.projectId,
    name: project.metadata.name,
    kind: project.kind,
    revisionId: project.revision.id,
    source: project.source,
    ...(project.github
      ? { github: `${project.github.owner}/${project.github.repo}@${project.github.branch}` }
      : {}),
    githubSha: project.github?.sha ?? null,
    ...(project.metadata.serverModuleName
      ? { serverModuleName: project.metadata.serverModuleName }
      : {}),
    ...(project.metadata.clientModuleName
      ? { clientModuleName: project.metadata.clientModuleName }
      : {}),
    updatedAt: project.updatedAt,
  };
}

function upsertSummary(
  projects: readonly CrowdyStudioProjectSummary[],
  next: CrowdyStudioProjectSummary,
): CrowdyStudioProjectSummary[] {
  const result = projects.filter((project) => project.projectId !== next.projectId);
  result.push(next);
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function upsertReference(
  files: readonly CrowdyStudioReferenceFile[],
  next: CrowdyStudioReferenceFile,
): CrowdyStudioReferenceFile[] {
  return [
    next,
    ...files.filter(
      (file) => file.source !== next.source || file.id !== next.id,
    ),
  ];
}

function applyValidatedPatch(
  baseline: CrowdyStudioProject,
  input: CrowdyStudioAtomicPatchInput,
): CrowdyStudioProject {
  if (input.changes.length < 1 || input.changes.length > 16) {
    throw new Error('Atomic patch must contain 1 to 16 file changes');
  }
  const next = cloneCrowdyStudioProject(baseline);
  const seen = new Set<string>();
  for (const change of input.changes) {
    const path = normalizeCrowdyStudioPath(change.path);
    const key = crowdyStudioFileKey(change.target, path);
    if (seen.has(key)) throw new Error(`Atomic patch repeats ${key}`);
    seen.add(key);
    if (!projectTargets(next.kind).includes(change.target)) {
      throw new Error(`${next.kind} projects do not have a ${change.target} target`);
    }
    const bytes = new TextEncoder().encode(change.content).byteLength;
    if (bytes > 65_536) throw new Error(`${key} exceeds the 65536-byte file limit`);
    const index = next.files.findIndex(
      (file) => file.target === change.target && file.path === path,
    );
    if (change.operation === 'CREATE') {
      if (change.expectedContentHash !== 'ABSENT' || index >= 0) {
        throw new CrowdyStudioRevisionConflictError(
          `${key} was expected to be absent`,
          baseline,
        );
      }
      next.files.push({ target: change.target, path, content: change.content });
      continue;
    }
    if (index < 0) {
      throw new CrowdyStudioRevisionConflictError(
        `${key} no longer exists`,
        baseline,
      );
    }
    const currentHash = sha256Digest(next.files[index].content);
    if (change.expectedContentHash !== currentHash) {
      throw new CrowdyStudioRevisionConflictError(
        `${key} content hash changed`,
        baseline,
      );
    }
    next.files[index] = {
      target: change.target,
      path,
      content: change.content,
    };
  }
  if (next.files.length > 128) {
    throw new Error('Project exceeds the 128-file limit');
  }
  next.files.sort(compareProjectFile);
  return next;
}

function projectContentHash(project: CrowdyStudioProject): string {
  return digestCanonicalJson({
    contract: 'crowdy.studio-project-content/1',
    projectId: project.projectId,
    metadata: project.metadata,
    files: project.files
      .map((file) => ({
        target: file.target,
        path: file.path,
        contentHash: sha256Digest(file.content),
      }))
      .sort((left, right) =>
        crowdyStudioFileKey(left.target, left.path).localeCompare(
          crowdyStudioFileKey(right.target, right.path),
        ),
      ),
  });
}

function upsertCheckpoint(
  checkpoints: readonly CrowdyStudioCheckpointMetadata[],
  checkpoint: CrowdyStudioCheckpointMetadata,
): CrowdyStudioCheckpointMetadata[] {
  return [
    checkpoint,
    ...checkpoints.filter(
      (entry) => entry.checkpointId !== checkpoint.checkpointId,
    ),
  ];
}

function fileRefExists(
  project: CrowdyStudioProject,
  state: CrowdyStudioState,
  ref: CrowdyStudioFileRef,
): boolean {
  if (ref.source === 'PROJECT') {
    return project.files.some(
      (file) =>
        file.target === ref.target &&
        file.path === normalizeCrowdyStudioPath(ref.path),
    );
  }
  const references =
    ref.source === 'PERSONAL_LIBRARY'
      ? state.personalLibraryFiles
      : state.commonFiles;
  return references.some((file) =>
    ref.referenceId
      ? file.id === ref.referenceId
      : file.target === ref.target && file.path === ref.path,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
