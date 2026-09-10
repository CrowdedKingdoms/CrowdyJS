/**
 * GraphQL transport for GitHub-backed Crowdy Studio projects.
 *
 * Same GraphQL client and session as everything else in the SDK: the game
 * API resolves the repository from the project's bind, so no operation here
 * names an `owner` / `repo` on a read or write, and no GitHub token ever
 * reaches the browser. GitHub is a filesystem for the project, not a login.
 *
 * Which token may call what is decided server-side: `connectUrl`, `repos`,
 * `bind`, `unbind` need the identity session (hosted Studio); `status`,
 * `setAutosave`, `tree`, `getFile`, `putFile` also work under the in-game
 * embed's app token.
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
  /** Autosave also pushes to GitHub. Off by default; the owner opts in. */
  autosave: boolean;
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

export interface CrowdyStudioGitHubFile {
  path: string;
  content: string;
  sha: string;
}

export interface CrowdyStudioGitHubProjectScope {
  appId: string;
  projectId: string;
}

const STATUS_FIELDS = `
  configured connected accountLogin accountType owner repo branch autosave installUrl
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
const SET_AUTOSAVE = `
  mutation CrowdyStudioGitHubSetAutosave($input: SetCrowdyStudioGitHubAutosaveInput!) {
    crowdyStudioGitHubSetAutosave(input: $input) { ${STATUS_FIELDS} }
  }
`;
const TREE = `
  query CrowdyStudioGitHubTree($input: CrowdyStudioGitHubProjectInput!) {
    crowdyStudioGitHubTree(input: $input) { path type sha size }
  }
`;
const FILE = `
  query CrowdyStudioGitHubFile($input: CrowdyStudioGitHubFileInput!) {
    crowdyStudioGitHubFile(input: $input) { path content sha }
  }
`;
const PUT_FILE = `
  mutation CrowdyStudioGitHubPutFile($input: CrowdyStudioGitHubPutFileInput!) {
    crowdyStudioGitHubPutFile(input: $input) { path content sha }
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

  async bind(
    input: CrowdyStudioGitHubProjectScope & { owner: string; repo: string; branch?: string },
  ): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubBind: CrowdyStudioGitHubStatus }>(BIND, { input });
    return data.crowdyStudioGitHubBind;
  }

  async unbind(input: CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubUnbind: CrowdyStudioGitHubStatus }>(UNBIND, {
      input,
    });
    return data.crowdyStudioGitHubUnbind;
  }

  async setAutosave(
    input: CrowdyStudioGitHubProjectScope & { autosave: boolean },
  ): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubSetAutosave: CrowdyStudioGitHubStatus }>(
      SET_AUTOSAVE,
      { input },
    );
    return data.crowdyStudioGitHubSetAutosave;
  }

  async tree(input: CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubTreeEntry[]> {
    const data = await this.graphql.query<{ crowdyStudioGitHubTree: CrowdyStudioGitHubTreeEntry[] }>(TREE, {
      input,
    });
    return data.crowdyStudioGitHubTree ?? [];
  }

  async getFile(input: CrowdyStudioGitHubProjectScope & { path: string }): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubFile: CrowdyStudioGitHubFile }>(FILE, { input });
    return data.crowdyStudioGitHubFile;
  }

  async putFile(
    input: CrowdyStudioGitHubProjectScope & { path: string; content: string; message: string; sha?: string },
  ): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubPutFile: CrowdyStudioGitHubFile }>(PUT_FILE, {
      input,
    });
    return data.crowdyStudioGitHubPutFile;
  }
}
