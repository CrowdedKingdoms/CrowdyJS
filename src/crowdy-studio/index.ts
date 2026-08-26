export {
  CrowdyStudioClientLogBuffer,
  bindClientLogShipper,
  formatClientLogTail,
  type CrowdyStudioClientLogLine,
  type CrowdyStudioClientLogTarget,
  type CrowdyStudioClientLogTransport,
} from './client-logs.js';
export {
  CrowdyStudioController,
  type CrowdyStudioControllerOptions,
  type CrowdyStudioBroker,
  type CrowdyStudioAgentWorkContext,
  type CrowdyStudioDeploymentPlan,
  type CrowdyStudioDeployResult,
  type CrowdyStudioInvokeResult,
  type CrowdyStudioPhase,
  type CrowdyStudioPolledSurface,
  type CrowdyStudioRun,
  type CrowdyStudioRuntimeStatus,
  type CrowdyStudioRuntimeSync,
  type CrowdyStudioRuntimeSyncState,
  type CrowdyStudioPlayerCompute,
  type CrowdyStudioPlayerWallet,
  type CrowdyStudioState,
  type CrowdyStudioStopResult,
  type CrowdyStudioUsageSnapshot,
  type CrowdyStudioWalletSnapshot,
} from './controller.js';
export {
  mountCrowdyStudio,
  type CrowdyStudioHandle,
  type MountCrowdyStudioAgentOptions,
  type MountCrowdyStudioDshOptions,
  type MountCrowdyStudioOptions,
} from './mount.js';
export {
  CrowdyStudioOfflineError,
  CrowdyStudioRevisionConflictError,
  cloneCrowdyStudioProject,
  crowdyStudioFileKey,
  crowdyStudioFileUri,
  normalizeCrowdyStudioPath,
  projectTargets,
  type CreateCrowdyStudioProjectInput,
  type ImportCrowdyStudioReferenceFileInput,
  type CrowdyStudioAtomicFileChange,
  type CrowdyStudioAtomicPatchInput,
  type CrowdyStudioAtomicPatchResult,
  type CrowdyStudioCheckpointFile,
  type CrowdyStudioCheckpointMetadata,
  type CrowdyStudioCheckpointRestoreInput,
  type CrowdyStudioCheckpointRestoreResult,
  type CrowdyStudioFileRef,
  type CrowdyStudioPairingPreference,
  type CrowdyStudioProject,
  type CrowdyStudioProjectFile,
  type CrowdyStudioProjectKind,
  type CrowdyStudioProjectMetadata,
  type CrowdyStudioProjectProvider,
  type CrowdyStudioProjectRevision,
  type CrowdyStudioProjectScope,
  type CrowdyStudioProjectSummary,
  type CrowdyStudioReferenceFile,
  type CrowdyStudioSaveState,
  type CrowdyStudioSynchronizationProvider,
  type CrowdyStudioProjectSynchronization,
  type CrowdyStudioPatchOperation,
  type CrowdyStudioTarget,
  type SaveCrowdyStudioLibraryFileInput,
  type SaveCrowdyStudioProjectInput,
} from './models.js';
export {
  createCrowdyStudioStarterProject,
  type CrowdyStudioNewProjectOptions,
} from './starter-projects.js';
export {
  agentChatRequiresBuildMode,
  extractDiagnosticSourceSnippet,
  formatDiagnosticsForAgentChat,
  isParseStyleDiagnosticMessage,
  parseRustcDiagnostics,
  DIAGNOSTIC_SOURCE_WINDOW_RADIUS,
  type CrowdyStudioDiagnostic,
  type CrowdyStudioDiagnosticSeverity,
  type CrowdyStudioDiagnosticSource,
  type DiagnosticSourceSnippet,
  type FormatDiagnosticsOptions,
} from './diagnostics.js';
export {
  formatRuntimeFailureForAgentChat,
  formatRuntimeFailureDisplay,
  parseRuntimeFailureFromExtensions,
  type RuntimeFailureCause,
  type RuntimeFailureEnvelope,
} from './runtime-failure.js';
export {
  extractEnclosingRustBlock,
  sha256DigestHex,
  sha256DigestHexSync,
  type ExtractedRustBlock,
} from './rust-block-extract.js';
export {
  isCurrentDiagnosticVersion,
  type MonacoCrowdyStudioEditorOptions,
} from './monaco-editor.js';
export {
  EMBEDDED_PLATFORM_INDEX,
  MAX_PLATFORM_CRATES,
  MAX_PLATFORM_CRATE_FIELD_LENGTH,
  MAX_PLATFORM_INDEX_BYTES,
  computePlatformIndexContentHash,
  loadPlatformIndex,
  type PlatformCrate,
  type PlatformIndex,
  type PlatformSymbol,
  type PlatformSymbolKind,
} from '../live-coding/platform-index.js';
export {
  DEFAULT_VFS_LIMITS,
  VfsLimitError,
  VirtualFileSystem,
  offsetAt,
  type VirtualDocument,
  type VirtualFileSystemLimits,
} from '../live-coding/vfs.js';
export {
  WorkerLanguageClient,
  WorkerMessageReader,
  WorkerMessageWriter,
  createDefaultRustLanguageWorker,
  type LanguageWorkerLike,
  type WorkerLanguageClientOptions,
} from '../live-coding/worker-transport.js';
export {
  CrowdyStudioAgentDomShell,
  type CrowdyStudioAgentDomShellOptions,
} from './agent-dom-shell.js';
export * from './dsh/index.js';
export {
  STUDIO_LAYOUT_STORAGE_KEY,
  STUDIO_PANE_IDS,
  StudioLayoutController,
  clampStudioPaneSize,
  studioPaneSizeRange,
  type StudioLayoutControllerOptions,
  type StudioLayoutListener,
  type StudioLayoutState,
  type StudioLayoutStorage,
  type StudioPaneId,
  type StudioPaneSizeRange,
} from './layout.js';
export {
  createPaneSplitter,
  type PaneSplitterHandle,
  type PaneSplitterOptions,
  type PaneSplitterRange,
} from './splitter.js';
export * from './embed/index.js';
export * from '../crowdy-agent/index.js';
export * from '../player-host/index.js';
