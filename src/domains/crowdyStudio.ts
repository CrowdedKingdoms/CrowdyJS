import type { GraphQLClient } from '../client.js';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
  CrowdyStudioGitHubTransport,
  type CrowdyStudioGitHubLayout,
} from '../crowdy-studio/github/transport.js';
import { studioFileToRepoPath } from '../crowdy-studio/github/layout.js';
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
  CrowdyStudioProjectSource as CrowdyStudioProjectSourceEnum,
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
 * the controller and public project models remain transport-neutral.
 *
 * A project's `source` decides how {@link saveProject} persists files:
 * `STUDIO` projects go through `crowdyStudioProjectSave` under the project
 * revision; `GITHUB` projects commit each changed file through
 * `crowdyStudioGitHubPutFile` / `DeleteFile` under `github.sha`
 * (`expectedCommitSha`), because their files are a server-maintained mirror
 * of the repository and the Studio file mutations refuse them. Either way a
 * lost race is a {@link CrowdyStudioRevisionConflictError} and the editor's
 * "the remote moved" recovery applies. The controller never learns which.
 */
export class CrowdyStudioAPI implements CrowdyStudioProjectProvider {
  private readonly baselines = new Map<string, CrowdyStudioProject>();
  private readonly github: CrowdyStudioGitHubTransport;
  /** Layout per `projectId@commit`; commits are immutable so this never goes stale. */
  private readonly layouts = new Map<string, CrowdyStudioGitHubLayout>();

  constructor(private readonly graphql: GraphQLClient) {
    this.github = new CrowdyStudioGitHubTransport(graphql);
  }

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
        sdkVersion: '0.1.8',
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
    const baseline =
      this.baselines.get(input.projectId) ??
      (await this.getProject({
        appId: input.appId,
        gridId: input.gridId,
        projectId: input.projectId,
      }));
    if (baseline.source === 'GITHUB' && baseline.github?.sha) {
      return this.saveBoundProject(baseline, input);
    }
    try {
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

  /**
   * Persist a GITHUB project: metadata through the project save (a CAS on the
   * revision, no file bodies), then each changed file as its own commit on the
   * bound branch, each carrying the commit the previous one produced. A file
   * put is atomic on the server (GitHub commit, then mirror + `github_sha`
   * advance in one transaction), so a stale race part-way through leaves the
   * earlier commits on the branch and this project describing them; the
   * conflict recovery re-reads and the remaining diffs are re-applied against
   * the new commit. Layout comes from the API at the commit being written to.
   */
  private async saveBoundProject(
    baseline: CrowdyStudioProject,
    input: SaveCrowdyStudioProjectInput,
  ): Promise<CrowdyStudioProject> {
    const scope = { appId: input.appId, projectId: input.projectId };
    const startSha = baseline.github?.sha;
    if (!startSha) {
      throw new Error('The bound project has no mirror commit; refresh it from GitHub first.');
    }
    // The caller's precondition is the revision IT read. The baseline is the
    // project this provider last returned; the two agree whenever the caller
    // saved or re-read through here. A caller holding an older revision must
    // not ride the baseline's commit onto the branch — that is exactly the
    // lost update the STUDIO path's server-side CAS refuses.
    if (input.expectedRevisionId !== baseline.revision.id) {
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
      throw new CrowdyStudioRevisionConflictError(
        `CROWDY_STUDIO_REVISION_CONFLICT: expected project revision ${input.expectedRevisionId}; current revision is ${baseline.revision.id}.`,
        remoteProject,
      );
    }
    try {
      if (metadataChanged(baseline, input)) {
        await this.request(CrowdyStudioProjectSaveDocument, {
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
            upserts: [],
            deletes: [],
          },
        });
      }
      const delta = projectFileDelta(baseline, input);
      let sha = startSha;
      if (delta.upserts.length > 0 || delta.deletes.length > 0) {
        const layout = await this.layoutAt(scope, sha);
        for (const file of delta.upserts) {
          const path = normalizeCrowdyStudioPath(file.path);
          const repoPath = studioFileToRepoPath(layout, file.target, path);
          if (!repoPath) {
            throw new Error(
              `The bound repository's crowdy.json has no ${file.target.toLowerCase()} directory, so ${path} has nowhere to go.`,
            );
          }
          const written = await this.github.putFile({
            ...scope,
            path: repoPath,
            content: file.content,
            message: `studio: update ${repoPath}`,
            expectedCommitSha: sha,
          });
          sha = written.commitSha ?? sha;
        }
        for (const file of delta.deletes) {
          const repoPath = studioFileToRepoPath(layout, file.target, normalizeCrowdyStudioPath(file.path));
          if (!repoPath) continue;
          const status = await this.github.deleteFile({
            ...scope,
            path: repoPath,
            message: `studio: delete ${repoPath}`,
            expectedCommitSha: sha,
          });
          sha = status.githubSha ?? sha;
        }
      }
      return await this.getProject({
        appId: input.appId,
        gridId: input.gridId,
        projectId: input.projectId,
      });
    } catch (error) {
      if (
        error instanceof CrowdyGraphQLError &&
        (error.code === 'GITHUB_STALE_SHA' ||
          error.code === 'CROWDY_STUDIO_REVISION_CONFLICT' ||
          error.message.includes('GITHUB_STALE_SHA') ||
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

  private async layoutAt(
    scope: { appId: string; projectId: string },
    commitSha: string,
  ): Promise<CrowdyStudioGitHubLayout> {
    const key = `${scope.projectId}@${commitSha}`;
    const cached = this.layouts.get(key);
    if (cached) return cached;
    const layout = await this.github.layout({ ...scope, commitSha });
    if (this.layouts.size > 64) {
      const [oldest] = this.layouts.keys();
      if (oldest !== undefined) this.layouts.delete(oldest);
    }
    this.layouts.set(key, layout);
    return layout;
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
  const bound =
    dto.source === CrowdyStudioProjectSourceEnum.Github &&
    dto.githubOwner &&
    dto.githubRepo &&
    dto.githubBranch;
  return {
    projectId: dto.projectId,
    name: dto.name,
    kind: kindFromApi(dto.pairingPreference),
    revisionId: String(dto.revision),
    source: bound ? 'GITHUB' : 'STUDIO',
    ...(bound ? { github: `${dto.githubOwner}/${dto.githubRepo}@${dto.githubBranch}` } : {}),
    githubSha: bound ? (dto.githubSha ?? null) : null,
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
    source: dto.source === CrowdyStudioProjectSourceEnum.Github ? 'GITHUB' : 'STUDIO',
    github:
      dto.source === CrowdyStudioProjectSourceEnum.Github &&
      dto.githubOwner &&
      dto.githubRepo &&
      dto.githubBranch
        ? {
            owner: dto.githubOwner,
            repo: dto.githubRepo,
            branch: dto.githubBranch,
            sha: dto.githubSha ?? null,
          }
        : null,
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

function metadataChanged(
  baseline: CrowdyStudioProject,
  input: SaveCrowdyStudioProjectInput,
): boolean {
  const a = baseline.metadata;
  const b = input.metadata;
  return (
    baseline.gridId !== input.gridId ||
    a.name !== b.name ||
    (a.description ?? '') !== (b.description ?? '') ||
    (a.serverModuleName ?? '') !== (b.serverModuleName ?? '') ||
    (a.clientModuleName ?? '') !== (b.clientModuleName ?? '') ||
    toApiPairing(baseline.kind, a.pairingPreference) !==
      toApiPairing(projectKind(input), b.pairingPreference)
  );
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
    github: project.github ? { ...project.github } : null,
  };
}
