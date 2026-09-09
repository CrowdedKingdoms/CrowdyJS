/**
 * Map Crowdy Studio SERVER/CLIENT files onto a bound GitHub repo.
 *
 * Full-stack layout (crowdy.json or server/ + client/ dirs):
 *   SERVER src/lib.rs  <->  server/src/lib.rs
 *   CLIENT src/lib.rs  <->  client/src/lib.rs
 */

import type { CrowdyStudioProjectFile, CrowdyStudioTarget } from '../models.js';
import type { CrowdyStudioGitHubTransport } from './transport.js';

export interface GitHubBind {
  owner: string;
  repo: string;
  branch: string;
}

export interface GitHubLayout {
  serverRoot: string | null;
  clientRoot: string | null;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', '.cursor']);
const SKIP_FILES = new Set(['crowdy.json', 'readme.md', 'license', '.gitignore']);
const MAX_FILES = 40;

export const DEFAULT_FULL_STACK_CROWDY_JSON = `{
  "server": "server",
  "client": "client"
}
`;

export function trimSlash(path: string): string {
  let start = 0;
  let end = path.length;
  while (start < end && path.charCodeAt(start) === 47) start += 1;
  while (end > start && path.charCodeAt(end - 1) === 47) end -= 1;
  return start === 0 && end === path.length ? path : path.slice(start, end);
}

export function joinRepo(root: string, rel: string): string {
  const base = trimSlash(root);
  const rest = trimSlash(rel);
  if (!base || base === '.') return rest;
  return rest ? `${base}/${rest}` : base;
}

export function underRoot(path: string, root: string | null): string | null {
  if (root == null) return null;
  const base = trimSlash(root);
  if (!base || base === '.') return path;
  if (path === base) return '';
  if (path.startsWith(`${base}/`)) return path.slice(base.length + 1);
  return null;
}

export function parseCrowdyJson(content: string): GitHubLayout | null {
  try {
    const parsed = JSON.parse(content) as { server?: unknown; client?: unknown };
    const server =
      typeof parsed.server === 'string' ? parsed.server.trim() || '.' : null;
    const clientRoot =
      typeof parsed.client === 'string' ? parsed.client.trim() || '.' : null;
    if (server == null && clientRoot == null) return null;
    return { serverRoot: server, clientRoot };
  } catch {
    return null;
  }
}

export function layoutFromRootEntries(
  entries: ReadonlyArray<{ path: string; type: string }>,
): GitHubLayout {
  const hasDir = (name: string) =>
    entries.some(
      (entry) =>
        entry.type === 'dir' &&
        (entry.path === name || entry.path.endsWith(`/${name}`)),
    );
  const hasClient = hasDir('client');
  const hasServer = hasDir('server');
  if (hasServer && hasClient) {
    return { serverRoot: 'server', clientRoot: 'client' };
  }
  if (hasClient) return { serverRoot: '.', clientRoot: 'client' };
  if (hasServer) return { serverRoot: 'server', clientRoot: null };
  return { serverRoot: '.', clientRoot: null };
}

export function repoPathToStudioFile(
  layout: GitHubLayout,
  repoPath: string,
): { target: CrowdyStudioTarget; path: string } | null {
  const name = repoPath.split('/').pop()?.toLowerCase() ?? '';
  if (SKIP_FILES.has(name) || SKIP_FILES.has(repoPath.toLowerCase())) return null;
  const clientRel = underRoot(repoPath, layout.clientRoot);
  if (clientRel != null && clientRel !== '') {
    return { target: 'CLIENT', path: clientRel };
  }
  const serverRel = underRoot(repoPath, layout.serverRoot);
  if (serverRel != null && serverRel !== '') {
    return { target: 'SERVER', path: serverRel };
  }
  return null;
}

export function studioFileToRepoPath(
  layout: GitHubLayout,
  target: CrowdyStudioTarget,
  path: string,
): string | null {
  const root = target === 'CLIENT' ? layout.clientRoot : layout.serverRoot;
  if (root == null) return null;
  return joinRepo(root, path);
}

export function mergeStudioFilesFromGitHub(
  current: readonly CrowdyStudioProjectFile[],
  incoming: readonly CrowdyStudioProjectFile[],
): { files: CrowdyStudioProjectFile[]; changed: boolean } {
  const keyOf = (file: CrowdyStudioProjectFile) => `${file.target}:${file.path}`;
  const next = new Map(current.map((file) => [keyOf(file), { ...file }]));
  let changed = false;
  for (const file of incoming) {
    const key = keyOf(file);
    const existing = next.get(key);
    if (!existing) {
      next.set(key, { ...file });
      changed = true;
      continue;
    }
    if (existing.content !== file.content) {
      next.set(key, { ...existing, content: file.content });
      changed = true;
    }
  }
  return { files: [...next.values()], changed };
}

export async function resolveGitHubLayout(
  github: CrowdyStudioGitHubTransport,
  bind: GitHubBind,
): Promise<GitHubLayout> {
  try {
    const file = await github.getFile({
      owner: bind.owner,
      repo: bind.repo,
      path: 'crowdy.json',
      ref: bind.branch,
    });
    const parsed = parseCrowdyJson(file.content);
    if (parsed) return parsed;
  } catch {
    // Missing crowdy.json: infer from the repo root.
  }
  const root = await github.tree({
    owner: bind.owner,
    repo: bind.repo,
    path: '',
    ref: bind.branch,
  });
  return layoutFromRootEntries(root);
}

async function listRepoFiles(
  github: CrowdyStudioGitHubTransport,
  bind: GitHubBind,
  path: string,
  acc: Array<{ path: string; sha?: string | null }>,
): Promise<void> {
  if (acc.length >= MAX_FILES) return;
  const entries = await github.tree({
    owner: bind.owner,
    repo: bind.repo,
    path,
    ref: bind.branch,
  });
  for (const entry of entries) {
    if (acc.length >= MAX_FILES) return;
    const name = entry.path.split('/').pop() ?? entry.path;
    if (SKIP_DIRS.has(name)) continue;
    if (entry.type === 'dir') {
      await listRepoFiles(github, bind, entry.path, acc);
      continue;
    }
    if (entry.type === 'file') acc.push({ path: entry.path, sha: entry.sha });
  }
}

export async function pullStudioFilesFromGitHub(
  github: CrowdyStudioGitHubTransport,
  bind: GitHubBind,
): Promise<CrowdyStudioProjectFile[]> {
  const layout = await resolveGitHubLayout(github, bind);
  const listed: Array<{ path: string; sha?: string | null }> = [];
  await listRepoFiles(github, bind, '', listed);
  const files: CrowdyStudioProjectFile[] = [];
  for (const entry of listed) {
    const mapped = repoPathToStudioFile(layout, entry.path);
    if (!mapped) continue;
    try {
      const body = await github.getFile({
        owner: bind.owner,
        repo: bind.repo,
        path: entry.path,
        ref: bind.branch,
      });
      files.push({
        target: mapped.target,
        path: mapped.path,
        content: body.content,
      });
    } catch {
      continue;
    }
  }
  return files;
}

async function putFileCreateOrUpdate(
  github: CrowdyStudioGitHubTransport,
  bind: GitHubBind,
  path: string,
  content: string,
  message: string,
): Promise<boolean> {
  let sha: string | undefined;
  let existingContent: string | undefined;
  try {
    const existing = await github.getFile({
      owner: bind.owner,
      repo: bind.repo,
      path,
      ref: bind.branch,
    });
    sha = existing.sha;
    existingContent = existing.content;
  } catch {
    sha = undefined;
  }
  if (existingContent === content) return false;
  await github.putFile({
    owner: bind.owner,
    repo: bind.repo,
    path,
    content,
    message,
    branch: bind.branch,
    ...(sha ? { sha } : {}),
  });
  return true;
}

export async function pushStudioFilesToGitHub(
  github: CrowdyStudioGitHubTransport,
  bind: GitHubBind,
  files: readonly CrowdyStudioProjectFile[],
): Promise<number> {
  const layout = await resolveGitHubLayout(github, bind);
  let pushed = 0;
  const wantsFullStack =
    files.some((file) => file.target === 'SERVER') &&
    files.some((file) => file.target === 'CLIENT');
  if (wantsFullStack) {
    const wrote = await putFileCreateOrUpdate(
      github,
      bind,
      'crowdy.json',
      DEFAULT_FULL_STACK_CROWDY_JSON,
      'studio: add crowdy.json layout',
    );
    if (wrote) pushed += 1;
  }
  for (const file of files) {
    const path = studioFileToRepoPath(layout, file.target, file.path);
    if (!path) continue;
    const wrote = await putFileCreateOrUpdate(
      github,
      bind,
      path,
      file.content,
      `studio: update ${file.target} ${file.path}`,
    );
    if (wrote) pushed += 1;
  }
  return pushed;
}
