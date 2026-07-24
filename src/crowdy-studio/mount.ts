import {
  CrowdyStudioController,
  type CrowdyStudioControllerOptions,
} from './controller.js';
import {
  CROWDY_AGENT_TOOL_REGISTRY_V1,
  CrowdyAgentBrowserToolDispatcher,
  CrowdyAgentToolRegistry,
  CrowdyStudioAgentController,
  createCrowdyStudioAgentTools,
  type CrowdyAgentBrowserToolHandlersV1,
  type CrowdyStudioAgentControllerOptionsV1,
} from '../crowdy-agent/index.js';
import {
  AgentControlLeaseManager,
  createPlayerHostAgentTools,
  type AgentControlLeaseManagerOptionsV1,
  type PlayerHostAdapterV1,
} from '../player-host/index.js';
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
    MonacoCrowdyStudioEditorOptions {
  /** Optional durable Agentic Crowdy Studio vertical slice. */
  agent?: MountCrowdyStudioAgentOptions;
}

export interface MountCrowdyStudioAgentOptions
  extends Omit<
    CrowdyStudioAgentControllerOptionsV1,
    | 'browserDispatcher'
    | 'beforeAgentWork'
    | 'onEpochAttached'
    | 'onLeaseChanged'
    | 'onPreempt'
  > {
  registry?: CrowdyAgentToolRegistry;
  /** Exact additional handlers, normally `game.extension.<game>.*`. */
  browserHandlers?: CrowdyAgentBrowserToolHandlersV1;
  playerHost?: PlayerHostAdapterV1;
  controlGate?: AgentControlLeaseManagerOptionsV1;
  onLocalPreempt?: CrowdyStudioAgentControllerOptionsV1['onPreempt'];
  autoInitialize?: boolean;
}

export interface CrowdyStudioHandle {
  controller: CrowdyStudioController;
  agent: CrowdyStudioAgentController | null;
  controlLeaseManager: AgentControlLeaseManager | null;
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
  let agent: CrowdyStudioAgentController | null = null;
  let controlLeaseManager: AgentControlLeaseManager | null = null;
  if (options.agent) {
    const registry =
      options.agent.registry ?? CROWDY_AGENT_TOOL_REGISTRY_V1;
    const hostTools = options.agent.playerHost
      ? createPlayerHostAgentTools(
          options.agent.playerHost,
          {
            ...options.agent.controlGate,
            contextVersion:
              options.agent.controlGate?.contextVersion ??
              (() =>
                agent?.getState().session?.contextVersion ??
                controller.getAgentContext().contextVersion),
          },
        )
      : null;
    controlLeaseManager = hostTools?.leaseManager ?? null;
    const handlers = mergeAgentHandlers(
      createCrowdyStudioAgentTools(controller, {
        getClientEpoch: () => agent?.getState().clientEpoch ?? null,
        getContextVersion: () =>
          agent?.getState().session?.contextVersion,
        getLeaseKinds: () =>
          agent
            ?.getState()
            .leases.filter((lease) => lease.status === 'ACTIVE')
            .map((lease) => lease.kind) ?? [],
        getHostCapabilityRevision: () =>
          controlLeaseManager?.snapshot().capabilities?.revision,
      }),
      hostTools?.handlers,
      options.agent.browserHandlers,
    );
    const dispatcher = new CrowdyAgentBrowserToolDispatcher({
      registry,
      handlers,
      getSessionId: () => agent?.getState().session?.sessionId ?? null,
      getClientEpoch: () => agent?.getState().clientEpoch ?? null,
      getContextVersion: () =>
        agent?.getState().session?.contextVersion ??
        controller.getAgentContext().contextVersion,
      getMode: () => agent?.getState().session?.mode ?? 'ASK',
    });
    const agentOptions = options.agent;
    agent = new CrowdyStudioAgentController({
      ...agentOptions,
      browserDispatcher: dispatcher,
      beforeAgentWork: async () => {
        await controller.prepareForAgentWork();
      },
      onPreempt: (reason) => {
        controlLeaseManager?.preempt(reason);
        agentOptions.onLocalPreempt?.(reason);
      },
      onEpochAttached: (clientEpoch) => {
        controlLeaseManager?.attach(clientEpoch);
        if (controlLeaseManager) {
          void controlLeaseManager.refreshCapabilities().catch(() => {
            controlLeaseManager?.preempt('CONTEXT_CHANGED');
          });
        }
      },
      onLeaseChanged: (lease) => {
        if (!controlLeaseManager || lease.kind !== 'PLAY') return;
        if (lease.status === 'ACTIVE') {
          void controlLeaseManager
            .refreshCapabilities()
            .then(() => controlLeaseManager?.grantLease(lease))
            .catch(() => controlLeaseManager?.preempt('CONTEXT_CHANGED'));
        } else {
          controlLeaseManager.preempt(
            lease.revokedReason ?? 'LEASE_EXPIRED',
          );
        }
      },
    });
  }
  const shell = new CrowdyStudioDomShell(host, controller, agent ?? undefined, {
    getPlayLeaseContext: () => {
      const capabilities = controlLeaseManager?.snapshot().capabilities;
      return capabilities
        ? {
            controlledEntityId: capabilities.controlledEntityId,
            hostCapabilityRevision: capabilities.revision,
          }
        : null;
    },
  });
  const unsubscribeHumanEdit = controller.onHumanEdit(() =>
    agent?.preemptForHumanEdit(),
  );
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
    const visible = document.visibilityState !== 'hidden';
    controller.setPageVisible(visible);
    agent?.setPageVisible(visible);
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
    if (agent && options.agent?.autoInitialize !== false) {
      await agent.initialize().catch((error) => {
        console.warn('Crowdy Studio agent could not attach; manual Studio remains available', error);
      });
    }
  } catch (error) {
    disconnectLayoutObserver();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
    const failedEditor = editor as CrowdyStudioEditorAdapter | null;
    failedEditor?.dispose();
    shell.dispose();
    unsubscribeHumanEdit();
    agent?.destroy();
    controller.destroy();
    throw error;
  }

  return {
    controller,
    agent,
    controlLeaseManager,
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
      unsubscribeHumanEdit();
      agent?.destroy();
      agent = null;
      controller.destroy();
    },
  };
}

function mergeAgentHandlers(
  ...sets: readonly (
    | CrowdyAgentBrowserToolHandlersV1
    | null
    | undefined
  )[]
): CrowdyAgentBrowserToolHandlersV1 {
  const merged: Record<
    string,
    CrowdyAgentBrowserToolHandlersV1[string]
  > = {};
  for (const set of sets) {
    if (!set) continue;
    for (const [name, handler] of Object.entries(set)) {
      if (merged[name]) {
        throw new Error(`Duplicate Crowdy Studio browser tool handler: ${name}`);
      }
      merged[name] = handler;
    }
  }
  return Object.freeze(merged);
}
