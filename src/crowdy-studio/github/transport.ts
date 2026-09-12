/**
 * GraphQL transport for GitHub-backed Crowdy Studio projects.
 *
 * Same GraphQL client and session as everything else in the SDK: the game
 * API resolves the repository from the project's bind, so no operation here
 * names an `owner` / `repo` on a read or write, and no GitHub token ever
 * reaches the browser. GitHub is a filesystem for the project, not a login.
 *
 * Studio GitHub ops require an **identity session** (Bearer identity token
 * or first-party `ck_session` + CSRF). A play app-token receives `SCOPE_MISSING`
 * on every `crowdyStudioGitHub*` field. Construct this transport from the
 * Overworld/identity client, never from the gameplay client.
 */

import { print } from 'graphql';
import type { GraphQLClient } from '../../client.js';
import {
  CrowdyStudioGitHubBindDocument,
  CrowdyStudioGitHubConnectUrlDocument,
  CrowdyStudioGitHubCreateModDocument,
  CrowdyStudioGitHubFileDocument,
  CrowdyStudioGitHubLayoutDocument,
  CrowdyStudioGitHubPutFileDocument,
  CrowdyStudioGitHubReposDocument,
  CrowdyStudioGitHubSetAutosaveDocument,
  CrowdyStudioGitHubStatusDocument,
  CrowdyStudioGitHubTreeDocument,
  CrowdyStudioGitHubUnbindDocument,
  type CreateCrowdyStudioGitHubModInput,
  type CrowdyStudioGitHubCreateModMutationVariables,
  type CrowdyStudioGitHubFileInput,
  type CrowdyStudioGitHubLayoutQuery,
  type CrowdyStudioGitHubProjectInput,
  type CrowdyStudioGitHubPutFileInput,
} from '../../generated/graphql.js';

export interface CrowdyStudioGitHubStatus {
  configured: boolean;
  connected: boolean;
  accountLogin: string | null;
  accountType: string | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  /** Optimistic-lock commit SHA (`github_sha`). */
  githubSha: string | null;
  projectId: string | null;
  /**
   * Legacy opt-in to also push Studio autosaves. Bound authoring writes go
   * through {@link CrowdyStudioGitHubTransport.putFile}; this flag is not the
   * working tree.
   */
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
  /** Commit SHA after a put. Null on reads. */
  commitSha: string | null;
}

export interface CrowdyStudioGitHubLayout {
  commitSha: string;
  server: string;
  client: string | null;
  assets: string;
  crowdyJson: string | null;
}

export interface CrowdyStudioGitHubProjectScope {
  appId: string;
  projectId: string;
  commitSha?: string;
}

const STATUS = print(CrowdyStudioGitHubStatusDocument);
const CONNECT = print(CrowdyStudioGitHubConnectUrlDocument);
const REPOS = print(CrowdyStudioGitHubReposDocument);
const BIND = print(CrowdyStudioGitHubBindDocument);
const CREATE_MOD = print(CrowdyStudioGitHubCreateModDocument);
const UNBIND = print(CrowdyStudioGitHubUnbindDocument);
const SET_AUTOSAVE = print(CrowdyStudioGitHubSetAutosaveDocument);
const TREE = print(CrowdyStudioGitHubTreeDocument);
const FILE = print(CrowdyStudioGitHubFileDocument);
const PUT_FILE = print(CrowdyStudioGitHubPutFileDocument);
const LAYOUT = print(CrowdyStudioGitHubLayoutDocument);

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

  async createMod(
    input: CrowdyStudioGitHubCreateModMutationVariables['input'] | CreateCrowdyStudioGitHubModInput,
  ): Promise<CrowdyStudioGitHubStatus> {
    const data = await this.graphql.query<{ crowdyStudioGitHubCreateMod: CrowdyStudioGitHubStatus }>(CREATE_MOD, {
      input,
    });
    return data.crowdyStudioGitHubCreateMod;
  }

  async unbind(input: CrowdyStudioGitHubProjectInput | CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubStatus> {
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

  async getFile(
    input: CrowdyStudioGitHubFileInput | (CrowdyStudioGitHubProjectScope & { path: string }),
  ): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubFile: CrowdyStudioGitHubFile }>(FILE, { input });
    return data.crowdyStudioGitHubFile;
  }

  async putFile(
    input: CrowdyStudioGitHubPutFileInput | (CrowdyStudioGitHubProjectScope & {
      path: string;
      content: string;
      message: string;
      sha?: string;
      expectedCommitSha?: string;
    }),
  ): Promise<CrowdyStudioGitHubFile> {
    const data = await this.graphql.query<{ crowdyStudioGitHubPutFile: CrowdyStudioGitHubFile }>(PUT_FILE, {
      input,
    });
    return data.crowdyStudioGitHubPutFile;
  }

  /**
   * Resolved `crowdy.json` mapping. CrowdyJS and DSH must call this instead of
   * keeping a local path grammar.
   */
  async layout(input: CrowdyStudioGitHubProjectScope): Promise<CrowdyStudioGitHubLayout> {
    const data = await this.graphql.query<CrowdyStudioGitHubLayoutQuery>(LAYOUT, { input });
    return data.crowdyStudioGitHubLayout;
  }
}
