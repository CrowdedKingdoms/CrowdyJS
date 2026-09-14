/**
 * GraphQL transport for GitHub-backed Crowdy Studio projects.
 *
 * Same GraphQL client and session as everything else in the SDK: the game
 * API resolves the repository from the project's bind, so no operation here
 * names an `owner` / `repo` on a read or write, and no GitHub token ever
 * reaches the browser. GitHub is a filesystem for the project, not a login,
 * and it is never required — a project starts in Crowdy Studio and may be
 * bound later.
 *
 * Which token may call what is decided server-side: `connectUrl`, `repos`,
 * `bind`, `unbind` need the identity session (hosted Studio); `status`,
 * `layout`, `tree`, `getFile`, `putFile`, `deleteFile`, `refresh` also work
 * under a game's app token, scoped to projects that token's user owns. A game
 * therefore needs no identity session to author against GitHub, and a
 * third-party game must never read one.
 *
 * Every field the API answers is DATACENTER_ONLY: this transport must run on
 * the client that adopted the app's datacenter endpoint (the same client that
 * plays), never on one pointed at the shared origin.
 */

import type { GraphQLClient } from '../../client.js';

export interface CrowdyStudioGitHubStatus {
  configured: boolean;
  connected: boolean;
  accountLogin: string | null;
  accountType: string | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  /** Commit the project mirror is at; null when the project is not bound. */
  githubSha: string | null;
  /**
   * `all` or `selected`: which repositories the installation covers. A
   * repository created on GitHub afterwards must be added to a `selected`
   * installation (at `installUrl`) before it can be bound. Null when not
   * connected.
   */
  repositorySelection: 'all' | 'selected' | null;
  installUrl: string | null;
}

export interface CrowdyStudioGitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
}

export interface CrowdyStudioGitHubTreeEntry {
  path: string;
  /** `blob` or `tree`. */
  type: string;
  sha: string | null;
  size: number | null;
}

export interface CrowdyStudioGitHubTree {
  commitSha: string;
  entries: CrowdyStudioGitHubTreeEntry[];
}

export interface CrowdyStudioGitHubFile {
  path: string;
  content: string;
  sha: string;
  /** Commit the file was read at, or the commit a write created (the new githubSha). */
  commitSha: string | null;
}

/**
 * Where the SERVER and CLIENT crates live in the bound repository, resolved
 * server-side from `crowdy.json` (or inferred) at one commit. The only layout
 * grammar: the SDK never parses `crowdy.json` itself.
 */
export interface CrowdyStudioGitHubLayout {
  commitSha: string;
  /** Directory of the SERVER Cargo.toml; `.` is the repository root. */
  server: string;
  /** Directory of the CLIENT Cargo.toml, or null when server-only. */
  client: string | null;
  assets: string;
  fromFile: boolean;
}

/** Which side is the truth for a bind's first commit. */
export type CrowdyStudioGitHubBindInitial = 'PUSH_PROJECT' | 'TAKE_REPOSITORY';

export interface CrowdyStudioGitHubProjectScope {
  appId: string;
  projectId: string;
}

const STATUS_FIELDS = `
  configured connected accountLogin accountType owner repo branch githubSha repositorySelection installUrl
`;

const STATUS = `
  query CrowdyStudioGitHubStatus($appId: BigInt, $projectId: String) {
    crowdyStudioGitHubStatus(appId: $appId, projectId: $projectId) { ${STATUS_FIELDS} }
  }
`;
const CONNECT = `
  mutation CrowdyStudioGitHubConnectUrl { crowdyStudioGitHubConnectUrl { connectUrl } }
`;
const REPOS = `
  query CrowdyStudioGitHubRepos { crowdyStudioGitHubRepos { owner name fullName private defaultBranch } }
`;
const BIND = `
  mutation CrowdyStudioGitHubBind($input: BindCrowdyStudioGitHubInput!) {
    crowdyStudioGitHubBind(input: $input) { ${STATUS_FIELDS} }
  }
`;
const UNBIND = `
  mutation CrowdyStudioGitHubUnbind($input: CrowdyStudioGitHubProjectInput!) {
    crowdyStudioGitHubUnbind(input: $input) { ${STATUS_FIELDS} }
  }
`;
const REFRESH = `
  mutation CrowdyStudioGitHubRefresh($input: CrowdyStudioGitHubProjectInput!) {
    crowdyStudioGitHubRefresh(input: $input) { ${STATUS_FIELDS} }
  }
`;
const LAYOUT = `
  query CrowdyStudioGitHubLayout($input: CrowdyStudioGitHubAtCommitInput!) {
    crowdyStudioGitHubLayout(input: $input) { commitSha server client assets fromFile }
  }
`;
const TREE = `
  query CrowdyStudioGitHubTree($input: CrowdyStudioGitHubAtCommitInput!) {
    crowdyStudioGitHubTree(input: $input) { commitSha entries { path type sha size } }
  }
`;
const FILE = `
  query CrowdyStudioGitHubFile($input: CrowdyStudioGitHubFileInput!) {
    crowdyStudioGitHubFile(input: $input) { path content sha commitSha }
  }
`;
const PUT_FILE = `
  mutation CrowdyStudioGitHubPutFile($input: CrowdyStudioGitHubPutFileInput!) {
    crowdyStudioGitHubPutFile(input: $input) { path content sha commitSha }
  }
`;
const DELETE_FILE = `
  mutation CrowdyStudioGitHubDeleteFile($input: CrowdyStudioGitHubDeleteFileInput!) {
    crowdyStudioGitHubDeleteFile(input: $input) { ${STATUS_FIELDS} }
  }
`;

export class CrowdyStudioGitHubTransport {
  constructor(private readonly graphql: GraphQLClient) {}

  async status(input: { appId?: string; projectId?: string } = {}): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubStatus: CrowdyStudioGitHubStatus }>(
      STATUS,
      { appId: input.appId, projectId: input.projectId },
    );
    return data.crowdyStudioGitHubStatus;
  }

  async connectUrl(): Promise<{ connectUrl: string }> {
    const data = await this.graphql.query<{ crowdyStudioGitHubConnectUrl: { connectUrl: string } }>(CONNECT);
    return data.crowdyStudioGitHubConnectUrl;
  }

  async repos(): Promise<CrowdyStudioGitHubRepo[]> {
    const data = await this.graphql.query<{ crowdyStudioGitHubRepos: CrowdyStudioGitHubRepo[] }>(REPOS);
    return data.crowdyStudioGitHubRepos ?? [];
  }

  /**
   * Bind the project and make the two sides agree in one commit.
   * `PUSH_PROJECT` commits the project files to the branch (refused with
   * GITHUB_REPO_HAS_FILES when the branch already has rust under the layout
   * roots); `TAKE_REPOSITORY` replaces the project files with the branch's
   * (refused with GITHUB_REPO_EMPTY when there are none).
   */
  async bind(
    input: CrowdyStudioGitHubProjectScope & {
      owner: string;
      repo: string;
      branch?: string;
      initial: CrowdyStudioGitHubBindInitial;
    },
  ): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubBind: CrowdyStudioGitHubStatus }>(BIND, { input });
    return data.crowdyStudioGitHubBind;
  }

  /** Clear the bind. The project keeps its files and is a STUDIO project again. */
  async unbind(input: CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubUnbind: CrowdyStudioGitHubStatus }>(UNBIND, {
      input,
    });
    return data.crowdyStudioGitHubUnbind;
  }

  /** Bring the project mirror forward to the branch head after a push made elsewhere. */
  async refresh(input: CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubRefresh: CrowdyStudioGitHubStatus }>(REFRESH, {
      input,
    });
    return data.crowdyStudioGitHubRefresh;
  }

  async layout(input: CrowdyStudioGitHubProjectScope & { commitSha?: string }): Promise<CrowdyStudioGitHubLayout> {
    const data = await this.graphql.query<{ crowdyStudioGitHubLayout: CrowdyStudioGitHubLayout }>(LAYOUT, {
      input,
    });
    return data.crowdyStudioGitHubLayout;
  }

  async tree(input: CrowdyStudioGitHubProjectScope & { commitSha?: string }): Promise<CrowdyStudioGitHubTree> {
    const data = await this.graphql.query<{ crowdyStudioGitHubTree: CrowdyStudioGitHubTree }>(TREE, { input });
    return data.crowdyStudioGitHubTree;
  }

  async getFile(
    input: CrowdyStudioGitHubProjectScope & { path: string; commitSha?: string },
  ): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubFile: CrowdyStudioGitHubFile }>(FILE, { input });
    return data.crowdyStudioGitHubFile;
  }

  /**
   * Commit one file to the bound branch. `expectedCommitSha` is the project
   * `github.sha` the writer read; a stale value is refused with
   * GITHUB_STALE_SHA. The blob `sha` is optional — the server resolves it from
   * the tree at that commit. The returned `commitSha` is the new `github.sha`.
   */
  async putFile(
    input: CrowdyStudioGitHubProjectScope & {
      path: string;
      content: string;
      message: string;
      expectedCommitSha: string;
      sha?: string;
    },
  ): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubPutFile: CrowdyStudioGitHubFile }>(PUT_FILE, {
      input,
    });
    return data.crowdyStudioGitHubPutFile;
  }

  /** Delete one file from the bound branch under the same guards as {@link putFile}. */
  async deleteFile(
    input: CrowdyStudioGitHubProjectScope & {
      path: string;
      message: string;
      expectedCommitSha: string;
      sha?: string;
    },
  ): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubDeleteFile: CrowdyStudioGitHubStatus }>(
      DELETE_FILE,
      { input },
    );
    return data.crowdyStudioGitHubDeleteFile;
  }
}
