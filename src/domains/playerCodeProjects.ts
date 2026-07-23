import type { GraphQLClient } from '../client.js';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
  CrowdyGraphQLError,
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyTimeoutError,
} from '../errors.js';
import {
  ModStudioOfflineError,
  ModStudioRevisionConflictError,
  normalizeModStudioPath,
  type CreateModStudioProjectInput,
  type ImportModStudioReferenceFileInput,
  type ModStudioPairingPreference,
  type ModStudioProject,
  type ModStudioProjectKind,
  type ModStudioProjectProvider,
  type ModStudioProjectScope,
  type ModStudioProjectSummary,
  type ModStudioReferenceFile,
  type SaveModStudioLibraryFileInput,
  type SaveModStudioProjectInput,
} from '../mod-studio/models.js';
import {
  PlayerCodeCommonFilesDocument,
  PlayerCodeImportSource,
  PlayerCodeLibraryFilesDocument,
  PlayerCodeLibrarySaveDocument,
  PlayerCodePairingPreference,
  PlayerCodeProjectCreateDocument,
  PlayerCodeProjectDocument,
  PlayerCodeProjectImportFileDocument,
  PlayerCodeProjectSaveDocument,
  PlayerCodeProjectsDocument,
  PlayerCodeTarget,
  type PlayerCodeCommonFilesQuery,
  type PlayerCodeLibraryFilesQuery,
  type PlayerCodeProjectFieldsFragment,
  type PlayerCodeProjectsQuery,
} from '../generated/graphql.js';

type ProjectDto = PlayerCodeProjectFieldsFragment;
type ProjectSummaryDto =
  PlayerCodeProjectsQuery['playerCodeProjects'][number];
type LibraryDto =
  PlayerCodeLibraryFilesQuery['playerCodeLibraryFiles'][number];
type CommonDto = PlayerCodeCommonFilesQuery['playerCodeCommonFiles'][number];

/**
 * Typed Game API adapter for private Mod Studio projects and reusable files.
 * Mutable projects remain separate from immutable player-compute versions;
 * only the controller's deploy path converts target files to sourceFilesJson.
 */
export class PlayerCodeProjectsAPI implements ModStudioProjectProvider {
  private readonly baselines = new Map<string, ModStudioProject>();

  constructor(private readonly graphql: GraphQLClient) {}

  async listProjects(
    scope: ModStudioProjectScope,
  ): Promise<ModStudioProjectSummary[]> {
    const data = await this.request(PlayerCodeProjectsDocument, {
      appId: scope.appId,
      includeArchived: false,
      limit: 50,
      offset: 0,
    });
    return data.playerCodeProjects.map(fromSummaryDto);
  }

  async getProject(
    input: ModStudioProjectScope & { projectId: string },
  ): Promise<ModStudioProject> {
    const data = await this.request(PlayerCodeProjectDocument, {
      appId: input.appId,
      projectId: input.projectId,
    });
    return this.remember(fromProjectDto(data.playerCodeProject, input.gridId));
  }

  async createProject(
    input: CreateModStudioProjectInput,
  ): Promise<ModStudioProject> {
    const data = await this.request(PlayerCodeProjectCreateDocument, {
      input: {
        appId: input.appId,
        gridId: input.gridId,
        name: input.metadata.name,
        description: input.metadata.description ?? null,
        serverModuleName: input.metadata.serverModuleName ?? null,
        clientModuleName: input.metadata.clientModuleName ?? null,
        pairingPreference: toApiPairing(input.kind, input.metadata.pairingPreference),
        sdkVersion: '0.1.5',
        abiVersion: 0,
        initialFiles: input.files.map(toApiFile),
      },
    });
    return this.remember(
      fromProjectDto(data.playerCodeProjectCreate, input.gridId),
    );
  }

  async saveProject(
    input: SaveModStudioProjectInput,
  ): Promise<ModStudioProject> {
    try {
      const baseline =
        this.baselines.get(input.projectId) ??
        (await this.getProject({
          appId: input.appId,
          gridId: input.gridId,
          projectId: input.projectId,
        }));
      const delta = projectFileDelta(baseline, input);
      const data = await this.request(PlayerCodeProjectSaveDocument, {
        input: {
          appId: input.appId,
          projectId: input.projectId,
          expectedRevision: input.expectedRevisionId,
          gridId: input.gridId,
          name: input.metadata.name,
          description: input.metadata.description ?? null,
          serverModuleName: input.metadata.serverModuleName ?? null,
          clientModuleName: input.metadata.clientModuleName ?? null,
          pairingPreference: toApiPairing(
            projectKind(input),
            input.metadata.pairingPreference,
          ),
          upserts: delta.upserts.map(toApiFile),
          deletes: delta.deletes.map(({ target, path }) => ({
            target: target as PlayerCodeTarget,
            path,
          })),
        },
      });
      return this.remember(
        fromProjectDto(data.playerCodeProjectSave, input.gridId),
      );
    } catch (error) {
      if (
        error instanceof CrowdyGraphQLError &&
        error.code === 'CONFLICT' &&
        error.message.includes('PLAYER_CODE_REVISION_CONFLICT')
      ) {
        let remoteProject: ModStudioProject | undefined;
        try {
          remoteProject = await this.getProject({
            appId: input.appId,
            gridId: input.gridId,
            projectId: input.projectId,
          });
        } catch {
          // The conflict remains actionable if the follow-up read fails.
        }
        throw new ModStudioRevisionConflictError(error.message, remoteProject);
      }
      throw error;
    }
  }

  async listPersonalLibraryFiles(
    scope: ModStudioProjectScope,
  ): Promise<ModStudioReferenceFile[]> {
    const data = await this.request(PlayerCodeLibraryFilesDocument, {
      appId: scope.appId,
      includeArchived: false,
      limit: 100,
      offset: 0,
    });
    return data.playerCodeLibraryFiles.map(fromLibraryDto);
  }

  async savePersonalLibraryFile(
    input: SaveModStudioLibraryFileInput,
  ): Promise<ModStudioReferenceFile> {
    const data = await this.request(PlayerCodeLibrarySaveDocument, {
      input: {
        appId: input.appId,
        title: input.title,
        pathHint: normalizeModStudioPath(input.path),
        target: input.target as PlayerCodeTarget,
        tags: input.tags ?? [],
        content: input.content,
      },
    });
    return fromLibraryDto(data.playerCodeLibrarySave);
  }

  async listCommonFiles(
    scope: ModStudioProjectScope,
  ): Promise<ModStudioReferenceFile[]> {
    const data = await this.request(PlayerCodeCommonFilesDocument, {
      appId: scope.appId,
      limit: 100,
      offset: 0,
    });
    return data.playerCodeCommonFiles.map(fromCommonDto);
  }

  async importReferenceFile(
    input: ImportModStudioReferenceFileInput,
  ): Promise<ModStudioProject> {
    const data = await this.request(PlayerCodeProjectImportFileDocument, {
      input: {
        appId: input.appId,
        projectId: input.projectId,
        expectedProjectRevision: input.expectedRevisionId,
        source:
          input.source === 'PERSONAL_LIBRARY'
            ? PlayerCodeImportSource.Library
            : PlayerCodeImportSource.Common,
        ...(input.source === 'PERSONAL_LIBRARY'
          ? { libraryFileId: input.referenceId }
          : { commonVersionId: input.referenceId }),
        ...(input.destinationPath
          ? { destinationPath: normalizeModStudioPath(input.destinationPath) }
          : {}),
      },
    });
    return this.remember(
      fromProjectDto(data.playerCodeProjectImportFile, input.gridId),
    );
  }

  private remember(project: ModStudioProject): ModStudioProject {
    this.baselines.set(project.projectId, cloneProject(project));
    return project;
  }

  private async request<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    variables: TVariables,
  ): Promise<TResult> {
    try {
      return await this.graphql.request(document, variables);
    } catch (error) {
      if (
        error instanceof CrowdyNetworkError ||
        error instanceof CrowdyTimeoutError ||
        (error instanceof CrowdyHttpError && error.status >= 500)
      ) {
        throw new ModStudioOfflineError(error.message, error);
      }
      throw error;
    }
  }
}

function fromSummaryDto(dto: ProjectSummaryDto): ModStudioProjectSummary {
  return {
    projectId: dto.projectId,
    name: dto.name,
    kind: kindFromApi(dto.pairingPreference),
    revisionId: String(dto.revision),
    ...(dto.serverModuleName
      ? { serverModuleName: dto.serverModuleName }
      : {}),
    ...(dto.clientModuleName
      ? { clientModuleName: dto.clientModuleName }
      : {}),
    updatedAt: dto.updatedAt,
  };
}

function fromProjectDto(
  dto: ProjectDto,
  fallbackGridId: string,
): ModStudioProject {
  const files = dto.files.map((file) => ({
    target: file.target as 'SERVER' | 'CLIENT',
    path: normalizeModStudioPath(file.path),
    content: file.content,
  }));
  return {
    projectId: dto.projectId,
    appId: String(dto.appId),
    gridId: dto.gridId == null ? fallbackGridId : String(dto.gridId),
    kind: kindFromApi(dto.pairingPreference),
    metadata: {
      name: dto.name,
      ...(dto.description ? { description: dto.description } : {}),
      ...(dto.serverModuleName
        ? { serverModuleName: dto.serverModuleName }
        : {}),
      ...(dto.clientModuleName
        ? { clientModuleName: dto.clientModuleName }
        : {}),
      pairingPreference: fromApiPairing(dto.pairingPreference),
    },
    files,
    sdkVersion: dto.sdkVersion,
    abiVersion: dto.abiVersion,
    revision: {
      id: String(dto.revision),
      savedAt: dto.updatedAt,
    },
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function fromLibraryDto(dto: LibraryDto): ModStudioReferenceFile {
  return {
    id: dto.libraryFileId,
    source: 'PERSONAL_LIBRARY',
    title: dto.title,
    target: dto.target as 'SERVER' | 'CLIENT',
    path: normalizeModStudioPath(dto.pathHint),
    content: dto.content,
    tags: [...dto.tags],
    updatedAt: dto.updatedAt,
  };
}

function fromCommonDto(dto: CommonDto): ModStudioReferenceFile {
  return {
    id: dto.versionId,
    source: 'COMMON',
    title: dto.title,
    target: dto.target as 'SERVER' | 'CLIENT',
    path: normalizeModStudioPath(dto.path),
    content: dto.content,
    tags: [...dto.tags],
    updatedAt: dto.updatedAt,
  };
}

function kindFromApi(
  pairing: PlayerCodePairingPreference,
): ModStudioProjectKind {
  if (pairing === PlayerCodePairingPreference.ServerOnly) return 'SERVER';
  if (pairing === PlayerCodePairingPreference.ClientOnly) return 'CLIENT';
  return 'FULL_STACK';
}

function fromApiPairing(
  pairing: PlayerCodePairingPreference,
): ModStudioPairingPreference {
  if (pairing === PlayerCodePairingPreference.Paired) return 'REQUIRED';
  if (pairing === PlayerCodePairingPreference.Independent) return 'OPTIONAL';
  return 'NONE';
}

function toApiPairing(
  kind: ModStudioProjectKind,
  pairing: ModStudioPairingPreference,
): PlayerCodePairingPreference {
  if (kind === 'SERVER') return PlayerCodePairingPreference.ServerOnly;
  if (kind === 'CLIENT') return PlayerCodePairingPreference.ClientOnly;
  return pairing === 'REQUIRED'
    ? PlayerCodePairingPreference.Paired
    : PlayerCodePairingPreference.Independent;
}

function toApiFile(file: {
  target: 'SERVER' | 'CLIENT';
  path: string;
  content: string;
}): {
  target: PlayerCodeTarget;
  path: string;
  content: string;
} {
  return {
    target: file.target as PlayerCodeTarget,
    path: normalizeModStudioPath(file.path),
    content: file.content,
  };
}

function projectKind(input: SaveModStudioProjectInput): ModStudioProjectKind {
  const hasServer = input.files.some((file) => file.target === 'SERVER');
  const hasClient = input.files.some((file) => file.target === 'CLIENT');
  if (hasServer && hasClient) return 'FULL_STACK';
  if (hasServer) return 'SERVER';
  return 'CLIENT';
}

function projectFileDelta(
  baseline: ModStudioProject,
  input: SaveModStudioProjectInput,
): {
  upserts: SaveModStudioProjectInput['files'];
  deletes: Array<{ target: 'SERVER' | 'CLIENT'; path: string }>;
} {
  const previous = new Map(
    baseline.files.map((file) => [
      `${file.target}:${normalizeModStudioPath(file.path)}`,
      file,
    ]),
  );
  const current = new Map(
    input.files.map((file) => [
      `${file.target}:${normalizeModStudioPath(file.path)}`,
      file,
    ]),
  );
  const upserts = input.files.filter((file) => {
    const before = previous.get(
      `${file.target}:${normalizeModStudioPath(file.path)}`,
    );
    return !before || before.content !== file.content;
  });
  const deletes = baseline.files
    .filter(
      (file) =>
        !current.has(`${file.target}:${normalizeModStudioPath(file.path)}`),
    )
    .map((file) => ({ target: file.target, path: file.path }));
  return { upserts, deletes };
}

function cloneProject(project: ModStudioProject): ModStudioProject {
  return {
    ...project,
    metadata: { ...project.metadata },
    files: project.files.map((file) => ({ ...file })),
    revision: { ...project.revision },
  };
}
