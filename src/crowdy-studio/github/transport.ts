/**
 * Raw GraphQL transport for GitHub-backed Crowdy Studio.
 * Uses the DSH/local game-api endpoint (GitHub fields are not on ck.dev).
 */

import type { GraphQLClient } from '../../client.js';

export interface CrowdyStudioGitHubStatus {
  configured: boolean;
  connected: boolean;
  accountLogin?: string | null;
  repositorySelection?: string | null;
  owner?: string | null;
  repo?: string | null;
  branch?: string | null;
  sha?: string | null;
}

export interface CrowdyStudioGitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch?: string | null;
}

const STATUS = `
  query CrowdyStudioGitHubStatus($appId: BigInt, $projectId: String) {
    crowdyStudioGitHubStatus(appId: $appId, projectId: $projectId) {
      configured
      connected
      accountLogin
      repositorySelection
      owner
      repo
      branch
      sha
    }
  }
`;

const CONNECT = `
  mutation CrowdyStudioGitHubConnectUrl {
    crowdyStudioGitHubConnectUrl { connectUrl state }
  }
`;

const REPOS = `
  query CrowdyStudioGitHubRepos {
    crowdyStudioGitHubRepos { owner name fullName private defaultBranch }
  }
`;

const BIND = `
  mutation CrowdyStudioGitHubBind($input: BindCrowdyStudioGitHubInput!) {
    crowdyStudioGitHubBind(input: $input) {
      configured
      connected
      accountLogin
      repositorySelection
      owner
      repo
      branch
      sha
    }
  }
`;

const CREATE_MOD = `
  mutation CrowdyStudioGitHubCreateMod($input: CreateCrowdyStudioGitHubModInput!) {
    crowdyStudioGitHubCreateMod(input: $input) {
      configured
      connected
      accountLogin
      repositorySelection
      owner
      repo
      branch
      sha
    }
  }
`;

const TREE = `
  query CrowdyStudioGitHubTree($input: CrowdyStudioGitHubTreeInput!) {
    crowdyStudioGitHubTree(input: $input) { path type sha }
  }
`;

const FILE = `
  query CrowdyStudioGitHubFile($input: CrowdyStudioGitHubTreeInput!) {
    crowdyStudioGitHubFile(input: $input) { path content sha }
  }
`;

const PUT_FILE = `
  mutation CrowdyStudioGitHubPutFile($input: CrowdyStudioGitHubPutFileInput!) {
    crowdyStudioGitHubPutFile(input: $input) { path content sha }
  }
`;

export interface CrowdyStudioGitHubTreeEntry {
  path: string;
  type: string;
  sha?: string | null;
}

export interface CrowdyStudioGitHubFile {
  path: string;
  content: string;
  sha: string;
}

export class CrowdyStudioGitHubTransport {
  constructor(private readonly graphql: GraphQLClient) {}

  async status(input: {
    appId?: string;
    projectId?: string;
  } = {}): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubStatus: CrowdyStudioGitHubStatus;
    }>(STATUS, {
      appId: input.appId,
      projectId: input.projectId,
    });
    return data.crowdyStudioGitHubStatus;
  }

  async connectUrl(): Promise<{ connectUrl: string; state: string }> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubConnectUrl: { connectUrl: string; state: string };
    }>(CONNECT);
    return data.crowdyStudioGitHubConnectUrl;
  }

  async repos(): Promise<CrowdyStudioGitHubRepo[]> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubRepos: CrowdyStudioGitHubRepo[];
    }>(REPOS);
    return data.crowdyStudioGitHubRepos ?? [];
  }

  async bind(input: {
    appId: string;
    projectId: string;
    owner: string;
    repo: string;
    branch?: string;
  }): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubBind: CrowdyStudioGitHubStatus;
    }>(BIND, { input });
    return data.crowdyStudioGitHubBind;
  }

  async createMod(input: {
    appId: string;
    projectId: string;
    name: string;
    kind?: string;
    files?: Array<{ path: string; content: string }>;
  }): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubCreateMod: CrowdyStudioGitHubStatus;
    }>(CREATE_MOD, { input });
    return data.crowdyStudioGitHubCreateMod;
  }

  async tree(input: {
    owner: string;
    repo: string;
    path?: string;
    ref?: string;
  }): Promise<CrowdyStudioGitHubTreeEntry[]> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubTree: CrowdyStudioGitHubTreeEntry[];
    }>(TREE, { input });
    return data.crowdyStudioGitHubTree ?? [];
  }

  async getFile(input: {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  }): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubFile: CrowdyStudioGitHubFile;
    }>(FILE, { input });
    return data.crowdyStudioGitHubFile;
  }

  async putFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
    sha?: string;
  }): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{
      crowdyStudioGitHubPutFile: CrowdyStudioGitHubFile;
    }>(PUT_FILE, { input });
    return data.crowdyStudioGitHubPutFile;
  }
}
