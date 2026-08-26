import {
  PlayerCodeBroker,
  type PlayerCodeBrokerOptions,
  type PlayerCodeGridBounds,
} from '../player-runtime/player-code-broker.js';
import type { PlayerComputeAPI } from '../domains/playerCompute.js';
import type { PlayerWalletAPI } from '../domains/playerWallet.js';
import {
  digestCanonicalJson,
  sha256Digest,
} from '../crowdy-agent/schema.js';
import {
  CrowdyStudioClientLogBuffer,
  type CrowdyStudioClientLogLine,
} from './client-logs.js';
import { parseRustcDiagnostics, type CrowdyStudioDiagnostic } from './diagnostics.js';
import {
  formatRuntimeFailureDisplay,
  parseRuntimeFailureFromExtensions,
  type RuntimeFailureEnvelope,
} from './runtime-failure.js';
import { CrowdyGraphQLError } from '../errors.js';
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

export type CrowdyStudioPolledSurface = 'runs' | 'logs' | 'usage';

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

export interface CrowdyStudioUsageSnapshot {
  hourUnitsUsed: string;
  dayUnitsUsed: string;
  unitsPerHour: string | null;
  unitsPerDay: string | null;
  compilesThisHour: number;
  maxCompilesPerHour: number;
  gateStatus: string;
  gateReason: string | null;
}

export interface CrowdyStudioWalletSnapshot {
  balanceCents: string;
  currency: string;
}

export interface CrowdyStudioRun {
  runId: string;
  moduleName: string;
  triggerSource: string;
  startedAt: string;
  durationUs: number;
  fuelUsed: string;
  success: boolean;
  errorMessage?: string | null;
}

export interface CrowdyStudioInvokeResult {
  resultBase64?: string | null;
  resultJson?: string | null;
  fuelUsed?: string;
  durationUs?: number;
  /** Set when playerComputeInvoke throws (GraphQL or transport failure). */
  error?: string;
  /** Structured failure from GraphQL extensions.runtimeFailure when present. */
  failure?: RuntimeFailureEnvelope;
  /** Export name used for this invoke (for chat handoff). */
  exportName?: string;
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
  runtime: CrowdyStudioRuntimeStatus;
  runtimeSync: CrowdyStudioRuntimeSync;
  agentActivity: 'IDLE' | 'PREPARING' | 'WORKING' | 'PAUSED';
  checkpoints: readonly CrowdyStudioCheckpointMetadata[];
  buildOutput: string;
  authoritativeDiagnostics: readonly CrowdyStudioDiagnostic[];
  localDiagnostics: readonly CrowdyStudioDiagnostic[];
  runs: readonly CrowdyStudioRun[];
  logs: readonly CrowdyStudioRun[];
  usage: CrowdyStudioUsageSnapshot | null;
  wallet: CrowdyStudioWalletSnapshot | null;
  invokeResult: CrowdyStudioInvokeResult | null;
  /** Last Test draft `crowdy::log` lines from the CLIENT worker. */
  clientLogs: readonly CrowdyStudioClientLogLine[];
}

export type CrowdyStudioPlayerCompute = Pick<
  PlayerComputeAPI,
  | 'deploy'
  | 'versions'
  | 'setEnabled'
  | 'setRequires'
  | 'artifactBytes'
  | 'usage'
  | 'runs'
  | 'logs'
  | 'invoke'
>;

export type CrowdyStudioPlayerWallet = Pick<PlayerWalletAPI, 'balance'>;

export interface CrowdyStudioBroker {
  start(bytes: ArrayBuffer): Promise<void>;
  stop(): void;
}

export interface CrowdyStudioControllerOptions {
  projectProvider: CrowdyStudioProjectProvider;
  playerCompute: CrowdyStudioPlayerCompute;
  playerWallet?: CrowdyStudioPlayerWallet;
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
  /** Fired for each captured `crowdy::log` line during Test draft. */
  onClientLog?: (line: CrowdyStudioClientLogLine) => void;
}

export interface CrowdyStudioStopResult {
  serverStopped: boolean | null;
  clientStopped: boolean | null;
  failures: string[];
}

interface CompiledTarget {
  target: CrowdyStudioTarget;
  name: string;
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
    runtime: { phase: 'IDLE' },
    runtimeSync: { state: 'NEVER_RUN' },
    agentActivity: 'IDLE',
    checkpoints: [],
    buildOutput: '',
    authoritativeDiagnostics: [],
    localDiagnostics: [],
    runs: [],
    logs: [],
    usage: null,
    wallet: null,
    invokeResult: null,
    clientLogs: [],
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
  private readonly clientLogBuffer = new CrowdyStudioClientLogBuffer();

  constructor(private readonly options: CrowdyStudioControllerOptions) {
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
    const input = createCrowdyStudioStarterProject({
      ...options,
      ...this.scope(),
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
      runs: [],
      logs: [],
      invokeResult: null,
      clientLogs: [],
    });
    this.clientLogBuffer.clear();
    this.restartVisibleSurfacePolling();
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

  /**
   * Re-read the open project and install it as an agent revision. Server-executed
   * write tools report only a revision id and content hashes, so the bodies have
   * to come back over the project provider before the editor can show them.
   * Returns false when the durable revision already matches what is open.
   */
  async adoptAgentRevision(
    synchronization: Omit<CrowdyStudioProjectSynchronization, 'source'> = {},
  ): Promise<boolean> {
    const current = this.requireProject();
    const project = await this.options.projectProvider.getProject({
      ...this.scope(),
      projectId: current.projectId,
    });
    if (project.revision.id === this.requireProject().revision.id) return false;
    this.synchronizeProject(project, { source: 'AGENT', ...synchronization });
    return true;
  }

  /**
   * Pull a newer durable revision (Harness write/edit) into the open editor.
   * No-ops while the human has unsaved edits or an unresolved conflict so we
   * never clobber the buffer or spam conflict state during a turn.
   */
  async pullRemoteAgentRevision(): Promise<'skipped' | 'unchanged' | 'adopted'> {
    if (!this.state.project) return 'skipped';
    if (this.persistedGeneration !== this.editGeneration) return 'skipped';
    if (this.state.saveState === 'CONFLICT') return 'skipped';
    const adopted = await this.adoptAgentRevision();
    return adopted ? 'adopted' : 'unchanged';
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
    this.clientLogBuffer.clear();
    this.update({
      runtime: { phase: draft ? 'TESTING_DRAFT' : 'DEPLOYING_LIVE' },
      buildOutput: '',
      authoritativeDiagnostics: [],
      clientLogs: [],
    });
    try {
      if (targets.length === 1) {
        const target = targets[0];
        const compiled = await this.compileTarget(project, target, draft, operation);
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
        // server version or alters the currently live pairing requirement.
        const client = await this.compileTarget(
          project,
          'CLIENT',
          draft,
          operation,
        );
        if (!client) {
          return {
            deployment: draft ? 'DRAFT' : 'LIVE',
            status: 'COMPILE_FAILED',
            projectRevisionId: project.revision.id,
            targets,
            message: this.state.runtime.message ?? 'Client compilation failed',
          };
        }
        const server = await this.compileTarget(
          project,
          'SERVER',
          draft,
          operation,
        );
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
        const requiredClientName =
          project.metadata.pairingPreference === 'REQUIRED'
            ? client.name
            : null;
        await this.options.playerCompute.setRequires({
          ...this.scope(),
          serverName: server.name,
          requiredClientName,
        });
        this.checkOperation(operation);
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
    draft: boolean,
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

    // This is the sole project→legacy wire conversion. Project state, provider
    // contracts, editors, and templates all use typed files.
    const sourceFilesJson = JSON.stringify(
      Object.fromEntries(files.map((file) => [file.path, file.content])),
    );
    const deployed = await this.options.playerCompute.deploy({
      ...this.scope(),
      name,
      target: target as never,
      sourceFilesJson,
      sdkVersion: project.sdkVersion,
      abiVersion: project.abiVersion,
      tickHz: target === 'SERVER' ? 1 : undefined,
      draft,
    });
    this.checkOperation(operation);

    const limit = this.options.compilePollLimit ?? 60;
    const pollMs = this.options.compilePollMs ?? 1_500;
    for (let attempt = 0; attempt < limit; attempt++) {
      const versions = await this.options.playerCompute.versions({
        ...this.scope(),
        name,
      });
      this.checkOperation(operation);
      const version = versions.find(
        (candidate) => candidate.versionId === deployed.versionId,
      );
      const status = version?.compileStatus.toLowerCase();
      if (status === 'succeeded' || status === 'success') {
        this.recordBuild(target, version?.compileLog ?? '');
        return { target, name, versionId: deployed.versionId };
      }
      if (status === 'failed' || status === 'error') {
        const log = version?.compileLog ?? 'Compilation failed without output';
        this.recordBuild(target, log);
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
    await this.options.playerCompute.setEnabled({
      ...this.scope(),
      name,
      enabled: true,
    });
    this.checkOperation(operation);
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
    const artifact = await this.options.playerCompute.artifactBytes({
      ...this.scope(),
      name: compiled.name,
      versionId: compiled.versionId,
    });
    this.checkOperation(operation);
    if (
      artifact.versionId !== compiled.versionId ||
      !artifact.artifactHash ||
      artifact.bytes.byteLength === 0
    ) {
      throw new Error('Client artifact did not match the compiled project version');
    }
    const brokerOptions: PlayerCodeBrokerOptions = {
      ...runtime,
      artifactHash: artifact.artifactHash,
      fuelPerDispatch: artifact.fuelPerDispatch,
      onPresentation: this.options.onPresentation,
      onLog: (level, message) => this.captureClientLog(level, message),
      tickIntervalMs: this.options.clientTickIntervalMs ?? 1_000,
    };
    const broker =
      this.options.brokerFactory?.(brokerOptions) ??
      new PlayerCodeBroker(brokerOptions);
    await broker.start(artifact.bytes);
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

    if (projectTargets(project.kind).includes('SERVER')) {
      serverStopped = false;
      try {
        await this.options.playerCompute.setEnabled({
          ...this.scope(),
          name: moduleNameFor(project, 'SERVER'),
          enabled: false,
        });
        serverStopped = true;
      } catch (error) {
        failures.push(`Server: ${errorMessage(error)}`);
      }
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
    const resolvedExport = exportName.trim() || 'invoke';
    try {
      const result = await this.options.playerCompute.invoke({
        ...this.scope(),
        moduleName: moduleNameFor(project, 'SERVER'),
        exportName: resolvedExport,
        paramsJson: paramsJson?.trim() || null,
      });
      this.checkAgentOperation(agentOperation);
      const invokeResult: CrowdyStudioInvokeResult = {
        ...result,
        exportName: resolvedExport,
      };
      this.update({ invokeResult });
      return invokeResult;
    } catch (error) {
      const { error: errorText, failure } = formatInvokeErrorParts(error);
      const invokeResult: CrowdyStudioInvokeResult = {
        error: errorText,
        failure,
        exportName: resolvedExport,
      };
      this.update({ invokeResult });
      return invokeResult;
    }
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

  async refreshSurface(surface: CrowdyStudioPolledSurface): Promise<void> {
    if (!this.state.project) return;
    const serverName = this.state.project.metadata.serverModuleName;
    if (surface === 'runs') {
      this.update({
        runs: await this.options.playerCompute.runs({
          ...this.scope(),
          ...(serverName ? { moduleName: serverName } : {}),
          limit: 50,
          offset: 0,
        }),
      });
      return;
    }
    if (surface === 'logs') {
      this.update({
        logs: await this.options.playerCompute.logs({
          ...this.scope(),
          ...(serverName ? { moduleName: serverName } : {}),
          limit: 50,
        }),
      });
      return;
    }
    const [usage, wallet] = await Promise.all([
      this.options.playerCompute.usage({ appId: this.options.appId }),
      this.options.playerWallet?.balance() ?? Promise.resolve(null),
    ]);
    this.update({ usage: normalizeUsage(usage), wallet });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.operationGeneration;
    this.clearSaveTimers();
    this.stopSurfacePolling();
    this.broker?.stop();
    this.broker = null;
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

  private captureClientLog(level: number, message: string): void {
    this.clientLogBuffer.append({
      at: new Date().toISOString(),
      level,
      message,
      target: 'CLIENT',
    });
    const stored = this.clientLogBuffer.tail(1).slice(-1)[0];
    if (!stored) return;
    this.update({ clientLogs: this.clientLogBuffer.tail() });
    this.options.onClientLog?.(stored);
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

function normalizeUsage(value: CrowdyStudioUsageSnapshot): CrowdyStudioUsageSnapshot {
  return {
    hourUnitsUsed: String(value.hourUnitsUsed),
    dayUnitsUsed: String(value.dayUnitsUsed),
    unitsPerHour:
      value.unitsPerHour == null ? null : String(value.unitsPerHour),
    unitsPerDay: value.unitsPerDay == null ? null : String(value.unitsPerDay),
    compilesThisHour: value.compilesThisHour,
    maxCompilesPerHour: value.maxCompilesPerHour,
    gateStatus: value.gateStatus,
    gateReason: value.gateReason ?? null,
  };
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

function formatInvokeErrorParts(error: unknown): {
  error: string;
  failure?: RuntimeFailureEnvelope;
} {
  if (error instanceof CrowdyGraphQLError) {
    const failure = parseRuntimeFailureFromExtensions(error.extensions);
    const remediation =
      typeof error.extensions?.remediation === 'string'
        ? error.extensions.remediation
        : undefined;
    if (failure) {
      return {
        error: formatRuntimeFailureDisplay(failure, remediation),
        failure: {
          ...failure,
          ...(remediation && !failure.remediation ? { remediation } : {}),
        },
      };
    }

    const code = typeof error.code === 'string' ? error.code : undefined;
    const message = error.message;

    let line: string;
    if (code && code.length > 0) {
      if (message === code || message.startsWith(`${code}:`)) {
        line = message;
      } else if (
        code === 'INTERNAL_SERVER_ERROR' &&
        message.startsWith('PLAYER_MODULE_')
      ) {
        line = message;
      } else {
        line = `${code}: ${message}`;
      }
    } else {
      line = message;
    }

    return {
      error: remediation ? `${line}\n${remediation}` : line,
    };
  }
  return { error: errorMessage(error) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
