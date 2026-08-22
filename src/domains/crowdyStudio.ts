import type { GraphQLClient } from '../client.js';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
  CrowdyGraphQLError,
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyTimeoutError,
} from '../errors.js';
import {
  CrowdyStudioOfflineError,
  CrowdyStudioRevisionConflictError,
  normalizeCrowdyStudioPath,
  type CreateCrowdyStudioProjectInput,
  type ImportCrowdyStudioReferenceFileInput,
  type CrowdyStudioPairingPreference,
  type CrowdyStudioProject,
  type CrowdyStudioProjectKind,
  type CrowdyStudioProjectProvider,
  type CrowdyStudioProjectScope,
  type CrowdyStudioProjectSummary,
  type CrowdyStudioReferenceFile,
  type SaveCrowdyStudioLibraryFileInput,
  type SaveCrowdyStudioProjectInput,
} from '../crowdy-studio/models.js';
import {
  CrowdyStudioCommonFilesDocument,
  CrowdyStudioImportSource,
  CrowdyStudioLibraryFilesDocument,
  CrowdyStudioLibrarySaveDocument,
  CrowdyStudioPairingPreference as CrowdyStudioPairingPreferenceEnum,
  CrowdyStudioProjectCreateDocument,
  CrowdyStudioProjectDocument,
  CrowdyStudioProjectImportFileDocument,
  CrowdyStudioProjectSaveDocument,
  CrowdyStudioProjectsDocument,
  CrowdyStudioTarget,
  type CrowdyStudioCommonFilesQuery,
  type CrowdyStudioLibraryFilesQuery,
  type CrowdyStudioProjectFieldsFragment,
  type CrowdyStudioProjectsQuery,
} from '../generated/graphql.js';

type ProjectDto = CrowdyStudioProjectFieldsFragment;
type ProjectSummaryDto =
  CrowdyStudioProjectsQuery['crowdyStudioProjects'][number];
type LibraryDto =
  CrowdyStudioLibraryFilesQuery['crowdyStudioLibraryFiles'][number];
type CommonDto = CrowdyStudioCommonFilesQuery['crowdyStudioCommonFiles'][number];

/**
 * Schema-coupled Game API adapter for private Crowdy Studio projects and
 * reusable files. Generated GraphQL documents and DTOs stay in this module;
 * the controller and public project models remain transport-neutral. Mutable
 * projects remain separate from immutable player-compute versions, and only
 * the controller's deploy path converts target files to sourceFilesJson.
 */
export class CrowdyStudioAPI implements CrowdyStudioProjectProvider {
  private readonly baselines = new Map<string, CrowdyStudioProject>();

  constructor(private readonly graphql: GraphQLClient) {}

  async listProjects(
    scope: CrowdyStudioProjectScope,
  ): Promise<CrowdyStudioProjectSummary[]> {
    const data = await this.request(CrowdyStudioProjectsDocument, {
      appId: scope.appId,
      includeArchived: false,
      limit: 50,
      offset: 0,
    });
    return data.crowdyStudioProjects.map(fromSummaryDto);
  }

  async getProject(
    input: CrowdyStudioProjectScope & { projectId: string },
  ): Promise<CrowdyStudioProject> {
    const data = await this.request(CrowdyStudioProjectDocument, {
      appId: input.appId,
      projectId: input.projectId,
    });
    return this.remember(fromProjectDto(data.crowdyStudioProject, input.gridId));
  }

  async createProject(
    input: CreateCrowdyStudioProjectInput,
  ): Promise<CrowdyStudioProject> {
    const data = await this.request(CrowdyStudioProjectCreateDocument, {
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
      fromProjectDto(data.crowdyStudioProjectCreate, input.gridId),
    );
  }

  async saveProject(
    input: SaveCrowdyStudioProjectInput,
  ): Promise<CrowdyStudioProject> {
    try {
      const baseline =
        this.baselines.get(input.projectId) ??
        (await this.getProject({
          appId: input.appId,
          gridId: input.gridId,
          projectId: input.projectId,
        }));
      const delta = projectFileDelta(baseline, input);
      const data = await this.request(CrowdyStudioProjectSaveDocument, {
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
            target: target as CrowdyStudioTarget,
            path,
          })),
        },
      });
      return this.remember(
        fromProjectDto(data.crowdyStudioProjectSave, input.gridId),
      );
    } catch (error) {
      // THE CODE IS `CROWDY_STUDIO_REVISION_CONFLICT`, not `CONFLICT`. This
      // asked for `CONFLICT` and could therefore never match, so a real remote
      // conflict never became a `CrowdyStudioRevisionConflictError` and the
      // editor's "the remote moved" recovery — refetch, then offer to keep your
      // version — was unreachable from the server side. The SDL description is
      // where it came from: it said "returns CONFLICT with
      // CROWDY_STUDIO_REVISION_CONFLICT", which reads as a code plus a detail
      // and is one code with a long name. `crowdy-agent/graphql-transport.ts`
      // had it right all along, in this same package.
      if (
        error instanceof CrowdyGraphQLError &&
        (error.code === 'CROWDY_STUDIO_REVISION_CONFLICT' ||
          error.message.includes('CROWDY_STUDIO_REVISION_CONFLICT'))
      ) {
        let remoteProject: CrowdyStudioProject | undefined;
        try {
          remoteProject = await this.getProject({
            appId: input.appId,
            gridId: input.gridId,
            projectId: input.projectId,
          });
        } catch {
          // The conflict remains actionable if the follow-up read fails.
        }
        throw new CrowdyStudioRevisionConflictError(error.message, remoteProject);
      }
      throw error;
    }
  }

  async listPersonalLibraryFiles(
    scope: CrowdyStudioProjectScope,
  ): Promise<CrowdyStudioReferenceFile[]> {
    const data = await this.request(CrowdyStudioLibraryFilesDocument, {
      appId: scope.appId,
      includeArchived: false,
      limit: 100,
      offset: 0,
    });
    return data.crowdyStudioLibraryFiles.map(fromLibraryDto);
  }

  async savePersonalLibraryFile(
    input: SaveCrowdyStudioLibraryFileInput,
  ): Promise<CrowdyStudioReferenceFile> {
    const data = await this.request(CrowdyStudioLibrarySaveDocument, {
      input: {
        appId: input.appId,
        title: input.title,
        pathHint: normalizeCrowdyStudioPath(input.path),
        target: input.target as CrowdyStudioTarget,
        tags: input.tags ?? [],
        content: input.content,
      },
    });
    return fromLibraryDto(data.crowdyStudioLibrarySave);
  }

  async listCommonFiles(
    scope: CrowdyStudioProjectScope,
  ): Promise<CrowdyStudioReferenceFile[]> {
    const data = await this.request(CrowdyStudioCommonFilesDocument, {
      appId: scope.appId,
      limit: 100,
      offset: 0,
    });
    return data.crowdyStudioCommonFiles.map(fromCommonDto);
  }

  async importReferenceFile(
    input: ImportCrowdyStudioReferenceFileInput,
  ): Promise<CrowdyStudioProject> {
    const data = await this.request(CrowdyStudioProjectImportFileDocument, {
      input: {
        appId: input.appId,
        projectId: input.projectId,
        expectedProjectRevision: input.expectedRevisionId,
        source:
          input.source === 'PERSONAL_LIBRARY'
            ? CrowdyStudioImportSource.Library
            : CrowdyStudioImportSource.Common,
        ...(input.source === 'PERSONAL_LIBRARY'
          ? { libraryFileId: input.referenceId }
          : { commonVersionId: input.referenceId }),
        ...(input.destinationPath
          ? { destinationPath: normalizeCrowdyStudioPath(input.destinationPath) }
          : {}),
      },
    });
    return this.remember(
      fromProjectDto(data.crowdyStudioProjectImportFile, input.gridId),
    );
  }

  private remember(project: CrowdyStudioProject): CrowdyStudioProject {
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
        throw new CrowdyStudioOfflineError(error.message, error);
      }
      throw error;
    }
  }
}

function fromSummaryDto(dto: ProjectSummaryDto): CrowdyStudioProjectSummary {
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
): CrowdyStudioProject {
  const files = dto.files.map((file) => ({
    target: file.target as 'SERVER' | 'CLIENT',
    path: normalizeCrowdyStudioPath(file.path),
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

function fromLibraryDto(dto: LibraryDto): CrowdyStudioReferenceFile {
  return {
    id: dto.libraryFileId,
    source: 'PERSONAL_LIBRARY',
    title: dto.title,
    target: dto.target as 'SERVER' | 'CLIENT',
    path: normalizeCrowdyStudioPath(dto.pathHint),
    content: dto.content,
    tags: [...dto.tags],
    updatedAt: dto.updatedAt,
  };
}

function fromCommonDto(dto: CommonDto): CrowdyStudioReferenceFile {
  return {
    id: dto.versionId,
    source: 'COMMON',
    title: dto.title,
    target: dto.target as 'SERVER' | 'CLIENT',
    path: normalizeCrowdyStudioPath(dto.path),
    content: dto.content,
    tags: [...dto.tags],
    updatedAt: dto.updatedAt,
  };
}

function kindFromApi(
  pairing: CrowdyStudioPairingPreferenceEnum,
): CrowdyStudioProjectKind {
  if (pairing === CrowdyStudioPairingPreferenceEnum.ServerOnly) return 'SERVER';
  if (pairing === CrowdyStudioPairingPreferenceEnum.ClientOnly) return 'CLIENT';
  return 'FULL_STACK';
}

function fromApiPairing(
  pairing: CrowdyStudioPairingPreferenceEnum,
): CrowdyStudioPairingPreference {
  if (pairing === CrowdyStudioPairingPreferenceEnum.Paired) return 'REQUIRED';
  if (pairing === CrowdyStudioPairingPreferenceEnum.Independent) return 'OPTIONAL';
  return 'NONE';
}

function toApiPairing(
  kind: CrowdyStudioProjectKind,
  pairing: CrowdyStudioPairingPreference,
): CrowdyStudioPairingPreferenceEnum {
  if (kind === 'SERVER') return CrowdyStudioPairingPreferenceEnum.ServerOnly;
  if (kind === 'CLIENT') return CrowdyStudioPairingPreferenceEnum.ClientOnly;
  return pairing === 'REQUIRED'
    ? CrowdyStudioPairingPreferenceEnum.Paired
    : CrowdyStudioPairingPreferenceEnum.Independent;
}

function toApiFile(file: {
  target: 'SERVER' | 'CLIENT';
  path: string;
  content: string;
}): {
  target: CrowdyStudioTarget;
  path: string;
  content: string;
} {
  return {
    target: file.target as CrowdyStudioTarget,
    path: normalizeCrowdyStudioPath(file.path),
    content: file.content,
  };
}

function projectKind(input: SaveCrowdyStudioProjectInput): CrowdyStudioProjectKind {
  const hasServer = input.files.some((file) => file.target === 'SERVER');
  const hasClient = input.files.some((file) => file.target === 'CLIENT');
  if (hasServer && hasClient) return 'FULL_STACK';
  if (hasServer) return 'SERVER';
  return 'CLIENT';
}

function projectFileDelta(
  baseline: CrowdyStudioProject,
  input: SaveCrowdyStudioProjectInput,
): {
  upserts: SaveCrowdyStudioProjectInput['files'];
  deletes: Array<{ target: 'SERVER' | 'CLIENT'; path: string }>;
} {
  const previous = new Map(
    baseline.files.map((file) => [
      `${file.target}:${normalizeCrowdyStudioPath(file.path)}`,
      file,
    ]),
  );
  const current = new Map(
    input.files.map((file) => [
      `${file.target}:${normalizeCrowdyStudioPath(file.path)}`,
      file,
    ]),
  );
  const upserts = input.files.filter((file) => {
    const before = previous.get(
      `${file.target}:${normalizeCrowdyStudioPath(file.path)}`,
    );
    return !before || before.content !== file.content;
  });
  const deletes = baseline.files
    .filter(
      (file) =>
        !current.has(`${file.target}:${normalizeCrowdyStudioPath(file.path)}`),
    )
    .map((file) => ({ target: file.target, path: file.path }));
  return { upserts, deletes };
}

function cloneProject(project: CrowdyStudioProject): CrowdyStudioProject {
  return {
    ...project,
    metadata: { ...project.metadata },
    files: project.files.map((file) => ({ ...file })),
    revision: { ...project.revision },
  };
}
