import type { CrowdyStudioController } from '../crowdy-studio/controller.js';
import {
  projectTargets,
  type CrowdyStudioFileRef,
  type CrowdyStudioProject,
} from '../crowdy-studio/models.js';
import { sha256Digest } from './schema.js';
import type { CrowdyAgentBrowserToolHandlersV1 } from './browser-dispatcher.js';
import { CrowdyAgentError } from './errors.js';

export interface CrowdyStudioAgentToolsOptionsV1 {
  readonly getClientEpoch?: () => string | null;
  readonly getContextVersion?: () => string | undefined;
  readonly getLeaseKinds?: () => readonly ('WORKSPACE' | 'PLAY')[];
  readonly getHostCapabilityRevision?: () => string | undefined;
  readonly isLeaseActive?: (
    leaseId: string,
    kind: 'WORKSPACE' | 'PLAY',
  ) => boolean;
}

/** Exact browser tools backed by the same headless kernel as the human UI. */
export function createCrowdyStudioAgentTools(
  controller: CrowdyStudioController,
  options: CrowdyStudioAgentToolsOptionsV1 = {},
): CrowdyAgentBrowserToolHandlersV1 {
  return Object.freeze({
    'studio.context.get': () => {
      const state = controller.getState();
      const context = controller.getAgentContext();
      return {
        appRef: context.appRef,
        ...(context.projectRef ? { projectRef: context.projectRef } : {}),
        gridRef: context.gridRef,
        contextVersion:
          options.getContextVersion?.() ?? context.contextVersion,
        saveState: state.saveState,
        runtime: runtimeProjection(controller),
        ...(options.getClientEpoch?.()
          ? { clientEpoch: options.getClientEpoch!()! }
          : {}),
        leaseKinds: [...(options.getLeaseKinds?.() ?? [])],
        ...(options.getHostCapabilityRevision?.()
          ? {
              hostCapabilityRevision:
                options.getHostCapabilityRevision!()!,
            }
          : {}),
      };
    },
    'studio.state.get': () => {
      const state = controller.getState();
      return {
        ...(state.project
          ? { project: projectProjection(state.project) }
          : {}),
        openFiles: state.openFiles
          .filter((file) => file.target)
          .map((file) => ({
            source: file.source,
            target: file.target!,
            path: file.path,
          })),
        saveState: state.saveState,
        runtime: runtimeProjection(controller),
      };
    },
    'project.select': async (argumentsValue) => {
      const projectRef = stringArgument(argumentsValue, 'projectRef');
      await controller.switchProject(projectRef);
      const project = requireProject(controller);
      return {
        selectedProjectRef: project.projectId,
        revision: project.revision.id,
      };
    },
    'workspace.tab.open': (argumentsValue) => {
      controller.openFile(fileRef(argumentsValue));
      return { ok: true };
    },
    'workspace.tab.close': (argumentsValue) => {
      controller.closeFile(fileRef(argumentsValue));
      return { ok: true };
    },
    'diagnostics.local.get': () => ({
      diagnostics: controller.getState().localDiagnostics.map((diagnostic) => ({
        source: 'LOCAL_ADVISORY',
        target: diagnostic.target,
        path: diagnostic.path,
        line: diagnostic.line,
        column: diagnostic.column,
        severity: diagnostic.severity.toUpperCase(),
        ...(diagnostic.code ? { code: diagnostic.code } : {}),
        message: diagnostic.message,
      })),
    }),
    'runtime.status.get': () => runtimeProjection(controller),
    'runtime.test_draft': async (argumentsValue, context) => {
      assertInvocationLease(context.invocation.leaseId, 'WORKSPACE', options);
      const expectedRevision = stringArgument(
        argumentsValue,
        'expectedRevision',
      );
      const targets = targetArguments(argumentsValue);
      const result = await runStudioOperation(
        controller,
        context.signal,
        (operation) =>
          controller.testDraftPlan(
            {
              expectedRevisionId: expectedRevision,
              targets,
            },
            operation,
          ),
      );
      if (result.status !== 'RUNNING') {
        throw new CrowdyAgentError('AGENT_TOOL_FAILED', result.message);
      }
      return {
        runtime: runtimeProjection(controller),
        compiledTargets: [...result.targets],
      };
    },
    'runtime.deploy_live': async (argumentsValue, context) => {
      assertInvocationLease(context.invocation.leaseId, 'WORKSPACE', options);
      if (!context.invocation.approvalGrant) {
        throw new CrowdyAgentError(
          'AGENT_APPROVAL_REQUIRED',
          'Live deployment requires exact human approval',
        );
      }
      const expectedHash = stringArgument(
        argumentsValue,
        'projectContentHash',
      );
      const expectedRevision = stringArgument(
        argumentsValue,
        'expectedRevision',
      );
      const targets = targetArguments(argumentsValue);
      const pairingPreference = stringArgument(
        argumentsValue,
        'pairingPreference',
      ) as 'NONE' | 'OPTIONAL' | 'REQUIRED';
      const result = await runStudioOperation(
        controller,
        context.signal,
        (operation) =>
          controller.deployLivePlan(
            {
              expectedRevisionId: expectedRevision,
              targets,
              pairingPreference,
              projectContentHash: expectedHash,
            },
            operation,
          ),
      );
      if (result.status !== 'RUNNING') {
        throw new CrowdyAgentError('AGENT_TOOL_FAILED', result.message);
      }
      return {
        runtime: runtimeProjection(controller),
        deployedTargets: [...result.targets],
      };
    },
    'runtime.invoke': async (argumentsValue, context) => {
      const environment = stringArgument(argumentsValue, 'environment');
      assertRuntimeEnvironment(controller, environment);
      assertInvocationLease(
        context.invocation.leaseId,
        environment === 'LIVE' ? 'PLAY' : 'WORKSPACE',
        options,
      );
      if (environment === 'LIVE' && !context.invocation.approvalGrant) {
        throw new CrowdyAgentError(
          'AGENT_APPROVAL_REQUIRED',
          'Live runtime invocation requires exact human approval',
        );
      }
      const params = arrayArgument(argumentsValue, 'params').map((entry) => {
        if (!isRecord(entry)) {
          throw new CrowdyAgentError(
            'AGENT_TOOL_INPUT_INVALID',
            'Runtime parameter must be an object',
          );
        }
        const name = stringArgument(entry, 'name');
        const type = stringArgument(entry, 'type');
        const value = stringArgument(entry, 'value');
        if (type === 'BOOLEAN' && value !== 'true' && value !== 'false') {
          throw new CrowdyAgentError(
            'AGENT_TOOL_INPUT_INVALID',
            `Boolean parameter ${name} must be true or false`,
          );
        }
        return [
          name,
          type === 'BOOLEAN' ? value === 'true' : value,
        ] as const;
      });
      const result = await runStudioOperation(
        controller,
        context.signal,
        (operation) =>
          controller.invoke(
            stringArgument(argumentsValue, 'exportName'),
            JSON.stringify(Object.fromEntries(params)),
            operation,
          ),
      );
      const value = result.resultJson ?? result.resultBase64 ?? '';
      return {
        resultType: result.resultJson
          ? 'TEXT'
          : result.resultBase64
            ? 'BASE64'
            : 'EMPTY',
        result: value,
        fuelUsed: result.fuelUsed ?? '0',
        durationUs: result.durationUs ?? 0,
      };
    },
    'runtime.stop': async () => {
      const result = await controller.stopProject();
      return {
        serverStopped: result.serverStopped !== false,
        clientStopped: result.clientStopped !== false,
        failures: result.failures,
      };
    },
  });
}

function runtimeProjection(controller: CrowdyStudioController): {
  phase: string;
  savedRevision: string;
  runningRevision?: string;
  sync: string;
  target?: string;
  draft?: boolean;
  message?: string;
} {
  const state = controller.getState();
  return {
    phase: state.runtime.phase,
    savedRevision:
      state.runtimeSync.savedRevisionId ?? state.project?.revision.id ?? '0',
    ...(state.runtimeSync.runningRevisionId
      ? { runningRevision: state.runtimeSync.runningRevisionId }
      : {}),
    sync: state.runtimeSync.state,
    ...(state.runtime.target ? { target: state.runtime.target } : {}),
    ...(state.runtimeSync.deployment
      ? { draft: state.runtimeSync.deployment === 'DRAFT' }
      : {}),
    ...(state.runtime.message ? { message: state.runtime.message } : {}),
  };
}

function projectProjection(project: CrowdyStudioProject): {
  projectId: string;
  name: string;
  description?: string;
  kind: string;
  revision: string;
  files: readonly {
    target: string;
    path: string;
    contentHash: string;
    byteLength: number;
  }[];
  serverModuleName?: string;
  clientModuleName?: string;
  pairingPreference: string;
  updatedAt: string;
} {
  return {
    projectId: project.projectId,
    name: project.metadata.name,
    ...(project.metadata.description
      ? { description: project.metadata.description }
      : {}),
    kind: project.kind,
    revision: project.revision.id,
    files: project.files.map((file) => ({
      target: file.target,
      path: file.path,
      contentHash: sha256Digest(file.content),
      byteLength: new TextEncoder().encode(file.content).byteLength,
    })),
    ...(project.metadata.serverModuleName
      ? { serverModuleName: project.metadata.serverModuleName }
      : {}),
    ...(project.metadata.clientModuleName
      ? { clientModuleName: project.metadata.clientModuleName }
      : {}),
    pairingPreference: project.metadata.pairingPreference,
    updatedAt: project.updatedAt,
  };
}

function fileRef(
  value: Readonly<Record<string, unknown>>,
): CrowdyStudioFileRef {
  const source = stringArgument(value, 'source') as CrowdyStudioFileRef['source'];
  const target = stringArgument(value, 'target') as 'SERVER' | 'CLIENT';
  const path = stringArgument(value, 'path');
  const referenceRef =
    typeof value.referenceRef === 'string' ? value.referenceRef : undefined;
  return {
    source,
    target,
    path,
    ...(referenceRef ? { referenceId: referenceRef } : {}),
  };
}

function requireProject(controller: CrowdyStudioController): CrowdyStudioProject {
  const project = controller.getState().project;
  if (!project) {
    throw new CrowdyAgentError(
      'AGENT_CONTEXT_CHANGED',
      'No Crowdy Studio project is selected',
    );
  }
  return project;
}

function stringArgument(
  value: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const entry = value[name];
  if (typeof entry !== 'string') {
    throw new CrowdyAgentError(
      'AGENT_TOOL_INPUT_INVALID',
      `${name} must be a string`,
      { field: name },
    );
  }
  return entry;
}

function arrayArgument(
  value: Readonly<Record<string, unknown>>,
  name: string,
): readonly unknown[] {
  const entry = value[name];
  if (!Array.isArray(entry)) {
    throw new CrowdyAgentError(
      'AGENT_TOOL_INPUT_INVALID',
      `${name} must be an array`,
      { field: name },
    );
  }
  return entry;
}

function targetArguments(
  value: Readonly<Record<string, unknown>>,
): readonly ('SERVER' | 'CLIENT')[] {
  return arrayArgument(value, 'targets').map((target) => {
    if (target !== 'SERVER' && target !== 'CLIENT') {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Runtime target must be SERVER or CLIENT',
        { field: 'targets' },
      );
    }
    return target;
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertInvocationLease(
  leaseId: string | undefined,
  kind: 'WORKSPACE' | 'PLAY',
  options: CrowdyStudioAgentToolsOptionsV1,
): void {
  if (!leaseId) {
    throw new CrowdyAgentError(
      'AGENT_LEASE_REQUIRED',
      `${kind} lease is required for this runtime operation`,
    );
  }
  if (options.isLeaseActive && !options.isLeaseActive(leaseId, kind)) {
    throw new CrowdyAgentError(
      'AGENT_LEASE_REVOKED',
      `${kind} lease is no longer active`,
    );
  }
}

function assertRuntimeEnvironment(
  controller: CrowdyStudioController,
  environment: string,
): void {
  const runtime = controller.getState().runtimeSync;
  if (
    (environment !== 'DRAFT' && environment !== 'LIVE') ||
    runtime.state !== 'RUNNING_SAVED' ||
    runtime.deployment !== environment
  ) {
    throw new CrowdyAgentError(
      'AGENT_CONTEXT_STALE',
      `No exact saved ${environment} runtime is currently running`,
    );
  }
}

async function runStudioOperation<T>(
  controller: CrowdyStudioController,
  signal: AbortSignal,
  operation: (agentOperation: number) => Promise<T>,
): Promise<T> {
  const agentOperation = controller.beginAgentOperation();
  const abort = (): void =>
    controller.cancelAgentOperation(
      'Agent operation preempted before completion',
    );
  if (signal.aborted) {
    abort();
    throw new CrowdyAgentError(
      'AGENT_CANCELLED',
      'Agent browser operation was cancelled',
    );
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await operation(agentOperation);
    if (signal.aborted) {
      throw new CrowdyAgentError(
        'AGENT_CANCELLED',
        'Agent browser operation was cancelled',
      );
    }
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Keep the canonical target helper reachable for BWF host integrations. */
export const crowdyStudioAgentProjectTargets = projectTargets;
