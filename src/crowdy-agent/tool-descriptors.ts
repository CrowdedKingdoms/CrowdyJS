import {
  deepFreeze,
  type JsonSchema,
  type JsonSchemaArray,
  type JsonSchemaBoolean,
  type JsonSchemaNumber,
  type JsonSchemaObject,
  type JsonSchemaString,
} from './schema.js';
import type {
  CrowdyAgentApprovalPolicy,
  CrowdyAgentIdempotencyClass,
  CrowdyAgentMode,
  CrowdyAgentRedactionRuleV1,
  CrowdyAgentScopeRequirementV1,
  CrowdyAgentToolDescriptorV1,
  CrowdyAgentToolExecutor,
  CrowdyAgentToolRisk,
} from './types.js';
import {
  GAME_COMMAND_RESULT_SCHEMA_V1,
  GAME_OBSERVATION_SCHEMA_V1,
  OBSERVE_REQUEST_SCHEMA_V1,
  PLAYER_HOST_CAPABILITIES_SCHEMA_V1,
} from '../player-host/schemas.js';

const text = (maxLength: number, minLength = 0): JsonSchemaString => ({
  type: 'string',
  minLength,
  maxLength,
});
const enumText = (values: readonly string[]): JsonSchemaString => ({
  type: 'string',
  minLength: 1,
  maxLength: Math.max(...values.map((value) => value.length)),
  enum: values,
});
const decimal = (allowNegative = false): JsonSchemaString => ({
  type: 'string',
  minLength: 1,
  maxLength: 40,
  pattern: allowNegative ? '^(0|-[1-9][0-9]*|[1-9][0-9]*)$' : '^(0|[1-9][0-9]*)$',
});
const digest = (): JsonSchemaString => ({
  type: 'string',
  minLength: 71,
  maxLength: 71,
  pattern: '^sha256:[0-9a-f]{64}$',
});
const dateTime = (): JsonSchemaString => ({
  type: 'string',
  minLength: 20,
  maxLength: 40,
  format: 'date-time',
});
const integer = (minimum: number, maximum: number): JsonSchemaNumber => ({
  type: 'integer',
  minimum,
  maximum,
});
const number = (minimum: number, maximum: number): JsonSchemaNumber => ({
  type: 'number',
  minimum,
  maximum,
});
const boolean = (): JsonSchemaBoolean => ({ type: 'boolean' });
const array = (
  items: JsonSchema,
  maxItems: number,
  minItems = 0,
  uniqueItems = false,
): JsonSchemaArray => ({
  type: 'array',
  minItems,
  maxItems,
  uniqueItems,
  items,
});
const object = (
  properties: Readonly<Record<string, JsonSchema>>,
  required: readonly string[] = Object.keys(properties),
): JsonSchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required,
  maxProperties: Object.keys(properties).length,
  properties,
});

const EMPTY = object({});
const OK = object({ ok: boolean() });
const TARGET = enumText(['SERVER', 'CLIENT']);
const PATH: JsonSchemaString = {
  ...text(256, 1),
  pattern:
    '^(?!/)(?!.*(?:^|/)\\.\\.?(?:/|$))(?!.*[\\u0000-\\u001f\\u007f])[^\\\\]+$',
};
const PROJECT_REF = text(128, 1);
const REFERENCE_REF = text(128, 1);
const CHECKPOINT_REF = text(128, 1);
const EXPECTED_REVISION = decimal();
const FILE_SUMMARY = object({
  target: TARGET,
  path: PATH,
  contentHash: digest(),
  byteLength: integer(0, 1_048_576),
});
const FILE_BODY = object({
  target: TARGET,
  path: PATH,
  content: text(65_536),
  contentHash: digest(),
});
const PROJECT_SUMMARY = object(
  {
    projectId: text(128, 1),
    name: text(120, 1),
    kind: enumText(['SERVER', 'CLIENT', 'FULL_STACK']),
    revision: EXPECTED_REVISION,
    updatedAt: dateTime(),
    archived: boolean(),
  },
  ['projectId', 'name', 'kind', 'revision', 'updatedAt', 'archived'],
);
const PROJECT = object(
  {
    projectId: text(128, 1),
    name: text(120, 1),
    description: text(1_024),
    kind: enumText(['SERVER', 'CLIENT', 'FULL_STACK']),
    revision: EXPECTED_REVISION,
    files: array(FILE_SUMMARY, 128),
    serverModuleName: text(120, 1),
    clientModuleName: text(120, 1),
    pairingPreference: enumText(['NONE', 'OPTIONAL', 'REQUIRED']),
    updatedAt: dateTime(),
  },
  [
    'projectId',
    'name',
    'kind',
    'revision',
    'files',
    'pairingPreference',
    'updatedAt',
  ],
);
const REFERENCE = object(
  {
    referenceId: text(128, 1),
    source: enumText(['PERSONAL_LIBRARY', 'COMMON']),
    title: text(120, 1),
    target: TARGET,
    path: PATH,
    contentHash: digest(),
    byteLength: integer(0, 65_536),
    version: EXPECTED_REVISION,
  },
  [
    'referenceId',
    'source',
    'title',
    'target',
    'path',
    'contentHash',
    'byteLength',
    'version',
  ],
);
const REFERENCE_BODY = object({
  reference: REFERENCE,
  content: text(65_536),
});
const CHECKPOINT = object({
  checkpointId: text(128, 1),
  projectRevision: EXPECTED_REVISION,
  contentHash: digest(),
  reason: enumText(['AGENT_WRITE', 'RESTORE_PREIMAGE', 'MANUAL']),
  createdAt: dateTime(),
});
const PATCH_CHANGE = object({
  target: TARGET,
  path: PATH,
  content: text(65_536),
  expectedContentHash: {
    ...text(71, 6),
    pattern: '^(ABSENT|sha256:[0-9a-f]{64})$',
  },
});
const PATCH_RESULT = object({
  projectRevision: EXPECTED_REVISION,
  checkpointId: text(128, 1),
  changedFiles: array(FILE_SUMMARY, 16, 1),
});
const RUNTIME_STATUS = object(
  {
    phase: enumText([
      'IDLE',
      'TESTING_DRAFT',
      'DEPLOYING_LIVE',
      'COMPILING',
      'ENABLING',
      'RUNNING',
      'COMPILE_FAILED',
      'STOPPING',
      'STOPPED',
      'PARTIAL_FAILURE',
      'ERROR',
    ]),
    savedRevision: EXPECTED_REVISION,
    runningRevision: EXPECTED_REVISION,
    sync: enumText(['NEVER_RUN', 'RUNNING_SAVED', 'RUNNING_STALE', 'STOPPED']),
    target: TARGET,
    draft: boolean(),
    message: text(512),
  },
  ['phase', 'savedRevision', 'sync'],
);
const DIAGNOSTIC = object(
  {
    source: enumText(['LOCAL_ADVISORY', 'RUSTC', 'RUNTIME']),
    target: TARGET,
    path: PATH,
    line: integer(1, 1_000_000),
    column: integer(1, 1_000_000),
    severity: enumText(['ERROR', 'WARNING', 'INFO', 'HINT']),
    code: text(64),
    message: text(2_048, 1),
  },
  ['source', 'target', 'path', 'line', 'column', 'severity', 'message'],
);
const RUN_ROW = object(
  {
    runRef: text(128, 1),
    moduleName: text(120, 1),
    triggerSource: text(80, 1),
    startedAt: dateTime(),
    durationUs: integer(0, 2_147_483_647),
    fuelUsed: decimal(),
    success: boolean(),
    errorMessage: text(1_024),
  },
  [
    'runRef',
    'moduleName',
    'triggerSource',
    'startedAt',
    'durationUs',
    'fuelUsed',
    'success',
  ],
);

interface DescriptorSpec {
  name: `${string}.${string}`;
  summary: string;
  executor: CrowdyAgentToolExecutor;
  modes: readonly CrowdyAgentMode[];
  input?: JsonSchemaObject;
  output?: JsonSchemaObject;
  risk?: CrowdyAgentToolRisk;
  effects?: readonly string[];
  reversible?: boolean;
  scopes?: readonly string[];
  scopeRequirements?: readonly CrowdyAgentScopeRequirementV1[];
  approval?: CrowdyAgentApprovalPolicy;
  approvalReasons?: readonly string[];
  timeoutMs?: number;
  idempotency?: CrowdyAgentIdempotencyClass;
  inputRedaction?: readonly CrowdyAgentRedactionRuleV1[];
  outputRedaction?: readonly CrowdyAgentRedactionRuleV1[];
  maxPersistedBytes?: number;
}

const READ = ['ASK', 'BUILD'] as const;
const ALL_MODES = ['ASK', 'BUILD', 'PLAY'] as const;
const BUILD = ['BUILD'] as const;
const PLAY = ['PLAY'] as const;
const ASK_PLAY = ['ASK', 'PLAY'] as const;
const BUILD_PLAY = ['BUILD', 'PLAY'] as const;

const specs: readonly (DescriptorSpec | CrowdyAgentToolDescriptorV1)[] = [
  {
    name: 'studio.context.get',
    summary: 'Read bounded current Studio, permission, runtime, epoch, and lease context.',
    executor: 'BROWSER',
    modes: ALL_MODES,
    output: object(
      {
        appRef: text(128, 1),
        projectRef: text(128, 1),
        gridRef: text(128, 1),
        contextVersion: text(128, 1),
        saveState: enumText(['SAVING', 'SAVED', 'CONFLICT', 'OFFLINE']),
        runtime: RUNTIME_STATUS,
        clientEpoch: decimal(),
        leaseKinds: array(enumText(['WORKSPACE', 'PLAY']), 2, 0, true),
        hostCapabilityRevision: text(128, 1),
      },
      ['appRef', 'gridRef', 'contextVersion', 'saveState', 'runtime', 'leaseKinds'],
    ),
  },
  {
    name: 'studio.state.get',
    summary: 'Read a bounded, credential-free projection of the headless Studio kernel.',
    executor: 'BROWSER',
    modes: READ,
    output: object(
      {
        project: PROJECT,
        openFiles: array(
          object({
            source: enumText(['PROJECT', 'PERSONAL_LIBRARY', 'COMMON']),
            target: TARGET,
            path: PATH,
          }),
          32,
        ),
        saveState: enumText(['SAVING', 'SAVED', 'CONFLICT', 'OFFLINE']),
        runtime: RUNTIME_STATUS,
      },
      ['openFiles', 'saveState', 'runtime'],
    ),
  },
  {
    name: 'project.list',
    summary: 'List bounded metadata for projects owned by the current player and app.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 50) }),
    output: object({
      projects: array(PROJECT_SUMMARY, 50),
      nextCursor: text(128),
    }, ['projects']),
    scopes: ['studio.project.read'],
  },
  {
    name: 'project.get',
    summary: 'Read one owner-scoped project and immutable provenance using a safe project reference.',
    executor: 'SERVER',
    modes: READ,
    input: object({ projectRef: PROJECT_REF }),
    output: PROJECT,
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.files', action: 'SUMMARY' }],
  },
  {
    name: 'project.select',
    summary: 'Select an owner-scoped project after pending human edits are safely resolved.',
    executor: 'BROWSER',
    modes: READ,
    input: object({ projectRef: PROJECT_REF }),
    output: object({ selectedProjectRef: PROJECT_REF, revision: EXPECTED_REVISION }),
  },
  {
    name: 'project.create',
    summary: 'Create a private bounded project from an enumerated starter kind.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      name: text(120, 1),
      description: text(1_024),
      kind: enumText(['SERVER', 'CLIENT', 'FULL_STACK']),
      starter: enumText(['EMPTY', 'MINIMAL', 'TICK', 'HUD']),
    }, ['name', 'kind', 'starter']),
    output: PROJECT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_create'],
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'project.create_from_modules',
    summary: 'Copy readable immutable module sources into a new private project by value.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      name: text(120, 1),
      modules: array(
        object({ target: TARGET, moduleRef: text(128, 1), versionRef: text(128, 1) }),
        2,
        1,
      ),
    }),
    output: PROJECT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_create', 'source_copy'],
    scopes: ['studio.project.read', 'studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'project.settings.update',
    summary: 'Update bounded project metadata and pairing at an expected revision.',
    executor: 'SERVER',
    modes: BUILD,
    input: object(
      {
        expectedRevision: EXPECTED_REVISION,
        name: text(120, 1),
        description: text(1_024),
        serverModuleName: text(120, 1),
        clientModuleName: text(120, 1),
        pairingPreference: enumText(['NONE', 'OPTIONAL', 'REQUIRED']),
      },
      ['expectedRevision', 'name', 'pairingPreference'],
    ),
    output: PROJECT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_metadata_write'],
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'project.archive',
    summary: 'Archive or restore a private project after exact human approval.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      action: enumText(['ARCHIVE', 'RESTORE']),
    }),
    output: PROJECT_SUMMARY,
    risk: 'DESTRUCTIVE',
    effects: ['project_archive_state'],
    reversible: true,
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
    approvalReasons: ['Archiving or restoring changes project availability.'],
  },
  {
    name: 'project.checkpoint.list',
    summary: 'List immutable checkpoint metadata for the selected readable project.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 50) }),
    output: object({ checkpoints: array(CHECKPOINT, 50), nextCursor: text(128) }, ['checkpoints']),
    scopes: ['studio.project.read'],
  },
  {
    name: 'project.checkpoint.restore',
    summary: 'Restore an exact checkpoint into a new revision after human approval.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      checkpointId: CHECKPOINT_REF,
      checkpointContentHash: digest(),
      expectedRevision: EXPECTED_REVISION,
    }),
    output: object({ project: PROJECT, preRestoreCheckpoint: CHECKPOINT }),
    risk: 'DESTRUCTIVE',
    effects: ['checkpoint_create', 'project_restore'],
    reversible: true,
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
    approvalReasons: ['Restore replaces the current project snapshot.'],
  },
  {
    name: 'workspace.file.list',
    summary: 'List bounded file path, target, size, and hash metadata.',
    executor: 'SERVER',
    modes: READ,
    output: object({ files: array(FILE_SUMMARY, 128) }),
    scopes: ['studio.project.read'],
  },
  {
    name: 'workspace.file.read',
    summary: 'Read one bounded file from the selected owner project.',
    executor: 'SERVER',
    modes: READ,
    input: object({ target: TARGET, path: PATH }),
    output: FILE_BODY,
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.content', action: 'TRUNCATE', maxBytes: 16_384 }],
    maxPersistedBytes: 20_480,
  },
  {
    name: 'workspace.file.create',
    summary: 'Create one bounded file at an expected project revision with a checkpoint.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      target: TARGET,
      path: PATH,
      content: text(65_536),
    }),
    output: PATCH_RESULT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_write', 'checkpoint_create'],
    scopeRequirements: [
      {
        scope: 'studio.project.write.server',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.project.write.client',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'CLIENT',
        },
      },
    ],
    inputRedaction: [{ path: '$.content', action: 'SUMMARY' }],
  },
  {
    name: 'workspace.file.patch',
    summary: 'Atomically create or replace bounded files with one pre-image checkpoint.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      changes: array(PATCH_CHANGE, 16, 1),
    }),
    output: PATCH_RESULT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_write', 'checkpoint_create'],
    scopeRequirements: [
      {
        scope: 'studio.project.write.server',
        when: {
          argumentPath: '$.changes[*].target',
          operator: 'CONTAINS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.project.write.client',
        when: {
          argumentPath: '$.changes[*].target',
          operator: 'CONTAINS',
          value: 'CLIENT',
        },
      },
    ],
    inputRedaction: [{ path: '$.changes[*].content', action: 'SUMMARY' }],
  },
  {
    name: 'workspace.file.rename',
    summary: 'Rename one project path after exact approval because references may be lost.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      target: TARGET,
      fromPath: PATH,
      toPath: PATH,
      expectedContentHash: digest(),
    }),
    output: PATCH_RESULT,
    risk: 'DESTRUCTIVE',
    effects: ['project_path_change', 'checkpoint_create'],
    reversible: true,
    scopeRequirements: [
      {
        scope: 'studio.project.write.server',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.project.write.client',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'CLIENT',
        },
      },
    ],
    approvalReasons: ['Renaming a file can break project references.'],
  },
  {
    name: 'workspace.file.delete',
    summary: 'Delete one exact project file after approval and preserve a checkpoint.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      target: TARGET,
      path: PATH,
      expectedContentHash: digest(),
    }),
    output: PATCH_RESULT,
    risk: 'DESTRUCTIVE',
    effects: ['project_file_delete', 'checkpoint_create'],
    reversible: true,
    scopeRequirements: [
      {
        scope: 'studio.project.write.server',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.project.write.client',
        when: {
          argumentPath: '$.target',
          operator: 'EQUALS',
          value: 'CLIENT',
        },
      },
    ],
    approvalReasons: ['Deleting source removes a project path.'],
  },
  {
    name: 'workspace.tab.open',
    summary: 'Open a loaded Studio file tab without changing project source.',
    executor: 'BROWSER',
    modes: READ,
    input: object({
      source: enumText(['PROJECT', 'PERSONAL_LIBRARY', 'COMMON']),
      target: TARGET,
      path: PATH,
      referenceRef: REFERENCE_REF,
    }, ['source', 'target', 'path']),
    output: OK,
  },
  {
    name: 'workspace.tab.close',
    summary: 'Close a loaded Studio file tab without changing project source.',
    executor: 'BROWSER',
    modes: READ,
    input: object({
      source: enumText(['PROJECT', 'PERSONAL_LIBRARY', 'COMMON']),
      target: TARGET,
      path: PATH,
      referenceRef: REFERENCE_REF,
    }, ['source', 'target', 'path']),
    output: OK,
  },
  {
    name: 'workspace.save',
    summary: 'Flush the complete pending project delta with optimistic revision checking.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({ expectedRevision: EXPECTED_REVISION }),
    output: object({ projectRevision: EXPECTED_REVISION, changedFiles: array(FILE_SUMMARY, 128) }),
    risk: 'ROUTINE_WRITE',
    effects: ['project_write'],
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'workspace.conflict.resolve',
    summary: 'Resolve a revision conflict in either direction after exact approval.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      localRevision: EXPECTED_REVISION,
      remoteRevision: EXPECTED_REVISION,
      resolution: enumText(['ACCEPT_REMOTE', 'OVERWRITE_REMOTE']),
      localContentHash: digest(),
      remoteContentHash: digest(),
    }),
    output: PROJECT,
    risk: 'DESTRUCTIVE',
    effects: ['project_conflict_resolution', 'checkpoint_create'],
    reversible: true,
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
    approvalReasons: ['Conflict resolution discards one side of an edit.'],
  },
  {
    name: 'library.personal.list',
    summary: 'List owner-scoped personal library metadata for the current app.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 100) }),
    output: object({ files: array(REFERENCE, 100), nextCursor: text(128) }, ['files']),
    scopes: ['studio.project.read'],
  },
  {
    name: 'library.personal.read',
    summary: 'Read one owner-scoped personal library file and exact version.',
    executor: 'SERVER',
    modes: READ,
    input: object({ referenceRef: REFERENCE_REF, version: EXPECTED_REVISION }),
    output: REFERENCE_BODY,
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.content', action: 'TRUNCATE', maxBytes: 16_384 }],
    maxPersistedBytes: 20_480,
  },
  {
    name: 'library.personal.save',
    summary: 'Create or update a bounded personal library file by expected version.',
    executor: 'SERVER',
    modes: BUILD,
    input: object(
      {
        referenceRef: REFERENCE_REF,
        expectedVersion: EXPECTED_REVISION,
        title: text(120, 1),
        target: TARGET,
        path: PATH,
        content: text(65_536),
      },
      ['title', 'target', 'path', 'content'],
    ),
    output: REFERENCE,
    risk: 'ROUTINE_WRITE',
    effects: ['personal_library_write'],
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
    inputRedaction: [{ path: '$.content', action: 'SUMMARY' }],
  },
  {
    name: 'library.personal.save_from_project',
    summary: 'Copy one selected project file by value into the personal library.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      target: TARGET,
      path: PATH,
      expectedContentHash: digest(),
      title: text(120, 1),
    }),
    output: REFERENCE,
    risk: 'ROUTINE_WRITE',
    effects: ['personal_library_write', 'source_copy'],
    scopes: ['studio.project.read', 'studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'library.common.list',
    summary: 'List immutable published common-file metadata for the current app.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 100) }),
    output: object({ files: array(REFERENCE, 100), nextCursor: text(128) }, ['files']),
    scopes: ['studio.project.read'],
  },
  {
    name: 'library.common.read',
    summary: 'Read one immutable published common-file version.',
    executor: 'SERVER',
    modes: READ,
    input: object({ referenceRef: REFERENCE_REF, version: EXPECTED_REVISION }),
    output: REFERENCE_BODY,
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.content', action: 'TRUNCATE', maxBytes: 16_384 }],
    maxPersistedBytes: 20_480,
  },
  {
    name: 'library.import',
    summary: 'Copy one readable library version by value into the selected project.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      source: enumText(['PERSONAL_LIBRARY', 'COMMON']),
      referenceRef: REFERENCE_REF,
      version: EXPECTED_REVISION,
      destinationTarget: TARGET,
      destinationPath: PATH,
    }),
    output: PATCH_RESULT,
    risk: 'ROUTINE_WRITE',
    effects: ['project_write', 'source_copy', 'checkpoint_create'],
    scopes: ['studio.project.read', 'studio.project.write.server', 'studio.project.write.client'],
  },
  {
    name: 'template.list',
    summary: 'List allowed starter templates and target compatibility.',
    executor: 'SERVER',
    modes: READ,
    output: object({
      templates: array(
        object({
          templateRef: text(128, 1),
          name: text(120, 1),
          kind: enumText(['SERVER', 'CLIENT', 'FULL_STACK']),
          contentHash: digest(),
        }),
        50,
      ),
    }),
    scopes: ['studio.project.read'],
  },
  {
    name: 'template.apply',
    summary: 'Apply an exact starter template, requiring approval when replacing files.',
    executor: 'SERVER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      templateRef: text(128, 1),
      templateContentHash: digest(),
      behavior: enumText(['EMPTY_ONLY', 'REPLACE']),
    }),
    output: PATCH_RESULT,
    risk: 'DESTRUCTIVE',
    effects: ['project_write', 'checkpoint_create'],
    reversible: true,
    scopes: ['studio.project.write.server', 'studio.project.write.client'],
    approvalReasons: ['Replacing existing files requires exact human approval.'],
  },
  {
    name: 'diagnostics.local.get',
    summary: 'Read bounded browser-local advisory diagnostics labeled as untrusted.',
    executor: 'BROWSER',
    modes: READ,
    output: object({ diagnostics: array(DIAGNOSTIC, 256) }),
    outputRedaction: [{ path: '$.diagnostics[*].message', action: 'TRUNCATE', maxBytes: 512 }],
  },
  {
    name: 'diagnostics.compile.get',
    summary: 'Read authoritative bounded compiler diagnostics and redacted logs.',
    executor: 'SERVER',
    modes: READ,
    input: object({ target: TARGET, runRef: text(128, 1) }, ['target']),
    output: object({ diagnostics: array(DIAGNOSTIC, 256), log: text(32_768) }),
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.log', action: 'TRUNCATE', maxBytes: 8_192 }],
    maxPersistedBytes: 16_384,
  },
  {
    name: 'runtime.status.get',
    summary: 'Read saved-versus-running project revision, target, phase, and pairing status.',
    executor: 'BROWSER',
    modes: READ,
    output: RUNTIME_STATUS,
  },
  {
    name: 'runtime.runs.list',
    summary: 'List bounded own-project runtime execution summaries.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 50) }),
    output: object({ runs: array(RUN_ROW, 50), nextCursor: text(128) }, ['runs']),
    scopes: ['studio.project.read'],
  },
  {
    name: 'runtime.logs.list',
    summary: 'List bounded redacted own-project runtime logs as untrusted data.',
    executor: 'SERVER',
    modes: READ,
    input: object({ cursor: text(128), limit: integer(1, 50) }),
    output: object({
      logs: array(
        object({
          runRef: text(128, 1),
          createdAt: dateTime(),
          level: enumText(['DEBUG', 'INFO', 'WARN', 'ERROR']),
          message: text(2_048),
        }),
        50,
      ),
      nextCursor: text(128),
    }, ['logs']),
    scopes: ['studio.project.read'],
    outputRedaction: [{ path: '$.logs[*].message', action: 'TRUNCATE', maxBytes: 512 }],
  },
  {
    name: 'runtime.usage.get',
    summary: 'Read compile, runtime, and agent budget plus read-only wallet balance.',
    executor: 'SERVER',
    modes: READ,
    output: object({
      compileUnitsUsed: decimal(),
      compileUnitsLimit: decimal(),
      agentUnitsUsed: decimal(),
      agentUnitsLimit: decimal(),
      walletBalanceMinor: decimal(true),
      currency: text(8, 3),
    }),
  },
  {
    name: 'runtime.test_draft',
    summary: 'Compile and test the saved project as draft without making it live.',
    executor: 'BROWSER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      targets: array(TARGET, 2, 1, true),
    }),
    output: object({ runtime: RUNTIME_STATUS, compiledTargets: array(TARGET, 2, 1, true) }),
    risk: 'ROUTINE_WRITE',
    effects: ['draft_compile', 'draft_runtime'],
    scopeRequirements: [
      {
        scope: 'studio.runtime.run.server',
        when: {
          argumentPath: '$.targets[*]',
          operator: 'CONTAINS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.runtime.run.client',
        when: {
          argumentPath: '$.targets[*]',
          operator: 'CONTAINS',
          value: 'CLIENT',
        },
      },
    ],
    timeoutMs: 120_000,
  },
  {
    name: 'runtime.deploy_live',
    summary: 'Deploy the exact saved revision live after bound human approval.',
    executor: 'BROWSER',
    modes: BUILD,
    input: object({
      expectedRevision: EXPECTED_REVISION,
      projectContentHash: digest(),
      targets: array(TARGET, 2, 1, true),
      pairingPreference: enumText(['NONE', 'OPTIONAL', 'REQUIRED']),
      draft: { ...boolean(), const: false },
    }),
    output: object({ runtime: RUNTIME_STATUS, deployedTargets: array(TARGET, 2, 1, true) }),
    risk: 'ROUTINE_WRITE',
    effects: ['live_deployment', 'runtime_enable'],
    reversible: true,
    scopeRequirements: [
      { scope: 'studio.runtime.live' },
      {
        scope: 'studio.runtime.run.server',
        when: {
          argumentPath: '$.targets[*]',
          operator: 'CONTAINS',
          value: 'SERVER',
        },
      },
      {
        scope: 'studio.runtime.run.client',
        when: {
          argumentPath: '$.targets[*]',
          operator: 'CONTAINS',
          value: 'CLIENT',
        },
      },
    ],
    approval: 'REQUIRED',
    approvalReasons: ['Live deployment changes the running project for players.'],
    timeoutMs: 120_000,
  },
  {
    name: 'runtime.invoke',
    summary: 'Invoke one contract-advertised runtime export with bounded scalar parameters.',
    executor: 'BROWSER',
    modes: BUILD_PLAY,
    input: object({
      exportName: text(120, 1),
      environment: enumText(['DRAFT', 'LIVE']),
      params: array(
        object({
          name: text(64, 1),
          type: enumText(['STRING', 'DECIMAL', 'BOOLEAN']),
          value: text(1_024),
        }),
        32,
      ),
    }),
    output: object({
      resultType: enumText(['EMPTY', 'TEXT', 'BASE64']),
      result: text(16_384),
      fuelUsed: decimal(),
      durationUs: integer(0, 2_147_483_647),
    }),
    risk: 'WORLD_CONTROL',
    effects: ['runtime_invoke'],
    scopes: ['studio.runtime.run.server'],
    approval: 'CONDITIONAL',
    approvalReasons: ['Invoking a live runtime export requires Play authority and exact approval.'],
    outputRedaction: [{ path: '$.result', action: 'TRUNCATE', maxBytes: 4_096 }],
  },
  {
    name: 'runtime.stop',
    summary: 'Idempotently stop project server runtime and the local client worker.',
    executor: 'BROWSER',
    modes: BUILD,
    output: object({
      serverStopped: boolean(),
      clientStopped: boolean(),
      failures: array(text(512, 1), 2),
    }),
    risk: 'ROUTINE_WRITE',
    effects: ['runtime_disable', 'client_worker_stop'],
    reversible: true,
    scopes: ['studio.runtime.run.server', 'studio.runtime.run.client'],
  },
  {
    name: 'game.capabilities.get',
    summary: 'Read the current generic host capability revision and typed command catalog.',
    executor: 'BROWSER',
    modes: ASK_PLAY,
    output: PLAYER_HOST_CAPABILITIES_SCHEMA_V1,
  },
  {
    name: 'game.observe',
    summary: 'Read one bounded fresh game snapshot; observations never grant authority.',
    executor: 'BROWSER',
    modes: ASK_PLAY,
    input: OBSERVE_REQUEST_SCHEMA_V1,
    output: GAME_OBSERVATION_SCHEMA_V1,
    scopes: ['game.observe'],
    outputRedaction: [
      { path: '$.nearbyActors', action: 'SUMMARY' },
      { path: '$.nearbyVoxels', action: 'SUMMARY' },
    ],
    maxPersistedBytes: 8_192,
  },
  gameCommand(
    'game.control.move',
    'Move the controlled entity briefly through the ordinary locomotion intent service.',
    object({
      observationId: text(128, 1),
      capabilityRevision: text(128, 1),
      controlledEntityId: text(128, 1),
      direction: enumText(['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'UP', 'DOWN']),
      intensity: number(0, 1),
      durationMs: integer(16, 2_000),
    }),
    'game.locomotion',
  ),
  gameCommand(
    'game.control.look',
    'Adjust controlled look direction through the ordinary player camera intent service.',
    object({
      observationId: text(128, 1),
      capabilityRevision: text(128, 1),
      controlledEntityId: text(128, 1),
      deltaYaw: number(-180, 180),
      deltaPitch: number(-90, 90),
    }),
    'game.locomotion',
  ),
  {
    name: 'game.control.stop',
    summary: 'Synchronously clear every agent movement and action intent; always locally allowed.',
    executor: 'BROWSER',
    modes: PLAY,
    output: GAME_COMMAND_RESULT_SCHEMA_V1,
    risk: 'WORLD_CONTROL',
    effects: ['agent_intent_clear'],
    reversible: true,
  },
  gameCommand(
    'game.inventory.select',
    'Select one bounded inventory slot through the ordinary inventory service.',
    plannedInput({ slot: integer(0, 255) }),
    'game.interact',
  ),
  gameCommand(
    'game.inventory.consume',
    'Consume a bounded quantity from one inventory slot through ordinary rules.',
    plannedInput({ slot: integer(0, 255), quantity: integer(1, 64) }),
    'game.interact',
  ),
  gameCommand(
    'game.inventory.transfer',
    'Transfer bounded items to or from the currently opened authorized container.',
    plannedInput({
      direction: enumText(['TO_CONTAINER', 'FROM_CONTAINER']),
      slot: integer(0, 255),
      quantity: integer(1, 64),
      containerRef: text(128, 1),
    }),
    'game.interact',
  ),
  gameCommand(
    'game.interact',
    'Perform one enumerated ordinary interaction against the fresh observed target.',
    object(
      {
        observationId: text(128, 1),
        capabilityRevision: text(128, 1),
        controlledEntityId: text(128, 1),
        action: enumText(['MINE', 'PLACE', 'USE', 'FISH', 'NPC_TALK']),
        targetRef: text(128, 1),
        inventorySlot: integer(0, 255),
      },
      [
        'observationId',
        'capabilityRevision',
        'controlledEntityId',
        'action',
        'targetRef',
      ],
    ),
    'game.interact',
  ),
  gameCommand(
    'game.craft',
    'Craft a bounded non-economic recipe using the player material inventory.',
    plannedInput({ recipeId: text(128, 1), quantity: integer(1, 64) }),
    'game.craft',
  ),
  gameCommand(
    'game.mount',
    'Mount or dismount one currently controllable host-advertised entity.',
    object(
      {
        observationId: text(128, 1),
        capabilityRevision: text(128, 1),
        controlledEntityId: text(128, 1),
        action: enumText(['MOUNT', 'DISMOUNT']),
        mountRef: text(128, 1),
      },
      ['observationId', 'capabilityRevision', 'controlledEntityId', 'action'],
    ),
    'game.locomotion',
  ),
  {
    ...gameCommand(
      'game.combat.attack',
      'Attack one fresh observed target through the ordinary combat referee path.',
      plannedInput({
        targetRef: text(128, 1),
        attack: enumText(['PRIMARY', 'SECONDARY']),
      }),
      'game.combat',
    ),
    approval: {
      policy: 'CONDITIONAL' as const,
      reasons: ['Player or PvP targets may require exact human approval.'],
      maxTtlSeconds: 120,
    },
  },
  gameCommand(
    'game.chat.send',
    'Send bounded text through an existing rate-limited game chat channel.',
    plannedInput({
      channel: enumText(['LOCAL', 'GROUP']),
      text: text(280, 1),
    }),
    'game.communicate',
  ),
  gameCommand(
    'game.travel.teleport',
    'Travel to one current host-advertised destination through ordinary authorization.',
    plannedInput({ destinationRef: text(128, 1) }),
    'game.travel',
  ),
];

/** Complete minimum Studio and generic game registry for contract version 1. */
export const CROWDY_AGENT_TOOL_DESCRIPTORS_V1: readonly CrowdyAgentToolDescriptorV1[] =
  deepFreeze(
    specs.map((spec) =>
      'schemaVersion' in spec ? spec : buildDescriptor(spec),
    ),
  );

function plannedInput(
  extra: Readonly<Record<string, JsonSchema>>,
): JsonSchemaObject {
  return object({
    observationId: text(128, 1),
    capabilityRevision: text(128, 1),
    controlledEntityId: text(128, 1),
    ...extra,
  });
}

function gameCommand(
  name: `${string}.${string}`,
  summary: string,
  input: JsonSchemaObject,
  scope: string,
): CrowdyAgentToolDescriptorV1 {
  return buildDescriptor({
    name,
    summary,
    executor: 'BROWSER',
    modes: PLAY,
    input,
    output: GAME_COMMAND_RESULT_SCHEMA_V1,
    risk: 'WORLD_CONTROL',
    effects: ['game_intent'],
    scopes: [scope],
  });
}

function buildDescriptor(spec: DescriptorSpec): CrowdyAgentToolDescriptorV1 {
  const risk = spec.risk ?? 'READ_ONLY';
  const approval =
    spec.approval ??
    (['DESTRUCTIVE', 'TRUST_CONSENT', 'ECONOMIC', 'IRREVERSIBLE'].includes(risk)
      ? 'REQUIRED'
      : 'NONE');
  const idempotency =
    spec.idempotency ??
    (risk === 'READ_ONLY'
      ? 'PURE'
      : spec.executor === 'SERVER'
        ? 'KEYED'
        : 'TOOL_CALL_ONCE');
  return {
    schemaVersion: 'crowdy.agent-tool/1',
    name: spec.name,
    wireName: `${spec.name.replace(/\./gu, '_')}_v1`,
    version: '1.0.0',
    summary: spec.summary,
    executor: spec.executor,
    modes: spec.modes,
    inputSchema: spec.input ?? EMPTY,
    outputSchema: spec.output ?? OK,
    risk: {
      class: risk,
      effects: spec.effects ?? [],
      reversible:
        spec.reversible ?? (risk === 'READ_ONLY' || risk === 'ROUTINE_WRITE'),
    },
    scopes: [
      { scope: 'agent.use' },
      ...(spec.scopeRequirements ??
        (spec.scopes ?? []).map((scope) => ({ scope }))),
    ],
    approval: {
      policy: approval,
      reasons:
        approval === 'NONE'
          ? []
          : spec.approvalReasons ?? ['Exact human approval is required.'],
      maxTtlSeconds: approval === 'NONE' ? 0 : 120,
    },
    idempotency: {
      class: idempotency,
      keyScope:
        idempotency === 'PURE'
          ? 'NONE'
          : idempotency === 'KEYED'
            ? 'USER_TOOL_ARGUMENTS'
            : 'TOOL_CALL',
    },
    timeoutMs: spec.timeoutMs ?? (spec.executor === 'BROWSER' ? 10_000 : 15_000),
    redaction: {
      input: spec.inputRedaction ?? [],
      output: spec.outputRedaction ?? [],
      maxPersistedBytes: spec.maxPersistedBytes ?? 4_096,
    },
  };
}
